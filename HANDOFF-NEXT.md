# Homepage Next-Agent Handoff

Last updated: 2026-07-20T22:14:36Z

## Current state

- Repository `main` is clean and published at `b371064`
  (`origin/main` matches).
- The custom Homepage now serves production at `home.lab.seandre.dev` through
  the Git-managed `homepage-custom-production` Service. The preview hostname
  remains available at `https://homepage-preview.lab.seandre.dev`.
- Stock Homepage remains deployed and available as the named rollback target:
  its Deployment, ConfigMap, Service, TLS Secret, Ingress identity, ServiceAccount,
  and RBAC remain present. Its Service still selects only the stock pod.
- HP-029 production cutover completed with owner approval. Production HTTPS,
  health, schema-v2 bootstrap, SSE, all routes, links, TLS, selector ownership,
  resource, restart, log, adapter, Prometheus, alert, and redaction checks are
  recorded in `docs/operations/homepage-rework.md`.
- Gate D preview technical closeout passed with the owner-approved shortened
  soak at `2026-07-20T21:37:34Z`.
- Preview artifact: `ghcr.io/seandre/k8s-homelab-homepage:unpoller-pdu-20260720-3`
  pinned to digest
  `sha256:d75558ed538c832d9f51259d022511619e44aac1af5d7c6c059d85ef97297dc5`.
- Argo CD `homelab-apps` is `Synced` / `Healthy` at `9335b5b`; parent
  `homelab` is `Synced` / `Healthy`.
- Custom Homepage production pods are 2/2 Ready with zero restarts; UnPoller
  is 1/1 Ready with zero restarts.
- Prometheus retained only the UnPoller outlet-power family plus scrape
  health. The target, exact `pve-01`/`pve-02` series, and one-hour history were
  healthy; no related firing alert was present.
- Production bootstrap schema v2 returned `CURRENT` PDU data with non-null
  total and both PVE watt values. PDU-specific names, outlet labels, endpoints,
  credentials, and raw metrics were not exposed.
- HP-030 Git-only rollback drill completed at rollback revision `0e2826d` and
  forward revision `9335b5b`; both Argo CD directions were `Synced` / `Healthy`
  and evidence is recorded in `docs/operations/homepage-rework.md`.
- Documentation image workflow deployed
  `ghcr.io/seandre/k8s-homelab-docs:sha-69ec88b` through the Git-managed docs
  Deployment. `npm run build` and `git diff --check` passed.
- The repository E2E suite passed keyboard, layout-control, and serious/critical
  accessibility checks; six visual snapshot comparisons differed from checked-in
  baselines by 15–50 px in page height and need follow-up visual baseline review.

## Next task: HP-031 v1 documentation closeout

HP-030 is complete. HP-031 is the next implementation task in
`docs/build/homepage-rework.md`. Update repository documentation and mark only
acceptance criteria with actual evidence. Keep OKD deployment/ownership and
automatic failover deferred.

The completed HP-030 drill verified:

1. Git revert routes production back to the stock Service, then a forward
   commit restores the custom Service.
2. The stock and custom selectors remain disjoint throughout the drill.
3. Argo CD reports the relevant applications `Synced` / `Healthy` after each
   direction.
4. Production HTTPS, TLS, stock healthcheck, custom health endpoints,
   bootstrap, SSE, routes, links, and redaction checks passed according to the
   stock/custom compatibility recorded in the runbook.
5. Restart counts, error behavior, resource use, and adapter states remained
   acceptable.

Never weaken strict TLS, broaden Prometheus retention, expose raw exporter
metrics, add outlet-control access, or commit any Secret/API key content.

## Subsequent tasks

- HP-031: close v1 documentation and mark only acceptance criteria with actual
  evidence. Keep OKD deployment/ownership and automatic failover deferred.

## Useful references

- [Homepage build plan](docs/build/homepage-rework.md)
- [Preview and rollback runbook](docs/operations/homepage-rework.md)
- [Observability/PDU runbook](docs/operations/homepage-observability.md)
- [Gate C and PDU evidence](docs/overview/homepage-gate-c-evidence.md)
- Historical closeout details: [HANDOFF.md](HANDOFF.md)

## Safety boundary

Rollback remains Git-only. Keep the stock Homepage available as the named
rollback target until a separate approved retention/removal decision. Do not use
insecure TLS as a fallback, do not run destructive cleanup, and do not dump
full exporter responses because they contain unrelated raw telemetry.
