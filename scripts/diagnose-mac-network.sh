#!/usr/bin/env bash
set -u

user="${SSH_USER:-sean}"
key="${SSH_KEY:-$HOME/.ssh/id_ed25519_github}"
suspect="${SUSPECT_HOST:-192.168.40.22}"
iterations="${SSH_ATTEMPTS:-20}"
sleep_seconds="${SSH_SLEEP_SECONDS:-2}"
clear_arp="${CLEAR_ARP:-0}"
hosts=(${HOSTS:-192.168.40.21 192.168.40.22 192.168.40.23})
conflict_hosts_re="${CONFLICT_HOSTS_RE:-192\.168\.40\.(21|22|23|112|170)}"
log_dir="${LOG_DIR:-diagnostics}"
timestamp="$(date +%Y%m%d-%H%M%S)"
log_file="${log_dir}/mac-network-${timestamp}.log"

mkdir -p "${log_dir}"

log() {
  printf '%s\n' "$*"
}

run() {
  log
  log "+ $*"
  "$@" 2>&1
  local status=$?
  log "[exit ${status}]"
  return "${status}"
}

capture_host() {
  local host="$1"

  log
  log "===== ${host} ====="
  run date
  run route -n get "${host}"
  run ping -c 3 "${host}"
  run nc -vz -G 3 "${host}" 22
  run arp -an
}

capture_suspect_after_failure() {
  log
  log "===== immediate suspect capture: ${suspect} ====="
  run ping -c 5 "${suspect}"
  run nc -vz -G 3 "${suspect}" 22
  run route -n get "${suspect}"
  run arp -an
  log
  log "===== conflict candidate ARP rows, if Mac is on the same L2 segment ====="
  arp -an | egrep "${conflict_hosts_re}" 2>&1

  if [[ "${clear_arp}" == "1" ]]; then
    log
    log "===== clearing ARP for ${suspect} and relearning ====="
    run sudo arp -d "${suspect}"
    run ping -c 1 "${suspect}"
    run arp -an
  fi
}

{
  log "Mac network diagnostic started: $(date)"
  log "user=${user}"
  log "key=${key}"
  log "suspect=${suspect}"
  log "hosts=${hosts[*]}"
  log "iterations=${iterations}"
  log "sleep_seconds=${sleep_seconds}"
  log "clear_arp=${clear_arp}"

  log
  log "### baseline host reachability"
  for host in "${hosts[@]}"; do
    capture_host "${host}"
  done

  log
  log "### suspect SSH loop"
  failed=0
  for ((i = 1; i <= iterations; i++)); do
    log
    log "===== attempt ${i} $(date) ====="
    ssh -i "${key}" \
      -o BatchMode=yes \
      -o ConnectTimeout=5 \
      -o ServerAliveInterval=2 \
      -o ServerAliveCountMax=2 \
      "${user}@${suspect}" \
      'date; hostname; ip -brief addr show ens18; ip route; uptime' 2>&1
    status=$?
    log "[ssh exit ${status}]"

    if [[ "${status}" -ne 0 ]]; then
      failed=1
      capture_suspect_after_failure
      break
    fi

    sleep "${sleep_seconds}"
  done

  if [[ "${failed}" -eq 0 ]]; then
    log
    log "### suspect SSH loop completed without failure"
    capture_suspect_after_failure
  fi

  log
  log "### final peer comparison"
  for host in "${hosts[@]}"; do
    capture_host "${host}"
  done

  log
  log "Mac network diagnostic finished: $(date)"
} | tee "${log_file}"

log
log "Wrote ${log_file}"
