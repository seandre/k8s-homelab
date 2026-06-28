# Install Runbook

## Active Phase: Final 2 TB Build

- [x] Create Proxmox USB installer
- [x] Enable Intel virtualization in BIOS
- [x] Disable Secure Boot if needed
- [x] Install Proxmox on 256 GB NVMe
- [ ] Set Proxmox hostname to `pve-01.lab.home.arpa`
- [x] Attach Proxmox to the UniFi `Servers` network
- [x] Set Proxmox IP to `192.168.40.20`
- [x] Open Proxmox UI at `https://192.168.40.20:8006`
- [x] Upload Ubuntu Server ISO
- [x] Create Ubuntu Server VM template
- [ ] Clone Kubernetes VMs
- [ ] Install k3s control plane
- [ ] Join k3s workers
- [ ] Add Argo CD
- [ ] Add ingress
- [ ] Add cert-manager
- [ ] Add monitoring
- [ ] Deploy first real app

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
