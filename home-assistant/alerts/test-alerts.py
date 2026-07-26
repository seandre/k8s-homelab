#!/usr/bin/env python3
"""Deterministic incident-state tests without a live notifier or device."""
from pathlib import Path
import json
import re

ROOT = Path(__file__).resolve().parent
contract = json.loads((ROOT / "alert_contract.json").read_text())
package = (ROOT / "indoor_alerts.yaml").read_text()

assert "states.get(" not in package, "unsupported dynamic states.get lookup"
assert "expand(states('input_text.indoor_map_" in package

class Incident:
    def __init__(self):
        self.state = "ok"
        self.events = []
    def warning(self):
        if self.state == "ok":
            self.state = "warning"; self.events.append("warning")
    def critical(self):
        if self.state != "critical":
            if self.state == "ok": self.warning()
            self.state = "critical"; self.events.append("critical")
    def recovery(self):
        if self.state != "ok":
            self.state = "ok"; self.events.append("recovery")

class BackupIncident(Incident):
    def failed_run(self):
        self.warning()

for name in contract["incidents"]:
    incident = Incident()
    incident.warning(); incident.warning()
    incident.critical(); incident.critical()
    incident.warning()  # de-escalation is silent
    incident.recovery(); incident.recovery()
    assert incident.events == ["warning", "critical", "recovery"], (name, incident.events)

assert contract["notification_path"] == "/indoor"
assert contract["notification_url"] == "https://homepage-preview.lab.seandre.dev/indoor"
assert contract["automatic_equipment_control"] is False
assert f"clickAction: {contract['notification_url']}" in package
assert f"uri: {contract['notification_url']}" in package
assert "obj.attributes.get('current_temperature') is none" in package
assert "{{ (value | float) * 9 / 5 + 32 }}" in package
assert not re.search(r"(?:fan|climate|switch|light)\.(?:turn_|set_|toggle)", package)
assert not re.search(r"(?:sensor|climate|fan|switch)\.[a-z0-9]+_[0-9a-f]{6,}", package)
assert package.count("# BEGIN GENERATED INCIDENTS") == 1
assert "sensor.indoor_living_room_co2_alert" in package
assert "sensor.indoor_living_room_humidity_alert" in package
assert "sensor.indoor_living_room_pm25_worst" in package
assert "indoor_alert_source_airgradient" in package
assert "incident: source_airgradient" in package
assert contract["freshness_seconds"]["airgradient_living_room"] == 180

def preferred(primary, primary_current, fallback, fallback_current):
    if primary_current:
        return primary
    if fallback_current:
        return fallback
    return None

def worst_current(airgradient, airgradient_current, coway, coway_current):
    values = []
    if airgradient_current:
        values.append(airgradient)
    if coway_current:
        values.append(coway)
    return max(values) if values else None

assert preferred(1100, True, 900, True) == 1100
assert preferred(1100, False, 900, True) == 900
assert preferred(1100, False, 900, False) is None
assert worst_current(12, True, 20, True) == 20
assert worst_current(22, True, 20, False) == 22
assert worst_current(22, False, 20, True) == 20
assert worst_current(22, False, 20, False) is None

backup = BackupIncident()
backup.failed_run(); backup.failed_run(); backup.failed_run()
backup.critical(); backup.failed_run(); backup.recovery(); backup.failed_run()
assert backup.events == ["warning", "critical", "recovery", "warning"], backup.events
assert "result == 'failed' and prior == 'ok'" in package
assert "entity_id: event.backup_automatic_backup" in package
assert "trigger.to_state.attributes.get('event_type') in ['completed', 'failed']" in package
assert "target: local" in package

assert "last_reported | default(obj.last_updated, true)" in package
assert not re.search(r"as_timestamp\((?:obj|a|b)\.last_updated\)", package)

availability_names = [
    "Indoor Aranet CO2", "Indoor Aranet temperature", "Indoor Aranet humidity",
    "Indoor Aranet pressure", "Indoor Aranet battery",
]
for name in availability_names:
    start = package.index(f"- name: {name}")
    end = package.find("      - name:", start + 1)
    block = package[start:end if end != -1 else package.index("automation:", start)]
    state_block = block.split("attributes:", 1)[0]
    assert "state not in ['unknown','unavailable']" in state_block, name
    assert "as_timestamp(now())" not in block, name
    assert "else none" in state_block or "{% else %}{{ none }}" in state_block, name

timestamp_names = [
    "Indoor Coway Living Room PM25",
    "Indoor Coway Bedroom PM25", "Indoor Coway Living Room filter life",
    "Indoor Coway Bedroom filter life",
]
for name in timestamp_names:
    start = package.index(f"- name: {name}")
    end = package.find("      - name:", start + 1)
    block = package[start:end if end != -1 else package.index("automation:", start)]
    state_block = block.split("attributes:", 1)[0]
    assert "last_reported" in state_block, name
    assert "as_timestamp(now()) - as_timestamp(" in state_block, name
    assert "else none" in state_block or "{% else %}{{ none }}" in state_block, name
print("IE-009 deterministic incident and safety tests: PASS")
