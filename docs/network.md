# Network Plan
## LAN
| Item | Value |
|---|---|
| UniFi network | `Servers` |
| Subnet | `192.168.40.0/24` |
| VLAN ID | `40` |
| Gateway | `192.168.40.1` |
| DNS | `192.168.40.1` |
| Domain | `lab.home.arpa` |
## Host IPs
| Host | IP | Role |
|---|---:|---|
| `pve-01` | `192.168.40.20` | Proxmox host |
| `k8s-control-01` | `192.168.40.21` | Final Kubernetes control-plane VM |
| `k8s-worker-01` | `192.168.40.22` | Final Kubernetes worker VM |
| `k8s-worker-02` | `192.168.40.23` | Final Kubernetes worker VM |
| `utility-01` | `192.168.40.24` | Utility VM |
| `ingress-vip` | `192.168.40.30` | Future ingress or load balancer IP |
## Notes
Use the UniFi `Servers` network for homelab infrastructure. Keep DHCP reservations or static leases aligned with this table.

Next network checkpoint: create or verify the UDM Pro Homelab network for VLAN ID `40`, confirm the gateway is reachable at `192.168.40.1`, then proceed with cloning `k8s-control-01`, setting its hostname/static IP, and verifying SSH.
