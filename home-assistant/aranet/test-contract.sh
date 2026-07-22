#!/bin/sh
set -eu

repository_root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
contract="$repository_root/home-assistant/aranet/contract.json"
baseline="$repository_root/docs/overview/indoor-dashboard-baseline.md"
runbook="$repository_root/docs/operations/aranet4-living-room.md"

jq -e '
  .schema_version == 1 and
  .device_alias == "aranet_living_room" and
  .display_name == "Living Room Aranet4" and
  .room == "living_room" and
  .dependency == "LOCAL_BLE" and
  .integration == "aranet" and
  .transport == "atom_living_room" and
  .controls == [] and
  .unavailable_value == null and
  (.readings | keys == ["battery", "co2", "humidity", "pressure", "temperature"]) and
  ([.readings[].alias] | unique | length == 5) and
  ([.readings[].alias] | all(startswith("aranet_living_room.")))
' "$contract" >/dev/null

for alias in temperature humidity pressure co2 battery; do
  grep -Fq "aranet_living_room.$alias" "$baseline"
done

grep -Fq 'value is `null`' "$runbook"
grep -Fq 'must remain current' "$runbook"

if rg -n -i '(bluetooth address|mac address|serial number|vendor id|entity_id)[[:space:]]*[:=][[:space:]]*[0-9a-z_-]+' \
  "$contract" "$runbook"; then
  echo 'Aranet contract contains a forbidden hardware or raw entity identifier' >&2
  exit 1
fi

echo 'IE-006 Aranet contract: PASS'
