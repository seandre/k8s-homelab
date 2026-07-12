# Overview 01: Infrastructure Reference

This is the source of truth for homelab hardware, storage, VM sizing, network addresses, and internal DNS names. Project-specific build steps live in the linked tutorials.

## Physical Hosts

| Host | Status | Model | CPU | RAM | Disks | Management IP |
|---|---|---|---|---:|---|---:|
| `pve-01` | Active | HP EliteDesk 800 G6 Mini | Intel Core i5-10500T, 6C/12T | 64 GB | 256 GB NVMe system, 2 TB NVMe VM data | `192.168.40.20` |
| `pve-02` | Hardware received | HP EliteDesk 800 G6 Mini | Intel Core i5-10500T, 6C/12T | 32 GB | 512 GB storage | `192.168.40.25` |
| `okd-cp-01` | Hardware received; SSD pending | HP EliteDesk 805 G8 Mini | AMD Ryzen 5 PRO 5650GE, 6C/12T | 16 GB, 32 GB planned | 1 TB Patriot Memory P400 Lite SSD pending installation | `192.168.40.26` |
| `okd-cp-02` | Hardware received; SSD pending | HP EliteDesk 805 G8 Mini | AMD Ryzen 5 PRO 5650GE, 6C/12T | 16 GB, 32 GB planned | 1 TB Patriot Memory P400 Lite SSD pending installation | `192.168.40.27` |
| `okd-cp-03` | Hardware received; SSD pending | HP EliteDesk 805 G8 Mini | AMD Ryzen 5 PRO 5650GE, 6C/12T | 16 GB, 32 GB planned | 1 TB Patriot Memory P400 Lite SSD pending installation | `192.168.40.28` |

`pve-02` remains standalone and hosts `bastion-01`. Do not add the matching 805 G8 systems to Proxmox; reserve them for [Build 04: Connected Compact OKD](../10-build/04-compact-okd.md).

## Proxmox Storage

| Host | Storage | Backing disk | Purpose |
|---|---|---|---|
| `pve-01` | `local` | 256 GB NVMe | ISOs, snippets, and small local files |
| `pve-01` | `local-lvm` | 256 GB NVMe | Default thin pool; avoid for primary VMs |
| `pve-01` | `vmdata` | 2 TB NVMe | Primary VM disks |
| `pve-02` | `local-lvm` | 512 GB storage | Planned primary VM disks on the standalone host |

Storage identifiers are local to each standalone host. The single-disk `pve-02` does not need a storage ID named `vmdata` merely to match `pve-01`.

## VM Layout

| VM | Status | Proxmox host | vCPU | RAM | Disk | Storage | IP |
|---|---|---|---:|---:|---:|---|---:|
| `k8s-control-01` | Active | `pve-01` | 2 | 8 GB | 80 GB | `vmdata` | `192.168.40.21` |
| `k8s-worker-01` | Active | `pve-01` | 4 | 16 GB | 150 GB | `vmdata` | `192.168.40.22` |
| `k8s-worker-02` | Active | `pve-01` | 4 | 16 GB | 150 GB | `vmdata` | `192.168.40.23` |
| `utility-01` | Next project | `pve-01` | 2 | 8 GB | 100 GB | `vmdata` | `192.168.40.24` |
| `bastion-01` | Planned after `pve-02` | `pve-02` | 4 | 12 GB | ~300 GB | `local-lvm` | `192.168.40.33` plus `.29`, `.31` |

Build `utility-01` with [Build 02: Utility Automation Server](../10-build/02-utility-automation-server.md). `bastion-01` is a separate infrastructure dependency providing `dnsmasq`, HAProxy, and Nexus.

The three `okd-cp-*` hosts are physical, schedulable OKD control-plane nodes rather than Proxmox VMs.

## Network

| Item | Value |
|---|---|
| UniFi network | `Servers` |
| Subnet | `192.168.40.0/24` |
| VLAN ID | `40` |
| Gateway and DNS | `192.168.40.1` |
| Internal domain | `lab.home.arpa` |
| Ingress VIP | `192.168.40.30` |
| OKD API / ingress VIPs | `192.168.40.29` / `192.168.40.31` |
| Bastion management | `192.168.40.33` |

The switch port/native network carries VLAN `40`, so Proxmox VM NIC VLAN tags remain blank. The workstation LAN is `192.168.10.0/24`; routing and security policy between it and the server VLAN are handled by UniFi.

## Internal DNS

Infrastructure names resolve to their host addresses. Kubernetes application names resolve to the shared Traefik ingress VIP.

| Name | Address |
|---|---:|
| `utility-01.lab.home.arpa` | `192.168.40.24` |
| `pve-02.lab.home.arpa` | `192.168.40.25` |
| `bastion-01.lab.home.arpa` | `192.168.40.33` |
| `nexus.lab.seandre.dev` | `192.168.40.33` |
| `okd-cp-01.okd.lab.seandre.dev` | `192.168.40.26` |
| `okd-cp-02.okd.lab.seandre.dev` | `192.168.40.27` |
| `okd-cp-03.okd.lab.seandre.dev` | `192.168.40.28` |
| `api.okd.lab.seandre.dev` | `192.168.40.29` |
| `api-int.okd.lab.seandre.dev` | CNAME to `api.okd.lab.seandre.dev` |
| `*.apps.okd.lab.seandre.dev` | `192.168.40.31` |
| `k8s-worker-03.lab.home.arpa` | `192.168.40.32` |
| `argocd.lab.home.arpa` | `192.168.40.30` |
| `grafana.lab.home.arpa` | `192.168.40.30` |
| `home.lab.home.arpa` | `192.168.40.30` |
| `nginx-test.lab.home.arpa` | `192.168.40.30` |
| `kosync.lab.home.arpa` | `192.168.40.30` |
| `argocd.lab.seandre.dev` | `192.168.40.30` |
| `grafana.lab.seandre.dev` | `192.168.40.30` |
| `home.lab.seandre.dev` | `192.168.40.30` |
| `nginx-test.lab.seandre.dev` | `192.168.40.30` |
| `kosync.lab.seandre.dev` | `192.168.40.30` |
| `docs.lab.seandre.dev` | `192.168.40.30` |

The public-domain rows are private split-DNS records. Cloudflare remains authoritative publicly but contains no homelab A/AAAA records; it is used for ACME TXT challenges. `bastion-01` serves the OKD forward and reverse records, with UniFi conditionally forwarding `okd.lab.seandre.dev` to `.33`.

SSH, Mosh, Proxmox, and optional RDP are internal administration services. They do not belong behind Kubernetes ingress and should not be forwarded from the public internet.

## Ubuntu Template and Disk Growth

The template uses Ubuntu Server 26.04 normal install with OpenSSH and `qemu-guest-agent`. It does not use the minimized install or featured server snaps.

After increasing a clone's virtual disk in Proxmox, inspect the device with `lsblk`, then grow the Ubuntu LVM root filesystem:

```bash
sudo growpart /dev/sda 3
sudo pvresize /dev/sda3
sudo lvextend -r -l +100%FREE /dev/mapper/ubuntu--vg-ubuntu--lv
df -h
```

If the disk is `/dev/vda`, use `/dev/vda3` instead.
