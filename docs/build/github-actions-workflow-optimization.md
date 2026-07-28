# Homepage GitHub Actions Workflow Optimization

## Purpose and authority

This document controls the first GitHub Actions performance optimization for
the custom Homepage. It records the baseline, fixed architecture, security
gates, implementation packages, production acceptance evidence, and rollback
procedure. It applies only to
`.github/workflows/homepage-image.yaml`; other image workflows remain unchanged
until this approach is proven.

Status: **IN PROGRESS**. WF-000 and WF-001 are complete. WF-002 is complete
only after five successful warm-cache `main` runs meet the performance target.
The first optimized production run passed every functional check but used the
new BuildKit cache scope for the first time, so it is recorded separately and
does not count toward the five-run warm-cache median.

## Baseline and objective

The pre-change baseline is the most recent 15 successful Homepage image
workflow runs sampled on 2026-07-27:

| Measure | Baseline |
|---|---:|
| Successful runs | 15 |
| Mean duration | 198 seconds |
| Minimum duration | 179 seconds |
| Maximum duration | 254 seconds |

The previous critical path performed application verification, a local
container build, and a local Trivy scan serially. A second job then rebuilt and
published the same source. Deployment digest promotion was manual.

The acceptance target is a median end-to-end GitHub workflow duration of no
more than 120 seconds across five successful warm-cache `main` runs. Duration
is measured from workflow creation to workflow completion, not by summing job
durations. Cold-cache and runner-queue outliers are reported separately and do
not justify removing or weakening a gate.

## Durable decision

Keep GitHub-hosted runners and first remove avoidable serial work, duplicate
container builds, and manual promotion. Do not introduce a self-hosted runner
for this optimization.

An isolated self-hosted runner may be reconsidered only if the optimized,
cached hosted workflow still misses the target after five representative
`main` runs. Any future proposal must separately address runner isolation,
patching, ephemeral job state, credential exposure, availability, and recovery.
It must not reuse a general-purpose homelab host merely to reduce queue time.

## Target architecture

```text
pull request ----------------> quality
       |                          |
       +--------------------> container-pr
                                  |
                         local build + Trivy only

main push ------------------> quality -------------------+
       |                                                |
       +--------------------> container-main             +--> deploy
                                |                        |
                     one build + push + exact-           |
                     digest Trivy scan ------------------+

workflow_dispatch ----------> quality
       |
       +--------------------> container-pr
```

`quality` and the applicable container job begin independently. On `main`,
`container-main` may publish an immutable, non-deployable artifact before
quality finishes. Only `deploy`, which requires both jobs, can change the
GitOps manifest.

## Workflow contract

### `quality`

Run for pull requests, `main` pushes, and manual dispatches:

1. Check out the repository with read-only contents permission.
2. Set up Node 22 with the npm cache keyed by
   `homepage/package-lock.json`.
3. Run `npm ci`.
4. Install Chromium and its required runner system dependencies.
5. Run lint, client/server type checks, unit tests, integration tests, and the
   portable Playwright suite.

Playwright's configured web server runs the production build. Do not add a
second standalone `npm run build` after Playwright.

### `container-pr`

Run only for pull requests and manual dispatches:

1. Build the Homepage container once with a workflow-scoped GitHub Actions
   BuildKit cache.
2. Load that build into the local Docker engine.
3. Scan it with Trivy, failing on fixable `HIGH` or `CRITICAL`
   vulnerabilities under the existing `ignore-unfixed` policy.

This job has read-only repository permission. It must not log in to GHCR,
publish an image, push Git, or otherwise mutate repository or package state.

### `container-main`

Run only for a push to `main`, in parallel with `quality`:

1. Build and push exactly one immutable
   `ghcr.io/seandre/k8s-homelab-homepage:sha-<short-sha>` image.
2. Reuse and update a workflow-scoped GitHub Actions BuildKit cache.
3. Preserve the BuildKit SBOM and maximum-mode provenance attestations.
4. Scan the exact pushed `tag@OCI-index-digest` with the existing Trivy policy;
   do not rebuild a local scan image.
5. Export the tag and OCI index digest as job outputs.

The job may write only packages and an OIDC identity token. It has no
repository write permission.

