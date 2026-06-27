#!/usr/bin/env bash
set -euo pipefail
hosts=(
  "192.168.40.20"
  "192.168.40.21"
  "192.168.40.22"
  "192.168.40.23"
  "192.168.40.24"
)
for host in "${hosts[@]}"; do
  echo "Checking ${host}..."
  ping -c 2 "${host}" || true
done
