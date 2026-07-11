# Project 1: Utility Bastion

This tutorial builds `utility-01` as a stable Linux admin VM inside the homelab network. Its job is to be an always-available terminal target from an iPad, Mac, or VPN client.

Do not install desktop tools, user apps, `kubectl`, or daily admin utilities on the Proxmox host. Keep Proxmox focused on running VMs. Put convenience tools in `utility-01`.

Complete this bastion build before starting [Project 2: pve-02 Hardware Integration](add-pve-02-node-tutorial.md). That project uses `utility-01` as its in-network point for Ansible, `kubectl`, and the repository checkout.

The optional GUI is documented separately in [Utility Desktop and KOReader](utility-desktop-koreader-tutorial.md). It is not required for Project 2.

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

## Step 4: Install Terminal and Bastion Tooling

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

The utility VM is internal infrastructure. The local firewall should allow SSH and Mosh only from trusted internal networks. This example allows the client LAN `192.168.10.0/24` and the server VLAN `192.168.40.0/24`. If VPN clients use another trusted subnet, add that subnet explicitly.

Before enabling UFW, confirm that your current SSH client is in one of those two networks. If it is not, add an equivalent allow rule for its trusted source subnet first; otherwise, enabling the firewall would disconnect you.

```bash
sudo apt install -y ufw
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow from 192.168.10.0/24 to any port 22 proto tcp
sudo ufw allow from 192.168.10.0/24 to any port 60000:61000 proto udp
sudo ufw allow from 192.168.40.0/24 to any port 22 proto tcp
sudo ufw allow from 192.168.40.0/24 to any port 60000:61000 proto udp
sudo ufw --force enable
sudo ufw status verbose
```

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

Copy the kubeconfig securely from your existing workstation. If you are rebuilding the cluster, follow the [k3s installation section of the Rebuild Runbook](rebuild-runbook.md#install-k3s) first. On `utility-01`, store the kubeconfig under `~/.kube`:

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
git clone git@github.com:Seandre/k8s-homelab.git
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
git clone https://github.com/Seandre/k8s-homelab.git
```

## Step 9: Validate the Bastion

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
git -C ~/Developer/homelab status
sudo ufw status verbose
```

## Step 10 (Optional): Disable Mosh

If Mosh is not needed, stop using it and remove its firewall allowance:

```bash
sudo ufw delete allow from 192.168.10.0/24 to any port 60000:61000 proto udp
sudo ufw delete allow from 192.168.40.0/24 to any port 60000:61000 proto udp
sudo ufw status verbose
```

SSH should normally remain enabled because it is the primary admin path.

## Next Project

The required bastion is now ready. Continue with [Project 2: pve-02 Hardware Integration](add-pve-02-node-tutorial.md), or add the optional GUI with [Utility Desktop and KOReader](utility-desktop-koreader-tutorial.md).

## Operating Rules

- Keep desired Kubernetes state in this repo and Argo CD, not only on `utility-01`.
- Keep SSH and Mosh reachable only from LAN/VPN networks.
- Use `tmux` for long-running sessions from iPad.
- Keep Proxmox clean: no daily user tools, desktop environment, browser, or Kubernetes admin workflow on the hypervisor.
