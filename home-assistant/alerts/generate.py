#!/usr/bin/env python3
"""Render repetitive, reviewable HA incident automations (stdlib only)."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PACKAGE = ROOT / "indoor_alerts.yaml"
MARKER = "# Numeric/source incident automations are generated from the reviewed contract\n# by generate.py. This marker is replaced in the checked-in rendered package.\n"

SPECS = [
    ("co2", "aranet_co2", ">= 1000", 10, ">= 1500", 5, "< 900", 10),
    ("temperature", "aranet_temperature", "value < 60 or value > 80", 15, "value < 55 or value > 85", 10, "62 <= value <= 78", 15),
    ("humidity", "aranet_humidity", "value < 30 or value > 60", 30, "value < 20 or value > 70", 15, "32 <= value <= 58", 30),
    ("pm25_living_room", "coway_living_room_pm25", ">= 15", 15, ">= 35", 10, "< 10", 15),
    ("pm25_bedroom", "coway_bedroom_pm25", ">= 15", 15, ">= 35", 10, "< 10", 15),
    ("battery", "aranet_battery", "<= 20", 30, "<= 10", 15, ">= 25", 30),
    ("filter_living_room", "coway_living_room_filter_life", "<= 10", 60, "<= 2", 60, ">= 15", 60),
    ("filter_bedroom", "coway_bedroom_filter_life", "<= 10", 60, "<= 2", 60, ">= 15", 60),
]

SOURCES = [
    ("aranet", "input_text.indoor_map_aranet_co2", 180),
    ("nest", "input_text.indoor_map_nest_temperature", 300),
    ("coway_living_room", "input_text.indoor_map_coway_living_room_pm25", 300),
    ("coway_bedroom", "input_text.indoor_map_coway_bedroom_pm25", 300),
]

def condition(expr: str) -> str:
    if "value" in expr:
        return expr
    return "value " + expr

def automation(name, sensor, warn, warn_m, crit, crit_m, recover, recover_m):
    helper = f"input_select.indoor_alert_{name}"
    entity = f"sensor.indoor_{sensor}"
    blocks = []
    for level, expr, minutes in (("warning", warn, warn_m), ("critical", crit, crit_m), ("recovery", recover, recover_m)):
        guard = "!= 'ok'" if level == "recovery" else ("== 'ok'" if level == "warning" else "!= 'critical'")
        target = "ok" if level == "recovery" else level
        escalation = ""
        if level == "critical":
            escalation = f'''      - if: "{{{{ states('{helper}') == 'ok' }}}}"
        then:
          - event: indoor_alert_notification
            event_data: {{incident: {name}, level: warning, path: /indoor}}
'''
        blocks.append(f'''  - id: indoor_alert_{name}_{level}\n    alias: Indoor alerts - {name} {level}\n    mode: single\n    trigger:\n      - platform: template\n        value_template: >-\n          {{% set entity = '{entity}' %}}\n          {{% set value = states(entity) | float(none) %}}\n          {{{{ value is not none and state_attr(entity, 'freshness') == 'CURRENT' and ({condition(expr)}) }}}}\n        for: "00:{minutes:02d}:00"\n    condition: "{{{{ states('{helper}') {guard} }}}}"\n    action:\n{escalation}      - service: input_select.select_option\n        target: {{entity_id: {helper}}}\n        data: {{option: {target}}}\n      - event: indoor_alert_notification\n        event_data: {{incident: {name}, level: {level}, path: /indoor}}\n''')
    return "\n".join(blocks)

def source_automations(name, mapping, freshness):
    helper = f"input_select.indoor_alert_source_{name}"
    timestamp = "obj.last_reported | default(obj.last_updated, true)"
    unavailable = f"{{% set obj = states.get(states('{mapping}')) %}}{{% set reported = {timestamp} if obj else none %}}{{{{ not obj or obj.state in ['unknown','unavailable'] or (as_timestamp(now()) - as_timestamp(reported)) > {freshness} }}}}"
    current = f"{{% set obj = states.get(states('{mapping}')) %}}{{% set reported = {timestamp} if obj else none %}}{{{{ obj and obj.state not in ['unknown','unavailable'] and (as_timestamp(now()) - as_timestamp(reported)) <= {freshness} }}}}"
    return f'''  - id: indoor_alert_source_{name}_warning
    alias: Indoor alerts - source {name} warning
    trigger:
      - platform: template
        value_template: >-
          {unavailable}
        for: "00:05:00"
    condition: "{{{{ states('{helper}') == 'ok' }}}}"
    action:
      - service: input_select.select_option
        target: {{entity_id: {helper}}}
        data: {{option: warning}}
      - event: indoor_alert_notification
        event_data: {{incident: source_{name}, level: warning, path: /indoor}}

  - id: indoor_alert_source_{name}_critical
    alias: Indoor alerts - source {name} critical
    trigger:
      - platform: template
        value_template: >-
          {unavailable}
        for: "00:30:00"
    condition: "{{{{ states('{helper}') != 'critical' }}}}"
    action:
      - if: "{{{{ states('{helper}') == 'ok' }}}}"
        then:
          - event: indoor_alert_notification
            event_data: {{incident: source_{name}, level: warning, path: /indoor}}
      - service: input_select.select_option
        target: {{entity_id: {helper}}}
        data: {{option: critical}}
      - event: indoor_alert_notification
        event_data: {{incident: source_{name}, level: critical, path: /indoor}}

  - id: indoor_alert_source_{name}_recovery
    alias: Indoor alerts - source {name} recovery
    trigger:
      - platform: template
        value_template: >-
          {current}
        for: "00:05:00"
    condition: "{{{{ states('{helper}') != 'ok' }}}}"
    action:
      - service: input_select.select_option
        target: {{entity_id: {helper}}}
        data: {{option: ok}}
      - event: indoor_alert_notification
        event_data: {{incident: source_{name}, level: recovery, path: /indoor}}
'''

def main():
    text = PACKAGE.read_text()
    prefix = text.split("# BEGIN GENERATED INCIDENTS", 1)[0]
    if MARKER in prefix:
        prefix = prefix.replace(MARKER, "")
    rendered = (prefix.rstrip() + "\n\n# BEGIN GENERATED INCIDENTS\n" +
                "\n".join(automation(*s) for s in SPECS) +
                "\n".join(source_automations(*s) for s in SOURCES) +
                "# END GENERATED INCIDENTS\n")
    PACKAGE.write_text(rendered)

if __name__ == "__main__":
    main()
