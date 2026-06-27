# Network Plan
## LAN
| Item | Value |
|---|---|
| Subnet | `192.168.10.0/24` |
| Gateway | `192.168.10.1` |
| DNS | `192.168.10.1` |
| Domain | `lab.home.arpa` |
## Host IPs
| Host | IP | Role |
|---|---:|---|
| `pve-01` | `192.168.10.20` | Proxmox host |
| `k8s-control-01` | `192.168.10.21` | Final Kubernetes control-plane VM |
| `k8s-worker-01` | `192.168.10.22` | Final Kubernetes worker VM |
| `k8s-worker-02` | `192.168.10.23` | Final Kubernetes worker VM |
| `utility-01` | `192.168.10.24` | Utility VM |
| `ingress-vip` | `192.168.10.30` | Future ingress or load balancer IP |
## Notes
Use a flat LAN first. Add VLANs later only after the initial cluster is working.
