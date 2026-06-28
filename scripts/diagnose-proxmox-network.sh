#!/usr/bin/env bash
set -u

suspect_ip="${SUSPECT_IP:-192.168.40.22}"
suspect_name="${SUSPECT_NAME:-k8s-worker-01}"
hosts=(${HOSTS:-192.168.40.21 192.168.40.22 192.168.40.23 192.168.40.112 192.168.40.170})
vm_names=(${VM_NAMES:-k8s-control-01 k8s-worker-01 k8s-worker-02})
log_dir="${LOG_DIR:-diagnostics}"
timestamp="$(date +%Y%m%d-%H%M%S)"
log_file="${log_dir}/proxmox-network-${timestamp}.log"

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

vmid_for() {
  local name="$1"
  qm list | awk -v name="${name}" '$2 == name {print $1; exit}'
}

mac_from_config() {
  local vmid="$1"
  qm config "${vmid}" | awk -F'[:,=]' '/^net[0-9]+:/ {print $3; exit}'
}

{
  log "Proxmox network diagnostic started: $(date)"
  log "suspect_ip=${suspect_ip}"
  log "suspect_name=${suspect_name}"
  log "hosts=${hosts[*]}"
  log "vm_names=${vm_names[*]}"

  run hostname
  run pveversion
  run qm list

  log
  log "### VM config and NIC inventory"
  suspect_vmid=""
  suspect_mac=""
  for name in "${vm_names[@]}"; do
    vmid="$(vmid_for "${name}")"
    if [[ -z "${vmid}" ]]; then
      log
      log "No VM ID found for ${name}"
      continue
    fi

    log
    log "===== ${name} vmid=${vmid} ====="
    qm config "${vmid}" | grep -E '^(name|net|agent|boot|ostype|scsi|virtio|sata|ide)'
    status=$?
    log "[config grep exit ${status}]"

    mac="$(mac_from_config "${vmid}")"
    log "parsed_mac=${mac:-unknown}"

    if [[ "${name}" == "${suspect_name}" ]]; then
      suspect_vmid="${vmid}"
      suspect_mac="${mac}"
    fi
  done

  log
  log "### Proxmox neighbor table"
  run ip neigh show

  log
  log "### Candidate host reachability from Proxmox"
  for host in "${hosts[@]}"; do
    log
    log "===== ${host} ====="
    run ping -c 3 "${host}"
    run nc -vz -w 3 "${host}" 22
  done

  if [[ -n "${suspect_vmid}" ]]; then
    log
    log "### Suspect VM runtime state"
    run qm status "${suspect_vmid}"
    run qm agent "${suspect_vmid}" ping

    log
    log "### Suspect VM monitor network/status"
    printf 'info network\ninfo status\nquit\n' | qm monitor "${suspect_vmid}" 2>&1
    log "[qm monitor exit $?]"
  else
    log
    log "No suspect VM ID found; skipping qm status/agent/monitor"
  fi

  if [[ -n "${suspect_mac}" ]]; then
    log
    log "### Bridge FDB rows for suspect MAC ${suspect_mac}"
    bridge fdb show | grep -i "${suspect_mac}" 2>&1
    log "[bridge grep exit $?]"
  else
    log
    log "No suspect MAC parsed; skipping bridge FDB lookup"
  fi

  log
  log "### Focused suspect check"
  run ping -c 20 "${suspect_ip}"
  run nc -vz -w 3 "${suspect_ip}" 22
  run ip neigh show

  log
  log "Proxmox network diagnostic finished: $(date)"
} | tee "${log_file}"

log
log "Wrote ${log_file}"
