# Build 03: `pve-02` and `bastion-01`

This project integrates the HP EliteDesk 800 G6 Mini as standalone `pve-02`. Its first required workload is `bastion-01`, which provides DNS, HAProxy, and Nexus for [Build 04: Compact OKD](04-compact-okd.md). The older `k8s-worker-03` exercise below is optional and must not consume the bastion's resources or addresses.

Do not join `pve-01` and `pve-02` into a Proxmox cluster during this first pass. A two-node Proxmox cluster needs a quorum plan, such as a qdevice or a third voter. The first goal is simple capacity and operational practice without risking the working `pve-01` setup.

Start this project only after completing the [`utility-01` automation-server validation](02-utility-automation-server.md#step-9-validate-the-automation-server). Run Ansible, Kubernetes, and Git commands from its repository checkout. [Optional 01: Utility Desktop and KOReader](../20-optional/01-utility-desktop-koreader.md) is not a prerequisite.

## Target Design

| Item | Value |
|---|---|
| Proxmox hostname | `pve-02` |
| Proxmox FQDN | `pve-02.lab.home.arpa` |
| Proxmox IP | `192.168.40.25` |
| Model | HP EliteDesk 800 G6 Mini |
| CPU | Intel Core i5-10500T |
| RAM | 32 GB |
| Disk | 512 GB storage |
| Network | UniFi `Servers`, VLAN ID `40` |
| Gateway/DNS | `192.168.40.1` |
| Initial Proxmox storage | `local-lvm` on the 512 GB device |
| First VM | `bastion-01` |
| First VM IPs | `.33` management, `.29` OKD API, `.31` OKD ingress |
| First VM size | 4 vCPU, 12 GB RAM, approximately 300 GB disk |

## Step 1: Confirm the Project Prerequisites

Before touching the new hardware, confirm that `utility-01` is reachable and can actually run the repository's automation. Run the remaining commands after SSH connects:

```bash
ssh sean@utility-01.lab.home.arpa
cd ~/Developer/homelab
kubectl get nodes -o wide
ansible --version
git status
ansible-config dump --only-changed
ansible-inventory --graph
ansible-playbook --syntax-check ansible/playbooks/prep-k8s-nodes.yml
ansible k3s_cluster --list-hosts
ansible k3s_cluster -m ping
```

These tests are non-mutating: they parse the inventory and playbook, list the selected hosts, and use Ansible's `ping` module to test SSH and remote Python. The existing three Kubernetes nodes should be `Ready`, and every current `k3s_cluster` inventory host should return `pong`.

The repository's `ansible.cfg` currently selects `~/.ssh/id_ed25519_github`. Confirm that file exists on `utility-01` and that its public key is authorized for user `sean` on the managed nodes:

```bash
test -r ~/.ssh/id_ed25519_github
ssh -i ~/.ssh/id_ed25519_github sean@192.168.40.21 hostname
```

If Ansible uses a different host-management key in your environment, configure that key deliberately before continuing; do not copy private keys into the repository. If sudo on the target requires a password, later playbook runs that use privilege escalation need `--ask-become-pass`. Do not start the `pve-02` project while the current cluster or this smoke test is unhealthy.

## Step 2: Reserve Network Identity

Create or reserve these records before installing anything:

| Hostname | Address |
|---|---:|
| `pve-02.lab.home.arpa` | `192.168.40.25` |
| `bastion-01.lab.home.arpa` | `192.168.40.33` |

Also reserve `.29` for the OKD API VIP and `.31` for the OKD ingress VIP. These secondary addresses belong to `bastion-01`, but do not activate the OKD DNS records until the bastion services pass their validation. Reserve `k8s-worker-03.lab.home.arpa` at `.32` only if you later perform the optional worker exercise.

Use the same UniFi `Servers` network as `pve-01`:

- Subnet: `192.168.40.0/24`
- VLAN ID: `40`
- Gateway: `192.168.40.1`
- DNS: `192.168.40.1`
- Domain: `lab.home.arpa`

The switch port should carry the `Servers` network the same way it does for `pve-01`. VM NIC VLAN tags should stay blank when the switch port/native network already carries VLAN `40`.

## Step 3: Prepare BIOS and Install Proxmox

In the HP BIOS:

1. Confirm the system sees 32 GB RAM and the 512 GB storage device.
2. Enable Intel virtualization.
3. Disable Secure Boot if the Proxmox installer requires it.
4. Set the NVMe as the primary boot device after install.

Install Proxmox VE onto the 512 GB device:

1. Use hostname `pve-02.lab.home.arpa`.
2. Set the management IP to `192.168.40.25/24`.
3. Set gateway and DNS to `192.168.40.1`.
4. Select the default LVM-thin storage layout so Proxmox creates `local-lvm` for VM disks. Do not select ZFS for this project.
5. After the first boot, open `https://192.168.40.25:8006`.

Verify from `utility-01`:

```bash
ping -c 3 192.168.40.25
nc -vz 192.168.40.25 8006
```

## Step 4: Configure Proxmox Storage

`pve-02` is standalone, so its storage is local to that host and is not shared with `pve-01`. Keep the installer default on the single 512 GB device:

| Storage | Purpose |
|---|---|
| `local` | ISOs, snippets, small local files |
| `local-lvm` | Primary VM disks on `pve-02` |

Do not recreate or rename the installer-created storage merely to match the `vmdata` name used on `pve-01`. `local-lvm` is the appropriate primary VM storage for this one-disk host. If you later add a separate data disk, document a new storage layout before migrating disks.

Keep `pve-02` standalone for now. Do not enable HA, live migration, Ceph, or a Proxmox cluster until a quorum and shared-storage design is documented.

## Step 5: Create or Copy the Ubuntu Template

Because the two Proxmox hosts are standalone, `pve-02` cannot directly see the template or storage on `pve-01`. The simplest path is to build a new template on `pve-02` from the same Ubuntu ISO. Alternatively, back up the template on `pve-01`, transfer the backup to `pve-02`, and restore it there. Do not create a Proxmox cluster only to copy the template.

Use the same template conventions as `pve-01`:

- Ubuntu Server 26.04 normal install
- No minimized install
- No featured server snaps
- OpenSSH enabled
- `qemu-guest-agent` installed

If copying or recreating the template is not convenient, create `bastion-01` manually with the same baseline. The important part is that the guest has SSH, `qemu-guest-agent`, and the same Ubuntu LVM layout used by the existing VMs.

## Step 6: Create Required `bastion-01`

Create the first VM on `pve-02` with 4 vCPU, 12 GB RAM, and approximately 300 GB on `local-lvm`. Reserve `192.168.40.33` for management and configure `192.168.40.29` and `192.168.40.31` as secondary addresses on the same interface after confirming they are unused.

Install `dnsmasq`, HAProxy, and Nexus. Bind Nexus HTTPS to `.33:443`; bind OKD API and machine-config frontends to `.29:6443` and `.29:22623`; bind OKD application ingress to `.31:80` and `.31:443`. Keep management access limited to trusted LAN/VPN networks.

Do not activate the OKD private records or UniFi Forward Domain until `dnsmasq` is healthy and forwards unmatched public TXT queries. The complete DNS, load-balancer, install, and validation sequence is in [Build 04: Compact OKD](04-compact-okd.md).

Back up Nexus configuration and blob storage to storage outside this VM and perform a restore test before relying on it.

## Optional Exercise: Create `k8s-worker-03`

Create a VM on `pve-02`:

| Item | Value |
|---|---|
| VM name | `k8s-worker-03` |
| vCPU | 4 |
| RAM | 12 GB |
| Disk | 150 GB |
| Storage | `local-lvm` |
| IP | `192.168.40.32` |
| Gateway/DNS | `192.168.40.1` |

Set the hostname inside the guest:

```bash
sudo hostnamectl set-hostname k8s-worker-03
grep -q '^127.0.1.1 k8s-worker-03.lab.home.arpa k8s-worker-03$' /etc/hosts || \
  echo '127.0.1.1 k8s-worker-03.lab.home.arpa k8s-worker-03' | sudo tee -a /etc/hosts
hostnamectl
```

If the VM disk was expanded after cloning, grow the Ubuntu LVM filesystem:

```bash
lsblk
sudo growpart /dev/sda 3
sudo pvresize /dev/sda3
sudo lvextend -r -l +100%FREE /dev/mapper/ubuntu--vg-ubuntu--lv
df -h
```

If the disk appears as `/dev/vda` instead of `/dev/sda`, use `/dev/vda3`.

Verify local networking:

```bash
ip addr
ip route
resolvectl status
ping -c 3 192.168.40.1
```

Verify from your workstation:

```bash
ssh sean@192.168.40.32
ssh sean@k8s-worker-03.lab.home.arpa
```

## Step 7: Add the Worker to Ansible Inventory

After SSH works, add `k8s-worker-03` to the `k3s_workers` group in `ansible/inventory/hosts.ini`:

```ini
[k3s_workers]
k8s-worker-01 ansible_host=192.168.40.22
k8s-worker-02 ansible_host=192.168.40.23
k8s-worker-03 ansible_host=192.168.40.32
```

Do not add the inventory row before the VM exists. Existing playbooks target the full `k3s_cluster` group, so a premature inventory entry will make routine Ansible runs fail against a missing host.

## Step 8: Prepare the Node

Temporarily allow passwordless sudo on `k8s-worker-03` for Ansible bootstrap:

```bash
echo 'sean ALL=(ALL) NOPASSWD:ALL' | sudo tee /etc/sudoers.d/99-sean-homelab-bootstrap
sudo chmod 440 /etc/sudoers.d/99-sean-homelab-bootstrap
```

From the repo checkout on `utility-01`, run the existing prep playbook:

```bash
ansible-playbook ansible/playbooks/prep-k8s-nodes.yml --limit k8s-worker-03
```

The playbook installs baseline packages, disables swap, loads Kubernetes kernel modules, applies networking sysctls, and starts `qemu-guest-agent`.

## Step 9: Join k3s

Read the k3s node token from `k8s-control-01`:

```bash
ssh sean@192.168.40.21
sudo cat /var/lib/rancher/k3s/server/node-token
```

On `k8s-worker-03`, join the existing cluster:

```bash
curl -sfL https://get.k3s.io | sudo env K3S_URL=https://192.168.40.21:6443 K3S_TOKEN='<TOKEN>' sh -s - agent \
  --node-ip 192.168.40.32
```

Remove the temporary sudoers file after the join:

```bash
sudo rm /etc/sudoers.d/99-sean-homelab-bootstrap
sudo -k
sudo -v
```

## Step 10: Validate the Cluster

From `utility-01`:

```bash
KUBECONFIG=~/.kube/k8s-homelab.yaml kubectl get nodes -o wide
KUBECONFIG=~/.kube/k8s-homelab.yaml kubectl get pods -A
KUBECONFIG=~/.kube/k8s-homelab.yaml kubectl get applications.argoproj.io -A
```

Expected results:

- `k8s-worker-03` reports `Ready`.
- Existing nodes remain `Ready`.
- Argo CD applications remain `Synced` and `Healthy`.

Run a small scheduling check:

```bash
KUBECONFIG=~/.kube/k8s-homelab.yaml kubectl run pve-02-schedule-test \
  --image=nginx:alpine \
  --restart=Never \
  --overrides='{"spec":{"nodeName":"k8s-worker-03"}}'

KUBECONFIG=~/.kube/k8s-homelab.yaml kubectl get pod pve-02-schedule-test -o wide
KUBECONFIG=~/.kube/k8s-homelab.yaml kubectl delete pod pve-02-schedule-test
```

## Step 11: Practice Basic Failure Handling

After the worker is stable, practice the operational flow:

```bash
KUBECONFIG=~/.kube/k8s-homelab.yaml kubectl cordon k8s-worker-03
KUBECONFIG=~/.kube/k8s-homelab.yaml kubectl drain k8s-worker-03 --ignore-daemonsets --delete-emptydir-data
```

Reboot `pve-02` or `k8s-worker-03`, then bring the worker back:

```bash
KUBECONFIG=~/.kube/k8s-homelab.yaml kubectl uncordon k8s-worker-03
KUBECONFIG=~/.kube/k8s-homelab.yaml kubectl get nodes -o wide
```

Do not test destructive host failure until persistent storage and backup behavior are documented.

## Troubleshooting Notes

- If ping works but SSH times out, remember that UniFi UDM Pro Intrusion Prevention previously affected SSH/TCP while ICMP stayed healthy.
- If `k8s-worker-03` is `NotReady`, check `systemctl status k3s-agent` and `journalctl -u k3s-agent --no-pager -n 100`.
- If DNS fails but direct IP works, fix UniFi DNS or static host records before continuing.
- If Ansible fails with sudo errors, confirm the temporary sudoers file exists and has mode `0440`.
- If the Proxmox UI is reachable but the VM has no IP, confirm the NIC is on the correct bridge and no VM VLAN tag is set.
