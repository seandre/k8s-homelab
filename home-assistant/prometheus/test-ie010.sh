#!/bin/sh
set -eu

repository_root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
monitoring_render=$(mktemp)
home_assistant_render=$(mktemp)
trap 'rm -f "$monitoring_render" "$home_assistant_render"' EXIT

kubectl kustomize "$repository_root/kubernetes/apps/monitoring" >"$monitoring_render"
kubectl kustomize "$repository_root/kubernetes/apps/home-assistant" >"$home_assistant_render"

grep -Fq 'name: home-assistant-indoor' "$monitoring_render"
grep -Fq 'metricsPath: /api/prometheus' "$monitoring_render"
grep -Fq 'name: home-assistant-indoor-prometheus' "$monitoring_render"
grep -Fq 'key: token' "$monitoring_render"
grep -Fq 'home-assistant.home-assistant.svc.cluster.local:8123' "$monitoring_render"
grep -Fq 'action: keep' "$monitoring_render"
grep -Fq 'record: indoor:history_samples:count' "$monitoring_render"

for window in 1h 3h 6h 24h 7d 30d; do
  grep -Fq "window: $window" "$monitoring_render"
done
grep -Fq 'custom: {range: request-bounded, step: max-360-points}' "$monitoring_render"

for metric in \
  indoor_aranet_temperature_fahrenheit \
  indoor_aranet_humidity_percent \
  indoor_aranet_pressure_hpa \
  indoor_aranet_co2_ppm \
  indoor_aranet_battery_percent \
  indoor_nest_temperature_fahrenheit \
  indoor_nest_humidity_percent \
  indoor_coway_living_room_aqi \
  indoor_coway_living_room_pm25_micrograms_m3 \
  indoor_coway_living_room_pm10_micrograms_m3 \
  indoor_coway_living_room_filter_life_percent \
  indoor_coway_bedroom_aqi \
  indoor_coway_bedroom_pm25_micrograms_m3 \
  indoor_coway_bedroom_pm10_micrograms_m3 \
  indoor_coway_bedroom_filter_life_percent \
  indoor_airgradient_temperature_fahrenheit \
  indoor_airgradient_humidity_percent \
  indoor_airgradient_co2_ppm \
  indoor_airgradient_pm25_micrograms_m3 \
  indoor_airgradient_pm10_micrograms_m3 \
  indoor_airgradient_tvoc_index \
  indoor_airgradient_nox_index; do
  grep -Fq "$metric" "$monitoring_render"
done

for alias in \
  airgradient_living_room.temperature \
  airgradient_living_room.humidity \
  airgradient_living_room.co2 \
  airgradient_living_room.pm25 \
  airgradient_living_room.pm10 \
  airgradient_living_room.tvoc_index \
  airgradient_living_room.nox_index; do
  grep -Fq "$alias:" "$monitoring_render"
done

grep -Fq 'requires_auth: true' "$home_assistant_render"
grep -Fq 'kubernetes.io/metadata.name: monitoring' "$home_assistant_render"
grep -Fq 'operator.prometheus.io/name: kube-prometheus-stack-prometheus' "$home_assistant_render"
if grep -Fq 'sensor.indoor_airgradient_source' "$home_assistant_render"; then
  echo 'non-reading AirGradient source state entered the history exporter allowlist' >&2
  exit 1
fi

if rg -n -i '(bearer_token|access_token|credentials):[[:space:]]+[^|]' \
  "$repository_root/kubernetes/apps/home-assistant" \
  "$repository_root/kubernetes/apps/monitoring/home-assistant-indoor-"*.yaml; then
  echo 'possible plaintext IE-010 credential found' >&2
  exit 1
fi

if rg -n -i 'airgradient[^\n]*(entity_id|serial|mac address|token|vendor)' \
  "$repository_root/kubernetes/apps/home-assistant/configmap.yaml" \
  "$repository_root/kubernetes/apps/monitoring/home-assistant-indoor-"*.yaml \
  "$repository_root/homepage/src/server/indoor-history.ts" \
  "$repository_root/homepage/src/server/runtime-config.ts"; then
  echo 'possible private AirGradient identifier found in history configuration' >&2
  exit 1
fi

echo 'IE-010 Prometheus manifest contract: PASS'
