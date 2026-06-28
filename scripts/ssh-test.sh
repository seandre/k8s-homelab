#!/usr/bin/env bash
set -euo pipefail

user="${1:-sean}"
key="${2:-$HOME/.ssh/id_ed25519_github}"
mode="${MODE:-once}"
suspect="${SUSPECT_HOST:-192.168.40.22}"
attempts="${SSH_ATTEMPTS:-30}"
sleep_seconds="${SSH_SLEEP_SECONDS:-2}"
command="${SSH_COMMAND:-date; hostname; uptime}"

hosts=(
  "192.168.40.21"
  "192.168.40.22"
  "192.168.40.23"
)

ssh_opts=(
  -i "${key}"
  -o BatchMode=yes
  -o ConnectTimeout=5
  -o ServerAliveInterval=2
  -o ServerAliveCountMax=2
)

run_once() {
  local host

  for host in "${hosts[@]}"; do
    echo "===== ${host} $(date) ====="
    ssh "${ssh_opts[@]}" "${user}@${host}" "hostname" || true
  done
}

run_loop() {
  local i status

  for ((i = 1; i <= attempts; i++)); do
    echo "===== attempt ${i} ${suspect} $(date) ====="
    set +e
    ssh "${ssh_opts[@]}" "${user}@${suspect}" "${command}"
    status=$?
    set -e
    echo "[ssh exit ${status}]"

    if [[ "${status}" -ne 0 ]]; then
      echo
      echo "SSH failed for ${suspect}; immediate TCP/22 peer check:"
      nc -vz -G 3 192.168.40.21 22 || true
      nc -vz -G 3 192.168.40.22 22 || true
      nc -vz -G 3 192.168.40.23 22 || true
      return "${status}"
    fi

    sleep "${sleep_seconds}"
  done
}

case "${mode}" in
  once)
    run_once
    ;;
  loop)
    run_loop
    ;;
  *)
    echo "Unknown MODE=${mode}. Use MODE=once or MODE=loop." >&2
    exit 2
    ;;
esac
