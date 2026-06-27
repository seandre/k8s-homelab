# Proxmox VM Layout
## Active 2 TB NVMe Layout
| VM | vCPU | RAM | Disk | IP |
|---|---:|---:|---:|---:|
| `k8s-control-01` | 2 | 8 GB | 80 GB | `192.168.40.21` |
| `k8s-worker-01` | 4 | 16 GB | 150 GB | `192.168.40.22` |
| `k8s-worker-02` | 4 | 16 GB | 150 GB | `192.168.40.23` |
| `utility-01` | 2 | 4-8 GB | 80-120 GB | `192.168.40.24` |
## Host Reserve
Reserve 4-8 GB RAM for Proxmox and filesystem cache.
## Historical 256 GB Dry Run
| VM | vCPU | RAM | Disk | IP |
|---|---:|---:|---:|---:|
| `k3s-test-01` | 4 | 16 GB | 80 GB | `192.168.40.21` |
