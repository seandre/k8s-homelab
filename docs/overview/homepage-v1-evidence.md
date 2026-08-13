# Homepage v1 Evidence

This is the HP-031 closeout index. It maps each v1 acceptance criterion in the
[Homepage Architecture](homepage-architecture.md#v1-acceptance-criteria) to
repository or operational evidence available at the 2026-07-20 closeout.
`Confirmed` means the criterion has recorded evidence and approval where
required.

| Criterion | Status | Evidence |
|---|---|---|
| <a id="private-gitops"></a>Private k3s deployment under GitOps control | Confirmed | [HP-029 production evidence](../operations/homepage-rework.md#hp-029-production-cutover--2026-07-20), [production Service and immutable deployment](../../kubernetes/apps/homepage-custom-preview/production-service.yaml) |
| <a id="links"></a>Agreed links and utilities remain available | Confirmed | [HP-029 routes and links](../operations/homepage-rework.md#hp-029-production-cutover--2026-07-20), [HP-030 compatibility checks](../operations/homepage-rework.md#hp-030-git-only-rollback-drill--2026-07-20) |
| <a id="states"></a>Live, stale, no-data, not-provisioned, and unsupported states are distinct | Confirmed | [normalization tests](../../homepage/src/server/normalization.test.ts), [fixture state review](homepage-ui-approval.md#intended-visual-decisions) |
| <a id="graphs"></a>CPU and network graphs reproduce btop's dot style and remain responsive | Confirmed | [graph implementation and tests](../../homepage/src/client/graph.ts), [approved graph review](homepage-ui-approval.md#gate-b2-review-checklist), and [approved six-case visual baseline update](../../homepage/tests/e2e/dashboard.spec.ts) |
| <a id="proxmox"></a>Both Proxmox hosts use the matching summary hierarchy | Confirmed | [matching-schema adapter test](../../homepage/src/server/proxmox.test.ts), [HP-029 adapter evidence](../operations/homepage-rework.md#hp-029-production-cutover--2026-07-20) |
| <a id="read-only"></a>Alerts and integrations are read-only | Confirmed | [representative adapter tests](../../homepage/src/server/argocd.test.ts), [k3s read-only RBAC](../../kubernetes/apps/homepage/custom-k3s-readonly-rbac.yaml), [Gate C evidence](homepage-gate-c-evidence.md) |
| <a id="redaction"></a>No integration credential appears in browser, image, Git history, or logs | Confirmed for the published surface | [redaction and adapter tests](../../homepage/src/server/app.test.ts), [HP-030 log/API redaction checks](../operations/homepage-rework.md#hp-030-git-only-rollback-drill--2026-07-20), [credential-safe workflow](../operations/homepage-rework.md#credential-provisioning-and-rotation) |
| <a id="responsive"></a>Desktop, tablet, and mobile pass approved visual and interaction checks | Confirmed | [Gate B1/B2 approval](homepage-ui-approval.md#gate-b2-review-checklist), [approved six-case visual baselines](../../homepage/tests/e2e/dashboard.spec.ts), and [full 9-test browser suite](../../homepage/tests/e2e/dashboard.spec.ts) |
| <a id="accessibility"></a>Keyboard operation, focus visibility, reduced motion, and ordinary contrast pass | Confirmed for tested behavior | [keyboard and accessibility E2E tests](../../homepage/tests/e2e/dashboard.spec.ts), [focus and reduced-motion styles](../../homepage/src/client/styles.css) |
| <a id="image"></a>Private GHCR image is built, scanned, SBOM/provenance-attached, and deployed by digest | Confirmed | [GitHub Actions verification/publish workflow](../../.github/workflows/homepage-image.yaml), [digest-pinned deployment](../../kubernetes/apps/homepage-custom-preview/deployment.yaml), [HP-029 deployed artifact evidence](../operations/homepage-rework.md#hp-029-production-cutover--2026-07-20) |
| <a id="rollback"></a>A tested procedure restores the current Homepage deployment | Confirmed | [HP-030 Git-only rollback and forward recovery drill](../operations/homepage-rework.md#hp-030-git-only-rollback-drill--2026-07-20) |
| <a id="okd-telemetry"></a>Direct OKD telemetry and least-privilege identity | Preview soak active through at least `2026-08-14T04:49:03Z` | [schema v5 OKD adapter tests](../../homepage/src/server/okd.test.ts), [OKD RBAC](../../kubernetes/clusters/okd/observability/homepage/rbac.yaml), [preview/production split](../../kubernetes/apps/homepage-custom-preview/kustomization.yaml), and [preflight plus active soak evidence](../operations/homepage-observability.md#okd-direct-telemetry-rollout) |

## Scope decisions

- The stock `homepage` Deployment, ConfigMap, Service, Ingress, TLS Secret,
  ServiceAccount, and RBAC remain deployed as the named rollback target. Any
  retention or removal decision requires a separate approved plan.
- OKD deployment ownership, an OKD overlay, manual cross-cluster switching, and
  automatic failover remain deferred. The current architecture does not claim a
  30-second automatic-failover objective.
- HP-031 closes the repository documentation gap. The owner approved the six
  visual baseline updates on 2026-07-20; the focused six-case visual suite and
  full nine-test browser suite passed afterward.
