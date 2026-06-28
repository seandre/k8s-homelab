# Proxmox Notes

Proxmox is installed and running on the 256 GB NVMe.

The separate 2 TB NVMe is installed and has been added in Proxmox as LVM-thin storage named `vmdata`. Use `vmdata` for real VM disks and Kubernetes lab workloads.

Proxmox is reachable at `192.168.40.20`.

Attach the Proxmox host and Kubernetes VMs to the intended Homelab network:

- Subnet: `192.168.40.0/24`
- Gateway: `192.168.40.1`
- VLAN ID: `40`
- Domain: `lab.home.arpa`

The Ubuntu template was built with Ubuntu Server 26.04 normal install. The minimized install was not used, no featured server snaps were installed, OpenSSH was enabled, and `qemu-guest-agent` was installed.

The qemu guest agent `systemctl enable` warning was encountered and treated as non-fatal.

Next steps: create or verify the UDM Pro Homelab network, verify gateway reachability, clone `k8s-control-01`, set its hostname/static IP, and verify SSH.
