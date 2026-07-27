#!/usr/bin/env bash
set -euo pipefail

root_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
rendered=$(mktemp)
trap 'rm -f "$rendered"' EXIT

kubectl kustomize "$root_dir/kubernetes/apps/home-assistant" >"$rendered"
for alias in temperature humidity co2 pm25 pm10 tvoc_index nox_index; do
  grep -Fq "indoor_airgradient_${alias}" "$rendered"
done
grep -Fq 'unit_of_measurement: "°F"' "$rendered"
grep -Fq 'freshness_window_seconds: "{{ 180 }}"' "$rendered"
test "$(rg -c "'STALE'" "$root_dir/kubernetes/apps/home-assistant/alerts-configmap.yaml")" -ge 7
test "$(rg -c 'obj.last_reported \| default\(obj.last_updated, true\).*<= 180' "$root_dir/kubernetes/apps/home-assistant/alerts-configmap.yaml")" -ge 15

if rg -n -i 'airgradient[^\n]*(mac address|serial|token|entity_id)' \
  "$root_dir/kubernetes/apps/home-assistant/alerts-configmap.yaml"; then
  echo 'AirGradient package contains a forbidden raw identifier or credential' >&2
  exit 1
fi

echo 'AG-003 AirGradient normalization contract: PASS'
