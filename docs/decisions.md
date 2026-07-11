# Architecture Decisions

| Date | Decision | Reason |
|---|---|---|
| Initial build | Use Proxmox VE with Ubuntu Server VMs and k3s | Provides simple VM lifecycle management and a lightweight Kubernetes learning platform |
| Initial build | Keep primary VM disks on the separate `pve-01` LVM-thin pool `vmdata` | Separates workloads from the Proxmox system disk |
| Initial build | Use the UniFi `Servers` network on VLAN `40` | Keeps infrastructure on the dedicated `192.168.40.0/24` network |
| Initial build | Use the full Ubuntu Server template with OpenSSH and `qemu-guest-agent` | Keeps early troubleshooting predictable and gives Proxmox guest visibility |
| 2026-06-28 | Check UniFi security filtering early when ICMP works but TCP fails | Intrusion Prevention caused intermittent SSH failures across hosts |
| 2026-06-29 | Use GitHub as the primary remote and defer self-hosted Git | Recovery must not depend on an in-cluster Git service |
| 2026-06-29 | Use Argo CD to reconcile cluster state from this repository | Normal changes should be Git-driven; manual apply is for bootstrap and break-glass recovery |
| 2026-06-30 | Use explicit Argo CD sync waves for ingress dependencies | MetalLB resources must precede the Traefik load balancer and dependent ingresses |
| 2026-06-30 | Allow Traefik to read Kubernetes nodes | Traefik's Kubernetes provider requires node list/watch access for this deployment |
| 2026-07-09 | Keep `pve-02` standalone during its first project | A two-node Proxmox cluster needs an explicit quorum design |
