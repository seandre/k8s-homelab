#!/usr/bin/env bash
set -euo pipefail
user="${1:-sean}"
hosts=(
  "192.168.10.21"
  "192.168.10.22"
  "192.168.10.23"
  "192.168.10.24"
)
for host in "${hosts[@]}"; do
  echo "Testing SSH to ${user}@${host}..."
  ssh -o BatchMode=yes -o ConnectTimeout=5 "${user}@${host}" "hostname" || true
done
