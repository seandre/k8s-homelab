#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source_file="${root}/home-assistant/alerts/indoor_alerts.yaml"
schedule_file="${root}/home-assistant/coway/night-schedule.yaml"
target_file="${root}/kubernetes/apps/home-assistant/alerts-configmap.yaml"
temp_file="$(mktemp)"
trap 'rm -f "${temp_file}"' EXIT

{
  # Preserve the independently owned AG-003 airgradient.yaml package and
  # replace only the generated indoor_alerts.yaml value.
  sed -n '1,/^  indoor_alerts.yaml: |$/p' "${target_file}"
  sed -e 's/^/    /' -e 's/[[:space:]]*$//' "${source_file}"
  printf '  coway-night-schedule.yaml: |\n'
  sed -e 's/^/    /' -e 's/[[:space:]]*$//' "${schedule_file}"
} > "${temp_file}"
cp "${temp_file}" "${target_file}"
