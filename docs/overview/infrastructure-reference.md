# Overview 01: Infrastructure Reference

This is the source of truth for homelab hardware, storage, VM sizing, network addresses, and internal DNS names. Project-specific build steps live in the linked tutorials.

Last live verification: 2026-07-18.

## Physical Hosts

| Host | Status | Model | CPU | RAM | Disks | Management IP |
|---|---|---|---|---:|---|---:|
| `pve-01` | Active | HP EliteDesk 800 G6 Mini | Intel Core i5-10500T, 6C/12T | 64 GB | 256 GB NVMe system, 2 TB NVMe VM data | `192.168.40.20` |
| `pve-02` | Active; standalone PVE host | HP EliteDesk 800 G6 Mini | Intel Core i5-10500T, 6C/12T | 32 GB | 512 GB storage | `192.168.40.25` |
| `okd-cp-01` | Hardware received; SSD pending | HP EliteDesk 805 G8 Mini | AMD Ryzen 5 PRO 5650GE, 6C/12T | 16 GB, 32 GB planned | 1 TB Patriot Memory P400 Lite SSD pending installation | `192.168.40.26` |
| `okd-cp-02` | Hardware received; SSD pending | HP EliteDesk 805 G8 Mini | AMD Ryzen 5 PRO 5650GE, 6C/12T | 16 GB, 32 GB planned | 1 TB Patriot Memory P400 Lite SSD pending installation | `192.168.40.27` |
| `okd-cp-03` | Hardware received; SSD pending | HP EliteDesk 805 G8 Mini | AMD Ryzen 5 PRO 5650GE, 6C/12T | 16 GB, 32 GB planned | 1 TB Patriot Memory P400 Lite SSD pending installation | `192.168.40.28` |

`pve-02` remains standalone and hosts `bastion-01`. Do not add the matching 805 G8 systems to Proxmox; reserve them for [Build 04: Connected Compact OKD](../build/compact-okd.md).

## Proxmox Storage

| Host | Storage | Backing disk | Purpose |
|---|---|---|---|
| `pve-01` | `local` | 256 GB NVMe | ISOs, snippets, and small local files |
| `pve-01` | `local-lvm` | 256 GB NVMe | Default thin pool; avoid for primary VMs |
| `pve-01` | `vmdata` | 2 TB NVMe | Primary VM disks |
| `pve-01` | `pbs-pve02-restore` | Network access to `pbs-01` datastore `pve02-backups` | Restore-only access for the isolated `bastion-01` recovery drill |
| `pve-02` | `local-lvm` | 512 GB storage | Primary VM disks on the standalone host |
| `pve-02` | `pbs-pve02` | Network access to `pbs-01` datastore `pve02-backups` | Daily stopped backup of `bastion-01` |

Storage identifiers are local to each standalone host. The single-disk `pve-02` does not need a storage ID named `vmdata` merely to match `pve-01`.

## VM Layout

| VM | Status | Proxmox host | vCPU | RAM | Disk | Storage | IP |
|---|---|---|---:|---:|---:|---|---:|
| `k8s-control-01` | Active | `pve-01` | 2 | 8 GB | 80 GB | `vmdata` | `192.168.40.21` |
| `k8s-worker-01` | Active | `pve-01` | 4 | 16 GB | 150 GB | `vmdata` | `192.168.40.22` |
| `k8s-worker-02` | Active | `pve-01` | 4 | 16 GB | 150 GB | `vmdata` | `192.168.40.23` |
| `utility-01` | Active | `pve-01` | 2 | 8 GB | 100 GB | `vmdata` | `192.168.40.24` |
| `pbs-01` | Active; Nexus recovery acceptance passed | `pve-01` | 4 | 6 GB | 64 GB OS + 500 GB datastore | `vmdata` | `192.168.40.34` |
| `bastion-01` | Active; protected by PBS and restore-tested | `pve-02` | 4 | 12 GB | 300 GB | `local-lvm` | `192.168.40.33` plus `.29`, `.31` |

Build `utility-01` with [Build 02: Utility Automation Server](../build/utility-automation-server.md). `bastion-01` is a separate infrastructure dependency providing `dnsmasq`, HAProxy, and Nexus.

The three `okd-cp-*` hosts are physical, schedulable OKD control-plane nodes rather than Proxmox VMs.

## Network

The [Network Topology and UniFi Policy](network-topology.md) documents the complete logical diagram, VLAN and firewall-zone matrix, UDM port assignments, remote access, and hardening backlog.

