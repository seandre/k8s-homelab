# Build 04: Connected Compact OKD on the Ryzen Nodes

> Status: planned. `pve-02`, `bastion-01`, and the OKD nodes do not exist yet. Complete the public-DNS proof, `utility-01`, `pve-02`, and `bastion-01` first.

This project installs a connected, Agent-based compact OKD cluster on the three HP EliteDesk 805 G8 systems. Each system is a schedulable control-plane node; there are no separate compute nodes. The existing VM-based k3s cluster remains intact as the rollback and management environment.

This is a fresh installation, not a k3s conversion. The installer may overwrite the Ryzen-node disks.

## Target Design

| Item | `okd-cp-01` | `okd-cp-02` | `okd-cp-03` |
|---|---|---|---|
| Address | `192.168.40.26` | `192.168.40.27` | `192.168.40.28` |
| CPU | Ryzen 5 PRO 5650GE, 6C/12T | Ryzen 5 PRO 5650GE, 6C/12T | Ryzen 5 PRO 5650GE, 6C/12T |
| Initial RAM | 16 GB | 16 GB | 16 GB |
| Storage | 1 TB P400 Lite SSD | 1 TB P400 Lite SSD | 1 TB P400 Lite SSD |
| Roles | control plane, etcd, compute | control plane, etcd, compute | control plane, etcd, compute |

| Shared endpoint | Address | Owner |
|---|---:|---|
| `api.okd.lab.seandre.dev` | `192.168.40.29` | HAProxy on `bastion-01` |
| `api-int.okd.lab.seandre.dev` | CNAME to `api` | `dnsmasq` on `bastion-01` |
| `*.apps.okd.lab.seandre.dev` | `192.168.40.31` | HAProxy on `bastion-01` |

The install configuration uses `baseDomain: lab.seandre.dev`, `metadata.name: okd`, three control-plane replicas, and zero compute replicas.

## Gate 1: Finish the Dependencies

Do not generate the ISO until all of these are true:

- Cloudflare is authoritative for `seandre.dev`, DNS-01 has succeeded on k3s, and no private A/AAAA records are public.
- `utility-01` at `.24` holds the repository, Ansible, `kubectl`, `oc`, `openshift-install`, `oc-mirror`, ISO tools, and protected kubeconfigs.
- standalone `pve-02` at `.25` is healthy.
- `bastion-01` at `.33` runs `dnsmasq`, HAProxy, and Nexus and owns secondary addresses `.29` and `.31`.
- the OKD forward and reverse records resolve correctly from `utility-01`, a workstation, and each node network.

Keep installer and client versions aligned with the selected OKD release. Record their checksums and versions in the build log; do not silently use `latest`.

## Gate 2: Prepare the Hardware

Install the three 1 TB SSDs, update each system to the same stable firmware, and record chassis, MAC address, hostname, and disk serial mappings in the private asset inventory. Configure UEFI, consistent boot settings, virtualization, and automatic recovery after power loss as desired.

Before installation, verify memory and storage and test SSD latency. etcd is sensitive to slow synchronous writes; investigate an outlier rather than accepting it as normal.

The initial 16 GB per node is an installation floor. Plan to upgrade to 32 GB after the cluster is stable, one node at a time.

## Gate 3: Activate Private DNS

Create these records in `dnsmasq` on `bastion-01` only after that VM is operational:

```text
address=/okd-cp-01.okd.lab.seandre.dev/192.168.40.26
address=/okd-cp-02.okd.lab.seandre.dev/192.168.40.27
address=/okd-cp-03.okd.lab.seandre.dev/192.168.40.28
address=/api.okd.lab.seandre.dev/192.168.40.29
cname=api-int.okd.lab.seandre.dev,api.okd.lab.seandre.dev
address=/.apps.okd.lab.seandre.dev/192.168.40.31
ptr-record=26.40.168.192.in-addr.arpa,okd-cp-01.okd.lab.seandre.dev
ptr-record=27.40.168.192.in-addr.arpa,okd-cp-02.okd.lab.seandre.dev
ptr-record=28.40.168.192.in-addr.arpa,okd-cp-03.okd.lab.seandre.dev
ptr-record=29.40.168.192.in-addr.arpa,api.okd.lab.seandre.dev
```

Configure UniFi Forward Domain for `okd.lab.seandre.dev` to `192.168.40.33`. Configure the OKD nodes to use `192.168.40.33` directly. If the installed UniFi version has no Forward Domain feature, distribute `.33` as DNS to the trusted LAN/VPN instead.

`dnsmasq` must forward unmatched queries, including `_acme-challenge` TXT queries, to public resolvers. Never shadow the whole `seandre.dev` public zone locally.

Validate before continuing:

```bash
for name in \
  okd-cp-01.okd.lab.seandre.dev \
  okd-cp-02.okd.lab.seandre.dev \
  okd-cp-03.okd.lab.seandre.dev \
  api.okd.lab.seandre.dev \
  api-int.okd.lab.seandre.dev \
  random.apps.okd.lab.seandre.dev; do
  dig @192.168.40.33 +short "$name"
done
dig @192.168.40.33 -x 192.168.40.26 +short
dig @192.168.40.33 TXT _acme-challenge.seandre.dev
```

Repeat forward and reverse tests from all three nodes and a workstation. Public resolvers must return no A/AAAA answer for these names.

## Gate 4: Configure HAProxy

Bind the API frontends to `.29` and ingress frontends to `.31`. Forward:

