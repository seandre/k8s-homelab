#!/usr/bin/env python3
"""Deterministic incident-state tests without a live notifier or device."""
from pathlib import Path
import json
import re

ROOT = Path(__file__).resolve().parent
contract = json.loads((ROOT / "alert_contract.json").read_text())
package = (ROOT / "indoor_alerts.yaml").read_text()

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
assert contract["automatic_equipment_control"] is False
assert "clickAction: /indoor" in package and "uri: /indoor" in package
assert not re.search(r"(?:fan|climate|switch|light)\.(?:turn_|set_|toggle)", package)
assert not re.search(r"(?:sensor|climate|fan|switch)\.[a-z0-9]+_[0-9a-f]{6,}", package)
assert package.count("# BEGIN GENERATED INCIDENTS") == 1

backup = BackupIncident()
backup.failed_run(); backup.failed_run(); backup.failed_run()
backup.critical(); backup.failed_run(); backup.recovery(); backup.failed_run()
assert backup.events == ["warning", "critical", "recovery", "warning"], backup.events
assert "result == 'failed' and prior == 'ok'" in package

assert "last_reported | default(obj.last_updated, true)" in package
assert not re.search(r"as_timestamp\((?:obj|a|b)\.last_updated\)", package)

numeric_names = [
    "Indoor Aranet CO2", "Indoor Aranet temperature", "Indoor Aranet humidity",
    "Indoor Aranet battery", "Indoor Coway Living Room PM25",
    "Indoor Coway Bedroom PM25", "Indoor Coway Living Room filter life",
    "Indoor Coway Bedroom filter life",
]
for name in numeric_names:
    start = package.index(f"- name: {name}")
    end = package.find("      - name:", start + 1)
    block = package[start:end if end != -1 else package.index("automation:", start)]
    state_block = block.split("attributes:", 1)[0]
    assert "last_reported" in state_block, name
    assert "as_timestamp(now()) - as_timestamp(" in state_block, name
    assert "else none" in state_block or "{% else %}{{ none }}" in state_block, name
print("IE-009 deterministic incident and safety tests: PASS")
