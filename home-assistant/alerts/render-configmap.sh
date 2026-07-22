#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source_file="${root}/home-assistant/alerts/indoor_alerts.yaml"
target_file="${root}/kubernetes/apps/home-assistant/alerts-configmap.yaml"
temp_file="$(mktemp)"
trap 'rm -f "${temp_file}"' EXIT

{
  sed -n '1,9p' "${target_file}"
  sed 's/^/    /' "${source_file}"
} > "${temp_file}"
cp "${temp_file}" "${target_file}"
