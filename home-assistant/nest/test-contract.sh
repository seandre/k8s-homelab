#!/bin/sh
set -eu

repository_root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
contract="$repository_root/home-assistant/nest/contract.json"
baseline="$repository_root/docs/overview/indoor-dashboard-baseline.md"
runbook="$repository_root/docs/operations/nest-living-room.md"
evidence="$repository_root/docs/operations/indoor-dashboard-ie-007-evidence.md"

jq -e '
  .schema_version == 1 and
  .device_alias == "nest_living_room" and
  .display_name == "Living Room Nest" and
  .room == "living_room" and
  .dependency == "NEST_CLOUD" and
  .integration == "nest" and
  .api == "SMART_DEVICE_MANAGEMENT" and
  .unavailable_value == null and
  (.readings | keys == ["current_temperature", "humidity"]) and
  ([.readings[].alias] | unique | length == 2) and
  ([.readings[].alias] | all(startswith("nest_living_room."))) and
  (.state | keys == ["cool_setpoint", "fan_timer", "heat_setpoint", "hvac_mode"]) and
  ([.state[]] | unique | length == 4) and
  ([.state[]] | all(startswith("nest_living_room."))) and
  .allowed_hvac_modes == ["OFF", "HEAT", "COOL", "HEAT_COOL"] and
  .allowed_setpoint_shapes == ["HEAT", "COOL", "RANGE"] and
  .capabilities.hvac_modes == {"supported": true, "options": ["OFF", "HEAT", "COOL", "HEAT_COOL"]} and
  .capabilities.setpoint_shapes == ["HEAT", "COOL", "RANGE"] and
  .capabilities.setpoint_min_f == 50 and
  .capabilities.setpoint_max_f == 90 and
  .capabilities.setpoint_step_f == 1 and
  .capabilities.fan_timer_minutes == {"supported": true, "values": [0, 720]}
' "$contract" >/dev/null

for alias in current_temperature humidity hvac_mode heat_setpoint cool_setpoint fan_timer; do
  grep -Fq "nest_living_room.$alias" "$baseline"
done

grep -Fq '## Owner gate' "$runbook"
grep -Fq 'every current value is' "$runbook"
grep -Fq 'does not operate equipment automatically' "$runbook"
grep -Fq 'LIVE; CLOUD-LOSS ACCEPTANCE PENDING' "$evidence"

if rg -n -i \
  '(project[_ -]?id|client[_ -]?id|client[_ -]?secret|oauth[_ -]?code|refresh[_ -]?token|access[_ -]?token|device[_ -]?id|entity_id)[[:space:]]*[:=][[:space:]]*[0-9a-z_-]+' \
  "$contract" "$runbook" "$evidence"; then
  echo 'Nest package contains a forbidden credential, vendor ID, or raw entity ID assignment' >&2
  exit 1
fi

echo 'IE-007 Nest contract: PASS'
