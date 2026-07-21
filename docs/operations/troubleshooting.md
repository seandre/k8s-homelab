# Operations 02: Troubleshooting

Start with the failing layer and collect evidence before changing identities, networking, or desired state.

Unless a command sets it explicitly, use the homelab kubeconfig:

```bash
export KUBECONFIG="$HOME/.kube/k8s-homelab.yaml"
```

## Fast Triage

```bash
scripts/check-hosts.sh
KUBECONFIG=~/.kube/k8s-homelab.yaml kubectl get nodes -o wide
KUBECONFIG=~/.kube/k8s-homelab.yaml kubectl get pods -A
KUBECONFIG=~/.kube/k8s-homelab.yaml kubectl get applications.argoproj.io -A
KUBECONFIG=~/.kube/k8s-homelab.yaml kubectl get ingress,certificate -A
```

Work through failures in this order:

1. IP reachability and TCP connectivity.
2. DNS resolution.
3. Kubernetes node and pod health.
4. Service endpoints and ingress matching.
5. TLS certificate readiness and client trust.
6. Application logs and configuration.

## `pve-01` Intel NIC Transmit-Hang Incident (`2026-07-20` to `2026-07-21`)

`pve-01` did not suffer a whole-host crash during this incident. Its operating
system continued running, but the Intel I219-LM physical uplink stopped
transmitting. Because `nic0` is the physical member of `vmbr0`, the failure
removed network connectivity from both the Proxmox host and every bridged VM.

The previous-boot journal repeatedly reported:

```text
e1000e 0000:00:1f.6 nic0: Detected Hardware Unit Hang
```

The three observed occurrences were:

| Boot | First NIC hang | Last NIC hang | Hang messages | Shutdown trigger |
|---|---|---|---:|---|
| `-3` | `2026-07-20 17:08:18` | `2026-07-20 17:14:56` | 200 | Short physical power-button press at `17:14:17` |
| `-2` | `2026-07-20 19:09:24` | `2026-07-20 20:09:12` | 1,795 | Short physical power-button press at `20:08:44` |
| `-1` | `2026-07-20 23:31:26` | `2026-07-21 07:06:58` | 13,667 | Short physical power-button press at `07:06:17` |

The final occurrence repeated approximately every two seconds for more than
seven hours. DNS and PBS status-query errors appeared after the transmit queue
had wedged and were consequences of the network failure, not its cause.
`systemd-logind` recognized each short power-button press and completed an
orderly guest and host shutdown. The logs contain no kernel panic, OOM kill,
NVMe error, thermal trip, machine-check error, watchdog lockup, or pstore crash
record. They also contain no physical link-down event. Treat the Intel
NIC/`e1000e` transmit path as the immediate cause with high confidence; the
lower-level trigger remains unproven.

At the time of diagnosis, the relevant state was:

- Proxmox VE `9.2.0`, running kernel `7.0.2-6-pve`;
- repository kernel candidate `7.0.14-5`;
- Intel I219-LM (`8086:0d4c`) using the in-kernel `e1000e` driver and NIC
  firmware `0.4-4`;
- HP BIOS `S21 02.18.00`, dated `2023-12-14`;
- 1 Gbps full-duplex link with Rx/Tx flow control;
- Energy Efficient Ethernet, TSO, GSO, and GRO enabled.

After the `2026-07-21 07:44` restart, all five production VMs and the core
Proxmox services were active, and the new boot had recorded no additional NIC
hangs as of `07:49`. Same-VLAN checks from `pve-02` reached `pve-01` with no
packet loss and found TCP/22 open. Direct access from the Trusted Mac still
failed while `pve-02` remained directly reachable. The Proxmox firewall was
disabled, so track that routed-access behavior as a separate UniFi policy or
client-tracking issue rather than as evidence that the NIC remained hung.

### Capture and Recovery

When the symptom returns, use a local console or a same-VLAN host such as
`pve-02` to preserve evidence before restarting:

```bash
journalctl --list-boots --no-pager
journalctl -k -b 0 --no-pager \
  | grep -E 'e1000e.*(Hardware Unit Hang|NIC Link|Reset adapter|NETDEV WATCHDOG)'
ethtool -i nic0
ethtool nic0
ethtool --show-eee nic0
ethtool -k nic0
ip -s link show nic0
```

If routed SSH is unavailable but `pve-02` is reachable, use it as the network
vantage point. Do not remove power immediately. A short power-button press was
handled cleanly during this incident and allowed Proxmox to stop its guests and
sync its filesystems. Use a forced power removal only if the host also stops
responding to its local console and cannot complete an orderly shutdown.

### Pending Remediation

Apply and validate these changes one stage at a time so the effective change
is identifiable:

