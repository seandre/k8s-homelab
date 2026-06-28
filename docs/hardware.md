# Hardware

## pve-01

| Item         | Value                    |
| ------------ | ------------------------ |
| Model        | HP EliteDesk 800 G6 Mini |
| CPU          | Intel Core i5-10500T     |
| CPU layout   | 6 cores / 12 threads     |
| RAM          | 64 GB DDR4 SO-DIMM       |
| Boot disk    | 256 GB NVMe              |
| VM/data disk | 2 TB NVMe                |
| Current OS   | Proxmox VE               |
| Current IP   | 192.168.40.20            |
| Role         | Primary Proxmox host     |

## Storage Layout

| Disk        | Purpose                               |
| ----------- | ------------------------------------- |
| 256 GB NVMe | Proxmox boot/system disk              |
| 2 TB NVMe   | Proxmox LVM-thin storage `vmdata` for VM disks and Kubernetes lab workloads |

## Notes

Proxmox is installed and running on the 256 GB NVMe. The 2 TB NVMe is installed separately and has been added in Proxmox as LVM-thin storage named `vmdata`.

Proxmox is reachable at `192.168.40.20`.
