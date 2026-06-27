# Proxmox VM Layout

## Storage Layout

| Storage     | Backing Disk | Purpose                                        |
| ----------- | ------------ | ---------------------------------------------- |
| `local`     | 256 GB NVMe  | ISOs, snippets, backups if needed              |
| `local-lvm` | 256 GB NVMe  | Default Proxmox VM storage, avoid for main VMs |
| `vmdata`    | 2 TB NVMe    | Primary VM disks                               |

## Kubernetes VM Layout

| VM               | vCPU |    RAM |   Disk | Storage  |              IP |
| ---------------- | ---: | -----: | -----: | -------- | --------------: |
| `k8s-control-01` |    2 |   8 GB |  80 GB | `vmdata` | `192.168.40.21` |
| `k8s-worker-01`  |    4 |  16 GB | 150 GB | `vmdata` | `192.168.40.22` |
| `k8s-worker-02`  |    4 |  16 GB | 150 GB | `vmdata` | `192.168.40.23` |
| `utility-01`     |    2 | 4-8 GB | 100 GB | `vmdata` | `192.168.40.24` |

## Notes

Store real VM disks on the 2 TB NVMe storage pool. Keep the 256 GB boot disk mostly for Proxmox itself, ISOs, and small temporary items.
