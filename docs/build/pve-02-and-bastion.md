# Build 03: `pve-02` and `bastion-01`

This project integrates the HP EliteDesk 800 G6 Mini as standalone `pve-02`. Its first required workload is `bastion-01`, which provides DNS, HAProxy, and Nexus for [Build 04: Compact OKD](compact-okd.md). The older `k8s-worker-03` exercise below is optional and must not consume the bastion's resources or addresses.

Do not join `pve-01` and `pve-02` into a Proxmox cluster during this first pass. A two-node Proxmox cluster needs a quorum plan, such as a qdevice or a third voter. The first goal is simple capacity and operational practice without risking the working `pve-01` setup.

Start this project only after completing the [`utility-01` automation-server validation](utility-automation-server.md#step-9-validate-the-automation-server). Run Ansible, Kubernetes, and Git commands from its repository checkout. [Optional 01: Utility Desktop and KOReader](../optional/utility-desktop-koreader.md) is not a prerequisite.

## Target Design

| Item | Value |
|---|---|
| Proxmox hostname | `pve-02` |
| Proxmox FQDN | `pve-02.lab.seandre.dev` |
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
ssh sean@utility-01.lab.seandre.dev
cd ~/Developer/k8s-homelab
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
| `pve-02.lab.seandre.dev` | `192.168.40.25` |
| `bastion-01.lab.seandre.dev` | `192.168.40.33` |

Also reserve `.29` for the OKD API VIP and `.31` for the OKD ingress VIP. These secondary addresses belong to `bastion-01`, but do not activate the OKD DNS records until the bastion services pass their validation. Reserve `k8s-worker-03.lab.seandre.dev` at `.32` only if you later perform the optional worker exercise.

Use the same UniFi `Servers` network as `pve-01`:

- Subnet: `192.168.40.0/24`
- VLAN ID: `40`
- Gateway: `192.168.40.1`
- DNS: `192.168.40.1`
- Domain: `lab.seandre.dev`

The switch port should carry the `Servers` network the same way it does for `pve-01`. VM NIC VLAN tags should stay blank when the switch port/native network already carries VLAN `40`.

## Step 3: Prepare BIOS and Install Proxmox

The HP EliteDesk 800 G6 Desktop Mini uses HP's S22-family Computer Setup layout. The menu names below match the model-specific [HP BIOS simulator](https://support.hp.com/us-en/product/setup-user-guides/hp-elitedesk-800-g6-desktop-mini-pc/34658463). Power on or restart the system and press `F10` repeatedly to enter **HP Computer Setup**.

First open **Main → System Information** and confirm:

- the processor is the Intel Core i5-10500T;
- **Memory Size** is approximately `32768 MB`; and
- the 512 GB NVMe device appears under **Storage Device**.

Then apply these settings. A checked box means enabled in HP Computer Setup.

| HP Computer Setup path | Setting | Value for `pve-02` | Reason |
|---|---|---|---|
| **Security → Secure Boot Configuration** | **Secure Boot** | Checked | Current Proxmox VE supports Secure Boot on new installations. Do not enable legacy boot. |
| **Advanced → System Options** | **Configure Storage Controller for RAID** | Unchecked | Expose the single storage device directly rather than through firmware RAID. |
| **Advanced → System Options** | **Configure Storage Controller for Intel Optane** | Unchecked | This host does not use Intel Optane acceleration. |
| **Advanced → System Options** | **Turbo-Boost** | Checked | Preserve the processor's normal boost behavior. |
| **Advanced → System Options** | **Hyperthreading** | Checked | Expose all 12 logical CPUs from the 6-core i5-10500T. |
| **Advanced → System Options** | **Virtualization Technology (VTx)** | Checked | Required for KVM virtual machines. |
| **Advanced → System Options** | **Virtualization Technology for Directed I/O (VTd)** | Checked | Enables the IOMMU needed for PCIe device assignment. |
| **Advanced → Boot Options** | **Fast Boot** | Unchecked during installation | Ensures the firmware performs full USB discovery while installing. It may be re-enabled after successful boot validation. |
| **Advanced → Boot Options** | **USB Storage Boot** | Checked | Allows the Proxmox installer USB to appear in the boot menu. |
| **Advanced → Boot Options** | **After Power Loss** | **Power On** | Returns the virtualization host to service after power is restored. |

Leave **DMA Protection**, **Pre-boot DMA protection**, TPM, HP Sure Start, AMT, and other settings at their current defaults; they are not prerequisites for this installation. Do not clear Secure Boot keys or the TPM. Proxmox VE has supported Secure Boot out of the box since version 8.1, so disabling it is only a troubleshooting step for old or incorrectly created installation media, not part of this build. See the Secure Boot section of the [Proxmox VE Administration Guide](https://pve.proxmox.com/pve-docs/pve-admin-guide.pdf).

Select **Main → Save Changes and Exit**. Insert a current Proxmox VE installer written for UEFI boot, restart, press `F9` repeatedly for **Boot Device Options**, and select the UEFI entry for the USB drive. Use this one-time menu instead of permanently placing USB ahead of the internal disk. After installation, confirm **Advanced → Boot Options → UEFI Boot Order** lists the NVMe Proxmox boot entry before network boot entries.

Install Proxmox VE onto the 512 GB device:

1. Use hostname `pve-02.lab.seandre.dev`.
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

## Step 6: Build and Secure `bastion-01`

`bastion-01` is an infrastructure dependency, not a general-purpose server. It owns the management address, the two future OKD virtual IPs, the forwarding DNS service, the OKD load-balancer listeners, and the Nexus artifact repository.

| Purpose | Address and port | Process |
|---|---|---|
| Bastion management | `192.168.40.33:22` | OpenSSH |
| Forwarding DNS | `192.168.40.33:53` TCP/UDP | `dnsmasq` |
| Nexus HTTPS | `192.168.40.33:443` | HAProxy to Nexus on loopback |
| OKD API | `192.168.40.29:6443` | HAProxy |
| OKD machine config | `192.168.40.29:22623` | HAProxy |
| OKD application HTTP | `192.168.40.31:80` | HAProxy |
| OKD application HTTPS | `192.168.40.31:443` | HAProxy |

::: warning Hold the OKD DNS gate
Do not create the `okd.lab.seandre.dev` records or the UniFi Forward Domain during this step. First prove that `dnsmasq` forwards unmatched public queries, Nexus works through trusted HTTPS, and HAProxy owns the intended listeners. Activate the OKD records later in [Build 04: Compact OKD](compact-okd.md#gate-3-activate-private-dns).
:::

### Phase 1: Provision the VM

#### Clone and size the VM

In the Proxmox UI, right-click `ubuntu-2604-template` and select **Clone**. Use:

| Setting | Value |
|---|---|
| Target node | `pve-02` |
| VM ID | Any unused ID, such as `200` |
| Name | `bastion-01` |
| Mode | **Full Clone** |
| Target storage | `local-lvm` |

A full clone keeps the bastion independent of the template's base disk. Before starting it, edit its hardware:

- 1 socket and 4 cores;
- `12288 MiB` RAM with ballooning disabled for predictable Nexus memory;
- VirtIO network device on `vmbr0`, with the VLAN tag blank;
- QEMU Guest Agent enabled; and
- **Start at boot** enabled, with startup order `10` and an approximately 60-second startup delay.

Select **Hardware → Hard Disk (`scsi0`) → Disk Action → Resize**. The resize dialog asks how much to add, not the desired final size. For a 32 GiB template disk, enter `268` to produce a 300 GiB disk.

::: tip Resize arithmetic
`32 GiB + 268 GiB = 300 GiB`. Entering `300` would create a 332 GiB virtual disk.
:::

Start the VM, sign in through the Proxmox console, and inspect its disk and LVM layout:

```bash
lsblk -o NAME,SIZE,FSTYPE,MOUNTPOINTS
sudo pvs
sudo vgs
sudo lvs
```

If the disk is `/dev/sda` and the LVM physical volume is partition 3, grow the partition, physical volume, and root logical volume:

```bash
sudo growpart /dev/sda 3
sudo pvresize /dev/sda3
sudo lvextend -r -l +100%FREE /dev/mapper/ubuntu--vg-ubuntu--lv
```

If the disk is `/dev/vda`, substitute `/dev/vda` and `/dev/vda3`. Verify the result:

```bash
lsblk
sudo pvs
sudo vgs
sudo lvs
df -h /
sudo fstrim -av
```

The virtual disk should be approximately 300 GiB, and `/` should contain nearly all of the available space.

#### Give the clone a unique identity

Set the final hostname:

```bash
sudo hostnamectl set-hostname bastion-01
sudoedit /etc/hosts
```

Change the `127.0.1.1` entry to:

```text
127.0.1.1 bastion-01.lab.seandre.dev bastion-01
```

Because this VM came from a manually installed template, regenerate its machine identity and SSH host keys before treating it as a distinct host:

```bash
sudo rm -f /etc/machine-id
sudo systemd-machine-id-setup
sudo rm -f /var/lib/dbus/machine-id
sudo ln -s /etc/machine-id /var/lib/dbus/machine-id

sudo rm -f /etc/ssh/ssh_host_*
sudo ssh-keygen -A
sudo systemctl restart ssh
```

Confirm the result. A successful `sshd -t` produces no output:

```bash
hostnamectl
cat /etc/machine-id
sudo sshd -t
```

#### Prove that all three addresses are free

Install the duplicate-address probe and identify the VM interface:

```bash
sudo apt update
sudo apt install -y iputils-arping
ip -brief link
```

The interface will normally be `ens18`. Substitute its actual name below:

```bash
sudo arping -D -I ens18 -c 3 192.168.40.33
sudo arping -D -I ens18 -c 3 192.168.40.29
sudo arping -D -I ens18 -c 3 192.168.40.31
```

Each test should receive no replies. Also confirm in UniFi that none of the addresses belongs to another client or reservation.

::: danger Stop on a duplicate
Do not assign an address that answers the duplicate-address probe. Find and correct the reservation or active client first; an IP collision on the future API or ingress endpoint can make an OKD installation fail unpredictably.
:::

#### Configure static networking

Use the Proxmox console for this change because applying Netplan will disconnect the temporary DHCP session. Find the existing configuration:

```bash
ls -l /etc/netplan
```

Edit the existing YAML file, commonly `50-cloud-init.yaml` or `00-installer-config.yaml`:

```bash
sudoedit /etc/netplan/50-cloud-init.yaml
```

Use the actual filename and interface name:

```yaml
network:
  version: 2
  ethernets:
    ens18:
      dhcp4: false
      addresses:
        - 192.168.40.33/24
        - 192.168.40.29/24
        - 192.168.40.31/24
      routes:
        - to: default
          via: 192.168.40.1
      nameservers:
        addresses:
          - 192.168.40.1
        search:
          - lab.seandre.dev
```

Generate and safely test the configuration:

```bash
sudo netplan generate
sudo netplan try
```

Confirm the change when prompted, then apply and validate it:

```bash
sudo netplan apply
ip -4 address show dev ens18
ip route
resolvectl status ens18
ping -c 3 192.168.40.1
ping -c 3 1.1.1.1
getent hosts ubuntu.com
```

All three addresses should appear on `ens18`, with one default route through `192.168.40.1`. Reboot once and reconnect from `utility-01`:

```bash
sudo reboot
```

```bash
ssh -i ~/.ssh/id_ed25519_github sean@192.168.40.33
```

If the template did not already contain the management public key, install it from `utility-01`:

```bash
ssh-copy-id -i ~/.ssh/id_ed25519_github.pub sean@192.168.40.33
```

### Phase 2: Establish the Core Services

#### Install the service baseline

On `bastion-01`, update the guest and install the required packages:

```bash
sudo apt update
sudo apt full-upgrade -y
sudo apt install -y \
  dnsmasq \
  haproxy \
  dnsutils \
  curl \
  jq \
  rsync \
  unzip \
  ufw \
  ca-certificates \
  qemu-guest-agent
```

Confirm the guest agent remains active:

```bash
systemctl is-active qemu-guest-agent
```

#### Configure `dnsmasq` as a forwarding resolver

Create only the forwarding configuration. The OKD record file deliberately remains absent until Build 04:

```bash
sudoedit /etc/dnsmasq.d/00-bastion.conf
```

```ini
interface=ens18
listen-address=127.0.0.1
listen-address=192.168.40.33
bind-dynamic

no-resolv
server=192.168.40.1

cache-size=1000
domain-needed
bogus-priv
```

Test, enable, and restart the resolver:

```bash
sudo dnsmasq --test
sudo systemctl enable dnsmasq
sudo systemctl restart dnsmasq
systemctl is-active dnsmasq
```

Validate ordinary and TXT forwarding:

```bash
dig @192.168.40.33 A ubuntu.com
dig @192.168.40.33 TXT seandre.dev
dig @192.168.40.33 TXT _acme-challenge.seandre.dev
dig @192.168.40.1 TXT _acme-challenge.seandre.dev
```

An empty `_acme-challenge` answer is normal when no challenge is active. The important result is that `192.168.40.33` responds promptly with the same DNS status as the upstream resolver. Confirm that the future private API record is still inactive:

```bash
dig @192.168.40.33 A api.okd.lab.seandre.dev
```

::: tip Split-DNS boundary
Never create a local authoritative copy of the entire `seandre.dev` zone. `dnsmasq` must continue forwarding unmatched names and ACME TXT queries to the public DNS path.
:::

### Phase 3: Install Nexus Repository

#### Install a pinned Nexus Repository release

This build pins Nexus Repository `3.94.0-12`, the current Sonatype release when this procedure was written on July 16, 2026. Check the [Sonatype download page](https://help.sonatype.com/en/download.html) and release notes before deliberately changing the version; do not silently replace the pin with `latest`. The official archive includes its required Java runtime.

Download the archive and its SHA-256 file:

```bash
cd /tmp

curl --fail --location --remote-name \
  https://download.sonatype.com/nexus/3/nexus-3.94.0-12-linux-x86_64.tar.gz

curl --fail --location --remote-name \
  https://download.sonatype.com/nexus/3/nexus-3.94.0-12-linux-x86_64.tar.gz.sha256

sha256sum --check nexus-3.94.0-12-linux-x86_64.tar.gz.sha256
```

Do not continue unless the checksum reports `OK`. Create a dedicated account and extract the application:

```bash
sudo useradd \
  --system \
  --home-dir /opt/sonatype \
  --create-home \
  --shell /bin/bash \
  nexus

sudo tar \
  --extract \
  --gzip \
  --file /tmp/nexus-3.94.0-12-linux-x86_64.tar.gz \
  --directory /opt/sonatype

sudo ln -s /opt/sonatype/nexus-3.94.0-12 /opt/sonatype/nexus
sudo mkdir -p /opt/sonatype/sonatype-work/nexus3/etc
sudo chown -R nexus:nexus /opt/sonatype
```

Create the runtime-user file:

```bash
sudoedit /opt/sonatype/nexus/bin/nexus.rc
```

```ini
run_as_user="nexus"
```

Configure Nexus to listen only on loopback; HAProxy will provide trusted HTTPS:

```bash
sudoedit /opt/sonatype/sonatype-work/nexus3/etc/nexus.properties
```

```ini
application-host=127.0.0.1
application-port=8081
nexus-context-path=/
```

Apply ownership:

```bash
sudo chown nexus:nexus \
  /opt/sonatype/nexus/bin/nexus.rc \
  /opt/sonatype/sonatype-work/nexus3/etc/nexus.properties
```

Sonatype recommends a dedicated non-root account, at least 65,536 file descriptors, and a reverse proxy for TLS termination. Review the current [system requirements](https://help.sonatype.com/en/sonatype-nexus-repository-system-requirements.html) and [reverse-proxy guidance](https://help.sonatype.com/en/run-behind-a-reverse-proxy.html) before a major upgrade.

#### Run Nexus as a system service

Create the service unit:

```bash
sudoedit /etc/systemd/system/nexus.service
```

```ini
[Unit]
Description=Sonatype Nexus Repository
After=network-online.target
Wants=network-online.target

[Service]
Type=forking
User=nexus
Group=nexus
LimitNOFILE=65536
ExecStart=/opt/sonatype/nexus/bin/nexus start
ExecStop=/opt/sonatype/nexus/bin/nexus stop
Restart=on-abort
TimeoutStartSec=600
TimeoutStopSec=600

[Install]
WantedBy=multi-user.target
```

Activate it:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now nexus
```

The first startup can take several minutes. Follow it with either command:

```bash
sudo journalctl -u nexus -f
```

```bash
sudo tail -f /opt/sonatype/sonatype-work/nexus3/log/nexus.log
```

In another session, wait until Nexus responds and confirm port `8081` is loopback-only:

```bash
curl --fail http://127.0.0.1:8081/
sudo ss -ltnp | grep 8081
```

The listener must be `127.0.0.1:8081`, not `0.0.0.0:8081` or one of the VM addresses.

### Phase 4: Publish the Services Securely

#### Issue the private Nexus endpoint's public certificate

Create a dedicated Cloudflare API token with **Zone / DNS / Edit** and **Zone / Zone / Read**, restricted to the single `seandre.dev` zone. Store it in the password manager. DNS-01 does not require a public A/AAAA record or any inbound internet port forward.

Install Certbot and its Cloudflare plugin:

```bash
sudo apt install -y certbot python3-certbot-dns-cloudflare
sudo install -d -m 0700 /etc/letsencrypt/secrets
sudoedit /etc/letsencrypt/secrets/cloudflare.ini
```

Add the restricted token:

```ini
dns_cloudflare_api_token = YOUR_RESTRICTED_TOKEN
```

Protect the credential and request the certificate. Replace the email address with one you control:

```bash
sudo chmod 0600 /etc/letsencrypt/secrets/cloudflare.ini

sudo certbot certonly \
  --dns-cloudflare \
  --dns-cloudflare-credentials /etc/letsencrypt/secrets/cloudflare.ini \
  --dns-cloudflare-propagation-seconds 30 \
  --non-interactive \
  --agree-tos \
  --email YOUR_EMAIL_ADDRESS \
  --domains nexus.lab.seandre.dev
```

Build the combined PEM file HAProxy expects:

```bash
sudo install -d -m 0700 /etc/haproxy/certs
sudo sh -c 'cat /etc/letsencrypt/live/nexus.lab.seandre.dev/fullchain.pem /etc/letsencrypt/live/nexus.lab.seandre.dev/privkey.pem > /etc/haproxy/certs/nexus.lab.seandre.dev.pem'
sudo chmod 0600 /etc/haproxy/certs/nexus.lab.seandre.dev.pem
```

::: warning Secret handling
Do not place the Cloudflare token, the certificate private key, the Nexus initial password, or a diagnostic containing them in Git. Public trust authenticates a private endpoint; it does not make that endpoint safe to expose to the internet.
:::

#### Configure Nexus and OKD listeners in HAProxy

Preserve the package default and replace the active configuration:

```bash
sudo cp /etc/haproxy/haproxy.cfg /etc/haproxy/haproxy.cfg.package-default
sudoedit /etc/haproxy/haproxy.cfg
```

```text
global
    log /dev/log local0
    log /dev/log local1 notice
    chroot /var/lib/haproxy
    stats socket /run/haproxy/admin.sock mode 660 level admin
    user haproxy
    group haproxy
    daemon
    ssl-default-bind-options ssl-min-ver TLSv1.2

defaults
    log global
    mode tcp
    option tcplog
    timeout connect 10s
    timeout client 5m
    timeout server 5m
    timeout check 10s

frontend nexus_https
    bind 192.168.40.33:443 ssl crt /etc/haproxy/certs/nexus.lab.seandre.dev.pem
    mode http
    option httplog
    option forwardfor
    acl trusted src 192.168.2.0/24 192.168.10.0/24 192.168.40.0/24
    http-request deny unless trusted
    http-request set-header X-Forwarded-Proto https
    http-request set-header X-Forwarded-Port 443
    default_backend nexus_http

backend nexus_http
    mode http
    server nexus 127.0.0.1:8081 check

frontend okd_api_6443
    bind 192.168.40.29:6443
    mode tcp
    default_backend okd_api_nodes

backend okd_api_nodes
    mode tcp
    balance roundrobin
    server okd-cp-01 192.168.40.26:6443 check check-ssl verify none inter 10s fall 3 rise 2
    server okd-cp-02 192.168.40.27:6443 check check-ssl verify none inter 10s fall 3 rise 2
    server okd-cp-03 192.168.40.28:6443 check check-ssl verify none inter 10s fall 3 rise 2

frontend okd_machine_config_22623
    bind 192.168.40.29:22623
    mode tcp
    default_backend okd_machine_config_nodes

backend okd_machine_config_nodes
    mode tcp
    balance roundrobin
    server okd-cp-01 192.168.40.26:22623 check inter 10s fall 3 rise 2
    server okd-cp-02 192.168.40.27:22623 check inter 10s fall 3 rise 2
    server okd-cp-03 192.168.40.28:22623 check inter 10s fall 3 rise 2

frontend okd_ingress_http
    bind 192.168.40.31:80
    mode tcp
    default_backend okd_ingress_http_nodes

backend okd_ingress_http_nodes
    mode tcp
    balance source
    server okd-cp-01 192.168.40.26:80 check inter 10s fall 3 rise 2
    server okd-cp-02 192.168.40.27:80 check inter 10s fall 3 rise 2
    server okd-cp-03 192.168.40.28:80 check inter 10s fall 3 rise 2

frontend okd_ingress_https
    bind 192.168.40.31:443
    mode tcp
    default_backend okd_ingress_https_nodes

backend okd_ingress_https_nodes
    mode tcp
    balance source
    server okd-cp-01 192.168.40.26:443 check check-ssl verify none inter 10s fall 3 rise 2
    server okd-cp-02 192.168.40.27:443 check check-ssl verify none inter 10s fall 3 rise 2
    server okd-cp-03 192.168.40.28:443 check check-ssl verify none inter 10s fall 3 rise 2
```

Validate and activate HAProxy:

```bash
sudo haproxy -c -f /etc/haproxy/haproxy.cfg
sudo systemctl enable haproxy
sudo systemctl restart haproxy
systemctl is-active haproxy
```

::: tip Expected backend state
The OKD backends will report `DOWN` until the three OKD nodes exist and expose their services. That does not prevent HAProxy from starting or owning the frontends. Nexus should be the only healthy backend at this stage.
:::

These frontends implement the current [OKD user-managed load-balancer requirements](https://docs.okd.io/latest/installing/installing_bare_metal/bare-metal-postinstallation-configuration.html). Port `22623` is restricted later to the server VLAN; the API and ingress endpoints are reachable only from documented trusted networks.

#### Automate certificate deployment

Create a Certbot deployment hook:

```bash
sudoedit /etc/letsencrypt/renewal-hooks/deploy/haproxy-nexus
```

```sh
#!/bin/sh
set -eu

PEM=/etc/haproxy/certs/nexus.lab.seandre.dev.pem
TMP="${PEM}.new"

cat \
  /etc/letsencrypt/live/nexus.lab.seandre.dev/fullchain.pem \
  /etc/letsencrypt/live/nexus.lab.seandre.dev/privkey.pem \
  > "$TMP"

chmod 0600 "$TMP"
mv "$TMP" "$PEM"

haproxy -c -f /etc/haproxy/haproxy.cfg
systemctl reload haproxy
```

Secure the hook and test the renewal path:

```bash
sudo chmod 0750 /etc/letsencrypt/renewal-hooks/deploy/haproxy-nexus
sudo /etc/letsencrypt/renewal-hooks/deploy/haproxy-nexus
sudo certbot renew --dry-run
systemctl list-timers certbot.timer
```

#### Add only the private Nexus DNS record

Add these private/local records in UniFi:

| Record | Address |
|---|---:|
| `bastion-01.lab.seandre.dev` | `192.168.40.33` |
| `nexus.lab.seandre.dev` | `192.168.40.33` |

Do not add public Cloudflare A/AAAA records for either name. From `utility-01`, validate private resolution and trusted TLS:

```bash
dig @192.168.40.1 A nexus.lab.seandre.dev +short
curl --fail https://nexus.lab.seandre.dev/
openssl s_client \
  -connect nexus.lab.seandre.dev:443 \
  -servername nexus.lab.seandre.dev \
  -verify_return_error </dev/null
```

### Phase 5: Harden and Validate the Bastion

#### Complete Nexus onboarding

Read the one-time password locally on `bastion-01`:

```bash
sudo cat /opt/sonatype/sonatype-work/nexus3/admin.password
```

Open `https://nexus.lab.seandre.dev`, sign in as `admin`, and:

1. replace the temporary password with a unique password stored in the password manager;
2. choose Community Edition unless a Pro license is intentional;
3. disable anonymous access initially;
4. confirm **Settings → Repository → Data Store** shows H2;
5. record the installed version, `3.94.0-12`; and
6. leave OKD mirroring unconfigured until the connected cluster is healthy.

::: details Why H2 is acceptable here
This is initially a small artifact repository. Sonatype documents H2 for deployments below 200,000 requests per day or 100,000 components. Move to PostgreSQL before exceeding that profile or turning Nexus into a larger shared dependency. Container-based H2 deployments are not supported, which is why this guide uses the official archive and a system service.
:::

#### Restrict incoming traffic

Enable UFW from the Proxmox console and keep that console open until a new SSH session succeeds:

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
```

Allow SSH from the documented trusted networks:

```bash
sudo ufw allow from 192.168.2.0/24 to 192.168.40.33 port 22 proto tcp
sudo ufw allow from 192.168.10.0/24 to 192.168.40.33 port 22 proto tcp
sudo ufw allow from 192.168.40.0/24 to 192.168.40.33 port 22 proto tcp
```

Allow DNS from those networks:

```bash
sudo ufw allow from 192.168.2.0/24 to 192.168.40.33 port 53
sudo ufw allow from 192.168.10.0/24 to 192.168.40.33 port 53
sudo ufw allow from 192.168.40.0/24 to 192.168.40.33 port 53
```

Allow Nexus HTTPS:

```bash
sudo ufw allow from 192.168.2.0/24 to 192.168.40.33 port 443 proto tcp
sudo ufw allow from 192.168.10.0/24 to 192.168.40.33 port 443 proto tcp
sudo ufw allow from 192.168.40.0/24 to 192.168.40.33 port 443 proto tcp
```

Allow the OKD API and restrict machine-config traffic to the server VLAN:

```bash
sudo ufw allow from 192.168.2.0/24 to 192.168.40.29 port 6443 proto tcp
sudo ufw allow from 192.168.10.0/24 to 192.168.40.29 port 6443 proto tcp
sudo ufw allow from 192.168.40.0/24 to 192.168.40.29 port 6443 proto tcp
sudo ufw allow from 192.168.40.0/24 to 192.168.40.29 port 22623 proto tcp
```

Allow OKD application ingress from the trusted networks:

```bash
sudo ufw allow from 192.168.2.0/24 to 192.168.40.31 port 80 proto tcp
sudo ufw allow from 192.168.10.0/24 to 192.168.40.31 port 80 proto tcp
sudo ufw allow from 192.168.40.0/24 to 192.168.40.31 port 80 proto tcp

sudo ufw allow from 192.168.2.0/24 to 192.168.40.31 port 443 proto tcp
sudo ufw allow from 192.168.10.0/24 to 192.168.40.31 port 443 proto tcp
sudo ufw allow from 192.168.40.0/24 to 192.168.40.31 port 443 proto tcp
```

Allow only the three k3s nodes to reach the Glances API that Homepage will use. K3s masquerades this off-cluster traffic behind the node that currently runs the Homepage pod, so all three node addresses are required:

```bash
sudo ufw allow from 192.168.40.21 to 192.168.40.33 port 61208 proto tcp
sudo ufw allow from 192.168.40.22 to 192.168.40.33 port 61208 proto tcp
sudo ufw allow from 192.168.40.23 to 192.168.40.33 port 61208 proto tcp
```

Enable and inspect the firewall:

```bash
sudo ufw enable
sudo ufw status numbered
```

Open a new SSH session before closing the console or existing session. Never add an inbound rule for `8081`; Nexus must remain loopback-only.

#### Publish host telemetry to Homepage

Homepage now has a dedicated **Host Status** row for `pve-01`, `pve-02`, and `bastion-01`. The existing `pve-01` card already reads Glances. Install the same API service on the two new systems before expecting their cards to show CPU, RAM, swap, and uptime.

This procedure pins Glances `4.5.5` in an isolated Python virtual environment rather than replacing distribution-managed Python packages. Glances web mode provides the REST API on TCP `61208`; Homepage's custom API widget reads `/api/4/all`. Review the upstream [Glances installation](https://github.com/nicolargo/glances#installation), [REST API security guidance](https://glances.readthedocs.io/en/latest/api/restful.html#security), and [Homepage custom API widget](https://gethomepage.dev/widgets/services/customapi/) before deliberately changing this design.

On `pve-02`, open a root shell through SSH or the Proxmox console and install the runtime:

```bash
apt update
apt install -y python3-venv lm-sensors
python3 -m venv /opt/glances
/opt/glances/bin/pip install --upgrade pip
/opt/glances/bin/pip install 'glances[web]==4.5.5'
install -d -m 0755 /etc/glances
```

Open `editor /etc/glances/glances.conf` and add:

```ini
[outputs]
webui_allowed_hosts=localhost,127.0.0.1,192.168.40.25,pve-02.lab.seandre.dev
```

On `bastion-01`, install the same pinned runtime:

```bash
sudo apt update
sudo apt install -y python3-venv lm-sensors
sudo python3 -m venv /opt/glances
sudo /opt/glances/bin/pip install --upgrade pip
sudo /opt/glances/bin/pip install 'glances[web]==4.5.5'
sudo install -d -m 0755 /etc/glances
sudoedit /etc/glances/glances.conf
```

Use this host-specific configuration:

```ini
[outputs]
webui_allowed_hosts=localhost,127.0.0.1,192.168.40.33,bastion-01.lab.seandre.dev
```

Create `/etc/systemd/system/glances.service` on both systems with `editor /etc/systemd/system/glances.service` on `pve-02` and `sudoedit /etc/systemd/system/glances.service` on `bastion-01`. The file content is identical:

```ini
[Unit]
Description=Glances web monitoring API
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=/opt/glances/bin/glances -C /etc/glances/glances.conf -w
Restart=on-failure
RestartSec=5s
NoNewPrivileges=true
PrivateTmp=true
ProtectHome=true
ProtectSystem=full

[Install]
WantedBy=multi-user.target
```

Reload systemd and activate the service on each system. Omit `sudo` in the `pve-02` root shell:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now glances
systemctl is-enabled glances
systemctl is-active glances
curl --fail http://127.0.0.1:61208/api/4/status
```

The status endpoint should return JSON containing `"version":"4.5.5"`. The `webui_allowed_hosts` setting protects against DNS-rebinding requests, while UFW limits the bastion endpoint to the Kubernetes nodes. Do not forward TCP `61208` from the internet or expose it through public DNS.

From `utility-01`, prove that the Homepage pod can reach both APIs through the same network path its widgets use:

```bash
kubectl -n homepage exec -i deployment/homepage -- node - <<'NODE'
(async () => {
  const endpoints = {
    'pve-02': 'http://192.168.40.25:61208/api/4/status',
    'bastion-01': 'http://192.168.40.33:61208/api/4/status',
  };

  for (const [name, url] of Object.entries(endpoints)) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
    const status = await response.json();
    console.log(`${name}: Glances ${status.version}`);
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
NODE
```

::: tip Why there is no CORS setting
Homepage fetches service-widget data through its server-side proxy, not directly from the browser. The firewall rules and Glances host-header allowlist protect the internal API without opening browser-origin access.
:::

#### Validate the bastion checkpoint

On `bastion-01`, confirm the service state and configuration syntax:

```bash
systemctl is-active ssh
systemctl is-active qemu-guest-agent
systemctl is-active dnsmasq
systemctl is-active haproxy
systemctl is-active nexus
systemctl is-active glances

sudo dnsmasq --test
sudo haproxy -c -f /etc/haproxy/haproxy.cfg
sudo ss -ltnup
```

Expected listeners include:

- `.33:53` TCP/UDP for `dnsmasq`;
- `.33:443` for Nexus through HAProxy;
- `.29:6443` and `.29:22623` for the OKD API frontends;
- `.31:80` and `.31:443` for OKD ingress;
- `127.0.0.1:8081` for Nexus itself;
- `.33:61208` for Glances, restricted by UFW to the three k3s nodes; and
- TCP `22` for SSH/socket activation.

From `utility-01`, verify DNS, Nexus, and the HAProxy frontends:

```bash
dig @192.168.40.33 A ubuntu.com
dig @192.168.40.33 TXT _acme-challenge.seandre.dev
curl --fail https://nexus.lab.seandre.dev/
nc -vz 192.168.40.29 6443
nc -vz 192.168.40.29 22623
nc -vz 192.168.40.31 80
nc -vz 192.168.40.31 443
```

The `nc` checks prove that HAProxy owns the frontends. Application requests cannot succeed until the OKD nodes provide healthy backends.

#### Back up and restore Nexus before relying on it

Nexus stores metadata and configuration in its database and repository content in blob stores. They must be backed up together. Configure an **Admin – Backup H2 Database** task in Nexus, then preserve these paths in the same recovery set:

```text
/opt/sonatype/sonatype-work/nexus3/db
/opt/sonatype/sonatype-work/nexus3/blobs
/opt/sonatype/sonatype-work/nexus3/etc
/opt/sonatype/sonatype-work/nexus3/keystores/node
```

The destination must be outside `bastion-01`, such as a NAS, Proxmox Backup Server, or another independently protected system. A second directory on the same VM disk is not a backup. For the current two-host architecture, follow [Operations 05: Proxmox Backup Server on `pve-01`](../operations/proxmox-backup-server.md). It creates a PBS VM and datastore on the physically separate `pve-01`, then uses a stopped whole-VM backup to preserve the database, blobs, configuration, and node identity together.

For a consistent periodic offline copy, stop Nexus and copy the complete data directory to a timestamped directory on the external target:

```bash
sudo systemctl stop nexus
sudo rsync -aHAX \
  /opt/sonatype/sonatype-work/nexus3/ \
  /mnt/EXTERNAL-BACKUP/nexus3-TIMESTAMP/
sudo systemctl start nexus
```

The `rsync` example applies when the external target is mounted directly in the guest. When using the planned PBS target, do not add a separate guest mount merely to imitate this command: run the H2 task, make the stopped `bastion-01` backup, and complete the isolated restore drill in Operations 05. For any restore method, use the same pinned Nexus version, correct the data ownership when restoring files, and prove that repository configuration and a test artifact are present. Follow Sonatype's current [backup](https://help.sonatype.com/en/prepare-a-backup.html) and [H2 restore](https://help.sonatype.com/en/restore-an-h2-database.html) procedures.

::: warning Recovery is the acceptance test
A successful copy is not enough. Do not make Nexus an OKD dependency until the database and matching blob-store backup have been restored and a known test artifact has been downloaded from the restored instance.
:::

The required Step 6 checkpoint is complete when:

| Done | Acceptance criterion |
|:---:|---|
| ☐ | `bastion-01` has 4 vCPU, 12 GiB RAM, and approximately 300 GiB on `local-lvm`. |
| ☐ | `.33`, `.29`, and `.31` survive a reboot on the same interface. |
| ☐ | SSH and Nexus management are limited to the trusted LAN/VPN networks. |
| ☐ | `dnsmasq` answers on `.33:53` and forwards unmatched public TXT queries. |
| ☐ | Nexus is reachable through trusted HTTPS on `nexus.lab.seandre.dev` and listens only on loopback behind HAProxy. |
| ☐ | HAProxy owns the API, machine-config, and ingress frontends on the correct destination addresses. |
| ☐ | Homepage shows live CPU, RAM, swap, and uptime for both `pve-02` and `bastion-01`. |
| ☐ | Nexus database, blobs, configuration, and node identity have an external backup and a successful restore test. |
| ☐ | No OKD private records or UniFi Forward Domain have been activated yet. |

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
grep -q '^127.0.1.1 k8s-worker-03.lab.seandre.dev k8s-worker-03$' /etc/hosts || \
  echo '127.0.1.1 k8s-worker-03.lab.seandre.dev k8s-worker-03' | sudo tee -a /etc/hosts
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
ssh sean@k8s-worker-03.lab.seandre.dev
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
