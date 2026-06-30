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
- Argo CD reconciles this repo through the `homelab` root application
- `homelab-infrastructure` and `homelab-apps` child applications are defined and reconciling
- MetalLB and Traefik ingress are installed through Argo CD
- MetalLB assigns the reserved ingress VIP `192.168.40.30`
- cert-manager is installed through Argo CD
- Internal TLS certificates are issued by the `homelab-ca` ClusterIssuer
- Monitoring is installed through Argo CD with kube-prometheus-stack
- Argo CD is exposed at `https://argocd.lab.home.arpa`
- The nginx test app is exposed at `https://nginx-test.lab.home.arpa`
- Grafana is exposed at `https://grafana.lab.home.arpa`
- UniFi UDM Pro Intrusion Prevention was identified as the cause of intermittent SSH/TCP timeouts and adjusted
- Next step: deploy the first real app

## Repo Map

- `docs/`: hardware, network, install, rebuild, decision, and troubleshooting notes
- `proxmox/`: Proxmox storage and VM layout notes
- `ansible/`: inventory and playbooks for node prep and k3s operations
- `kubernetes/bootstrap/`: one-time bootstrap manifests for Argo CD and other cluster bring-up steps
- `kubernetes/clusters/homelab/`: Argo CD-managed cluster applications and infrastructure targets

## Current Direction

The cluster is moving from workstation-driven `kubectl apply` toward GitOps:

1. Keep GitHub as the source of truth for now.
2. Let Argo CD reconcile cluster infrastructure and apps from `kubernetes/clusters/homelab`.
3. Use cert-manager's internal CA issuer for lab HTTPS certificates.
4. Deploy the first real app through Argo CD.
5. Add a utility/admin VM after the core GitOps path is stable, so cluster administration can happen from inside the homelab network.

Self-hosted Git is intentionally deferred. It can be revisited later, but GitHub is simpler and safer during bootstrap because the desired cluster state remains available even if the homelab is down.

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

Get the initial Argo CD admin password:

```bash
KUBECONFIG=~/.kube/k8s-homelab.yaml kubectl -n argocd get secret argocd-initial-admin-secret \
  -o jsonpath='{.data.password}' | base64 -d
```
