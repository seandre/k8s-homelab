# Build 02: Utility Automation Server

This tutorial builds `utility-01` as the homelab automation server. Its job is to hold administration clients, the repository checkout, install tools, and protected kubeconfigs. It is not the OKD bastion: `bastion-01` later provides DNS, HAProxy, and Nexus.

Do not install desktop tools, user apps, `kubectl`, or daily admin utilities on the Proxmox host. Keep Proxmox focused on running VMs. Put convenience tools in `utility-01`.

Complete this automation server before [Build 03](03-pve-02-and-bastion.md) or [Build 04](04-compact-okd.md).

The optional GUI is documented separately in [Optional 01: Utility Desktop and KOReader](../20-optional/01-utility-desktop-koreader.md). It is not required for later builds.

## Target Design

| Item | Value |
|---|---|
| Hostname | `utility-01` |
| FQDN | `utility-01.lab.home.arpa` |
| IP | `192.168.40.24` |
| Gateway/DNS | `192.168.40.1` |
| Domain | `lab.home.arpa` |
| Proxmox host/storage | `pve-01` / `vmdata` |
| VM size | 2 vCPU, 8 GB RAM, 100 GB disk |
| User | `sean` |
| Access | SSH and Mosh over LAN/VPN only |
| Platform tools | Ansible, Git, `kubectl`, `oc`, `openshift-install`, `oc-mirror`, ISO tooling |
| Secret custody | separate mode-0600 kubeconfigs; pull secrets and tokens outside Git |

SSH is the normal admin path. Mosh is for mobile networks that roam or sleep. Neither service should be exposed through Kubernetes ingress or forwarded from the public internet.

## Step 1: Create the VM

Clone from the existing Ubuntu Server 26.04 template if it is available. Cloning keeps the utility VM consistent with the Kubernetes nodes: same base OS, OpenSSH enabled, and `qemu-guest-agent` already installed.

In the Proxmox UI:

1. Select the Ubuntu Server 26.04 template.
2. Clone it as `utility-01`.
3. Store the disk on `vmdata`.
4. Set CPU to `2` vCPU.
5. Set memory to `8192` MiB.
6. Resize the disk to `100` GB if the template disk is smaller.
7. Put the NIC on the same bridge/network as the Kubernetes VMs. Leave the VM VLAN tag blank because the switch port/native network carries VLAN `40`.
8. Enable the QEMU Guest Agent option for the VM.
9. Set a DHCP reservation or static address for `192.168.40.24`.

If the VM uses Ubuntu LVM and the disk was expanded after cloning, grow the guest filesystem after first boot:

```bash
lsblk
sudo growpart /dev/sda 3
sudo pvresize /dev/sda3
sudo lvextend -r -l +100%FREE /dev/mapper/ubuntu--vg-ubuntu--lv
df -h
```

If the disk appears as `/dev/vda` instead of `/dev/sda`, use `/dev/vda3`.

## Step 2: Set the Hostname and Network Identity

The hostname gives logs, SSH prompts, DHCP leases, and Proxmox guest-agent output a stable name.

Run this inside `utility-01`:

```bash
sudo hostnamectl set-hostname utility-01
grep -q '^127.0.1.1 utility-01.lab.home.arpa utility-01$' /etc/hosts || \
  echo '127.0.1.1 utility-01.lab.home.arpa utility-01' | sudo tee -a /etc/hosts
hostnamectl
```

If the VM uses DHCP, create a UniFi reservation for `utility-01` at `192.168.40.24`. If it uses static netplan, keep DNS and gateway pointed at `192.168.40.1`.

Verify local identity and reachability:

```bash
ip addr
ip route
resolvectl status
ping -c 3 192.168.40.1
```

## Step 3: Confirm Guest Agent and SSH

The guest agent lets Proxmox see IP addresses and perform cleaner shutdowns. SSH is the normal way to administer the VM.

Run this inside `utility-01`:

```bash
sudo apt update
sudo apt install -y qemu-guest-agent openssh-server
sudo systemctl enable --now qemu-guest-agent ssh
systemctl status qemu-guest-agent --no-pager
systemctl status ssh --no-pager
```

From your Mac or iPad SSH client:

