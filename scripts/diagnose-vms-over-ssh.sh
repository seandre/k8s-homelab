#!/usr/bin/env bash
set -u

user="${SSH_USER:-sean}"
key="${SSH_KEY:-$HOME/.ssh/id_ed25519_github}"
hosts=(${HOSTS:-192.168.40.21 192.168.40.22 192.168.40.23})
log_dir="${LOG_DIR:-diagnostics}"
timestamp="$(date +%Y%m%d-%H%M%S)"
log_file="${log_dir}/vms-over-ssh-${timestamp}.log"

mkdir -p "${log_dir}"

log() {
  printf '%s\n' "$*"
}

{
  log "VM over-SSH diagnostic started: $(date)"
  log "user=${user}"
  log "key=${key}"
  log "hosts=${hosts[*]}"

  for host in "${hosts[@]}"; do
    log
    log "===== ${host} ====="
    ssh -i "${key}" \
      -o BatchMode=yes \
      -o ConnectTimeout=5 \
      -o ServerAliveInterval=2 \
      -o ServerAliveCountMax=2 \
      "${user}@${host}" \
      'bash -s' < scripts/diagnose-vm-identity.sh 2>&1
    status=$?
    log "[ssh diagnostic exit ${status}]"
  done

  log
  log "VM over-SSH diagnostic finished: $(date)"
} | tee "${log_file}"

log
log "Wrote ${log_file}"
