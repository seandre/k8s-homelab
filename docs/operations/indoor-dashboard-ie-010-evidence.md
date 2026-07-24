# IE-010 — Prometheus History Pipeline

## Contract

Home Assistant exposes its authenticated `/api/prometheus` endpoint only to the
Prometheus pod. The exporter includes exactly 15 normalized, Git-owned indoor
read aliases. A metric relabeling rule at ingestion drops Home Assistant process
and information collectors, so adding an integration cannot silently expand the
stored dataset.

The normalized sensors enforce source freshness before export:

- Aranet readings expire after 180 seconds without a new local observation.
- Nest and Coway readings expire after 300 seconds without a new cloud
  observation.
- `unknown` and `unavailable` render as no numeric sensor state. Home
  Assistant then removes the corresponding Prometheus series; it never emits a
  zero or carries the old value forward.

The fixed query catalog maps the 15 public aliases to metric names and permits
only `1h`, `24h`, `7d`, and `30d`. IE-011 must select from this catalog and must
not accept browser-supplied PromQL, metric names, entity IDs, or URLs.

## Credential provisioning

Create a dedicated Home Assistant user named `Indoor Prometheus`. Leave
Administrator disabled and do not grant dashboard control access. Sign in as
that user and create one long-lived token named `Indoor Prometheus scrape`.

The cluster does not currently run Sealed Secrets. Introducing its private-key
root of trust is prohibited until the separate key backup and restore exercise
in the rebuild runbook passes. Provision the token as the protected runtime
Secret `monitoring/home-assistant-indoor-prometheus`, key `token`, following the
same established pattern as the monitoring exporter credential. The plaintext
must enter `kubectl create secret` through standard input or a mode-`0600`
temporary file; never put it in a command argument, terminal output, Git, or
documentation. The committed `ScrapeConfig` references only the Secret name and
key.

After the Secret exists, revoke any temporary owner token used to create or
verify the identity and clear the clipboard. The dedicated token is
read-only by account role, is scoped operationally to the exporter endpoint, and
is independently revocable.

## Validation

Local and schema validation:

```bash
sh home-assistant/prometheus/test-ie010.sh
home-assistant/alerts/test-alerts.sh
home-assistant/k3s/test-manifests.sh
git diff --check
```

Live acceptance:

1. Confirm the Home Assistant and monitoring Argo applications are
   `Synced/Healthy`.
2. Confirm the target `home-assistant-indoor` is `UP`.
3. Query the catalog and prove that all currently supported readings have data.
   An unsupported live capability may remain absent; it must never be replaced
   with a fabricated series.
4. Query `indoor:history_samples:count{window="1h"}`, then the `24h`, `7d`, and
   `30d` variants. A newly installed pipeline is expected to have a smaller
   sample count in older horizons until retention fills; each query must still
   return truthful available samples.
5. Confirm no series for the job exists outside the exact `indoor_*` allowlist.
6. During a controlled source-loss test, wait through the source freshness
   window and confirm the affected current series disappears while historical
   samples remain queryable.

## Rollback

Revert the IE-010 Git commit. Argo removes the scrape, rules, query catalog, HA
exporter configuration, and Prometheus ingress exception. Revoke the dedicated
Home Assistant token and delete its runtime Secret. Retained historical
samples naturally age out under the existing 30-day retention; do not delete the
Prometheus PVC.

## Evidence

| Check | Result |
|---|---|
| Production-image Home Assistant configuration check | PASS |
| Monitoring resources accepted by live API dry-run | PASS |
| Exact 15-series double allowlist | PASS |
| Four fixed history horizons | PASS |
| Plaintext credential absent from Git | PASS |
| Dedicated non-admin identity and protected runtime Secret | PASS |
| Live target and history queries | PENDING CREDENTIAL |
| Controlled unavailable-series test | PENDING LIVE TARGET |
