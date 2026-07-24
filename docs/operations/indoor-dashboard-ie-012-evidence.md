# IE-012 Homepage Control Gateway

Status: **implemented; live rollout pending**.

The Homepage backend now exposes only `POST /api/v1/indoor/actions`. Its strict
discriminated contract accepts canonical Nest and Coway aliases and verified
values; it cannot accept a Home Assistant entity ID, service name, URL, vendor
identifier, or arbitrary service data.

## Safeguards and behavior

- Requests require JSON, literal `confirmed: true`, an exact current
  `stateVersion`, same-origin Fetch Metadata, and a source address on approved
  Main/Trusted `192.168.20.0/24` or Teleport `192.168.2.0/24`.
- Nest and Coway sources must be `AVAILABLE`, and the requested value must be in
  the target's advertised capability allowlist.
- The gateway limits each source to 10 attempts per minute, permits no concurrent
  execution for a target, and retains idempotency keys for at least 24 hours.
- A 1 GiB runtime journal on `local-path` preserves replay results across a pod
  restart. An interrupted pending action becomes `FAILED`; restart never replays
  it.
- Acceptance returns `202 PENDING`. Public state is not changed optimistically.
  `SUCCEEDED` appears only after a new Home Assistant observation converges;
  source failure becomes `FAILED`, and non-convergence becomes `TIMED_OUT`.
- Audit events contain only action ID, canonical alias, command type, normalized
  old/requested state, latency, and result. They exclude credentials, headers,
  private mappings, upstream bodies, and raw identifiers.

Home Assistant remains the sole device-control authority. The server-owned
translation calls only fixed `climate`, `fan`, `select`, and `switch` services.
The entity mapping exists only in the runtime Secret
`homepage/homepage-home-assistant-control`; no mapping value is stored in Git or
this document.

The gateway runs as one replica with `Recreate` deployment semantics because a
single process owns the persistent replay journal and per-target execution
locks. Read-only dashboard behavior remains available again as soon as the
Deployment restarts.

## Verification

From `homepage/`:

```sh
npm run typecheck
npm run lint
npm test
npm run test:integration
npm run build
```

From the repository root:

```sh
git diff --check
kubectl kustomize kubernetes/apps/homepage-custom-preview >/dev/null
home-assistant/k3s/test-manifests.sh
```

The unit and route suite covers success after observed convergence, timeout,
cloud failure, state conflict, unavailable source, replay without a second HA
call, invalid capability, raw-field rejection, Main and Teleport source rules,
cross-origin rejection, rate limiting, fixed service translation, and audit
redaction.

## Runtime Secret recovery

After a clean cluster restore, derive the mapping from Home Assistant's restored
entity/device registries on the trusted operator workstation and create
`homepage-home-assistant-control` with one `mapping.json` key. Validate only the
schema and count; never print or commit its values. The gateway stays disabled
and returns `503 ACTIONS_UNAVAILABLE` when the Secret or token is absent.

## Rollback

Roll back the Homepage image and Deployment/PVC manifests through GitOps. An old
read-only image ignores the runtime Secret and journal. Do not delete either
until the 24-hour replay window has elapsed. Rolling back cannot execute or
replay an accepted action.
