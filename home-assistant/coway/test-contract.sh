#!/bin/sh
set -eu

repository_root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
contract="$repository_root/home-assistant/coway/contract.json"
fixture="$repository_root/home-assistant/coway/fixtures/capabilities.pending.json"
live_fixture="$repository_root/home-assistant/coway/fixtures/capabilities.live.json"
baseline="$repository_root/docs/overview/indoor-dashboard-baseline.md"
runbook="$repository_root/docs/operations/coway-live-onboarding.md"
evidence="$repository_root/docs/operations/indoor-dashboard-ie-008-evidence.md"
schedule="$repository_root/home-assistant/coway/night-schedule.yaml"

jq -e '
  .schema_version == 1 and
  .integration == "iocare" and
  .dependency == "COWAY_CLOUD" and
  (.devices | keys == ["coway_bedroom", "coway_living_room"]) and
  .devices.coway_living_room == {"display_name":"Living Room Coway","room":"living_room"} and
  .devices.coway_bedroom == {"display_name":"Bedroom Coway","room":"bedroom"} and
  .read_alias_suffixes == ["aqi","pm25","pm10","filter_life","pre_filter_life","hepa_filter_life"] and
  .control_alias_suffixes == ["power","speed","preset","timer","light","button_lock","sensitivity"] and
  .upstream_candidate_values.speed_percent == [33,66,100] and
  (.upstream_candidate_values.preset | index("AUTO_ECO") | not) and
  ([.live_capabilities[]] | all(
    .observed == true and
    .readings == ["aqi","pm25","pm10","filter_life","pre_filter_life","hepa_filter_life"] and
    .filter_life == {"strategy":"MINIMUM","sources":["pre_filter","max2_filter"]} and
    .controls.power == [false,true] and
    .controls.speed == [1,2,3] and
    .controls.preset == ["AUTO","NIGHT","RAPID"] and
    .controls.timer_minutes == [0,60,120,240,480] and
    .controls.light == ["ON","OFF","AQI_OFF"] and
    .controls.button_lock == [false,true] and
    .controls.sensitivity == ["SENSITIVE","NORMAL","INSENSITIVE"] and
    .disabled == []
  )) and
  .unavailable_value == null
' "$contract" >/dev/null

jq -e '
  .fixture == "coway_live_capabilities_pending" and
  (.devices | keys == ["coway_bedroom", "coway_living_room"]) and
  ([.devices[]] | all(
    .source_state == "UNAVAILABLE" and .observed == false and
    .readings == [] and .controls == {} and .disabled == []
  ))
' "$fixture" >/dev/null

jq -e '
  .fixture == "coway_live_capabilities" and
  (.devices | keys == ["coway_bedroom", "coway_living_room"]) and
  ([.devices[]] | all(
    .source_state == "AVAILABLE" and .observed == true and
    .readings == ["aqi","pm25","pm10","filter_life","pre_filter_life","hepa_filter_life"] and
    .filter_life_strategy == "MINIMUM" and
    .controls.power == [false,true] and
    .controls.speed == [1,2,3] and
    .controls.preset == ["AUTO","NIGHT","RAPID"] and
    .controls.timer_minutes == [0,60,120,240,480] and
    .controls.light == ["ON","OFF","AQI_OFF"] and
    .controls.button_lock == [false,true] and
    .controls.sensitivity == ["SENSITIVE","NORMAL","INSENSITIVE"] and
    .disabled == []
  ))
' "$live_fixture" >/dev/null

for device in coway_living_room coway_bedroom; do
  grep -Fq "$device" "$baseline"
done
grep -Fq '## Owner gate' "$runbook"
grep -Fq 'Auto (Eco)' "$runbook"
grep -Fq 'exactly one purifier at a time' "$runbook"
grep -Fq 'LIVE; STALE-STATE GUARD PENDING' "$evidence"

if rg -n -i \
  '(password|username|email|access[_ -]?token|refresh[_ -]?token|device[_ -]?id|serial|mac address|entity_id)[[:space:]]*[:=][[:space:]]*[^[:space:]<{]+' \
  "$contract" "$fixture" "$live_fixture" "$runbook" "$evidence"; then
  echo 'Coway package contains a forbidden credential, vendor ID, or raw entity ID assignment' >&2
  exit 1
fi

grep -Fq 'id: coway_night_mode_start' "$schedule"
grep -Fq 'at: "22:00:00"' "$schedule"
grep -Fq 'percentage: 66' "$schedule"
grep -Fq 'option: "AQI Off"' "$schedule"
grep -Fq 'id: coway_night_mode_end' "$schedule"
grep -Fq 'at: "06:30:00"' "$schedule"
grep -Fq 'preset_mode: "Auto"' "$schedule"
grep -Fq 'option: "On"' "$schedule"
grep -Fq "integration_entities('coway')" "$schedule"
if rg -n 'entity_id:[[:space:]]+(fan|select)\.[a-z0-9_]+$' "$schedule"; then
  echo 'Coway schedule contains a raw entity ID' >&2
  exit 1
fi

echo 'IE-008 Coway onboarding contract: PASS'
