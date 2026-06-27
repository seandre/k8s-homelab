#!/usr/bin/env bash
set -euo pipefail
hosts=(
  "192.168.10.20"
  "192.168.10.21"
  "192.168.10.22"
  "192.168.10.23"
  "192.168.10.24"
)
for host in "${hosts[@]}"; do
  echo "Checking ${host}..."
  ping -c 2 "${host}" || true
done