| Frontend | Backends |
|---|---|
| `.29:6443` | all three nodes on `6443` |
| `.29:22623` | all three nodes on `22623` during installation |
| `.31:80` | all three schedulable nodes on `80` |
| `.31:443` | all three schedulable nodes on `443` |

Use TCP mode and health checks. Keep Nexus on `.33:443`; distinct destination addresses prevent its HTTPS listener from colliding with OKD ingress. Validate the HAProxy configuration and prove that taking one backend down removes it from rotation.

## Generate the Agent-based Installer ISO

On `utility-01`, create a dedicated, permission-restricted install directory. Obtain the pull secret through the approved OKD release workflow and keep it outside Git. Create `install-config.yaml` with the important compact-cluster shape:

```yaml
apiVersion: v1
baseDomain: lab.seandre.dev
metadata:
  name: okd
compute:
  - name: worker
    replicas: 0
controlPlane:
  name: master
  replicas: 3
networking:
  networkType: OVNKubernetes
platform:
  none: {}
pullSecret: '<REDACTED>'
sshKey: '<PUBLIC_SSH_KEY>'
```

Create `agent-config.yaml` with the rendezvous IP and one host entry per MAC address. Pin each host to its address, gateway, DNS server `.33`, and intended hostname. Use `192.168.40.26` as the rendezvous address.

```bash
chmod 0700 ~/okd-install
openshift-install agent create image --dir ~/okd-install
```

Back up only the files required for recovery, with secret material encrypted and access controlled. Never commit `install-config.yaml`, pull secrets, generated authentication data, kubeconfigs, or private keys.

## Install and Monitor

Boot all three nodes from the generated ISO. Confirm the MAC-to-host mapping before accepting a disk write. From `utility-01`:

```bash
openshift-install agent wait-for bootstrap-complete \
  --dir ~/okd-install --log-level=info
openshift-install agent wait-for install-complete \
  --dir ~/okd-install --log-level=info
```

Install the resulting kubeconfig as a separate file and preserve the existing k3s context:

```bash
install -d -m 0700 ~/.kube
install -m 0600 ~/okd-install/auth/kubeconfig ~/.kube/okd.yaml
KUBECONFIG=~/.kube/okd.yaml oc get nodes -o wide
```

Because this is a compact cluster, confirm the control-plane nodes are schedulable. Do not configure Nexus mirroring or replace platform certificates while operators are converging.

## Cluster Acceptance

Wait until every ClusterOperator is stable:

```bash
KUBECONFIG=~/.kube/okd.yaml oc get clusteroperators
KUBECONFIG=~/.kube/okd.yaml oc get clusterversion
KUBECONFIG=~/.kube/okd.yaml oc get nodes
```

Acceptance requires `Available=True`, `Progressing=False`, and `Degraded=False` for all ClusterOperators over a meaningful observation period. Resolve pending CSRs, time synchronization, DNS, storage, registry, or networking faults before adding optional components.

## Publicly Trusted Platform Certificates

After acceptance, install a supported cert-manager release and Cloudflare DNS-01 credentials. Issue:

- a wildcard certificate for `*.apps.okd.lab.seandre.dev` in `openshift-ingress`, then reference its Secret as the default IngressController certificate;
- a certificate for `api.okd.lab.seandre.dev` in `openshift-config`, then configure it as an API server named certificate.

Never configure a custom certificate for `api-int.okd.lab.seandre.dev`. That internal endpoint remains platform-managed; replacing it can degrade the cluster. See [Build 01: Public TLS](01-public-domain-tls.md) for the rollout and checks.

## Nexus and Mirroring

Use Nexus first as an artifact repository. Document and test backup, restore, retention, and pruning before it becomes a dependency. Only after the connected cluster is healthy should `oc-mirror` add a narrowly scoped release and Operator mirror. Keep the first installation connected so DNS, load balancing, installation, and mirroring failures are not combined.

## Memory Upgrade

Upgrade one node from 16 GB to 32 GB at a time:

1. confirm all operators are healthy and etcd has quorum;
2. cordon and drain the node using OKD maintenance guidance;
3. shut down, install memory, and verify it in firmware;
4. boot, wait for `Ready`, uncordon, and recheck all operators;
5. proceed only after the cluster is stable.

## Failure and Recovery Tests

- Shut down one node and confirm etcd quorum, API access through `.29`, and application ingress through `.31` remain available.
- Confirm HAProxy removes and later restores the backend.
- Restore Nexus from backup and prove retention/pruning.
- Test the narrow `oc-mirror` workflow before relying on mirrored content.
- Preserve installer artifacts and kubeconfigs according to the recovery policy.

## Completion Criteria

- All forward, wildcard, and reverse records resolve from every required client.
- Public DNS contains no homelab A/AAAA records; ACME TXT lookup still works through the bastion.
- All ClusterOperators are available and stable.
- API and console certificates validate without a private CA.
- A one-node outage preserves quorum, API access, and ingress.
- Nexus restore and narrowly scoped mirroring have been tested.

## References

- [OKD Agent-based Installer](https://docs.okd.io/latest/installing/installing_with_agent_based_installer/installing-with-agent-based-installer.html)
- [OKD bare-metal DNS requirements](https://docs.okd.io/latest/installing/installing_bare_metal/ipi/ipi-install-prerequisites.html)
- [OKD API server certificates](https://docs.okd.io/latest/security/certificates/api-server.html)
