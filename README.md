# Homelab

Kubernetes homelab built on Proxmox VE.

## Hardware

- Host: HP EliteDesk 800 G6 Mini
- CPU: Intel Core i5-10500T
- RAM: 64 GB
- Boot/system disk: 256 GB NVMe
- VM/data disk: 2 TB NVMe
- Hypervisor: Proxmox VE

## Goal

Build a reproducible Kubernetes homelab for platform engineering and GitOps workflows.

Target stack:

- Proxmox VE
- Ubuntu Server VMs
- k3s
- Argo CD
- ingress
- cert-manager
- monitoring
- local test apps

## Current Status

- Proxmox VE installed on the 256 GB NVMe in the HP EliteDesk mini PC
- 2 TB NVMe configured as Proxmox LVM-thin storage `vmdata`
- UniFi `Servers` network on VLAN ID `40` selected for homelab infrastructure
- Proxmox host reachable at `192.168.40.20`
- Kubernetes VMs cloned, resized, networked, and prepared
- Three-node k3s cluster is running:
  - `k8s-control-01` at `192.168.40.21`
  - `k8s-worker-01` at `192.168.40.22`
  - `k8s-worker-02` at `192.168.40.23`
- Workstation kubeconfig lives at `~/.kube/k8s-homelab.yaml`
- Argo CD is installed in the `argocd` namespace
- Argo CD is currently accessed with `kubectl port-forward` because ingress is not installed yet
- Argo CD is installed but is not yet the primary reconciler for cluster infrastructure
- UniFi UDM Pro Intrusion Prevention was identified as the cause of intermittent SSH/TCP timeouts and adjusted
- Next step: add Argo CD root applications and ingress

## Repo Map

- `docs/`: hardware, network, install, rebuild, decision, and troubleshooting notes
- `proxmox/`: Proxmox storage and VM layout notes
- `ansible/`: inventory and playbooks for node prep and k3s operations
- `kubernetes/clusters/homelab/`: cluster bootstrap manifests, currently including Argo CD

## Current Direction

The cluster is moving from workstation-driven `kubectl apply` toward GitOps:

1. Keep GitHub as the source of truth for now.
2. Teach Argo CD to watch this repo and reconcile cluster infrastructure from `kubernetes/clusters/homelab`.
3. Add ingress/load balancer support so services, including Argo CD, do not require port-forwarding.
4. Add cert-manager, monitoring, and a first real app through Argo CD.
5. Add a utility/admin VM after the GitOps path is clear, so cluster administration can happen from inside the homelab network.

Self-hosted Git is intentionally deferred. It can be revisited later, but GitHub is simpler and safer during bootstrap because the desired cluster state remains available even if the homelab is down.

## Common Commands

Check cluster nodes:

```bash
KUBECONFIG=~/.kube/k8s-homelab.yaml kubectl get nodes -o wide
```

Check Argo CD:

```bash
KUBECONFIG=~/.kube/k8s-homelab.yaml kubectl -n argocd get pods
```

Access Argo CD locally:

```bash
KUBECONFIG=~/.kube/k8s-homelab.yaml kubectl -n argocd port-forward svc/argocd-server 8080:443
```

Get the initial Argo CD admin password:

```bash
KUBECONFIG=~/.kube/k8s-homelab.yaml kubectl -n argocd get secret argocd-initial-admin-secret \
  -o jsonpath='{.data.password}' | base64 -d
```
