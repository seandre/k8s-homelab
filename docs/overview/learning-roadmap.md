# Overview 02: Learning Roadmap

Last updated: 2026-07-18.

The platform baseline is working. New work should now teach day-2 operations rather than add tools without a recovery story.

## Project Status

1. ☑ Public TLS is active on k3s: both Let's Encrypt ClusterIssuers and all six current `lab.seandre.dev` application certificates are `Ready`.
2. ☑ The six private k3s public-domain names are live. The former application `.home.arpa` DNS names are no longer active.
3. ◐ `utility-01` is active with Git, Ansible, and `kubectl`; install and pin `oc`, `openshift-install`, and `oc-mirror` before generating OKD installation media.
4. ☑ Standalone `pve-02` is active with [Build 03: `pve-02` and `bastion-01`](../build/pve-02-and-bastion.md).
5. ☑ `bastion-01` runs `dnsmasq`, HAProxy, Nexus, and Glances on `pve-02`; the OKD DNS records remain intentionally inactive.
6. ☑ [`pbs-01` on `pve-01`](../operations/proxmox-backup-server.md) protects `bastion-01`; the H2 task, stopped backup, PBS verification, protected snapshot, and isolated Nexus artifact restore all passed.
7. ◐ Install temporary Ubuntu on the three Ryzen systems, complete the selected [Top500 HPL benchmark](../optional/hpl-benchmark.md), preserve the results, and then install [Build 04: Connected Compact OKD](../build/compact-okd.md).
8. ☐ Wait for every ClusterOperator to stabilize, then add trusted wildcard ingress and named API certificates. Never replace `api-int` TLS.
9. ☐ Retain the tested Nexus backup, then add a narrowly scoped OKD release and Operator mirror.
10. ☐ Upgrade Ryzen-node memory to 32 GB one node at a time with drain and health checks.
11. ☐ Continue k3s day-2 work: KOReader persistence, storage recovery, Sealed Secrets, alerts, rollback, and upgrades.

## Project Requirements

- Desired state belongs in Git and Argo CD; utility VMs are operational conveniences.
- Every stateful service needs a tested restore procedure.
- Every manual fix becomes code or a concise troubleshooting note.
- Prefer recoverable, well-understood components over a larger tool catalog.
- Keep GitHub as the primary remote until self-hosted Git can fail without blocking recovery.
