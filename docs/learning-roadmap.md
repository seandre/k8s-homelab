# Learning Roadmap

Last updated: 2026-07-09.

The platform baseline is working. New work should now teach day-2 operations rather than add tools without a recovery story.

## Ordered Projects

1. Build and validate `utility-01` with [Project 1: Utility Bastion](utility-bastion-tutorial.md).
2. Add [Utility Desktop and KOReader](utility-desktop-koreader-tutorial.md) only if a GUI is useful.
3. Integrate the new host with [Project 2: pve-02 Hardware Integration](add-pve-02-node-tutorial.md), keeping it standalone during the first pass.
4. Close KOReader Sync registration and complete the persistence checks in the [KOReader Sync Runbook](koreader-sync-runbook.md).
5. Add a persistent storage layer and document its node-loss assumptions.
6. Back up and restore one stateful workload before trusting its data.
7. Choose a Git-compatible secrets workflow and prove rotation and recovery.
8. Add practical node, ingress, and storage alerts.
9. Practice GitOps rollback, drift correction, node reboots, and k3s upgrades.

## Project Requirements

- Desired state belongs in Git and Argo CD; utility VMs are operational conveniences.
- Every stateful service needs a tested restore procedure.
- Every manual fix becomes code or a concise troubleshooting note.
- Prefer recoverable, well-understood components over a larger tool catalog.
- Keep GitHub as the primary remote until self-hosted Git can fail without blocking recovery.