```bash
ssh sean@192.168.40.24
ssh sean@utility-01.lab.home.arpa
```

If the IP works but the name does not, fix the UniFi DNS record before moving on.

## Step 4: Install Terminal and Automation Tooling

These packages make the VM useful as a daily admin shell. `tmux` keeps sessions alive when an iPad disconnects. `ripgrep`, `jq`, and `curl` make troubleshooting faster. Ansible gives you a place to run future host automation.

```bash
sudo apt update
sudo apt install -y \
  openssh-server \
  mosh \
  tmux \
  git \
  curl \
  jq \
  ripgrep \
  htop \
  ca-certificates \
  ansible
```

SSH gives you a secure remote shell. Mosh runs over UDP and tolerates Wi-Fi changes, VPN reconnects, and iPad backgrounding better than plain SSH. `tmux` is a terminal multiplexer: start work inside a named session, disconnect, and reattach later.

Try `tmux` once:

```bash
tmux new -s admin
```

Detach with `Ctrl-b`, then `d`. Reattach:

```bash
tmux attach -t admin
```

## Step 5: Limit Access to the Homelab Network

The utility VM is internal infrastructure. The local firewall should allow SSH and Mosh only from trusted internal networks. This example allows SSH from the Teleport network `192.168.2.0/24`, the client LAN `192.168.10.0/24`, and the server VLAN `192.168.40.0/24`. Mosh is limited to the client LAN and server VLAN. If another trusted VPN subnet needs access, add it explicitly and open only the required protocol and port.

Before enabling UFW, confirm that your current SSH client is in one of those networks. If it is not, add an equivalent allow rule for its trusted source subnet first; otherwise, enabling the firewall would disconnect you.

```bash
sudo apt install -y ufw
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow from 192.168.2.0/24 to any port 22 proto tcp
sudo ufw allow from 192.168.10.0/24 to any port 22 proto tcp
sudo ufw allow from 192.168.10.0/24 to any port 60000:61000 proto udp
sudo ufw allow from 192.168.40.0/24 to any port 22 proto tcp
sudo ufw allow from 192.168.40.0/24 to any port 60000:61000 proto udp
sudo ufw --force enable
sudo ufw status verbose
```

Expected Teleport rule:

```text
22/tcp                     ALLOW IN    192.168.2.0/24
```

Test a new SSH session from a Teleport client before closing the session used to change UFW. Do not add a `60000:61000/udp` rule for `192.168.2.0/24` unless Mosh is intentionally required from that network.

Do not add port forwards for SSH or Mosh on the internet edge. Use the LAN or VPN.

## Step 6: Connect from iPad

Use an iPad terminal app that supports SSH keys. If it also supports Mosh, use Mosh for long-running mobile sessions.

SSH:

```bash
ssh sean@utility-01.lab.home.arpa
```

Mosh:

```bash
mosh sean@utility-01.lab.home.arpa
```

Start persistent work inside `tmux` after connecting:

```bash
tmux new -A -s admin
```

The `-A` flag attaches to the existing `admin` session if it exists, or creates it if it does not.

## Step 7: Install Kubernetes Admin Tools

The utility VM should be able to inspect and operate the cluster, but desired state still lives in Git and Argo CD.

Install `kubectl` and `helm`:

```bash
sudo snap install kubectl --classic
sudo snap install helm --classic
kubectl version --client
helm version
```

Install `k9s` using the current upstream Ubuntu package:

```bash
curl -fLO https://github.com/derailed/k9s/releases/latest/download/k9s_linux_amd64.deb
sudo apt install -y ./k9s_linux_amd64.deb
rm k9s_linux_amd64.deb
k9s version
```

Install `oc`, `openshift-install`, and `oc-mirror` from the release artifacts for the exact OKD version selected for the cluster. Verify published checksums, record the versions in the build log, and place the binaries in `/usr/local/bin`. Do not use an unrecorded `latest` download: installer, client, and release compatibility matters.

Install the ISO-generation dependencies required by the selected Agent-based Installer release and verify all automation clients together:

```bash
ansible --version
git --version
kubectl version --client
oc version --client
openshift-install version
oc-mirror version
```

