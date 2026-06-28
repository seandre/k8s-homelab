# Install Runbook

## Active Phase: Current Manual Build

- [x] Create Proxmox USB installer
- [x] Enable Intel virtualization in BIOS
- [x] Disable Secure Boot if needed
- [x] Install Proxmox on 256 GB NVMe
- [x] Add 2 TB NVMe in Proxmox as LVM-thin storage `vmdata`
- [ ] Set Proxmox hostname to `pve-01.lab.home.arpa`
- [x] Attach Proxmox to the UniFi `Servers` network
- [x] Set Proxmox IP to `192.168.40.20`
- [x] Open Proxmox UI at `https://192.168.40.20:8006`
- [x] Upload Ubuntu Server ISO
- [x] Create Ubuntu Server VM template
- [x] Use Ubuntu Server 26.04 normal install for the template
- [x] Do not use Ubuntu minimized install
- [x] Do not install featured server snaps
- [x] Enable OpenSSH
- [x] Install `qemu-guest-agent`
- [x] Treat the `systemctl enable` warning for qemu guest agent as non-fatal
- [ ] Create or verify the UDM Pro Homelab network on VLAN ID `40`
- [ ] Verify gateway reachability at `192.168.40.1`
- [ ] Clone Kubernetes VMs
- [ ] Clone `k8s-control-01`
- [ ] Set `k8s-control-01` hostname and static IP
- [ ] Verify SSH to `k8s-control-01`
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

## Ubuntu Template Notes

The template was built from Ubuntu Server 26.04 using the normal install. The minimized install was not used, no featured server snaps were installed, OpenSSH was enabled, and `qemu-guest-agent` was installed.

The qemu guest agent `systemctl enable` warning was encountered and treated as non-fatal.
