#!/bin/sh
set -eu

repository_root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
app_output=$(mktemp)
cluster_output=$(mktemp)
trap 'rm -f "$app_output" "$cluster_output"' EXIT

kubectl kustomize "$repository_root/kubernetes/apps/home-assistant" >"$app_output"
kubectl kustomize "$repository_root/kubernetes/clusters/homelab/apps" >"$cluster_output"

expected_image='ghcr.io/seandre/k8s-homelab-home-assistant:sha-b5bc31cb8f0ac715f5794c95e03510e03658a5e4@sha256:9f0c4eb2c42db67d70c12ff6ca3ed9c1fcd314d9f66929a0de61064654610803'

grep -Fq "image: $expected_image" "$app_output"
grep -Fq 'storageClassName: local-path' "$app_output"
grep -Fq 'storage: 10Gi' "$app_output"
grep -Fq 'host: ha.lab.seandre.dev' "$app_output"
grep -Fq 'mountPath: /config/configuration.yaml' "$app_output"
grep -Fq 'automountServiceAccountToken: false' "$app_output"
grep -Fq 'type: Recreate' "$app_output"
grep -Fq 'cidr: 0.0.0.0/0' "$app_output"
grep -Fq '10.0.0.0/8' "$app_output"
grep -Fq 'port: 443' "$app_output"
grep -Fq 'port: 53' "$app_output"
grep -Fq 'port: 8123' "$app_output"

# IE-005 adds only the confirmed Atom /32. IE-010 adds Prometheus ingress only;
# Homepage remains deferred, and an IoT subnet-wide route remains forbidden.
grep -Fq 'cidr: 192.168.30.239/32' "$app_output"
grep -Fq 'port: 6053' "$app_output"
grep -Fq 'kubernetes.io/metadata.name: monitoring' "$app_output"
grep -Fq 'operator.prometheus.io/name: kube-prometheus-stack-prometheus' "$app_output"
if grep -Eq 'cidr: 192\.168\.30\.0/24|port: 9090|namespace: homepage' "$app_output"; then
  echo 'Home Assistant render contains a deferred or overly broad network path' >&2
  exit 1
fi

grep -Fq "image: $expected_image" "$cluster_output"

if rg -n -i '(password|access[_-]?token|client[_-]?secret):[[:space:]]+[^|]' \
  "$repository_root/kubernetes/apps/home-assistant"; then
  echo 'possible credential field found in Home Assistant manifests' >&2
  exit 1
fi

echo 'IE-004 manifest contract: PASS'
