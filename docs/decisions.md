# Decision Log
| Date | Decision | Reason |
|---|---|---|
| TBD | Use Proxmox VE as base hypervisor | Better VM lifecycle, snapshots, and templates |
| TBD | Use k3s first | Simple, lightweight, good for learning |
| TBD | Use Ubuntu Server first | Familiar and easy to troubleshoot |
| TBD | Retire 256 GB SSD from active build plan | Too small for final Proxmox/Kubernetes lab |
| TBD | Use installed 2 TB NVMe for final build | Enough room for VMs, metrics, logs, snapshots, and experiments |
| TBD | Use UniFi Servers network | Keep homelab infrastructure grouped on the dedicated server network |
| TBD | Use Argo CD later | GitOps practice for platform engineering |
| TBD | Resize Ubuntu VM disks with LVM after Proxmox disk expansion | Ubuntu Server template disks use LVM, so expanded VM disks need `growpart`, `pvresize`, and `lvextend` inside the guest |
