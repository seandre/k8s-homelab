#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
python3 "${root}/home-assistant/alerts/generate.py"
"${root}/home-assistant/alerts/render-configmap.sh"
python3 "${root}/home-assistant/alerts/test-alerts.py"
git -C "${root}" diff --exit-code -- home-assistant/alerts/indoor_alerts.yaml kubernetes/apps/home-assistant/alerts-configmap.yaml
