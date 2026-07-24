#!/bin/sh
set -eu

credentials=/credentials
archive_dir=/source/backups
test -s "${credentials}/token-secret"
test -s "${credentials}/ha-token"
test -n "$(find "${archive_dir}" -maxdepth 1 -type f -print -quit)"

export PBS_REPOSITORY="$(cat "${credentials}/auth-id")@$(cat "${credentials}/server"):$(cat "${credentials}/datastore")"
export PBS_PASSWORD_FILE="${credentials}/token-secret"
export PBS_FINGERPRINT="$(cat "${credentials}/fingerprint")"
export PBS_NAMESPACE="$(cat "${credentials}/namespace")"

result=failed
if proxmox-backup-client backup home-assistant.pxar:"${archive_dir}" \
  --backup-type host --backup-id home-assistant; then
  result=success
fi

curl --fail --silent --show-error \
  --request POST \
  --header "Authorization: Bearer $(cat "${credentials}/ha-token")" \
  --header "Content-Type: application/json" \
  --data "{\"target\":\"pbs\",\"result\":\"${result}\"}" \
  "http://home-assistant.home-assistant.svc.cluster.local:8123/api/events/indoor_backup_result" \
  >/dev/null

test "${result}" = success
