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

for window in 1h 24h 7d 30d; do
  grep -Fq "window: $window" "$monitoring_render"
done

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
  indoor_coway_bedroom_filter_life_percent; do
  grep -Fq "$metric" "$monitoring_render"
done

grep -Fq 'requires_auth: true' "$home_assistant_render"
grep -Fq 'kubernetes.io/metadata.name: monitoring' "$home_assistant_render"
grep -Fq 'operator.prometheus.io/name: kube-prometheus-stack-prometheus' "$home_assistant_render"

if rg -n -i '(bearer_token|access_token|credentials):[[:space:]]+[^|]' \
  "$repository_root/kubernetes/apps/home-assistant" \
  "$repository_root/kubernetes/apps/monitoring/home-assistant-indoor-"*.yaml; then
  echo 'possible plaintext IE-010 credential found' >&2
  exit 1
fi

echo 'IE-010 Prometheus manifest contract: PASS'
