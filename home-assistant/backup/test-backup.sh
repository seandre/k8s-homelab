#!/usr/bin/env bash
set -euo pipefail
root=
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
script="$root/home-assistant/backup/backup-to-pbs.sh"
cronjob="$root/kubernetes/apps/home-assistant/backup-cronjob.yaml"
grep -Fq 'PBS_PASSWORD_FILE=' "$script"
# shellcheck disable=SC2016 # Match the literal variable reference in the script.
grep -Fq 'home-assistant.pxar:"${archive_dir}"' "$script"
grep -Fq '\"target\":\"pbs\"' "$script"
# shellcheck disable=SC2016 # Match the literal variable reference in the script.
grep -Fq '/api/webhook/${ha_webhook_id}' "$script"
if grep -Fq 'Authorization:' "$script"; then
  echo "backup reporter must use its fixed webhook, not a general HA token" >&2
  exit 1
fi
if [[ ! -f "$cronjob" ]]; then
  echo "IE-014 backup image contract: PASS"
  exit 0
fi
grep -Fq 'schedule: "0 3 * * *"' "$cronjob"
grep -Fq 'readOnly: true' "$cronjob"
grep -Fq 'secretName: home-assistant-pbs-backup' "$cronjob"
if grep -Eqi '(token-secret:|password:|BEGIN PRIVATE)' "$cronjob"; then
  echo "backup manifest contains credential material" >&2
  exit 1
fi
echo "IE-014 backup contract: PASS"
