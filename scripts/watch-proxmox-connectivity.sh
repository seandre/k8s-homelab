#!/usr/bin/env bash
set -u

interval="${INTERVAL_SECONDS:-2}"
ping_count="${PING_COUNT:-1}"
tcp_timeout="${TCP_TIMEOUT_SECONDS:-2}"
log_dir="${LOG_DIR:-diagnostics}"
log_file="${LOG_FILE:-}"

targets=(
  "192.168.10.1|Mac LAN gateway|ping"
  "192.168.40.1|Servers VLAN gateway|ping"
  "192.168.40.20|Proxmox host|ping,tcp22"
  "192.168.40.21|k8s-control-01|ping,tcp22"
  "192.168.40.22|k8s-worker-01|ping,tcp22"
  "192.168.40.23|k8s-worker-02|ping,tcp22"
)

if [[ -z "${log_file}" ]]; then
  timestamp="$(date +%Y%m%d-%H%M%S)"
  log_file="${log_dir}/connectivity-watch-${timestamp}.log"
fi

mkdir -p "${log_dir}"

if [[ "$(uname -s)" == "Darwin" ]]; then
  nc_timeout_flag=(-G "${tcp_timeout}")
else
  nc_timeout_flag=(-w "${tcp_timeout}")
fi

ping_once() {
  local host="$1"
  local output
  local status

  output="$(ping -c "${ping_count}" "${host}" 2>&1)"
  status=$?

  if [[ "${status}" -eq 0 ]]; then
    awk -F'time=' '/time=/{split($2,a," "); print "ok " a[1]; exit}' <<<"${output}"
  else
    printf 'fail'
  fi
}

tcp22_once() {
  local host="$1"
  local output
  local status

  output="$(nc -vz "${nc_timeout_flag[@]}" "${host}" 22 2>&1)"
  status=$?

  if [[ "${status}" -eq 0 ]]; then
    printf 'ok'
  elif grep -qi 'refused' <<<"${output}"; then
    printf 'refused'
  elif grep -Eqi 'timed? out|timeout|operation timed out' <<<"${output}"; then
    printf 'timeout'
  elif grep -qi 'no route' <<<"${output}"; then
    printf 'no-route'
  else
    printf 'error'
  fi
}

print_header() {
  printf '\n'
  printf 'Connectivity watch started: %s\n' "$(date)"
  printf 'interval=%ss ping_count=%s tcp_timeout=%ss log=%s\n' "${interval}" "${ping_count}" "${tcp_timeout}" "${log_file}"
  printf 'Press Ctrl-C to stop.\n\n'
  printf '%-20s %-16s %-12s %-8s %s\n' "time" "target" "ping" "tcp/22" "name"
  printf '%-20s %-16s %-12s %-8s %s\n' "-------------------" "---------------" "----------" "------" "-------------------"
}

print_header | tee -a "${log_file}"

while true; do
  now="$(date '+%Y-%m-%d %H:%M:%S')"

  for target in "${targets[@]}"; do
    IFS='|' read -r host label checks <<<"${target}"
    ping_result="$(ping_once "${host}")"

    if [[ "${checks}" == *tcp22* ]]; then
      tcp_result="$(tcp22_once "${host}")"
    else
      tcp_result="-"
    fi

    printf '%-20s %-16s %-12s %-8s %s\n' "${now}" "${host}" "${ping_result}" "${tcp_result}" "${label}"
  done | tee -a "${log_file}"

  printf '\n' | tee -a "${log_file}"
  sleep "${interval}"
done
