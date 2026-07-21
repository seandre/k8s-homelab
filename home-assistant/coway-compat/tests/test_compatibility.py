from __future__ import annotations

import asyncio
from contextlib import ExitStack
import importlib
import json
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock, patch


FIXTURE_PATH = Path(__file__).parent / "fixtures" / "airmega_250s.json"
COMPONENT_PACKAGE = "custom_components.coway"


def _purifier_fixture() -> tuple[str, SimpleNamespace]:
    raw = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
    state = raw["state"]
    state["device_attr"] = raw["device_attr"]
    return raw["purifier_key"], SimpleNamespace(**state)


class FakeCoordinator:
    def __init__(self) -> None:
        purifier_key, purifier = _purifier_fixture()
        self.data = SimpleNamespace(purifiers={purifier_key: purifier})
        self.last_update_success = True
        self.client = SimpleNamespace()

    def async_add_listener(self, update_callback, context=None):
        return lambda: None

    async def async_request_refresh(self) -> None:
        return None


class FakeConfigEntries:
    def async_entries(self, domain=None):
        return []


class CowayCompatibilityTests(unittest.IsolatedAsyncioTestCase):
    def test_imports_against_pinned_home_assistant(self) -> None:
        manifest = json.loads(
            (Path("/config/custom_components/coway/manifest.json")).read_text(
                encoding="utf-8"
            )
        )
        self.assertEqual("0.6.1", manifest["version"])
        self.assertEqual(["cowayaio==0.2.4"], manifest["requirements"])

        for module in (
            "__init__",
            "config_flow",
            "const",
            "coordinator",
            "fan",
            "select",
            "sensor",
            "switch",
            "util",
        ):
            importlib.import_module(f"{COMPONENT_PACKAGE}.{module}")

    async def test_config_flow_form_and_redacted_auth_failure(self) -> None:
        from cowayaio.exceptions import AuthError
        from custom_components.coway.config_flow import CowayConfigFlow
        from homeassistant.const import CONF_PASSWORD, CONF_USERNAME

        flow = CowayConfigFlow()
        flow.hass = SimpleNamespace(config_entries=FakeConfigEntries())

        form = await flow.async_step_user()
        self.assertEqual("form", form["type"].value)
        self.assertEqual("user", form["step_id"])
        self.assertEqual({}, form["errors"])

        with ExitStack() as stack:
            stack.enter_context(
                patch(
                    "custom_components.coway.config_flow.async_create_clientsession",
                    return_value=object(),
                )
            )
            validate = stack.enter_context(
                patch(
                    "custom_components.coway.config_flow.async_validate_api",
                    new=AsyncMock(side_effect=AuthError()),
                )
            )
            result = await flow.async_step_user(
                {
                    CONF_USERNAME: "account-redacted@example.invalid",
                    CONF_PASSWORD: "credential-redacted",
                }
            )

        self.assertEqual("form", result["type"].value)
        self.assertEqual({"base": "invalid_auth"}, result["errors"])
        validate.assert_awaited_once()
        self.assertNotIn("credential-redacted", repr(result))

    async def test_airmega_250s_entity_contract(self) -> None:
        from custom_components.coway.const import COWAY_COORDINATOR, DOMAIN
        from custom_components.coway import fan, select, sensor, switch
        from homeassistant.components.fan import FanEntityFeature

        coordinator = FakeCoordinator()
        entry = SimpleNamespace(entry_id="entry-redacted")
        hass = SimpleNamespace(
            data={DOMAIN: {entry.entry_id: {COWAY_COORDINATOR: coordinator}}}
        )

        by_platform: dict[str, list] = {}
        for platform in (fan, select, sensor, switch):
            entities: list = []
            await platform.async_setup_entry(hass, entry, entities.extend)
            by_platform[platform.__name__.rsplit(".", 1)[-1]] = entities

        self.assertEqual(["Purifier"], [item.name for item in by_platform["fan"]])
        purifier = by_platform["fan"][0]
        self.assertEqual(3, purifier.speed_count)
        self.assertEqual(66, purifier.percentage)
        self.assertEqual(["Auto", "Night", "Rapid"], purifier.preset_modes)
        self.assertEqual(
            FanEntityFeature.SET_SPEED
            | FanEntityFeature.PRESET_MODE
            | FanEntityFeature.TURN_ON
            | FanEntityFeature.TURN_OFF,
            purifier.supported_features,
        )

        self.assertEqual(
            ["Light", "Current timer", "Smart mode sensitivity"],
            [item.name for item in by_platform["select"]],
        )
        selects = {item.name: item for item in by_platform["select"]}
        self.assertEqual(["On", "Off", "AQI Off"], selects["Light"].options)
        self.assertEqual(
            ["OFF", "1 Hour", "2 Hours", "4 Hours", "8 Hours"],
            selects["Current timer"].options,
        )
        self.assertEqual(
            ["Sensitive", "Normal", "Insensitive"],
            selects["Smart mode sensitivity"].options,
        )

        self.assertEqual(["Button lock"], [item.name for item in by_platform["switch"]])
        self.assertEqual(
            [
                "AQI",
                "Pre filter",
                "MAX2 filter",
                "Timer remaining",
                "Particulate matter 2.5",
                "Particulate matter 10",
                "Indoor air quality",
                "Lux",
            ],
            [item.name for item in by_platform["sensor"]],
        )

        sensor_values = {item.name: item.native_value for item in by_platform["sensor"]}
        self.assertEqual(42.0, sensor_values["AQI"])
        self.assertEqual(4, sensor_values["Particulate matter 2.5"])
        self.assertEqual(7, sensor_values["Particulate matter 10"])
        self.assertEqual(91, sensor_values["Pre filter"])
        self.assertEqual(83, sensor_values["MAX2 filter"])
        self.assertEqual("Good", sensor_values["Indoor air quality"])

    async def test_auto_eco_is_report_only_for_airmega_250s(self) -> None:
        from custom_components.coway.fan import Purifier
        from homeassistant.exceptions import HomeAssistantError

        coordinator = FakeCoordinator()
        purifier = next(iter(coordinator.data.purifiers.values()))
        purifier.fan_speed = 9
        entity = Purifier(coordinator, next(iter(coordinator.data.purifiers)))

        self.assertEqual("Auto (Eco)", entity.preset_mode)
        self.assertIn("Auto (Eco)", entity.preset_modes)
        with self.assertRaisesRegex(HomeAssistantError, "cannot be manually selected"):
            await entity.async_set_preset_mode("Auto (Eco)")


if __name__ == "__main__":
    unittest.main()
