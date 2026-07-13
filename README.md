# Homelab

Kubernetes homelab built on Proxmox VE.

## Hardware

- Primary host: HP EliteDesk 800 G6 Mini (`pve-01`)
- CPU: Intel Core i5-10500T
- RAM: 64 GB
- Boot/system disk: 256 GB NVMe
- VM/data disk: 2 TB NVMe
- Hypervisor: Proxmox VE
- Additional virtualization host received: HP EliteDesk 800 G6 Mini (`pve-02`) with Intel Core i5-10500T, 32 GB RAM, and 512 GB storage
- Bare-metal cluster hardware received: three matching HP EliteDesk 805 G8 Minis, each with an AMD Ryzen 5 PRO 5650GE, 16 GB RAM, and a 1 TB Patriot Memory P400 Lite SSD waiting to be installed

Start with the [Documentation Order](docs/00-overview/00-documentation-order.md). The [Infrastructure Reference](docs/00-overview/01-infrastructure-reference.md) contains the complete hardware, storage, VM, network, and DNS layout.

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
- Argo CD is exposed at `https://argocd.lab.seandre.dev`
- The nginx test app is exposed at `https://nginx-test.lab.seandre.dev`
- Grafana is exposed at `https://grafana.lab.seandre.dev`
- Homepage is exposed at `https://home.lab.seandre.dev`
- UniFi UDM Pro Intrusion Prevention was identified as the cause of intermittent SSH/TCP timeouts and adjusted
- Next sequence: prove public DNS-01 on k3s, finish `utility-01`, build `pve-02` and `bastion-01`, then install connected compact OKD on the three Ryzen systems

## Repo Map

- `docs/00-overview/`: documentation order, infrastructure reference, roadmap, and architecture decisions
- `docs/10-build/`: required dependency-ordered build sequence
- `docs/20-optional/`: optional desktop, application, and GitOps learning projects
- `docs/30-operations/`: rebuild and troubleshooting references
- `docs-site/`: Docusaurus configuration, local search, and static container build
- `ansible/`: inventory and playbooks for node prep and k3s operations
- `kubernetes/bootstrap/`: one-time bootstrap manifests for Argo CD and other cluster bring-up steps
- `kubernetes/apps/`: reusable application definitions that can be selected by one or more clusters
- `kubernetes/infrastructure/`: reusable infrastructure definitions such as ingress and certificate management
- `kubernetes/clusters/homelab/`: the homelab cluster entrypoint and selection layer for Argo CD-managed apps and infrastructure

## GitOps Flow

The repo keeps reusable definitions separate from cluster-specific selection:

1. The `homelab` root Argo CD application watches `kubernetes/clusters/homelab`.
2. The root application creates child applications, including `homelab-apps` and `homelab-infrastructure`.
3. `homelab-apps` watches `kubernetes/clusters/homelab/apps`, whose kustomization selects app definitions from `kubernetes/apps`.
4. `homelab-infrastructure` watches `kubernetes/clusters/homelab/infrastructure`, whose kustomization selects infrastructure definitions from `kubernetes/infrastructure`.

App manifests should stay in `kubernetes/apps` unless they are truly cluster-specific. Moving them under `kubernetes/clusters/homelab` would mix reusable app definitions with the homelab deployment selection layer.

## Current Direction

Follow the [numbered documentation order](docs/00-overview/00-documentation-order.md): [prove public DNS/TLS](docs/10-build/01-public-domain-tls.md), finish the [`utility-01` automation server](docs/10-build/02-utility-automation-server.md), build [standalone `pve-02` and `bastion-01`](docs/10-build/03-pve-02-and-bastion.md), then install [compact OKD](docs/10-build/04-compact-okd.md). The broader backlog lives in the [Learning Roadmap](docs/00-overview/02-learning-roadmap.md).

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
open https://argocd.lab.seandre.dev
```

The Argo CD username is `admin`. Retrieve its stable password through Keychain Access by searching for `Homelab Argo CD admin`. See [Stable Argo CD and Grafana Admin Credentials](docs/30-operations/03-stable-admin-credentials.md) for setup, rotation, verification, and recovery.

Access Grafana through ingress:

```bash
open https://grafana.lab.seandre.dev
```

The Grafana username is `admin`. Retrieve its stable password through Keychain Access by searching for `Homelab Grafana admin`. The stable-credentials tutorial explains why the chart-generated Secret is not used.
