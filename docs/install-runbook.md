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
- [x] Create or verify the UDM Pro Homelab network on VLAN ID `40`
- [x] Verify gateway reachability at `192.168.40.1`
- [x] Clone Kubernetes VMs
- [x] Clone `k8s-control-01`
- [x] Set `k8s-control-01` hostname and static IP
- [x] Set `k8s-worker-01` hostname and static IP
- [x] Set `k8s-worker-02` hostname and static IP
- [x] Verify SSH to `k8s-control-01`
- [x] Verify SSH to worker nodes
- [x] Resolve UniFi UDM Pro Intrusion Prevention blocking SSH/TCP checks
- [x] Temporarily enable passwordless sudo for node prep
- [x] Run Kubernetes node prep on all nodes
- [x] Remove temporary passwordless sudo and return to password-required sudo
- [x] Install k3s control plane
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

## Kubernetes Node Prep

If running node prep through Ansible or non-interactive SSH, temporarily allow `sean` to use passwordless sudo on each node:

```bash
echo 'sean ALL=(ALL) NOPASSWD:ALL' | sudo tee /etc/sudoers.d/99-sean-homelab-bootstrap
sudo chmod 440 /etc/sudoers.d/99-sean-homelab-bootstrap
```

Run the node prep playbook from the repo:

```bash
ansible-playbook ansible/playbooks/prep-k8s-nodes.yml
```

After prep is complete and verified, remove the temporary sudoers file on each node so `sudo` requires a password again:

```bash
sudo rm /etc/sudoers.d/99-sean-homelab-bootstrap
```

Current status: node prep completed on `k8s-control-01`, `k8s-worker-01`, and `k8s-worker-02`. The temporary sudoers file was removed and `sudo` requires a password again.

## k3s Control Plane

The k3s server was installed on `k8s-control-01` (`192.168.40.21`) only. Workers have not been joined yet.

Install command used:

```bash
curl -sfL https://get.k3s.io | sh -s - server \
  --node-ip 192.168.40.21 \
  --advertise-address 192.168.40.21 \
  --tls-san 192.168.40.21 \
  --disable traefik \
  --disable servicelb
```

Installed version: `v1.36.2+k3s1`.

Validation completed on the control node:

- `systemctl is-active k3s` returned `active`
- `k8s-control-01` reported `Ready`
- `coredns`, `local-path-provisioner`, and `metrics-server` reported `Running`
- bundled Traefik and ServiceLB were disabled

The workstation kubeconfig was fetched to `~/.kube/k8s-homelab.yaml` and rewritten to use `https://192.168.40.21:6443`.

Temporary passwordless sudo was removed from `k8s-control-01` after installation, and `sudo -n true` again requires interactive authentication.

## Network Troubleshooting Note

During VM setup, SSH appeared to flap across Proxmox and Kubernetes nodes while ping stayed healthy. The cause was UniFi UDM Pro Intrusion Prevention affecting TCP/22 traffic. For future troubleshooting, check UDM Pro security features when ICMP works but SSH times out.
