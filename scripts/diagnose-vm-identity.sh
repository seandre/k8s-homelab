#!/usr/bin/env bash
set -u

log_dir="${LOG_DIR:-diagnostics}"
timestamp="$(date +%Y%m%d-%H%M%S)"
host_label="$(hostname 2>/dev/null || echo unknown-host)"
log_file="${log_dir}/vm-identity-${host_label}-${timestamp}.log"

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

run_sudo() {
  log
  log "+ sudo -n $*"
  sudo -n "$@" 2>&1
  local status=$?
  log "[exit ${status}]"
  return "${status}"
}

{
  log "VM identity diagnostic started: $(date)"
  run hostnamectl
  run hostname
  run cat /etc/machine-id
  run ip -brief addr show ens18
  run ip route
  run ip link show ens18
  run ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub
  run ls -l /etc/netplan/
  run_sudo cat /etc/netplan/*.yaml

  log
  log "### Local health"
  run uptime
  run free -h
  run df -h
  run systemctl status ssh --no-pager
  run_sudo journalctl -u ssh --since "1 hour ago" --no-pager

  log
  log "### Kernel network/freeze/error signals"
  sudo -n journalctl -k --since "1 hour ago" --no-pager 2>&1 \
    | egrep -i 'ens18|link|reset|virtio|oom|blocked|hung|error|fail'
  log "[kernel filter exit ${PIPESTATUS[1]}]"

  log
  log "VM identity diagnostic finished: $(date)"
} | tee "${log_file}"

log
log "Wrote ${log_file}"
