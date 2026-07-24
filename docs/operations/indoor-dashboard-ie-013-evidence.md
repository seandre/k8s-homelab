# IE-013 Indoor Dashboard UI

Status: **complete**.

The custom Homepage now includes a compact Living Room indoor summary on
Overview and a dedicated `/indoor` route. The route shows Aranet, Nest, and both
Coway sources independently so a cloud failure does not hide local monitoring.

## Behavior

- Current temperature, humidity, CO₂, pressure, Aranet battery, PM2.5, PM10,
  AQI, and filter state use only normalized schema-v3 aliases.
- History supports fixed `1h`, `24h`, `7d`, and `30d` windows with visible and
  screen-reader-described threshold markers.
- Missing history renders `NO DATA`; stale and unavailable readings retain
  their explicit backend state and never fabricate a current value.
- Nest and Coway controls render only when their capability is advertised.
  Every command opens a review dialog containing the target, current state,
  requested state, and local/cloud dependency.
- Submission includes a fresh idempotency key, literal confirmation, and the
  displayed state version. The UI keeps the reported state unchanged until a
  later bootstrap observation converges. Pending, failed, timed-out, and
  successful action results are shown from backend state.
- Companion App indoor notifications now open the deployed absolute `/indoor`
  URL rather than a relative Home Assistant path.

No raw Home Assistant entity ID, vendor identifier, service name, token, URL
input, or arbitrary query is accepted or rendered.

## Verification

The implementation passes:

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e
python3 home-assistant/alerts/test-alerts.py
home-assistant/k3s/test-manifests.sh
git diff --check
```

The suite includes 106 component/server tests and 15 Chromium flows covering
control confirmation, non-optimistic state, keyboard cancellation,
accessibility, mobile/tablet/desktop overflow, and dark/light overview visual
baselines.

## Rollback

Revert the Homepage image pin and IE-013 source commit through GitOps. The
control gateway remains safe if the UI is rolled back because it independently
requires confirmation, current state version, capability, source, origin,
network, idempotency, and convergence checks. If `/indoor` is rolled back,
temporarily point the notification URL to the Homepage root to avoid a dead
link.
