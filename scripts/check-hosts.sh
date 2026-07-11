#!/usr/bin/env bash
set -euo pipefail
hosts=(
  "192.168.40.20"
  "192.168.40.21"
  "192.168.40.22"
  "192.168.40.23"
  "192.168.40.24"
)

if [[ "${INCLUDE_PLANNED_HOSTS:-0}" == "1" ]]; then
  hosts+=(
    "192.168.40.25"
    "192.168.40.26"
  )
fi
for host in "${hosts[@]}"; do
  echo "Checking ${host}..."
  ping -c 2 "${host}" || true
done
