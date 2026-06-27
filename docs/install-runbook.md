# Install Runbook
## Active Phase: Final 2 TB Build
- [ ] Create Proxmox USB installer
- [ ] Enable Intel virtualization in BIOS
- [ ] Disable Secure Boot if needed
- [ ] Install Proxmox on 2 TB NVMe
- [ ] Set Proxmox hostname to `pve-01.lab.home.arpa`
- [ ] Set Proxmox IP to `192.168.10.20`
- [ ] Open Proxmox UI at `https://192.168.10.20:8006`
- [ ] Upload Ubuntu Server ISO
- [ ] Create Ubuntu Server VM template
- [ ] Clone Kubernetes VMs
- [ ] Install k3s control plane
- [ ] Join k3s workers
- [ ] Add Argo CD
- [ ] Add ingress
- [ ] Add cert-manager
- [ ] Add monitoring
- [ ] Deploy first real app
## Historical Phase: 256 GB Dry Run
- [ ] Install Proxmox on 256 GB SSD
- [ ] Create `k3s-test-01`
- [ ] Install Ubuntu Server
- [ ] Install qemu guest agent
- [ ] Install single-node k3s
- [ ] Deploy nginx test app
- [ ] Test service and ingress
- [ ] Document issues
