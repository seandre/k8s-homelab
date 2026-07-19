# Build 04: Connected Compact OKD on the Ryzen Nodes

> Status: planned, with the temporary-Ubuntu benchmark path selected. `pve-02`, `bastion-01`, and `pbs-01` are operational, and the Nexus recovery test has passed. Install temporary Ubuntu on each Ryzen system, benchmark all three, and preserve the results before generating or booting OKD media. Keep the OKD DNS records inactive until Step 4.

This tutorial installs a connected, Agent-based compact OKD cluster on the three HP EliteDesk 805 G8 systems. Each system is a schedulable control-plane node; there are no separate compute nodes. The existing VM-based k3s cluster remains intact as the rollback and management environment.

This is a fresh installation, not a k3s conversion. The generated Agent image contains the target disk selection and can automatically overwrite the Ryzen-node disks after the hosts pass validation.

::: danger Destructive boundary
Do not boot a Ryzen node from the generated Agent ISO until its MAC address, hostname, static address, and installation disk have all been checked twice. Nothing in this tutorial should target a k3s node, Proxmox host, `utility-01`, or `bastion-01` disk.
:::

## What You Will Build

| Item | `okd-cp-01` | `okd-cp-02` | `okd-cp-03` |
|---|---|---|---|
| Address | `192.168.40.26` | `192.168.40.27` | `192.168.40.28` |
| FQDN | `okd-cp-01.okd.lab.seandre.dev` | `okd-cp-02.okd.lab.seandre.dev` | `okd-cp-03.okd.lab.seandre.dev` |
| CPU | Ryzen 5 PRO 5650GE, 6C/12T | Ryzen 5 PRO 5650GE, 6C/12T | Ryzen 5 PRO 5650GE, 6C/12T |
| Initial RAM | 16 GB | 16 GB | 16 GB |
| Storage | 1 TB P400 Lite SSD | 1 TB P400 Lite SSD | 1 TB P400 Lite SSD |
| Roles | control plane, etcd, compute | control plane, etcd, compute | control plane, etcd, compute |

| Shared endpoint | Address | Owner |
|---|---:|---|
| `api.okd.lab.seandre.dev` | `192.168.40.29` | HAProxy on `bastion-01` |
| `api-int.okd.lab.seandre.dev` | CNAME to `api` | `dnsmasq` on `bastion-01` |
| `*.apps.okd.lab.seandre.dev` | `192.168.40.31` | HAProxy on `bastion-01` |

The install configuration uses `baseDomain: lab.seandre.dev`, `metadata.name: okd`, three control-plane replicas, and zero compute replicas. The node network is `192.168.40.0/24`, the gateway is `192.168.40.1`, and the nodes use `192.168.40.33` for DNS.

This walkthrough pins `4.22.0-okd-scos.7`, the stable OKD/SCOS release selected on 2026-07-18. Do not silently replace it with `latest`. If you deliberately select a later release, update every download, checksum, client, installer, and reference to that same release before generating media.

## Step 1: Confirm the Starting Gate

Do all installation work from `utility-01`. Connect and confirm that the existing k3s management cluster is healthy:

```bash
ssh sean@utility-01.lab.seandre.dev
cd ~/Developer/k8s-homelab
git status --short
kubectl get nodes -o wide
```

The Git output should contain only changes you recognize, and all three existing k3s nodes should be `Ready`. This OKD build does not replace or modify them.

Check the external dependencies:

```bash
ping -c 3 192.168.40.33
nc -vz 192.168.40.29 6443
nc -vz 192.168.40.29 22623
nc -vz 192.168.40.31 80
nc -vz 192.168.40.31 443
dig @192.168.40.33 A ubuntu.com
dig @192.168.40.33 TXT _acme-challenge.seandre.dev
curl --fail https://nexus.lab.seandre.dev/
```

The four `nc` commands prove that HAProxy owns its future OKD frontends; the OKD backends are still expected to be down. DNS forwarding and Nexus HTTPS must work. Also confirm that the protected PBS recovery point and isolated Nexus artifact restore in [Operations 05: Proxmox Backup Server](../operations/proxmox-backup-server.md) are still the accepted recovery baseline.

Create a private build-log directory:

```bash
umask 077
install -d -m 0700 ~/okd-build-log
date --iso-8601=seconds | tee ~/okd-build-log/started-at.txt
```

Do not continue if k3s, `bastion-01`, DNS forwarding, HAProxy, Nexus, or the recovery baseline is unhealthy.

## Step 2: Install and Pin the OKD Clients

On `utility-01`, install the Agent image dependencies:

```bash
sudo apt update
sudo apt install -y \
  curl \
  iputils-arping \
  jq \
  syslinux-utils

command -v isohybrid
```

Ubuntu Resolute does not publish a `libnmstate-bin` (or `nmstate`) package in
its standard repositories. The current Agent-based installer workflow below
does not invoke `nmstatectl`, so it is intentionally not installed here.

Download the installer and client from the same OKD release. Keep this in one shell session so the two variables remain set:

