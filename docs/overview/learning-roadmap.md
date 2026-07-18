# Overview 02: Learning Roadmap

Last updated: 2026-07-17.

The platform baseline is working. New work should now teach day-2 operations rather than add tools without a recovery story.

## Ordered Projects

1. Export the current UniFi DNS records and DHCP reservations, then prove Cloudflare DNS-01 staging and production on k3s using [Build 01: Public TLS](../build/public-domain-tls.md).
2. Add the six private k3s public-domain records, migrate the ingresses to trusted certificates, and retain `.home.arpa` during the transition.
3. Build and validate `utility-01` with [Build 02: Utility Automation Server](../build/utility-automation-server.md), including pinned OKD clients and kubeconfig custody.
4. Build standalone `pve-02` with [Build 03: `pve-02` and `bastion-01`](../build/pve-02-and-bastion.md).
5. Create `bastion-01` on `pve-02`; install and validate `dnsmasq`, HAProxy, and Nexus before activating OKD DNS.
6. Build [`pbs-01` on `pve-01`](../operations/proxmox-backup-server.md), make a stopped backup of `bastion-01`, and pass the isolated Nexus restore test.
7. Prepare the three Ryzen systems and install [Build 04: Connected Compact OKD](../build/compact-okd.md).
8. Wait for every ClusterOperator to stabilize, then add trusted wildcard ingress and named API certificates. Never replace `api-int` TLS.
9. Use Nexus as an artifact repository first; retain its tested backup, then add a narrowly scoped OKD release and Operator mirror.
10. Upgrade Ryzen-node memory to 32 GB one node at a time with drain and health checks.
11. Continue k3s day-2 work: KOReader persistence, storage recovery, Sealed Secrets, alerts, rollback, and upgrades.

## Project Requirements

- Desired state belongs in Git and Argo CD; utility VMs are operational conveniences.
- Every stateful service needs a tested restore procedure.
- Every manual fix becomes code or a concise troubleshooting note.
- Prefer recoverable, well-understood components over a larger tool catalog.
- Keep GitHub as the primary remote until self-hosted Git can fail without blocking recovery.
