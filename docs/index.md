# Seandre Homelab Documentation

This site is the readable view of the Markdown documentation stored in the homelab Git repository. Git remains the source of truth.

## Required Build Order

1. [Public DNS and trusted TLS](build/public-domain-tls.md)
2. [`utility-01` automation server](build/utility-automation-server.md)
3. [`pve-02` and `bastion-01`](build/pve-02-and-bastion.md)
4. [Connected compact OKD](build/compact-okd.md)

Read the [complete documentation order](overview/documentation-order.md) for optional projects and operations references. The [infrastructure reference](overview/infrastructure-reference.md) is the canonical source for hardware, addresses, storage, and DNS; the [network topology](overview/network-topology.md) records the live UniFi VLANs, zones, uplinks, and policy boundaries.

The approved [Homelab Homepage Architecture](overview/homepage-architecture.md) defines the planned btop-inspired replacement for the current Homepage application, including its views, telemetry sources, security boundary, k3s rollout, OKD migration, and rollback gates. Follow the [Homepage Rework Build Plan](build/homepage-rework.md) to implement it as bounded, acceptance-tested tasks while preserving the existing deployment as the rollback target.

## Current Platform

- Proxmox VE hosts the virtual machines.
- The existing three-node k3s cluster is the active application platform.
- Argo CD reconciles Kubernetes state from this repository.
- Traefik uses the private ingress VIP `192.168.40.30`.
- `pve-02` is an active standalone Proxmox VE host, and `bastion-01` runs DNS forwarding, HAProxy, Nexus, and Glances on it.
- `pbs-01` runs on the separate physical host `pve-01`; the stopped `bastion-01` backup, automatic verification, and isolated Nexus artifact restore test have passed.
- The six current k3s applications use private `lab.seandre.dev` names with ready publicly trusted certificates.
- Compact OKD remains planned. Its three Ryzen systems are on hand, and the selected next phase is identical offline temporary-Ubuntu installations followed by the three-node HPL benchmark; OKD will overwrite those installations afterward.
