# Coway daytime Smart restoration — 2026-09-23

The daytime routine now restores each purifier to power on, Smart (`Auto`),
and lights `On` at 06:30 America/Los_Angeles, on daytime HA startup, and every
five minutes until 22:00. Healthy settings receive no commands. Normal
`Auto (Eco)` operation is preserved, and unavailable units or failed commands
do not block the other purifier. This policy also corrects manual daytime
power/mode/light changes on the next check.

## Connection repair

The old Coway client returned `Failed to parse purifier HTML page for info:
Extra data`. Home Assistant retained cached control states while observations
stopped; after a reload, the integration correctly reported `setup_retry`.
Coway IoCare 0.6.3 / CowayAIO 0.2.6 restored the connection to `loaded` and fresh
observations. The update contains the upstream
[HTML parsing fix](https://github.com/RobertD502/cowayaio/pull/20).

## Deployment and verification

- Source: `4e443f01fa0737b4d0eb7b98907ef45c583cb625`.
- [Image verification and publication](https://github.com/seandre/k8s-homelab/actions/runs/35929285562): successful, including 12 compatibility/schedule tests, HA config validation, and vulnerability comparison.
- Previous image: `ghcr.io/seandre/k8s-homelab-home-assistant:sha-d67b3a521484f31fee74e3b9e099c079ce01c997@sha256:7ca982de471f12b7ba8c688bb3370ecbaabede18c123d8307bae83b122687bc2`.
- Deployed image: `ghcr.io/seandre/k8s-homelab-home-assistant:sha-4e443f01fa0737b4d0eb7b98907ef45c583cb625@sha256:afa882fbcb9495534106c9f0b38c016a7978f60a38a3ff7ed6f490c2bda31bae`.
- Argo revision: `1422db477686ea0c5fc70e52e82683daaf576cc0`, `Synced` / `Healthy`; Deployment rollout successful.
- At approximately 15:44 Pacific, both bedroom and living-room purifiers reported power `on`, preset `Auto`, and light `On`. Their observations were 48 seconds old; 14 raw Coway sensor reports were also current.
- Invoking the deployed daytime routine with its time condition enabled completed successfully. Recovery from power-off, failures, Eco idle, and schedule boundaries was tested with synthetic devices using HA's actual script engine.

Rollback the deployment commit to restore the prior pinned image and config
revision. Reverting the source commit also removes the daytime recovery policy.
The old client may continue to fail against the changed Coway cloud response;
do not mistake its cached state for a successful device observation. No PVC or
integration credentials were replaced.
