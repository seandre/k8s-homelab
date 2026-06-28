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
| TBD | Use Argo CD later | GitOps practice for platform engineering |
| TBD | Resize Ubuntu VM disks with LVM after Proxmox disk expansion | Ubuntu Server template disks use LVM, so expanded VM disks need `growpart`, `pvresize`, and `lvextend` inside the guest |
