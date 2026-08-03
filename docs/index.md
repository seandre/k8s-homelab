# Seandre Homelab Documentation

This site is the readable view of the Markdown documentation stored in the homelab Git repository. Git remains the source of truth.

## Required Build Order

1. [Public DNS and trusted TLS](build/public-domain-tls.md)
2. [`utility-01` automation server](build/utility-automation-server.md)
3. [`pve-02` and `bastion-01`](build/pve-02-and-bastion.md)
4. [Connected compact OKD](build/compact-okd.md)

Read the [complete documentation order](overview/documentation-order.md) for optional projects and operations references. The [infrastructure reference](overview/infrastructure-reference.md) is the canonical source for hardware, addresses, storage, and DNS; the [network topology](overview/network-topology.md) records the live UniFi VLANs, zones, uplinks, and policy boundaries.

The [cluster-wide Keycloak OIDC/SSO build and operator guide](build/keycloak-oidc-sso.md)
documents the implemented private identity provider, runtime Secret contracts,
normal login paths for Headlamp, kubectl, Grafana, and Argo CD, failover tests,
and independent R2/PBS recovery gates. Live cutover remains gated on the
external credentials, private DNS, MFA enrollment, and acceptance tests listed
there.

The approved [Homelab Homepage Architecture](overview/homepage-architecture.md) defines the btop-inspired private Homepage, including its views, telemetry sources, security boundary, k3s rollout, deferred OKD migration, and rollback gates. The custom app now serves production; the [Homepage Rework Build Plan](build/homepage-rework.md), [operations runbook](operations/homepage-rework.md), and [v1 evidence index](overview/homepage-v1-evidence.md) record implementation, operation, and closeout status.

The [Homepage GitHub Actions Workflow Optimization](build/github-actions-workflow-optimization.md)
is the controlling plan for parallel hosted-runner verification, a single
attested container build, exact-digest scanning, automated GitOps promotion,
and five-run performance acceptance. It keeps all existing application,
supply-chain, and GitOps gates.

The [AirGradient ONE Integration Build
Plan](build/airgradient-one-integration.md) defines the ordered agent packages,
strict schema-v4 contract, local Home Assistant onboarding gate, alert and
control safety rules, dashboard changes, acceptance matrix, and Git-only
rollback for adding the Living Room monitor. AG-000 through AG-009 are complete;
the production acceptance and rollback results are recorded in the
[IE-015 evidence](operations/indoor-dashboard-ie-015-evidence.md).

The live-source rollout, persistent Prometheus configuration, and host
node_exporter prerequisite are documented in [Homepage Observability
Expansion](operations/homepage-observability.md). UniFi PDU Pro power is live
through the strict-TLS local UnPoller path at revision `c3d8968`; the
owner-approved shortened Gate D soak passed technical closeout at
`2026-07-20T21:37:34Z`. Stock Homepage remains the Git-only rollback target.

## Current Platform

- Proxmox VE hosts the virtual machines.
- The existing three-node k3s cluster is the active application platform.
- Argo CD reconciles Kubernetes state from this repository.
- Traefik uses the private ingress VIP `192.168.40.30`.
- `pve-02` is an active standalone Proxmox VE host, and `bastion-01` runs DNS forwarding, HAProxy, Nexus, and Glances on it.
- `pbs-01` runs on the separate physical host `pve-01`; the stopped `bastion-01` backup, automatic verification, and isolated Nexus artifact restore test have passed.
- The six current k3s applications use private `lab.seandre.dev` names with ready publicly trusted certificates.
- Compact OKD remains planned. Its three Ryzen systems are on hand, and the selected next phase is identical offline temporary-Ubuntu installations followed by the three-node HPL benchmark; OKD will overwrite those installations afterward.
