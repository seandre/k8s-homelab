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
10. Temporarily enable passwordless sudo for node prep
11. Prepare Kubernetes nodes
12. Remove temporary passwordless sudo and return to password-required sudo
13. Install the k3s control plane on `k8s-control-01`
14. Join k3s workers
15. Apply Kubernetes bootstrap manifests
16. Deploy infrastructure services
17. Deploy apps
18. Validate ingress and monitoring

## Current Next Steps

1. Join k3s workers
2. Verify all Kubernetes nodes are Ready
3. Commit the working milestone

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

## Kubernetes Node Prep

For non-interactive SSH or Ansible prep, temporarily enable passwordless sudo for `sean` on each Kubernetes node:

```bash
echo 'sean ALL=(ALL) NOPASSWD:ALL' | sudo tee /etc/sudoers.d/99-sean-homelab-bootstrap
sudo chmod 440 /etc/sudoers.d/99-sean-homelab-bootstrap
```

Run the node prep playbook:

```bash
ansible-playbook ansible/playbooks/prep-k8s-nodes.yml
```

After the prep is complete and verified, remove the temporary sudoers file from each node:

```bash
sudo rm /etc/sudoers.d/99-sean-homelab-bootstrap
```

Verify `sudo` requires a password again:

```bash
sudo -k
sudo -v
```

Current build status: Kubernetes node prep has been completed on the three Kubernetes nodes, the prep playbook was idempotent with `changed=0`, and the temporary sudoers file was removed.

## k3s Control Plane Install

Install the k3s server on `k8s-control-01` only:

```bash
curl -sfL https://get.k3s.io | sh -s - server \
  --node-ip 192.168.40.21 \
  --advertise-address 192.168.40.21 \
  --tls-san 192.168.40.21 \
  --disable traefik \
  --disable servicelb
```

Fetch the workstation kubeconfig and point it at the control-plane IP:

```bash
mkdir -p ~/.kube
ssh -i ~/.ssh/id_ed25519_github sean@192.168.40.21 \
  "sudo cat /etc/rancher/k3s/k3s.yaml" > ~/.kube/k8s-homelab.yaml
sed -i '' 's#https://127\.0\.0\.1:6443#https://192.168.40.21:6443#' ~/.kube/k8s-homelab.yaml
chmod 600 ~/.kube/k8s-homelab.yaml
```

Current build status: k3s server `v1.36.2+k3s1` is installed on `k8s-control-01`, the node reports `Ready`, core system pods are running, bundled Traefik and ServiceLB are disabled, and temporary passwordless sudo has been removed from the control node. Worker join is the next milestone.
