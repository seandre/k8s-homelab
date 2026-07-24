# IE-011 Homepage indoor read-contract evidence

IE-011 changes the Homepage bootstrap contract from schema v2 to schema v3 and
adds normalized indoor state. Existing infrastructure members remain unchanged.
The public contract contains only canonical room, device, reading, capability,
alert, freshness, source-state, and state-version values.

## Read boundaries

`HomeAssistantIndoorAdapter` authenticates server-side with a mounted,
non-admin Home Assistant token. It reads the fixed Git-owned normalized indoor
sensors and emits canonical aliases only. It never returns Home Assistant
entity IDs, vendor identifiers, the token, an upstream URL, or an upstream
error. Missing credentials, authentication failure, malformed data, and
transport failure all produce explicit `UNAVAILABLE` state with null current
values.

Local Aranet observations expire after 180 seconds. Cloud-backed Nest and Coway
observations expire after 300 seconds. A stale observation may remain in
Prometheus history, but its bootstrap `value` is null.

The live capability arrays reproduce the independently verified IE-007 and
IE-008 contracts. Unsupported fixture capabilities use `supported: false` and
empty option arrays; the adapter never invents a substitute.

## History boundary

`GET /api/v1/history` retains existing non-indoor behavior and adds only the 15
Git-owned indoor aliases with windows `1h`, `24h`, `7d`, and `30d`. The server
maps those pairs to fixed Prometheus metric names, ranges, and steps. Browser
input cannot supply PromQL, a Home Assistant entity ID, a metric name, a URL,
or a vendor identifier. A missing series is `HISTORY_NOT_FOUND`; no last value
is carried forward as current.

## Fixtures and tests

The deterministic fixture set covers:

- healthy: every source current;
- partial: local/cloud sources fail independently;
- stale: retained history exists while current values are null;
- unavailable: sources and values are explicitly unavailable/null;
- unsupported: capability flags are false and allowlists are empty.

Verification commands:

```sh
cd homepage
npm run typecheck
npm test
npm run lint
npm run build
npm run test:integration
cd ..
kubectl kustomize kubernetes/apps/homepage-custom-preview
home-assistant/k3s/test-manifests.sh
git diff --check
```

The unit suite includes contract, fixture, adapter, history integration, and
redaction assertions. The application manifests mount only
`homepage-home-assistant-readonly`, allow Homepage-to-Home Assistant TCP/8123,
and preserve all other namespace isolation.

## Credential provisioning

The token is runtime-only. Until the repository's Sealed Secrets key
backup/restore gate is complete, provision the namespace-local Secret through
the existing protected runtime-Secret procedure:

```text
namespace: homepage
secret: homepage-home-assistant-readonly
key: token
mount: /var/run/homepage-secrets/home-assistant/token
```

Never pass the token as a command-line argument, print it, or commit it.

## Rollback

Revert the IE-011 commits and restore the prior immutable Homepage image digest.
Delete only `homepage/homepage-home-assistant-readonly` if the adapter is being
retired. This does not change Home Assistant devices, integrations, alerts, or
Prometheus retention.
