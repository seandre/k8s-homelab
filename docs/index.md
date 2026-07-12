# Seandre Homelab Documentation

This site is the readable view of the Markdown documentation stored in the homelab Git repository. Git remains the source of truth.

## Required Build Order

1. [Public DNS and trusted TLS](10-build/01-public-domain-tls.md)
2. [`utility-01` automation server](10-build/02-utility-automation-server.md)
3. [`pve-02` and `bastion-01`](10-build/03-pve-02-and-bastion.md)
4. [Connected compact OKD](10-build/04-compact-okd.md)

Read the [complete documentation order](00-overview/00-documentation-order.md) for optional projects and operations references. The [infrastructure reference](00-overview/01-infrastructure-reference.md) is the canonical source for hardware, addresses, storage, and DNS.

## Current Platform

- Proxmox VE hosts the virtual machines.
- The existing three-node k3s cluster is the active application platform.
- Argo CD reconciles Kubernetes state from this repository.
- Traefik uses the private ingress VIP `192.168.40.30`.
- Compact OKD, `pve-02`, and `bastion-01` remain planned builds.