| Item | Value |
|---|---|
| UniFi network | `Servers` |
| Subnet | `192.168.40.0/24` |
| VLAN ID | `40` |
| Gateway and DNS | `192.168.40.1` |
| Routed LAN DHCP domain | `lab.home.arpa` |
| Canonical private split-DNS zone | `lab.seandre.dev` |
| IPv6 | Explicitly disabled on LANs; WAN delegation disabled |
| Ingress VIP | `192.168.40.30` |
| OKD API / ingress VIPs | `192.168.40.29` / `192.168.40.31` |
| Bastion management | `192.168.40.33` |
| PBS management | `pbs-01.lab.seandre.dev` (`192.168.40.34`); active and reserved |

The switch port/native network carries VLAN `40`, so Proxmox VM NIC VLAN tags remain blank. UDM port 1 is hardened as a native/access Servers port with all tagged VLANs blocked. The primary workstation LAN is Main/Trusted VLAN `20` at `192.168.20.0/24`; Default VLAN `1` at `192.168.10.0/24` is retained as a wired recovery network. Administrative access from Trusted to Management and Servers is limited to the approved MacBook, while Teleport retains separate VPN access to Trusted and Servers.

## Active Internal DNS

Infrastructure names resolve to their host addresses. Kubernetes application names resolve to the shared Traefik ingress VIP.

| Name | Address |
|---|---:|
| `pve-01.lab.seandre.dev` | `192.168.40.20` |
| `k8s-control-01.lab.seandre.dev` | `192.168.40.21` |
| `k8s-worker-01.lab.seandre.dev` | `192.168.40.22` |
| `k8s-worker-02.lab.seandre.dev` | `192.168.40.23` |
| `utility-01.lab.seandre.dev` | `192.168.40.24` |
| `pve-02.lab.seandre.dev` | `192.168.40.25` |
| `bastion-01.lab.seandre.dev` | `192.168.40.33` |
| `nexus.lab.seandre.dev` | CNAME to `bastion-01.lab.seandre.dev` (`192.168.40.33`) |
| `pbs-01.lab.seandre.dev` | `192.168.40.34` |
| `ingress.lab.seandre.dev` | `192.168.40.30` |
| `argocd.lab.seandre.dev` | CNAME to `ingress.lab.seandre.dev` |
| `grafana.lab.seandre.dev` | CNAME to `ingress.lab.seandre.dev` |
| `home.lab.seandre.dev` | CNAME to `ingress.lab.seandre.dev` |
| `nginx-test.lab.seandre.dev` | CNAME to `ingress.lab.seandre.dev` |
| `kosync.lab.seandre.dev` | CNAME to `ingress.lab.seandre.dev` |
| `docs.lab.seandre.dev` | CNAME to `ingress.lab.seandre.dev` |

The `utility-01` operating-system hostname remains `utility-01.lab.home.arpa`, but its active network DNS name is `utility-01.lab.seandre.dev`. The old infrastructure and application `.home.arpa` names no longer resolve and must not be used in current connection examples.

The public-domain rows are private split-DNS records. Cloudflare remains authoritative publicly but contains no homelab A/AAAA records; it is used for ACME TXT challenges.

## Reserved or Planned DNS

These names and addresses are reserved for later work but intentionally do not resolve yet:

| Name | Planned address or target |
|---|---:|
| `okd-cp-01.okd.lab.seandre.dev` | `192.168.40.26` |
| `okd-cp-02.okd.lab.seandre.dev` | `192.168.40.27` |
| `okd-cp-03.okd.lab.seandre.dev` | `192.168.40.28` |
| `api.okd.lab.seandre.dev` | `192.168.40.29` |
| `api-int.okd.lab.seandre.dev` | CNAME to `api.okd.lab.seandre.dev` |
| `*.apps.okd.lab.seandre.dev` | `192.168.40.31` |
| `k8s-worker-03.lab.seandre.dev` | `192.168.40.32`; optional exercise only |

`bastion-01` already forwards unmatched DNS queries, but the OKD records and UniFi Forward Domain remain inactive until Gate 3 of Build 04.

SSH, Mosh, Proxmox, and optional RDP are internal administration services. They do not belong behind Kubernetes ingress and should not be forwarded from the public internet.

Use `https://pve-01.lab.seandre.dev:8006` for the active Proxmox UI after completing [Operations 04: Proxmox Public TLS](../operations/proxmox-public-tls.md). Keep the installed Proxmox node name `pve01`; the new FQDN is a DNS and certificate identity, not a node rename.

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
