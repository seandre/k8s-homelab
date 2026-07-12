# Overview 03: Architecture Decisions

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
| 2026-07-10 | Use Sealed Secrets as the homelab GitOps secrets learning workflow | It teaches encrypted GitOps, key custody, deliberate rotation, and recovery with the current Argo CD model; an external secret manager remains the enterprise target |
| 2026-07-12 | Install connected compact OKD directly on the three matching HP 805 G8 systems | Three schedulable control-plane nodes provide etcd quorum and OpenShift administration practice without an interim destructive k3s rebuild |
| 2026-07-11 | Keep the HP 800 G6 as standalone `pve-02` | It adds flexible VM and installer capacity without mixing the matching Ryzen Kubernetes failure domains into Proxmox |
| 2026-07-12 | Separate `utility-01` automation from `bastion-01` infrastructure services | Installer tools and kubeconfig custody remain independent of the DNS, HAProxy, and Nexus services required by OKD |
| 2026-07-12 | Keep RFC1918 records private and use Cloudflare only for ACME DNS-01 | Public trust does not require publishing homelab addresses or opening inbound HTTP/S |
| 2026-07-12 | Install OKD connected before adding Nexus mirroring | This isolates installation failures from mirror and disconnected-registry failures |
