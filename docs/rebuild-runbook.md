# Rebuild Runbook

This lab should be reproducible. Anything important should live in Git or be documented here.

## Rebuild Principles

- Do not rely on undocumented manual changes.
- Keep IPs, hostnames, and VM sizes documented.
- Commit changes after each working milestone.
- Keep secrets out of Git.
- Prefer rebuilding over debugging mystery state when early in the lab.

## Rebuild Order

1. Install Proxmox on the 256GB NVMe
2. Configure host networking on the UniFi `Servers` network
3. Upload Ubuntu Server ISO
4. Create Ubuntu template
5. Clone VMs
6. Install k3s
7. Apply Kubernetes bootstrap manifests
8. Deploy infrastructure services
9. Deploy apps
10. Validate ingress and monitoring

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
