#!/bin/sh
set -eu

credentials=/credentials
archive_dir=/source/backups
test -s "${credentials}/token-secret"
test -s "${credentials}/ha-webhook-id"
test -n "$(find "${archive_dir}" -maxdepth 1 -type f -print -quit)"

PBS_REPOSITORY="$(cat "${credentials}/auth-id")@$(cat "${credentials}/server"):$(cat "${credentials}/datastore")"
PBS_PASSWORD_FILE="${credentials}/token-secret"
PBS_FINGERPRINT="$(cat "${credentials}/fingerprint")"
PBS_NAMESPACE="$(cat "${credentials}/namespace")"
export PBS_REPOSITORY PBS_PASSWORD_FILE PBS_FINGERPRINT PBS_NAMESPACE

result=failed
if proxmox-backup-client backup home-assistant.pxar:"${archive_dir}" \
  --backup-type host --backup-id home-assistant; then
  result=success
fi

ha_webhook_id="$(cat "${credentials}/ha-webhook-id")"
curl --fail --silent --show-error \
  --request POST \
  --header "Content-Type: application/json" \
  --data "{\"target\":\"pbs\",\"result\":\"${result}\"}" \
  "http://home-assistant.home-assistant.svc.cluster.local:8123/api/webhook/${ha_webhook_id}" \
  >/dev/null
unset ha_webhook_id

test "${result}" = success