```bash
OKD_RELEASE='4.22.0-okd-scos.7'
OKD_RELEASE_URL="https://github.com/okd-project/okd/releases/download/${OKD_RELEASE}"

install -d -m 0700 "$HOME/Downloads/okd-${OKD_RELEASE}"
cd "$HOME/Downloads/okd-${OKD_RELEASE}"

curl --fail --location --remote-name "${OKD_RELEASE_URL}/sha256sum.txt"
curl --fail --location --remote-name \
  "${OKD_RELEASE_URL}/openshift-client-linux-${OKD_RELEASE}.tar.gz"
curl --fail --location --remote-name \
  "${OKD_RELEASE_URL}/openshift-install-linux-${OKD_RELEASE}.tar.gz"

sha256sum --ignore-missing --check sha256sum.txt
```

Both downloaded archives must report `OK`. Stop if either checksum fails.

Extract and install the binaries:

```bash
tar -xzf "openshift-client-linux-${OKD_RELEASE}.tar.gz"
tar -xzf "openshift-install-linux-${OKD_RELEASE}.tar.gz"

sudo install -m 0755 oc kubectl openshift-install /usr/local/bin/

oc version --client
kubectl version --client
openshift-install version
```

The `openshift-install version` output must identify `4.22.0-okd-scos.7` and its configured release image. Record all three outputs:

```bash
{
  oc version --client
  kubectl version --client
  openshift-install version
} | tee ~/okd-build-log/client-versions.txt
```

`oc-mirror` is not used for this connected installation. It can be installed and tested later, before the mirroring exercise, without making Nexus or a mirror registry part of the initial cluster's boot path.

## Step 3: Inventory and Prepare Each Ryzen Node

Temporary Ubuntu and the HPL benchmark are part of the selected build path. Perform this step on one node at a time so chassis, NIC, and SSD identities cannot be crossed, then benchmark the three completed nodes together.

::: tip Do not set a static Ubuntu address while offline
During the disconnected Ubuntu installation, leave the onboard NIC on automatic/DHCP and choose **Continue without network**. Do not enter `.26`, `.27`, or `.28` in the installer. Before the first cabled boot, create the corresponding UniFi DHCP reservation. Ubuntu receives that reserved address by DHCP; the later OKD Agent configuration assigns the same address statically.
:::