### `deploy`

Run only after both `quality` and `container-main` succeed:

1. Consume only the tag and digest exported by `container-main`.
2. Replace exactly one custom Homepage container image in
   `kubernetes/apps/homepage-custom-preview/deployment.yaml` with
   `tag@digest`.
3. Render the complete homelab kustomization and run `git diff --check`.
4. Commit only that Deployment manifest as `github-actions[bot]`.
5. Before each push, fetch `main`. If a newer Homepage source, Homepage
   workflow, or Homepage Deployment change exists, exit successfully and allow
   the newer workflow to deploy it.
6. If `main` advanced only through unrelated changes, rebase and retry without
   force-pushing.
7. Attempt at most three pushes and fail visibly if all three fail.

This is the only job with repository write permission. The manifest-only bot
commit is intentionally outside the workflow's push path filters and must not
start another image build.

The internal contract is:

- `container-main` produces an immutable image tag and OCI index digest.
- `deploy` consumes only those outputs after both required gates pass.
- Kubernetes stores
  `ghcr.io/...:sha-<short-sha>@sha256:<digest>`.

## Security and failure gates

The following gates are mandatory:

| Gate | Required behavior |
|---|---|
| Application | Lint, client/server types, unit, integration, portable E2E, production build, keyboard, and accessibility coverage pass |
| Container | One main-branch build; Trivy fails on fixable HIGH/CRITICAL findings |
| Supply chain | Immutable SHA tag, OCI digest, SBOM, and maximum provenance are published |
| Promotion | The scanned digest exactly matches the digest written to the Deployment |
| GitOps | Kustomize render and whitespace validation pass; only the Deployment manifest is committed |
| Concurrency | A newer Homepage change supersedes an older run; no force push is permitted |
| Privilege | Quality/PR are read-only, package write exists only in `container-main`, and repository write exists only in `deploy` |

A quality failure may leave an immutable SHA image in GHCR, but that artifact is
not deployable and must never create a deployment commit. A scan, manifest
replacement, kustomize, whitespace, rebase, or push failure leaves production
unchanged. No workflow may use a mutable production tag, a cluster credential,
direct `kubectl apply`, or a self-hosted runner.

## Implementation packages

