# Documentation Order

Use the numeric directory and filename prefixes as the navigation order. The `10-build` sequence is dependency-ordered and should be completed in order. Documents in `20-optional` are elective and say when they fit. Documents in `30-operations` are references to use whenever needed.

## Start Here

1. [Infrastructure Reference](01-infrastructure-reference.md) defines the canonical hardware, addresses, storage, and DNS plan.
2. [Learning Roadmap](02-learning-roadmap.md) tracks the broader project backlog.
3. [Architecture Decisions](03-architecture-decisions.md) records durable design choices and rationale.

## Required Build Sequence

1. [Build 01: Publicly Trusted TLS](../10-build/01-public-domain-tls.md) proves Cloudflare DNS-01 on the existing k3s cluster and migrates its private ingress names.
2. [Build 02: Utility Automation Server](../10-build/02-utility-automation-server.md) validates `utility-01`, including Git, Kubernetes clients, Ansible inventory, SSH, and safe connectivity tests.
3. [Build 03: `pve-02` and `bastion-01`](../10-build/03-pve-02-and-bastion.md) creates the standalone Proxmox host and the DNS, HAProxy, and Nexus dependency.
4. [Build 04: Compact OKD](../10-build/04-compact-okd.md) activates private OKD DNS and installs the three-node connected Agent-based cluster.

Do not activate the OKD private records before `bastion-01` is operational. Do not configure Nexus mirroring or custom OKD certificates until every ClusterOperator is stable.

## Optional Projects

1. [Utility Desktop and KOReader](../20-optional/01-utility-desktop-koreader.md) may be completed any time after Build 02; it is not required for later builds.
2. [KOReader Sync Runbook](../20-optional/02-koreader-sync-runbook.md) applies to the existing k3s application and can be used independently of OKD.
3. [Sealed Secrets](../20-optional/03-sealed-secrets.md) is a k3s GitOps and recovery exercise; complete its key-backup test before relying on encrypted secrets.
4. [Docusaurus Documentation Site](../20-optional/04-docusaurus-site.md) builds this Markdown collection with local search and prepares its GitOps deployment.

## Operations References

1. [Rebuild Runbook](../30-operations/01-rebuild-runbook.md) restores the existing VM-based k3s cluster.
2. [Troubleshooting](../30-operations/02-troubleshooting.md) contains network, ingress, TLS, and workload diagnostics.
3. [Stable Admin Credentials](../30-operations/03-stable-admin-credentials.md) establishes durable Argo CD and Grafana passwords with macOS Keychain custody and stable Kubernetes Secrets.
