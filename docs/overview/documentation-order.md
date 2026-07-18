# Documentation Order

Use the explicit VitePress sidebar and the numbered entries below as the navigation order. The `build` sequence is dependency-ordered and should be completed in order. Documents in `optional` are elective and say when they fit. Documents in `operations` are references to use whenever needed.

## Start Here

1. [Infrastructure Reference](infrastructure-reference.md) defines the canonical hardware, addresses, storage, and DNS plan.
2. [Learning Roadmap](learning-roadmap.md) tracks the broader project backlog.
3. [Architecture Decisions](architecture-decisions.md) records durable design choices and rationale.

## Required Build Sequence

1. [Build 01: Publicly Trusted TLS](../build/public-domain-tls.md) proves Cloudflare DNS-01 on the existing k3s cluster and migrates its private ingress names.
2. [Build 02: Utility Automation Server](../build/utility-automation-server.md) validates `utility-01`, including Git, Kubernetes clients, Ansible inventory, SSH, and safe connectivity tests.
3. [Build 03: `pve-02` and `bastion-01`](../build/pve-02-and-bastion.md) creates the standalone Proxmox host and the DNS, HAProxy, and Nexus dependency.
4. [Build 04: Compact OKD](../build/compact-okd.md) activates private OKD DNS and installs the three-node connected Agent-based cluster.

Do not activate the OKD private records before `bastion-01` is operational. Do not configure Nexus mirroring or custom OKD certificates until every ClusterOperator is stable.

## Optional Projects

1. [Utility Desktop and KOReader](../optional/utility-desktop-koreader.md) may be completed any time after Build 02; it is not required for later builds.
2. [KOReader Sync Runbook](../optional/koreader-sync-runbook.md) applies to the existing k3s application and can be used independently of OKD.
3. [Sealed Secrets](../optional/sealed-secrets.md) is a k3s GitOps and recovery exercise; complete its key-backup test before relying on encrypted secrets.
4. [VitePress Documentation Site](../optional/vitepress-site.md) builds this Markdown collection with local search and documents its automated GitOps deployment.
5. [Top500 HPL Benchmark](../optional/hpl-benchmark.md) compares the k3s VMs and Ryzen systems after temporary Ubuntu installation and before OKD overwrites the Ryzen disks.

## Operations References

1. [Rebuild Runbook](../operations/rebuild-runbook.md) restores the existing VM-based k3s cluster.
2. [Troubleshooting](../operations/troubleshooting.md) contains network, ingress, TLS, and workload diagnostics.
3. [Stable Admin Credentials](../operations/stable-admin-credentials.md) establishes durable Argo CD and Grafana passwords with macOS Keychain custody and stable Kubernetes Secrets.
4. [Proxmox Public TLS](../operations/proxmox-public-tls.md) adds private `seandre.dev` aliases for `pve-01` and its VMs, then configures native Proxmox ACME DNS-01. **Complete.**
5. [Proxmox Backup Server](../operations/proxmox-backup-server.md) builds `pbs-01` on `pve-01` and proves an isolated Nexus restore before Nexus becomes an OKD dependency.