Keep OKD pull secrets, Cloudflare tokens, installer authentication output, and private keys in the password manager or permission-restricted files outside the repository.

Copy the kubeconfig securely from your existing workstation. If you are rebuilding the cluster, follow the [k3s installation section of the Rebuild Runbook](../30-operations/01-rebuild-runbook.md#install-k3s) first. On `utility-01`, store the kubeconfig under `~/.kube`:

```bash
mkdir -p ~/.kube
chmod 700 ~/.kube
vi ~/.kube/k8s-homelab.yaml
chmod 600 ~/.kube/k8s-homelab.yaml
```

Use the homelab kubeconfig by default:

```bash
grep -q 'KUBECONFIG=$HOME/.kube/k8s-homelab.yaml' ~/.profile || \
  echo 'export KUBECONFIG=$HOME/.kube/k8s-homelab.yaml' >> ~/.profile
export KUBECONFIG="$HOME/.kube/k8s-homelab.yaml"
kubectl get nodes -o wide
```

## Step 8: Clone the Homelab Repo

The repo checkout is for inspection, commits, and break-glass commands. It is not a replacement for GitOps.

```bash
mkdir -p ~/Developer
cd ~/Developer
git clone git@github.com:seandre/k8s-homelab.git
cd homelab
git status
```

If the SSH clone fails, create a key and add its public half under [GitHub SSH keys](https://github.com/settings/keys):

```bash
ssh-keygen -t ed25519 -C "sean@utility-01"
cat ~/.ssh/id_ed25519.pub
```

Alternatively, clone over HTTPS:

```bash
git clone https://github.com/seandre/k8s-homelab.git
```

## Step 9: Validate the Automation Server

Run these checks from the Mac, iPad, and `utility-01` as appropriate:

```bash
ssh sean@utility-01.lab.home.arpa
mosh sean@utility-01.lab.home.arpa
```

Inside `utility-01`:

```bash
tmux new -A -s admin
kubectl get nodes -o wide
helm version
k9s version
cd ~/Developer/homelab
git status
ansible-config dump --only-changed
ansible-inventory --graph
ansible-playbook --syntax-check ansible/playbooks/prep-k8s-nodes.yml
ansible k3s_cluster --list-hosts
ansible k3s_cluster -m ping
sudo ufw status verbose
```

The inventory, syntax, host-list, and Ansible `ping` checks do not change the managed nodes. Ansible's `ping` module tests SSH authentication and remote Python; it is not an ICMP ping. Every current `k3s_cluster` host should return `pong` before `utility-01` is considered ready for automation.

The repository's `ansible.cfg` selects `~/.ssh/id_ed25519_github`. Confirm the key is readable and its public half is authorized for user `sean` on the managed nodes:

```bash
test -r ~/.ssh/id_ed25519_github
ssh -i ~/.ssh/id_ed25519_github sean@192.168.40.21 hostname
```

If host automation uses a different private key, update the local Ansible configuration or inventory to select it. Never put a private key in Git. Playbooks that become root may also require `--ask-become-pass` unless passwordless sudo was deliberately configured.

## Step 10 (Optional): Disable Mosh

If Mosh is not needed, stop using it and remove its firewall allowance:

```bash
sudo ufw delete allow from 192.168.10.0/24 to any port 60000:61000 proto udp
sudo ufw delete allow from 192.168.40.0/24 to any port 60000:61000 proto udp
sudo ufw status verbose
```

SSH should normally remain enabled because it is the primary admin path.

## Next Project

The automation server is ready when Ansible, Git, the existing k3s kubeconfig, and the pinned OKD clients have been validated. Continue with [Build 03: `pve-02` and `bastion-01`](03-pve-02-and-bastion.md), then [Build 04: Compact OKD](04-compact-okd.md). The optional GUI remains separate in [Optional 01: Utility Desktop and KOReader](../20-optional/01-utility-desktop-koreader.md).

## Operating Rules

- Keep desired Kubernetes state in this repo and Argo CD, not only on `utility-01`.
- Keep SSH and Mosh reachable only from LAN/VPN networks.
- Use `tmux` for long-running sessions from iPad.
- Keep Proxmox clean: no daily user tools, desktop environment, browser, or Kubernetes admin workflow on the hypervisor.