| Package | State | Completion condition |
|---|---|---|
| WF-000 — Publish controlling plan | **COMPLETE** | Plan commit [`8722c5d`](https://github.com/seandre/k8s-homelab/commit/8722c5d09f26a504900caa1cdfd28ab251cd45df), successful [documentation run `30329079546`](https://github.com/seandre/k8s-homelab/actions/runs/30329079546), and isolated docs-image promotion `9938945`; unrelated worktree edits were not included |
| WF-001 — Parallelize verification and build once | **COMPLETE** | Workflow commit [`394ec33`](https://github.com/seandre/k8s-homelab/commit/394ec3311c1abdcc7b45e9cc73b809171bee491b), successful [first optimized run `30329328834`](https://github.com/seandre/k8s-homelab/actions/runs/30329328834), and gated Deployment promotion [`c309422`](https://github.com/seandre/k8s-homelab/commit/c309422764c8f7b10c777c19dce0ea690e029ba7) |
| WF-002 — Production acceptance and closeout | PENDING | Argo CD is Synced/Healthy on the pinned digest and five warm-cache `main` runs have a median duration at or below 120 seconds |

## Production acceptance evidence

Do not fill an evidence cell from expectation or local simulation. Link the
GitHub run, package/attestation view, Git commit, or redacted cluster output
that proves it.

| Check | Required evidence | Result |
|---|---|---|
| Parallel execution | First optimized run shows overlapping `quality` and `container-main` timestamps | **PASS** — [run `30329328834`](https://github.com/seandre/k8s-homelab/actions/runs/30329328834): both jobs started at `2026-07-28T04:39:04Z` |
| Single build | The same run contains exactly one main-branch BuildKit build | **PASS** — `container-main` contained one `Build and push the immutable image once` step; `container-pr` was skipped on the `main` push |
| Exact digest | Trivy input, `container-main` output, deployment commit, and manifest contain the same OCI digest | **PASS** — the exact-digest Trivy step succeeded and [`c309422`](https://github.com/seandre/k8s-homelab/commit/c309422764c8f7b10c777c19dce0ea690e029ba7) pinned the exported OCI digest `sha256:01db6b8e3b4466fa60927c1197528e7c8e6ebbc9c5aa4e605705be5ed1435a0b` |
| Supply-chain attestations | GHCR/referrers evidence shows an SBOM and maximum-mode provenance for that digest | **PASS** — GHCR reports an OCI index at the deployed digest and attestation manifest `sha256:9adb2a997fc2e39c736a68e5b574eac6b1fccb9d68aa38a9313c812eca7d5a17` with SPDX and SLSA provenance layers; the [workflow](../../.github/workflows/homepage-image.yaml) requests `provenance: mode=max` |
| No build loop | The manifest-only bot commit does not start the Homepage image workflow | **PASS** — the post-promotion run list contains the `394ec33` source run and no run for bot commit `c309422` |
| GitOps health | Argo CD reports `Synced / Healthy` and the running Deployment image ID/reference resolves to that digest | **PASS** — at `2026-07-28T04:45:49Z`, `homelab-apps` was `Synced / Healthy` at `c309422`; the ready pod's image and runtime image ID both resolved to the deployed digest |
| Rollback readiness | The prior digest-pinned reference is recorded and can be restored with one Git revert or manifest edit | **PASS** — the parent of [`c309422`](https://github.com/seandre/k8s-homelab/commit/c309422764c8f7b10c777c19dce0ea690e029ba7) records prior reference `sha-8597793@sha256:c36cb687b32b2c6a7573fc63bc808e06593c1123f11027f856e80e115efebbd0` |

### First optimized functional run

[Run `30329328834`](https://github.com/seandre/k8s-homelab/actions/runs/30329328834)
was created at `2026-07-28T04:38:55Z` and completed successfully at
`2026-07-28T04:40:34Z`, an end-to-end duration of **99 seconds**. `quality`
completed at `04:40:23Z`, `container-main` at `04:40:01Z`, and the gated
`deploy` job ran from `04:40:25Z` through `04:40:33Z`.

This run created the new `homepage-container-main` BuildKit cache scope. Treat
it as cold-cache functional evidence and do not include it in the five-run
warm-cache acceptance median.

### Five-run timing record

Use five successful, representative, warm-cache `main` runs. Record queue delay
and cache state so cold-cache or runner-capacity effects remain visible.

| Run | Source SHA | Cache | Created | Completed | Duration | Queue/cold-cache note |
|---:|---|---|---|---|---:|---|
| 1 | PENDING | PENDING | PENDING | PENDING | PENDING | |
| 2 | PENDING | PENDING | PENDING | PENDING | PENDING | |
| 3 | PENDING | PENDING | PENDING | PENDING | PENDING | |
| 4 | PENDING | PENDING | PENDING | PENDING | PENDING | |
| 5 | PENDING | PENDING | PENDING | PENDING | PENDING | |
| **Median** | | | | | **PENDING** | Pass at `<= 120 s` |

## Validation commands

Run the affected local checks before publication:

```bash
cd homepage
npm ci
npm run lint
npm run typecheck
npm test -- --run
npm run test:integration
npm run test:e2e -- --grep-invert 'matches the .* overview'

cd ..
kubectl kustomize kubernetes/clusters/homelab >/dev/null
git diff --check

cd docs-site/vitepress
npm ci
npm run build
```

The Playwright command includes the production build and portable
accessibility checks. VitePress fails on unresolved internal links.

## Rollback

- To roll back application code, revert the source commit and allow its
  workflow to publish and promote the resulting immutable image.
- For immediate application rollback, restore the previous digest-pinned image
  in `kubernetes/apps/homepage-custom-preview/deployment.yaml`, validate the
  kustomization, and push that single Git change. Argo CD performs the rollout.
- If the automation itself is faulty, revert the workflow refactor and use the
  previous manual digest-promotion process.
- Do not delete immutable images or attestations during rollback. They are
  audit and recovery evidence.
- Do not bypass GitOps with a direct cluster apply, introduce a mutable
  production tag, weaken Trivy or tests, force-push `main`, or add a
  self-hosted runner as a rollback shortcut.