1. During a maintenance window, update Proxmox packages and move from kernel
   `7.0.2-6-pve` to the current repository kernel before adding driver
   workarounds.
2. Review and, if applicable, update the HP EliteDesk 800 G6 BIOS from the
   [official HP support page](https://support.hp.com/us-en/product/setup-user-guides/hp-elitedesk-800-g6-desktop-mini-pc/34658463).
3. Monitor the new kernel for the first `Detected Hardware Unit Hang` event.
4. If the fault recurs, test disabling EEE first. If necessary, test TSO/GSO/GRO
   and Tx flow control separately rather than disabling every offload at once.
5. Persist only the setting that proves effective, and add an alert for the
   first matching kernel message. The relevant implementation is the upstream
   Linux [`e1000e` driver](https://github.com/torvalds/linux/blob/master/drivers/net/ethernet/intel/e1000e/netdev.c).

The following `ethtool` changes are runtime diagnostics and reset at reboot
unless explicitly persisted. Run them only during a controlled recurrence:

```bash
ethtool --set-eee nic0 eee off
ethtool -K nic0 tso off gso off gro off
ethtool -A nic0 tx off
```

## `pve-02`, `bastion-01`, and PBS Fast Triage

The implemented path is `bastion-01` VM `200` on standalone `pve-02`, backed up to `pbs-01.lab.seandre.dev` on `pve-01`. Start with non-secret checks:

```bash
ssh pve-02 'pvesm status; qm status 200'
dig A pve-02.lab.seandre.dev +short
dig A bastion-01.lab.seandre.dev +short
dig A pbs-01.lab.seandre.dev +short
dig @192.168.40.33 A ubuntu.com +short
curl --fail --head https://nexus.lab.seandre.dev
```

On `pve-02`, confirm the guest services and backup storage without printing credentials:

```bash
qm guest exec 200 -- systemctl is-active dnsmasq haproxy nexus glances
pvesm status --storage pbs-pve02
pvesh get /cluster/backup --output-format yaml
```

If Nexus is healthy but certificate renewal is under investigation, compare the live Certbot deployment hook with the safe version in Build 03 before running a dry-run. The hook must concatenate the public chain and private key into a protected temporary PEM using output redirection; never allow either key material or an authorization header into diagnostics.

## Argo CD and Grafana Credentials

Treat these values as secrets. Keep the current passwords in the password manager and do not paste them into tickets, chat, logs, or Git.

The administrator Mac stores the current credentials in the login Keychain as generic-password entries with these service names:

- `argocd.lab.seandre.dev`, account `admin`, label `Homelab Argo CD admin`;
- `grafana.lab.seandre.dev`, account `admin`, label `Homelab Grafana admin`.

Use Keychain Access to copy them into the preferred password manager. Do not use terminal commands that print the password during routine login or troubleshooting.

The Argo CD username is `admin`. The durable password hash and server signing key live in `argocd/argocd-secret`; do not delete or recreate that Secret during routine bootstrap or reconciliation. `argocd-initial-admin-secret` is only a bootstrap delivery mechanism, not the persistent credential source. After confirming the current admin password is stored in the password manager and works, delete the bootstrap Secret as upstream recommends:

```bash
kubectl -n argocd get secret argocd-secret \
  -o go-template='{{range $k, $v := .data}}{{$k}}{{"\n"}}{{end}}'
kubectl -n argocd delete secret argocd-initial-admin-secret
```

Expected Argo CD keys include `admin.password`, `admin.passwordMtime`, and `server.secretkey`. Reset a forgotten password by following the official Argo CD password-reset procedure; do not regenerate or print the server signing key.

Grafana consumes the stable `monitoring/grafana-admin-credentials` Secret through the chart's `grafana.admin.existingSecret` values. Confirm only its key names and the Deployment reference:

```bash
kubectl -n monitoring get secret grafana-admin-credentials \
  -o go-template='{{range $k, $v := .data}}{{$k}}{{"\n"}}{{end}}'
kubectl -n monitoring get deployment kube-prometheus-stack-grafana \
  -o yaml | grep -A3 -B3 grafana-admin-credentials
```

The chart-generated `kube-prometheus-stack-grafana` Secret is intentionally replaced by `grafana-admin-credentials`; do not use the generated Secret as a password-recovery source. Follow [Operations 03: Stable Admin Credentials](stable-admin-credentials.md) for rotation, Keychain custody, rollout, and recovery. A manually created Secret survives normal Argo CD and Helm reconciliation but not namespace deletion or cluster loss. Complete the Sealed Secrets tutorial and its controller-key backup exercise before treating Git as sufficient disaster recovery for credentials.

## SSH and VM Identity

Run the Mac-side capture for repeated ping, TCP/22, ARP, and SSH evidence:

```bash
scripts/diagnose-mac-network.sh
```

Useful overrides:

```bash
SSH_ATTEMPTS=50 scripts/diagnose-mac-network.sh
CLEAR_ARP=1 scripts/diagnose-mac-network.sh
SUSPECT_HOST=192.168.40.23 scripts/diagnose-mac-network.sh
```

Copy `scripts/diagnose-proxmox-network.sh` to `pve-01` and run it from the Proxmox shell when host-side bridge, neighbor, VM NIC, or guest-agent evidence is needed. Run `scripts/diagnose-vms-over-ssh.sh` from the Mac when SSH works, or copy `scripts/diagnose-vm-identity.sh` into a VM and run it from the console when it does not.

Confirm that every VM has a unique hostname, `/etc/machine-id`, SSH host-key fingerprint, Proxmox NIC MAC address, and static IP. Do not regenerate any of these until duplicate evidence is captured.

Evidence rules:

- The Mac is routed from Main/Trusted `192.168.20.0/24` to Servers `192.168.40.0/24`, so its ARP table normally shows its gateway rather than VM MAC addresses.
- A changing VM MAC in Proxmox or UniFi suggests an IP conflict or client-table problem.
- If Proxmox reaches a VM while the Mac cannot, focus on UniFi routing, firewall, and client tracking.
- If both Proxmox and the Mac lose a VM, focus on the guest OS, VM NIC, bridge, or VM health.
- If ping works while TCP/22 fails across several targets, inspect UniFi security filtering before changing Proxmox or guest configuration.
- If TCP/22 connects but sessions die, inspect `sshd`, PAM, shell startup, disk, memory, and kernel logs.

The 2026-06-28 SSH incident was caused by UniFi UDM Pro Intrusion Prevention interfering with TCP while ICMP remained healthy. Use `scripts/watch-proxmox-connectivity.sh` to compare ping and TCP/22 over time.

## Argo CD and Ingress

Bootstrap Argo CD with server-side apply because its CRDs exceed the client-side annotation limit:

```bash
KUBECONFIG=~/.kube/k8s-homelab.yaml kubectl apply --server-side --force-conflicts -k kubernetes/bootstrap
```

If Traefik remains at `EXTERNAL-IP <pending>`, confirm that MetalLB's `IPAddressPool` and `L2Advertisement` reconciled before the Traefik `LoadBalancer` Service. The manifests encode this dependency with Argo CD sync waves.

If the VIP responds but every hostname returns `404`, traffic reached Traefik but no route matched. Inspect ingresses, endpoints, and Traefik logs:

```bash
kubectl get ingress -A
kubectl get endpoints -A
kubectl -n traefik logs deployment/traefik --tail=160
```

Traefik previously failed because its service account could not list nodes. Its ClusterRole must allow `get`, `list`, and `watch` on nodes.

If Argo CD loops through redirects after ingress or TLS changes, confirm `server.insecure: "true"` in `argocd-cmd-params-cm`, then restart the server:

```bash
kubectl -n argocd rollout restart deployment/argocd-server
```

## DNS and TLS

If a hostname does not resolve, bypass DNS while preserving the TLS hostname:

```bash
curl -I --resolve home.lab.seandre.dev:443:192.168.40.30 https://home.lab.seandre.dev
```

If an ingress certificate is missing, inspect the ClusterIssuer, Certificate, and cert-manager pods:

```bash
kubectl get clusterissuer
kubectl get certificate -A
kubectl -n cert-manager get pods
```

A ready certificate plus an HTTPS `404` usually means an ingress match problem, not a certificate problem. Current `lab.seandre.dev` application certificates are publicly trusted; a browser warning on those names is not expected and should trigger certificate-chain, clock, and DNS checks.

## Homepage CrashLoopBackOff

Collect the previous process logs and mounted configuration:

```bash
kubectl -n homepage describe pod -l app.kubernetes.io/name=homepage
kubectl -n homepage logs deployment/homepage --previous --tail=120
kubectl -n homepage exec deployment/homepage -- ls -la /app/config
```

Homepage `v1.13.2` requires `/app/config/proxmox.yaml` even when Proxmox integration is unused. The ConfigMap must provide that file because ConfigMap mounts are read-only and Homepage cannot create a missing default there. The current manifest includes an empty `proxmox.yaml` key.

## General Lessons

- `CrashLoopBackOff` is a symptom; use `describe` and previous logs to find the cause.
- Git and Argo CD are the source of truth. Convert durable manual fixes into manifests or Ansible.
- Keep secrets, kubeconfigs, private keys, and generated diagnostics out of Git.
