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

Proxmox is installed and running on the 256 GB NVMe and is reachable at `192.168.40.20`.

Store real VM disks on the 2 TB NVMe LVM-thin storage pool named `vmdata`. Keep the 256 GB boot disk mostly for Proxmox itself, ISOs, and small temporary items.

The Ubuntu Server template was built with Ubuntu Server 26.04 normal install. The minimized install was not used, no featured server snaps were installed, OpenSSH was enabled, and `qemu-guest-agent` was installed. The qemu guest agent `systemctl enable` warning was treated as non-fatal.

## VM Disk Resize Procedure

Resize the VM disk in the Proxmox GUI first. Proxmox disk resize is additive, so from a 40 GB Ubuntu Server template disk:

- `k8s-control-01` target 80 GB: add `+40G`
- `k8s-worker-01` target 150 GB: add `+110G`
- `k8s-worker-02` target 150 GB: add `+110G`

Inside Ubuntu, the install used LVM. Use `lsblk` first to confirm the disk and partition layout, then resize the LVM-backed root filesystem:

```bash
sudo growpart /dev/sda 3
sudo pvresize /dev/sda3
sudo lvextend -r -l +100%FREE /dev/mapper/ubuntu--vg-ubuntu--lv
df -h
```

If the disk appears as `/dev/vda` instead of `/dev/sda`, use `/dev/vda3`.
