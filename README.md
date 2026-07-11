# Homelab

Kubernetes homelab built on Proxmox VE.

## Hardware

- Primary host: HP EliteDesk 800 G6 Mini (`pve-01`)
- CPU: Intel Core i5-10500T
- RAM: 64 GB
- Boot/system disk: 256 GB NVMe
- VM/data disk: 2 TB NVMe
- Hypervisor: Proxmox VE
- Planned second host: HP EliteDesk 800 G6 (`pve-02`) with Intel Core i5-10500, 32 GB RAM, and 512 GB NVMe

See [Infrastructure Reference](docs/infrastructure.md) for the complete hardware, storage, VM, network, and DNS layout.

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

Last verified: 2026-06-30.

- Proxmox VE installed on the 256 GB NVMe in the HP EliteDesk mini PC
- 2 TB NVMe configured as Proxmox LVM-thin storage `vmdata`
- UniFi `Servers` network on VLAN ID `40` selected for homelab infrastructure
- Proxmox host reachable at `192.168.40.20`
- Kubernetes VMs cloned, resized, networked, and prepared
- Three-node k3s cluster is running k3s `v1.36.2+k3s1`; all nodes are `Ready`:
  - `k8s-control-01` at `192.168.40.21`
  - `k8s-worker-01` at `192.168.40.22`
  - `k8s-worker-02` at `192.168.40.23`
- Workstation kubeconfig lives at `~/.kube/k8s-homelab.yaml`
- Argo CD is installed in the `argocd` namespace and all Argo CD pods are running
- Argo CD reconciles this repo through the `homelab` root application
- `homelab`, `homelab-infrastructure`, `homelab-apps`, and `homelab-monitoring` are `Synced` and `Healthy`
- MetalLB and Traefik ingress are installed through Argo CD
- MetalLB assigns the reserved ingress VIP `192.168.40.30` to the Traefik `LoadBalancer` service
- cert-manager is installed through Argo CD
- Internal TLS certificates are issued by the `homelab-ca` ClusterIssuer
- Monitoring is installed through Argo CD with kube-prometheus-stack
- Argo CD is exposed at `https://argocd.lab.home.arpa`
- The nginx test app is exposed at `https://nginx-test.lab.home.arpa`
- Grafana is exposed at `https://grafana.lab.home.arpa`
- Homepage is exposed at `https://home.lab.home.arpa`
- UniFi UDM Pro Intrusion Prevention was identified as the cause of intermittent SSH/TCP timeouts and adjusted
- Next project: build `utility-01` as the in-network administration VM, then use it as the control point for the separate `pve-02` hardware-integration project

## Repo Map

- `docs/infrastructure.md`: canonical hardware, storage, VM, network, and DNS reference
- `docs/rebuild-runbook.md`: rebuild and recovery sequence
- `docs/troubleshooting.md`: network, ingress, TLS, and application diagnostics
- `docs/decisions.md`: durable architectural decisions and rationale
- `docs/learning-roadmap.md`: prioritized projects and platform-learning backlog
- `ansible/`: inventory and playbooks for node prep and k3s operations
- `kubernetes/bootstrap/`: one-time bootstrap manifests for Argo CD and other cluster bring-up steps
- `kubernetes/apps/`: reusable application definitions that can be selected by one or more clusters
- `kubernetes/infrastructure/`: reusable infrastructure definitions such as ingress and certificate management
- `kubernetes/clusters/homelab/`: the homelab cluster entrypoint and selection layer for Argo CD-managed apps and infrastructure
- `docs/utility-bastion-tutorial.md`: required tutorial for the `utility-01` admin VM
- `docs/utility-desktop-koreader-tutorial.md`: optional XFCE, RDP, and KOReader companion guide for `utility-01`
- `docs/add-pve-02-node-tutorial.md`: tutorial for adding the planned second Proxmox host and `k8s-worker-03`
- `docs/koreader-sync-runbook.md`: KOReader Sync deployment and operations

## GitOps Flow

The repo keeps reusable definitions separate from cluster-specific selection:

1. The `homelab` root Argo CD application watches `kubernetes/clusters/homelab`.
2. The root application creates child applications, including `homelab-apps` and `homelab-infrastructure`.
3. `homelab-apps` watches `kubernetes/clusters/homelab/apps`, whose kustomization selects app definitions from `kubernetes/apps`.
4. `homelab-infrastructure` watches `kubernetes/clusters/homelab/infrastructure`, whose kustomization selects infrastructure definitions from `kubernetes/infrastructure`.

App manifests should stay in `kubernetes/apps` unless they are truly cluster-specific. Moving them under `kubernetes/clusters/homelab` would mix reusable app definitions with the homelab deployment selection layer.

## Current Direction

Build the [Utility Bastion](docs/utility-bastion-tutorial.md) first, then complete the separate [pve-02 Hardware Integration Project](docs/add-pve-02-node-tutorial.md). The remaining ordered backlog lives in the [Learning Roadmap](docs/learning-roadmap.md).

GitHub remains the recovery-safe source of truth during bootstrap. Self-hosted Git is deferred so cluster recovery never depends on an in-cluster Git service.

## Common Commands

Check cluster nodes:

```bash
KUBECONFIG=~/.kube/k8s-homelab.yaml kubectl get nodes -o wide
```

Check Argo CD:

```bash
KUBECONFIG=~/.kube/k8s-homelab.yaml kubectl -n argocd get pods
KUBECONFIG=~/.kube/k8s-homelab.yaml kubectl get applications.argoproj.io -A
```

Access Argo CD locally:

```bash
KUBECONFIG=~/.kube/k8s-homelab.yaml kubectl -n argocd port-forward svc/argocd-server 8080:443
```

Access Argo CD through ingress:

```bash
open https://argocd.lab.home.arpa
```

Get the Argo CD admin username and initial password:

```bash
echo admin
KUBECONFIG=~/.kube/k8s-homelab.yaml kubectl -n argocd get secret argocd-initial-admin-secret \
  -o jsonpath='{.data.password}' | base64 -d
```

Access Grafana through ingress:

```bash
open https://grafana.lab.home.arpa
```

Get the Grafana admin username and password:

```bash
KUBECONFIG=~/.kube/k8s-homelab.yaml kubectl -n monitoring get secret kube-prometheus-stack-grafana \
  -o jsonpath='{.data.admin-user}' | base64 -d
KUBECONFIG=~/.kube/k8s-homelab.yaml kubectl -n monitoring get secret kube-prometheus-stack-grafana \
  -o jsonpath='{.data.admin-password}' | base64 -d
```
