# Rebuild Runbook

This lab should be reproducible. Anything important should live in Git or be documented here.

## Rebuild Principles

- Do not rely on undocumented manual changes.
- Keep IPs, hostnames, and VM sizes documented.
- Commit changes after each working milestone.
- Keep secrets out of Git.
- Prefer rebuilding over debugging mystery state when early in the lab.

## Rebuild Order

1. Install Proxmox on the 256 GB NVMe
2. Add the separate 2 TB NVMe as Proxmox LVM-thin storage named `vmdata`
3. Configure host networking on the UniFi `Servers` / Homelab network: `192.168.40.0/24`, VLAN ID `40`, gateway `192.168.40.1`, domain `lab.home.arpa`
4. Confirm Proxmox is reachable at `192.168.40.20`
5. Upload Ubuntu Server ISO
6. Create an Ubuntu Server 26.04 template using the normal install
7. Enable OpenSSH, install `qemu-guest-agent`, and skip featured server snaps
8. Clone VMs
9. Expand VM disks in Proxmox, then expand Ubuntu LVM inside the guest
10. Install k3s
11. Apply Kubernetes bootstrap manifests
12. Deploy infrastructure services
13. Deploy apps
14. Validate ingress and monitoring

## Current Next Steps

1. Create or verify the UDM Pro Homelab network on VLAN ID `40`
2. Verify gateway reachability at `192.168.40.1`
3. Clone `k8s-control-01`
4. Set `k8s-control-01` hostname and static IP
5. Verify SSH to `k8s-control-01`

## Ubuntu Template Notes

The template was built from Ubuntu Server 26.04 using the normal install. The minimized install was not used, no featured server snaps were installed, OpenSSH was enabled, and `qemu-guest-agent` was installed.

The qemu guest agent `systemctl enable` warning was encountered and treated as non-fatal.

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
