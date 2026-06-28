# Homelab

Kubernetes homelab built on Proxmox VE.

## Hardware

- Host: HP EliteDesk 800 G6 Mini
- CPU: Intel Core i5-10500T
- RAM: 64 GB
- Installed SSD: 2 TB NVMe
- Previous SSD: 256 GB
- Hypervisor: Proxmox VE

## Goal

Build a reproducible Kubernetes homelab for platform engineering practice.
Initial stack:

- Proxmox VE
- Ubuntu Server VMs
- k3s
- Argo CD
- ingress
- cert-manager
- monitoring
- local test apps

## Current Status

- 64 GB RAM installed
- 2 TB NVMe installed
- Proxmox VE installed on the HP EliteDesk mini PC
- 2 TB NVMe configured as Proxmox LVM-thin storage `vmdata`
- UniFi `Servers` network on VLAN ID `40` selected for homelab infrastructure
- Clients added in UniFi based on MAC address, set to static IPs and dns entries added
- Proxmox host reachable at `192.168.40.20`
- Kubernetes control-plane and worker VMs cloned and networked
- Worker nodes are set up
- UniFi UDM Pro Intrusion Prevention was identified as the cause of intermittent SSH/TCP timeouts and adjusted
- Next step: install the k3s control plane and join workers
