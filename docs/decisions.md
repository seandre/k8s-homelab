# Decision Log
| Date | Decision | Reason |
|---|---|---|
| TBD | Use Proxmox VE as base hypervisor | Better VM lifecycle, snapshots, and templates |
| TBD | Use k3s first | Simple, lightweight, good for learning |
| TBD | Use Ubuntu Server 26.04 normal install for the VM template | Familiar, easy to troubleshoot, and includes the expected baseline packages |
| TBD | Do not use Ubuntu minimized install | Avoid missing common tools during early lab setup |
| TBD | Do not install featured server snaps in the template | Keep the template clean and minimal for Kubernetes nodes |
| TBD | Enable OpenSSH in the template | Allows immediate remote administration after cloning |
| TBD | Install `qemu-guest-agent` in the template | Gives Proxmox guest visibility and cleaner VM lifecycle operations |
| TBD | Treat the qemu guest agent `systemctl enable` warning as non-fatal | The warning was encountered during manual setup and did not block the template build |
| TBD | Use 256 GB NVMe as the Proxmox boot/system disk | Current manual build has Proxmox installed and running there |
| TBD | Use the separate 2 TB NVMe as Proxmox LVM-thin storage named `vmdata` | Keeps VM disks and Kubernetes workloads off the boot disk |
| TBD | Use UniFi Servers / Homelab network on VLAN ID `40` | Keep homelab infrastructure grouped on the dedicated `192.168.40.0/24` network |
| 2026-06-28 | Treat UniFi UDM Pro Intrusion Prevention as part of SSH troubleshooting | IPS can allow ICMP while intermittently timing out TCP/22, which looks like Proxmox or VM instability unless checked early |
| TBD | Use Argo CD for GitOps bootstrap | Provides a GitOps control plane for managing future cluster services |
| 2026-06-29 | Keep GitHub as the primary Git remote during bootstrap | Avoids a circular dependency where the cluster needs self-hosted Git in order to recover the cluster |
| 2026-06-29 | Defer self-hosted Git | Forgejo/Gitea can be evaluated later, but it is not needed for the current learning and bootstrap path |
| 2026-06-29 | Use Argo CD to reconcile cluster infrastructure from this repo | The next GitOps milestone is for Argo CD to watch `kubernetes/clusters/homelab` rather than relying on repeated workstation `kubectl apply` |
| 2026-06-29 | Add a utility/admin VM after the initial GitOps path is clear | A utility VM is useful for stable in-network administration, but it should support the workflow rather than block ingress and Argo CD app setup |
| TBD | Resize Ubuntu VM disks with LVM after Proxmox disk expansion | Ubuntu Server template disks use LVM, so expanded VM disks need `growpart`, `pvresize`, and `lvextend` inside the guest |