1. Install the intended 1 TB SSD.
2. Label the chassis with its intended `okd-cp-*` identity and keep Ethernet disconnected during the temporary Ubuntu installation.
3. Connect a keyboard and monitor.
4. Power on and press `F10` repeatedly to open HP Computer Setup.
5. Record the chassis serial, firmware version, installed memory, onboard NIC MAC, SSD model, and SSD serial in the private asset inventory.
6. Update all three systems to the same stable HP firmware before continuing.
7. Install and onboard temporary Ubuntu exactly as described in [Temporary Ubuntu and Top500 HPL Benchmark](../optional/hpl-benchmark.md#install-temporary-ubuntu-on-the-ryzen-nodes). The node remains offline during installation, then uses DHCP with a UniFi reservation for its future `.26`, `.27`, or `.28` address after it is connected to an access/native Servers VLAN `40` switch port.

Apply a consistent firmware baseline:

| Setting | Value | Reason |
|---|---|---|
| Boot mode | UEFI only | Required for the planned boot path |
| Legacy/CSM boot | Disabled | Avoid ambiguous duplicate boot paths |
| Secure Boot | Enabled initially | Preserve platform verification; disable only as a documented troubleshooting test if the verified Agent image will not boot |
| SMT | Enabled | Exposes 12 threads from the 6-core CPU |
| SVM/virtualization | Enabled | Preserves the option to run virtualization workloads later |
| Storage controller | AHCI/direct, not firmware RAID | Exposes the single SSD directly |
| USB boot | Enabled | Required for the first Agent ISO deployment |
| After power loss | Power on | Returns a cluster node to service after power restoration |
| Boot order after install | Internal SSD before USB/network | Prevents an accidental reinstall |

On each temporary Ubuntu installation, collect the inventory with these commands:

```bash
hostnamectl
lscpu
free -h
ip -brief link
lsblk -e7 -o NAME,PATH,SIZE,MODEL,SERIAL,TYPE,TRAN
```

For the onboard interface on each node, record the Linux interface name and MAC address:

```bash
ip -brief link
cat /sys/class/net/<INTERFACE>/address
```

Replace `<INTERFACE>` with the wired interface, commonly `eno1`. Do not record a Wi-Fi or USB-adapter MAC.

Confirm that each intended installation disk is at least 900 GB and that there is only one disk of that size. The later root-device hint deliberately selects a non-rotating disk of at least 900 GB; this excludes normal USB installer media but would match two installed 1 TB SSDs.

Check drive health and run the same small synchronous-write test on every temporary Ubuntu node:

```bash
sudo apt update
sudo apt install -y fio smartmontools
sudo smartctl --all /dev/<INSTALL_DISK>

sudo fio \
  --name=etcd-fsync \
  --filename=/var/tmp/etcd-fio.test \
  --rw=write \
  --ioengine=sync \
  --fdatasync=1 \
  --bs=2300 \
  --size=1G \
  --runtime=60 \
  --time_based \
  --group_reporting

sudo rm -f /var/tmp/etcd-fio.test
```

Replace `<INSTALL_DISK>` with the recorded SSD device, such as `/dev/nvme0n1` or `/dev/sda`. This test writes only the named temporary file on the installed filesystem; do not point `fio` at a raw disk. Review the `fdatasync` latency percentiles. The p99 value should remain under 10 ms, and the three results should be broadly similar. Retain the outputs in the private build log and investigate SMART errors, a p99 failure, or a material outlier.

The published minimum for a control-plane node is 4 CPUs, 16 GB RAM, 100 GB storage, and 300 IOPS. These nodes meet the installation minimum, but 16 GB leaves little capacity for applications. Plan the documented 32 GB upgrade after acceptance.

Complete [Temporary Ubuntu and Top500 HPL Benchmark](../optional/hpl-benchmark.md) now. Back up its results before continuing because OKD will erase the temporary installations. The Ubuntu DHCP reservations may remain for address continuity, but the final Agent configuration—not Ubuntu netplan—provides each node's static OKD address.

Fill in this worksheet before creating `agent-config.yaml`:

| Node | Onboard interface | Onboard MAC | Only non-rotating disk at least 900 GB? |
|---|---|---|---|
| `okd-cp-01` | `<record>` | `<record>` | yes / no |
| `okd-cp-02` | `<record>` | `<record>` | yes / no |
| `okd-cp-03` | `<record>` | `<record>` | yes / no |

Do not continue with an unknown MAC, multiple matching disks, failing SMART data, inconsistent firmware, or an unexplained performance outlier. etcd needs low-latency synchronous storage; investigate rather than normalizing a slow node.

## Step 4: Activate the Private OKD DNS Records

This is the point at which the previously held DNS records become active. Connect to `bastion-01`:

```bash
ssh sean@bastion-01.lab.seandre.dev
sudoedit /etc/dnsmasq.d/10-okd.conf
```

Add exactly this dedicated record file:

```ini
address=/okd-cp-01.okd.lab.seandre.dev/192.168.40.26
address=/okd-cp-02.okd.lab.seandre.dev/192.168.40.27
address=/okd-cp-03.okd.lab.seandre.dev/192.168.40.28

address=/api.okd.lab.seandre.dev/192.168.40.29
cname=api-int.okd.lab.seandre.dev,api.okd.lab.seandre.dev
address=/.apps.okd.lab.seandre.dev/192.168.40.31

ptr-record=26.40.168.192.in-addr.arpa,okd-cp-01.okd.lab.seandre.dev
ptr-record=27.40.168.192.in-addr.arpa,okd-cp-02.okd.lab.seandre.dev
ptr-record=28.40.168.192.in-addr.arpa,okd-cp-03.okd.lab.seandre.dev
ptr-record=29.40.168.192.in-addr.arpa,api.okd.lab.seandre.dev,api-int.okd.lab.seandre.dev
```

Test and reload `dnsmasq`:

```bash
sudo dnsmasq --test
sudo systemctl restart dnsmasq
systemctl is-active dnsmasq
sudo journalctl -u dnsmasq --since '5 minutes ago' --no-pager
```

In UniFi Network, add a conditional forward/Forward Domain for `okd.lab.seandre.dev` to `192.168.40.33`. Do not create a local copy of the parent `seandre.dev` zone. If the installed UniFi version does not provide conditional forwarding, distribute `192.168.40.33` as DNS to the trusted LAN and VPN clients that must use OKD.

The OKD nodes do not depend on UniFi conditional forwarding; `agent-config.yaml` points them directly at `192.168.40.33`.

From `utility-01`, validate every private answer directly against `bastion-01`:

```bash
for name in \
  okd-cp-01.okd.lab.seandre.dev \
  okd-cp-02.okd.lab.seandre.dev \
  okd-cp-03.okd.lab.seandre.dev \
  api.okd.lab.seandre.dev \
  api-int.okd.lab.seandre.dev \
  random.apps.okd.lab.seandre.dev; do
  printf '%-55s ' "$name"
  dig @192.168.40.33 +short "$name" | paste -sd ',' -
done

dig @192.168.40.33 -x 192.168.40.26 +short
dig @192.168.40.33 -x 192.168.40.27 +short
dig @192.168.40.33 -x 192.168.40.28 +short
dig @192.168.40.33 -x 192.168.40.29 +short
dig @192.168.40.33 TXT _acme-challenge.seandre.dev
```

The node names must return `.26`, `.27`, and `.28`; both API names must reach `.29`; any name under `apps.okd.lab.seandre.dev` must return `.31`; and reverse lookups must return the matching names.

Repeat the same forward and reverse lookups from a trusted workstation without specifying `@192.168.40.33`. That proves the UniFi forwarding path works. Finally prove the records remain private:

```bash
dig @1.1.1.1 +short A api.okd.lab.seandre.dev
dig @1.1.1.1 +short A console-openshift-console.apps.okd.lab.seandre.dev
```

Both public lookups must return no address. Unmatched TXT queries through `.33` must still follow the public DNS path.

## Step 5: Upgrade the HAProxy API Health Check

Build 03 already created the four required frontends. Keep them bound as follows:

| Frontend | Backends | Lifetime |
|---|---|---|
| `.29:6443` | all three nodes on `6443` | permanent |
| `.29:22623` | all three nodes on `22623` | permanent, server-VLAN access only |
| `.31:80` | all three nodes on `80` | permanent |
| `.31:443` | all three nodes on `443` | permanent |

Port `22623` is not merely a bootstrap port; nodes can need the machine config server during their lifecycle. Keep it available to the server VLAN after installation.

On `bastion-01`, edit only the existing `okd_api_nodes` backend so the API health check tests `/readyz` over TLS:

```bash
sudoedit /etc/haproxy/haproxy.cfg
```

The backend must be:

```text
backend okd_api_nodes
    mode tcp
    balance roundrobin
    option httpchk GET /readyz
    http-check expect status 200
    server okd-cp-01 192.168.40.26:6443 check check-ssl verify none inter 5s fall 3 rise 2
    server okd-cp-02 192.168.40.27:6443 check check-ssl verify none inter 5s fall 3 rise 2
    server okd-cp-03 192.168.40.28:6443 check check-ssl verify none inter 5s fall 3 rise 2
```

Leave the machine-config and ingress backends from Build 03 in TCP mode. Validate before reloading:

```bash
sudo haproxy -c -f /etc/haproxy/haproxy.cfg
sudo systemctl reload haproxy
systemctl is-active haproxy
sudo ss -ltnp | grep -E '192\.168\.40\.(29|31):(80|443|6443|22623)'
```

Before the nodes boot, HAProxy should own all four listeners and report the OKD backends down. After the API starts, a failed `/readyz` check must remove a node within 30 seconds. Keep Nexus on `.33:443`; its distinct destination address prevents a collision with OKD ingress on `.31:443`.

## Step 6: Create a Protected Installation Directory

Return to `utility-01` and create a new directory for this one installation attempt:

```bash
umask 077
install -d -m 0700 ~/okd-install
test -d ~/okd-install
```

If `~/okd-install` already contains files from an earlier generation attempt, stop and choose a new directory such as `~/okd-install-attempt-02`. Do not mix generated artifacts from two attempts or releases.

Confirm the management SSH public key exists and print it for the next step:

```bash
test -r ~/.ssh/id_ed25519_github.pub
cat ~/.ssh/id_ed25519_github.pub
```

Only the public key goes in `install-config.yaml`. Never copy the private key into the installation directory.

OKD images in this connected build are public. The installer still requires syntactically valid pull-secret JSON, so this tutorial uses the OKD project's documented placeholder value. If private registry credentials are required later, use a real protected pull secret instead.

## Step 7: Create `install-config.yaml`

Open the file:

```bash
vi ~/okd-install/install-config.yaml
```

Paste this configuration, replacing `<PASTE_PUBLIC_SSH_KEY>` with the complete single line printed in Step 6:

```yaml
apiVersion: v1
baseDomain: lab.seandre.dev
metadata:
  name: okd
compute:
  - architecture: amd64
    hyperthreading: Enabled
    name: worker
    replicas: 0
controlPlane:
  architecture: amd64
  hyperthreading: Enabled
  name: master
  replicas: 3
networking:
  clusterNetwork:
    - cidr: 10.128.0.0/14
      hostPrefix: 23
  machineNetwork:
    - cidr: 192.168.40.0/24
  networkType: OVNKubernetes
  serviceNetwork:
    - 172.30.0.0/16
platform:
  none: {}
pullSecret: '{"auths":{"fake":{"auth":"aWQ6cGFzcwo="}}}'
sshKey: '<PASTE_PUBLIC_SSH_KEY>'
```

Protect and review it:

```bash
chmod 0600 ~/okd-install/install-config.yaml
sed -n '1,220p' ~/okd-install/install-config.yaml
```

Check these relationships before continuing:

- `metadata.name: okd` plus `baseDomain: lab.seandre.dev` produces `api.okd.lab.seandre.dev` and `*.apps.okd.lab.seandre.dev`.
- `compute.replicas: 0` plus `controlPlane.replicas: 3` produces the compact topology.
- `machineNetwork` contains `.26`, `.27`, `.28`, `.29`, `.31`, `.33`, and the `.1` gateway.
- The cluster and service networks do not overlap the machine network, home networks, or each other.
- The SSH key is one line and begins with a public-key type such as `ssh-ed25519`.

## Step 8: Create `agent-config.yaml`

Open the Agent configuration:

```bash
vi ~/okd-install/agent-config.yaml
```

Paste the complete three-host template below. Replace every `<CP0N_INTERFACE>` and `<CP0N_MAC>` with the values recorded in Step 3. Preserve the lowercase, colon-separated MAC format.

```yaml
apiVersion: v1beta1
kind: AgentConfig
metadata:
  name: okd
rendezvousIP: 192.168.40.26
hosts:
  - hostname: okd-cp-01.okd.lab.seandre.dev
    role: master
    interfaces:
      - name: <CP01_INTERFACE>
        macAddress: <CP01_MAC>
    rootDeviceHints:
      minSizeGigabytes: 900
      rotational: false
    networkConfig:
      interfaces:
        - name: <CP01_INTERFACE>
          type: ethernet
          state: up
          mac-address: <CP01_MAC>
          ipv4:
            enabled: true
            address:
              - ip: 192.168.40.26
                prefix-length: 24
            dhcp: false
          ipv6:
            enabled: false
      dns-resolver:
        config:
          search:
            - okd.lab.seandre.dev
          server:
            - 192.168.40.33
      routes:
        config:
          - destination: 0.0.0.0/0
            next-hop-address: 192.168.40.1
            next-hop-interface: <CP01_INTERFACE>
            table-id: 254

  - hostname: okd-cp-02.okd.lab.seandre.dev
    role: master
    interfaces:
      - name: <CP02_INTERFACE>
        macAddress: <CP02_MAC>
    rootDeviceHints:
      minSizeGigabytes: 900
      rotational: false
    networkConfig:
      interfaces:
        - name: <CP02_INTERFACE>
          type: ethernet
          state: up
          mac-address: <CP02_MAC>
          ipv4:
            enabled: true
            address:
              - ip: 192.168.40.27
                prefix-length: 24
            dhcp: false
          ipv6:
            enabled: false
      dns-resolver:
        config:
          search:
            - okd.lab.seandre.dev
          server:
            - 192.168.40.33
      routes:
        config:
          - destination: 0.0.0.0/0
            next-hop-address: 192.168.40.1
            next-hop-interface: <CP02_INTERFACE>
            table-id: 254

  - hostname: okd-cp-03.okd.lab.seandre.dev
    role: master
    interfaces:
      - name: <CP03_INTERFACE>
        macAddress: <CP03_MAC>
    rootDeviceHints:
      minSizeGigabytes: 900
      rotational: false
    networkConfig:
      interfaces:
        - name: <CP03_INTERFACE>
          type: ethernet
          state: up
          mac-address: <CP03_MAC>
          ipv4:
            enabled: true
            address:
              - ip: 192.168.40.28
                prefix-length: 24
            dhcp: false
          ipv6:
            enabled: false
      dns-resolver:
        config:
          search:
            - okd.lab.seandre.dev
          server:
            - 192.168.40.33
      routes:
        config:
          - destination: 0.0.0.0/0
            next-hop-address: 192.168.40.1
            next-hop-interface: <CP03_INTERFACE>
            table-id: 254
```

Protect the file and prove that no placeholder remains:

```bash
chmod 0600 ~/okd-install/agent-config.yaml
if grep -R -n '<CP\|<PASTE' ~/okd-install; then
  echo 'STOP: replace every placeholder before generating the ISO'
else
  echo 'No template placeholders remain'
fi
```

Read the whole file once more. In particular, confirm that:

- `.26` and the first node's MAC belong to `okd-cp-01`, the rendezvous host;
- `.27` belongs to `okd-cp-02` and `.28` belongs to `okd-cp-03`;
- all three roles are `master`;
- the interface name is repeated consistently within each host;
- every host has a unique MAC and address;
- DNS is `.33`, the gateway is `.1`, and the prefix length is `24`; and
- exactly one disk per node matches both root-device hints.

## Step 9: Run the Final Preflight and Generate the Agent ISO

Keep all three Ryzen nodes powered off. From `utility-01`, check that their future addresses are not already in use. Replace `<UTILITY_INTERFACE>` with the interface connected to `192.168.40.0/24`, commonly `ens18`:

```bash
ip -brief link
sudo arping -D -I <UTILITY_INTERFACE> -c 3 192.168.40.26
sudo arping -D -I <UTILITY_INTERFACE> -c 3 192.168.40.27
sudo arping -D -I <UTILITY_INTERFACE> -c 3 192.168.40.28
```

Each duplicate-address probe should receive no replies. Stop and resolve any response.

Confirm required network paths:

```bash
getent hosts quay.io
curl --silent --show-error --output /dev/null \
  --write-out 'quay registry HTTP status: %{http_code}\n' \
  https://quay.io/v2/

dig @192.168.40.33 +short api.okd.lab.seandre.dev
dig @192.168.40.33 +short api-int.okd.lab.seandre.dev
dig @192.168.40.33 +short test.apps.okd.lab.seandre.dev
```

An HTTP `401` from `https://quay.io/v2/` is an expected registry response and proves the TLS path is reachable. DNS must return `.29`, `.29`, and `.31` respectively.

Back up the two human-authored inputs before the installer generates anything:

```bash
install -d -m 0700 ~/okd-install-inputs-4.22.0-okd-scos.7
install -m 0600 ~/okd-install/install-config.yaml \
  ~/okd-install-inputs-4.22.0-okd-scos.7/install-config.yaml
install -m 0600 ~/okd-install/agent-config.yaml \
  ~/okd-install-inputs-4.22.0-okd-scos.7/agent-config.yaml
```

Ask the selected installer to validate the inputs and generate the image:

```bash
openshift-install --dir ~/okd-install agent create image --log-level=info \
  2>&1 | tee ~/okd-build-log/agent-create-image.log
```

Do not work around a validation error. Correct the original YAML, refresh the protected input copy, and regenerate in a new empty installation directory if the failed command produced partial artifacts.

Inspect the result:

```bash
find ~/okd-install -maxdepth 2 -type f -printf '%M %s %p\n' | sort
sha256sum ~/okd-install/agent.x86_64.iso \
  | tee ~/okd-build-log/agent.x86_64.iso.sha256
```

The directory should contain `agent.x86_64.iso` and installer state. Keep the directory private; generated Ignition, authentication data, kubeconfigs, and keys must never enter Git.

## Step 10: Write Three USB Drives

Use three USB drives of at least 8 GB so all hosts can remain booted from the same generated image at once. The ISO is identical for all three nodes; the installer matches each host by onboard NIC MAC address.

Make a copy for `isohybrid`, preserving the original generated ISO:

```bash
cp ~/okd-install/agent.x86_64.iso ~/okd-install/agent.usb.x86_64.iso
isohybrid --uefi ~/okd-install/agent.usb.x86_64.iso
sha256sum ~/okd-install/agent.usb.x86_64.iso \
  | tee ~/okd-build-log/agent.usb.x86_64.iso.sha256
```

If the USB drives are passed through to `utility-01`, identify one whole device at a time:

```bash
lsblk -p -o NAME,SIZE,MODEL,SERIAL,TRAN,MOUNTPOINTS
```

::: danger Verify the USB target
In the next command, `/dev/sdX` must be the whole removable USB device, never a partition and never a system or data disk. Compare its model, serial, size, and `TRAN=usb` before pressing Enter.
:::

Unmount any mounted partitions on that USB, then write the image:

```bash
sudo dd if="$HOME/okd-install/agent.usb.x86_64.iso" \
  of=/dev/sdX bs=4M status=progress conv=fsync
sync
```

Repeat the identify, unmount, and write sequence separately for the second and third drives. If USB passthrough is inconvenient, securely copy `agent.usb.x86_64.iso` and its checksum to a workstation, verify the checksum there, and use its trusted raw-image writer.

Label the drives `OKD 4.22.0 Agent` rather than assigning a drive to a particular host; host identity comes from the embedded MAC mapping.

## Step 11: Perform the Last Go/No-Go Review

Before booting any Agent USB, confirm every row:

| Check | Required result |
|---|---|
| Existing k3s cluster | all nodes `Ready`; its kubeconfig is preserved |
| `utility-01` clients | `oc` and `openshift-install` both match `4.22.0-okd-scos.7` |
| Node identities | each chassis maps to one intended onboard MAC and address |
| Disk selection | one non-rotating disk of at least 900 GB per node |
| DNS | node, API, API-internal, wildcard, and PTR tests pass |
| Public DNS | no A/AAAA result for private OKD endpoints |
| HAProxy | syntax valid; all four frontends listening |
| Network | `.26`–`.28` unused; gateway and internet reachable |
| Installer input | no placeholders; protected copy exists |
| USB image | checksum recorded and verified |

This is the last safe stopping point. Booting the generated ISO can lead directly to installation on the selected SSDs.

## Step 12: Boot the Three Nodes

1. Insert an Agent USB into `okd-cp-01` at `192.168.40.26`.
2. Power it on, press `F9` repeatedly, and choose the UEFI USB entry from the one-time boot menu.
3. Watch the local console. Confirm it applies the `.26` network configuration and identifies the host as `okd-cp-01.okd.lab.seandre.dev`.
4. Boot `okd-cp-02` the same way and confirm `.27` and its intended FQDN.
5. Boot `okd-cp-03` and confirm `.28` and its intended FQDN.
6. Leave all three USB drives inserted until the installer writes the SSDs and the nodes reboot.
7. On the first reboot, remove the USB drive or use `F9` to select the internal SSD. Do not boot the Agent image a second time.
8. After each node proves it can boot from its SSD, set the internal SSD before USB and network boot in UEFI order.

The `.26` node is the rendezvous host, so boot it first. The installation does not need a separate bootstrap machine; the Agent workflow temporarily performs bootstrap work on the rendezvous host.

In a separate `bastion-01` session, watch infrastructure while the nodes boot:

```bash
sudo journalctl -fu dnsmasq
```

In another session:

```bash
sudo journalctl -fu haproxy
```

DNS queries should arrive from the node network. HAProxy backends should transition from down to up as the API, machine config server, and ingress services appear.

## Step 13: Monitor Bootstrap and Installation

From `utility-01`, monitor bootstrap:

```bash
openshift-install --dir ~/okd-install agent wait-for bootstrap-complete \
  --log-level=info
```

Success ends with a message that cluster bootstrap is complete. Then wait for the entire installation:

```bash
openshift-install --dir ~/okd-install agent wait-for install-complete \
  --log-level=info
```

Do not interrupt a slow but progressing installation. Watch the node consoles and the two `bastion-01` journals while the command runs.

If bootstrap stops progressing, rerun the wait at debug level and protect the output:

```bash
openshift-install --dir ~/okd-install agent wait-for bootstrap-complete \
  --log-level=debug 2>&1 | tee ~/okd-build-log/bootstrap-debug.log
```

Collect Agent diagnostics from the rendezvous host if it is reachable:

```bash
ssh core@192.168.40.26 agent-gather -O \
  > ~/okd-build-log/okd-cp-01-agent-gather.tar.xz
```

Check these in order before changing anything:

1. the console shows the expected FQDN, MAC, address, and installation disk;
2. `.26`–`.28` can reach `.33` on TCP and UDP port `53`;
3. every node resolves the API, API-internal, wildcard, and other node names through `.33`;
4. the nodes have a default route through `.1` and can reach the required internet registries;
5. system clocks agree; and
6. HAProxy sends API traffic only to nodes whose `/readyz` returns success.

Do not regenerate the ISO or start a second installation attempt while the first attempt is still active.

## Step 14: Install the OKD Kubeconfig Without Replacing k3s

After `install-complete` succeeds, copy the generated kubeconfig to its own file:

```bash
install -d -m 0700 ~/.kube
install -m 0600 ~/okd-install/auth/kubeconfig ~/.kube/okd.yaml
```

Use the OKD kubeconfig only for the following commands:

```bash
export KUBECONFIG="$HOME/.kube/okd.yaml"
oc whoami
oc get nodes -o wide
oc get clusterversion
oc get clusteroperators
```

Keep `~/.kube/k8s-homelab.yaml` unchanged. In a new shell, set `KUBECONFIG` deliberately before running either `kubectl` or `oc`; do not rely on whichever cluster was used last.

The generated kubeadmin password is also protected installation output:

```bash
install -m 0600 ~/okd-install/auth/kubeadmin-password \
  ~/.kube/okd-kubeadmin-password
```

Move the credential into the password manager when practical. Do not commit it or paste it into a build log.

## Step 15: Run Cluster Acceptance

First verify the compact topology:

```bash
export KUBECONFIG="$HOME/.kube/okd.yaml"

oc get nodes -o wide
oc get nodes --show-labels
oc describe nodes | grep -E '^(Name:|Taints:)'
```

There must be exactly three `Ready` control-plane nodes. Because this is a compact cluster, they must also be schedulable for normal workloads; an unexpected control-plane `NoSchedule` taint is a fault to investigate.

Watch the platform converge:

```bash
watch -n 15 'oc get clusteroperators; echo; oc get clusterversion; echo; oc get nodes'
```

Press `Ctrl-C` only after every ClusterOperator remains:

- `Available=True`;
- `Progressing=False`; and
- `Degraded=False`.

Then run the broader checks:

```bash
oc get pods -A -o wide
oc get csr
oc get routes -A
oc get ingresscontroller default -n openshift-ingress-operator

curl --insecure --fail https://api.okd.lab.seandre.dev:6443/readyz
curl --insecure --head \
  https://console-openshift-console.apps.okd.lab.seandre.dev
```

The API must return `ok`. The console request must reach the cluster; `--insecure` is temporary because the initial platform certificate is not yet publicly trusted.

Do not blindly approve every pending CSR. For any pending request, inspect its username, signer, groups, requested names, and originating node and approve it only when it matches one of the three expected hosts.

From `bastion-01`, verify every direct API backend and the load-balanced endpoint:

```bash
for address in 192.168.40.26 192.168.40.27 192.168.40.28; do
  curl --insecure --fail --max-time 5 "https://${address}:6443/readyz"
done

curl --insecure --fail https://api.okd.lab.seandre.dev:6443/readyz
```

Do not add cert-manager, custom certificates, storage Operators, mirroring, or application workloads until this acceptance step passes over a meaningful observation period.

## Step 16: Protect the Installation and Finish the Platform

After acceptance:

1. Record the installed release, release-image digest, ISO SHA-256, node firmware versions, MAC mappings, disk serials, install start/end times, and acceptance results.
2. Preserve `~/okd-install`, the protected input copy, and `~/.kube/okd.yaml` in an encrypted, access-controlled recovery location.
3. Keep pull secrets, generated authentication data, kubeconfigs, and private keys out of Git and ordinary unencrypted backups.
4. Preserve the existing k3s kubeconfig and verify that the k3s cluster still operates independently.
5. Keep `.29:22623` restricted to the server VLAN but available for node lifecycle traffic.

### Add publicly trusted platform certificates

Follow [Build 01: Public TLS](public-domain-tls.md) only after cluster acceptance:

- issue `*.apps.okd.lab.seandre.dev` in `openshift-ingress` and configure it as the default IngressController certificate; and
- issue `api.okd.lab.seandre.dev` in `openshift-config` and configure it as an API server named certificate.

Never configure a custom certificate for `api-int.okd.lab.seandre.dev`. That internal endpoint remains platform-managed.

### Plan storage deliberately

The three local SSDs do not automatically provide replicated persistent storage. Before hosting stateful applications, choose and test a storage design, define failure behavior, and verify backup and restore. Also check the Image Registry Operator configuration before relying on in-cluster image builds; platform `none` does not supply durable registry storage automatically.

### Upgrade memory one node at a time

Upgrade from 16 GB to 32 GB only after acceptance:

1. Confirm all operators are healthy and etcd has quorum.
2. Cordon and drain one node using current OKD maintenance guidance.
3. Shut down that node, install memory, and verify 32 GB in firmware.
4. Boot it, wait for `Ready`, uncordon it, and recheck every operator.
5. Observe stability before starting the next node.

Never shut down two control-plane nodes together.

### Add mirroring only after the connected cluster is healthy

Nexus is already protected by PBS and a tested isolated artifact restore. Install and pin `oc-mirror`, confirm the registry implementation is suitable for container-image mirroring, and start with one narrowly scoped OKD release and Operator set. Do not make the first connected installation depend on the untested mirror path.

## Step 17: Perform Failure and Recovery Tests

After the cluster, storage, and certificates are stable:

1. Confirm all ClusterOperators are healthy and record the baseline.
2. Shut down one node only.
3. Confirm etcd retains quorum, `oc` can reach the API through `.29`, and an application route remains reachable through `.31`.
4. Confirm HAProxy removes the stopped API backend within 30 seconds.
5. Start the node, wait for `Ready`, and confirm HAProxy restores it after `/readyz` succeeds.
6. Recheck every ClusterOperator and pending CSR.
7. Repeat the isolated Nexus restore after a major Nexus or PBS change.
8. Test the narrow mirroring workflow before relying on mirrored content.

Do not combine this exercise with a memory upgrade, OKD update, certificate change, or storage migration.

## Optional Appendix: Learn PXE with the Agent Installer

Use the Agent ISO for the first deployment. PXE changes how a host receives the same Agent installer; it does not replace DNS, HAProxy, `install-config.yaml`, `agent-config.yaml`, the rendezvous IP, or disk safeguards.

PXE becomes worthwhile after the cluster is proven because it provides a repeatable reprovisioning path:

```text
utility-01 (.24)                    bastion-01 (.33)
- pinned openshift-install           - dnsmasq DNS
- protected input directory          - optional DHCP/PXE service
- generated PXE artifacts            - HTTP artifact service
          |                                      |
          +--------------- switch ---------------+
                           |
              .26          .27          .28
           okd-cp-01    okd-cp-02    okd-cp-03
```

There must be exactly one DHCP authority on the provisioning network. Do not enable a broad `dnsmasq` DHCP range on VLAN `40` while UniFi is also serving it. Start on an isolated provisioning VLAN or configure tightly scoped MAC reservations and boot options in the existing DHCP authority.

For a later PXE exercise:

1. Reuse a protected copy of the accepted installation inputs; never edit the archived accepted directory in place.
2. Check the selected installer's exact PXE command:

   ```bash
   openshift-install agent --help
   ```

3. If that release exposes `create pxe-files`, generate the matching artifacts in a new directory:

   ```bash
   openshift-install --dir ~/okd-pxe-install agent create pxe-files
   find ~/okd-pxe-install -maxdepth 2 -type f -print | sort
   ```

4. Do not mix a kernel, initramfs, rootfs, Ignition file, or iPXE script from different OKD releases.
5. Publish only the generated boot artifacts. Keep pull secrets, kubeconfigs, private keys, and original inputs off the HTTP server.
6. Add one onboard-NIC MAC reservation first and confirm the expected address, gateway, `.33` DNS server, boot filename, and artifact URL.
7. Boot the node through **F9 → UEFI IPv4 Network** and verify the MAC-to-host mapping before allowing a disk write.
8. Add the other two MACs only after the first node reaches the Agent environment correctly.
9. After provisioning, put the SSD before network boot or leave PXE as a manual `F9` choice. A normal reboot must never reinstall a healthy node.

PXE boot requires the onboard wired adapter. Wi-Fi and many USB Ethernet adapters cannot perform firmware network boot.

## Completion Checklist

| Complete | Requirement |
|---|---|
| ☐ | The selected OKD release, clients, installer, and checksums are pinned and recorded. |
| ☐ | Every chassis, onboard MAC, address, and SSD serial maps to the intended node. |
| ☐ | All node, wildcard, API, API-internal, and reverse records resolve from required clients. |
| ☐ | Public DNS returns no private homelab A/AAAA records, while public TXT forwarding still works. |
| ☐ | HAProxy uses `/readyz` for API health and owns all four required frontends. |
| ☐ | All three nodes are `Ready`, schedulable, and running the intended release. |
| ☐ | Every ClusterOperator is available and stable. |
| ☐ | API and console certificates validate after the trusted-certificate step. |
| ☐ | A one-node outage preserves quorum, API access, and ingress. |
| ☐ | Installer artifacts and kubeconfigs are encrypted, protected, and excluded from Git. |
| ☐ | Nexus restore and a narrowly scoped mirror workflow have been tested before mirroring is trusted. |

## References

- [OKD `4.22.0-okd-scos.7` release](https://github.com/okd-project/okd/releases/tag/4.22.0-okd-scos.7)
- [OpenShift 4.22 Agent-based Installer](https://docs.redhat.com/en/documentation/openshift_container_platform/4.22/html/installing_an_on-premise_cluster_with_the_agent-based_installer/installing-with-agent-based-installer)
- [OKD bare-metal preparation and requirements](https://docs.okd.io/latest/installing/installing_bare_metal/preparing-to-install-on-bare-metal.html)
- [OKD platform-none load-balancer guidance](https://docs.okd.io/latest/installing/installing_bare_metal/bare-metal-postinstallation-configuration.html)
- [OKD API server certificates](https://docs.okd.io/latest/security/certificates/api-server.html)
