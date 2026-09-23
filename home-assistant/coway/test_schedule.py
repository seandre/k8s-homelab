"""Exercise the real HA script engine with synthetic devices and no cloud calls.

Run with the production Home Assistant Python environment. The image verifier
copies this module and night-schedule.yaml into its isolated tests directory.
"""
from datetime import datetime
from pathlib import Path
import tempfile
import unittest
from zoneinfo import ZoneInfo

import yaml
from homeassistant.core import Context, HomeAssistant
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.script import Script
from homeassistant.helpers.template import Template


class DayRestoreTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.hass = HomeAssistant(self.directory.name)
        self.clock = datetime(2026, 9, 23, 6, 30, tzinfo=ZoneInfo('America/Los_Angeles'))
        self.calls = []
        self.fail = set()
        self.cross_boundary = False
        self.entities = ['fan.synthetic_a', 'fan.synthetic_b',
                         'select.synthetic_a_light', 'select.synthetic_b_light']
        self.devices = {'fan.synthetic_a': 'a', 'select.synthetic_a_light': 'a',
                        'fan.synthetic_b': 'b', 'select.synthetic_b_light': 'b'}
        Template('', self.hass)._env.globals.update(
            integration_entities=lambda domain: self.entities if domain == 'coway' else [],
            device_id=lambda entity: self.devices.get(entity),
            device_entities=lambda device: [e for e in self.entities if self.devices[e] == device],
            now=lambda: self.clock,
        )
        self.set_fan('a', 'off', None)
        self.set_fan('b', 'off', None)
        self.set_light('a', 'Off')
        self.set_light('b', 'AQI Off')

        async def service(call):
            targets = call.data['entity_id']
            if isinstance(targets, str):
                targets = [targets]
            for entity in targets:
                self.calls.append((call.service, entity))
                if (call.service, entity) in self.fail:
                    raise HomeAssistantError('synthetic cloud failure')
                state = self.hass.states.get(entity)
                attrs = dict(state.attributes)
                value = state.state
                if call.service == 'turn_on':
                    value = 'on'
                elif call.service == 'set_preset_mode':
                    attrs['preset_mode'] = call.data['preset_mode']
                else:
                    value = call.data['option']
                self.hass.states.async_set(entity, value, attrs)
                if self.cross_boundary:
                    self.clock = self.clock.replace(hour=22, minute=0)

        for domain, name in [('fan', 'turn_on'), ('fan', 'set_preset_mode'),
                             ('select', 'select_option')]:
            self.hass.services.async_register(domain, name, service)
        package = yaml.safe_load(Path(__file__).with_name('night-schedule.yaml').read_text())
        self.automation = next(a for a in package['automation'] if a['id'] == 'coway_night_mode_end')

    async def asyncTearDown(self):
        await self.hass.async_stop(force=True)
        self.directory.cleanup()

    def set_fan(self, suffix, state, preset):
        self.hass.states.async_set(f'fan.synthetic_{suffix}', state,
                                   {'preset_mode': preset, 'percentage': 0})

    def set_light(self, suffix, state):
        self.hass.states.async_set(f'select.synthetic_{suffix}_light', state,
                                   {'options': ['On', 'Off', 'AQI Off']})

    async def run_restore(self):
        sequence = [{'variables': self.automation['variables']},
                    *self.automation['condition'], *self.automation['action']]
        script = Script(self.hass, cv.SCRIPT_SCHEMA(sequence), 'test daytime restore',
                        'automation', log_exceptions=False)
        await script.async_run(context=Context())

    def assert_restored(self, suffix):
        fan = self.hass.states.get(f'fan.synthetic_{suffix}')
        self.assertEqual('on', fan.state)
        self.assertIn(fan.attributes['preset_mode'], ['Auto', 'Auto (Eco)'])
        self.assertEqual('On', self.hass.states.get(f'select.synthetic_{suffix}_light').state)

    async def test_power_then_smart_then_light_and_no_repeat_commands(self):
        await self.run_restore()
        for suffix in ['a', 'b']:
            self.assert_restored(suffix)
            self.assertLess(self.calls.index(('turn_on', f'fan.synthetic_{suffix}')),
                            self.calls.index(('set_preset_mode', f'fan.synthetic_{suffix}')))
            self.assertLess(self.calls.index(('set_preset_mode', f'fan.synthetic_{suffix}')),
                            self.calls.index(('select_option', f'select.synthetic_{suffix}_light')))
        self.calls.clear()
        await self.run_restore()
        self.assertEqual([], self.calls)

    async def test_manual_and_night_modes_return_to_smart(self):
        self.set_fan('a', 'on', None)
        self.set_fan('b', 'on', 'Night')
        await self.run_restore()
        self.assert_restored('a')
        self.assert_restored('b')
        self.assertFalse(any(call[0] == 'turn_on' for call in self.calls))

    async def test_eco_idle_is_preserved(self):
        for suffix, preset in [('a', 'Auto (Eco)'), ('b', 'Auto')]:
            self.set_fan(suffix, 'on', preset)
            self.set_light(suffix, 'On')
        await self.run_restore()
        self.assertEqual([], self.calls)

    async def test_unavailable_unit_does_not_block_other(self):
        self.set_fan('a', 'unavailable', None)
        await self.run_restore()
        self.assert_restored('b')
        self.assertFalse(any('synthetic_a' in entity for _, entity in self.calls))

    async def test_failed_power_retries_later_without_blocking_other_unit(self):
        self.fail.add(('turn_on', 'fan.synthetic_a'))
        await self.run_restore()
        self.assert_restored('b')
        self.assertEqual('Off', self.hass.states.get('select.synthetic_a_light').state)
        self.fail.clear()
        await self.run_restore()
        self.assert_restored('a')

    async def test_day_window_boundaries(self):
        for hour, minute, expected in [(0, 0, False), (6, 29, False),
                                       (6, 30, True), (21, 59, True), (22, 0, False)]:
            with self.subTest(hour=hour, minute=minute):
                self.clock = self.clock.replace(hour=hour, minute=minute)
                self.set_fan('a', 'off', None)
                self.calls.clear()
                await self.run_restore()
                self.assertEqual(expected, bool(self.calls))

    async def test_inflight_restore_stops_when_night_begins(self):
        self.clock = self.clock.replace(hour=21, minute=59)
        self.cross_boundary = True
        await self.run_restore()
        self.assertEqual([('turn_on', 'fan.synthetic_a')], self.calls)


if __name__ == '__main__':
    unittest.main()
