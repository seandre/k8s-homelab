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
        self.clock = datetime(2026, 10, 7, 7, 0, tzinfo=ZoneInfo('America/Los_Angeles'))
        self.calls = []
        self.fail = set()
        self.cross_boundary = False
        self.entities = ['fan.synthetic_a', 'fan.synthetic_b',
                         'select.synthetic_a_light', 'select.synthetic_b_light']
        self.airgradient_entities = []
        self.devices = {'fan.synthetic_a': 'a', 'select.synthetic_a_light': 'a',
                        'fan.synthetic_b': 'b', 'select.synthetic_b_light': 'b'}
        Template('', self.hass)._env.globals.update(
            integration_entities=lambda domain: self.entities if domain == 'coway' else self.airgradient_entities if domain == 'airgradient' else [],
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
                    value = 'on'
                    attrs['preset_mode'] = call.data['preset_mode']
                elif call.service == 'set_percentage':
                    value = 'on'
                    attrs.update(percentage=call.data['percentage'], preset_mode=None)
                elif call.service == 'set_value':
                    value = str(call.data['value'])
                else:
                    value = call.data['option']
                self.hass.states.async_set(entity, value, attrs)
                if self.cross_boundary:
                    self.clock = self.clock.replace(hour=22, minute=0)

        for domain, name in [('fan', 'set_percentage'), ('fan', 'set_preset_mode'),
                             ('select', 'select_option'), ('number', 'set_value')]:
            self.hass.services.async_register(domain, name, service)
        package = yaml.safe_load(Path(__file__).with_name('night-schedule.yaml').read_text())
        self.package = package
        self.automations = {automation['id']: automation for automation in package['automation']}
        self.automation = self.automations['coway_night_mode_end']

    async def asyncTearDown(self):
        await self.hass.async_stop(force=True)
        self.directory.cleanup()

    def set_fan(self, suffix, state, preset, percentage=0):
        self.hass.states.async_set(f'fan.synthetic_{suffix}', state,
                                   {'preset_mode': preset, 'percentage': percentage})

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

    async def test_smart_then_light_and_no_repeat_commands(self):
        await self.run_restore()
        for suffix in ['a', 'b']:
            self.assert_restored(suffix)
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

    async def test_failed_mode_does_not_block_other_unit(self):
        self.fail.add(('set_preset_mode', 'fan.synthetic_a'))
        await self.run_restore()
        self.assert_restored('b')
        self.assertEqual('Off', self.hass.states.get('select.synthetic_a_light').state)
        self.fail.clear()
        await self.run_restore()
        self.assert_restored('a')

    async def test_day_window_boundaries(self):
        for hour, minute, expected in [(0, 0, False), (6, 29, False),
                                       (6, 30, False), (6, 59, False), (7, 0, True), (21, 59, True), (22, 0, False)]:
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
        self.assertEqual([('set_preset_mode', 'fan.synthetic_a')], self.calls)


    async def test_night_sets_level_two_and_aqi_off_without_redundant_power(self):
        self.automation = self.automations['coway_night_mode_start']
        self.clock = self.clock.replace(hour=22)
        await self.run_restore()
        for suffix in ['a', 'b']:
            fan = self.hass.states.get(f'fan.synthetic_{suffix}')
            self.assertEqual('on', fan.state)
            self.assertEqual(66, fan.attributes['percentage'])
            self.assertIsNone(fan.attributes['preset_mode'])
            self.assertEqual('AQI Off', self.hass.states.get(f'select.synthetic_{suffix}_light').state)
        self.calls.clear()
        self.clock = self.clock.replace(hour=3, minute=30)
        await self.run_restore()
        self.assertEqual([], self.calls)

    async def test_night_window_includes_six_thirty_to_seven(self):
        self.automation = self.automations['coway_night_mode_start']
        for hour, minute, expected in [(22, 0, True), (0, 0, True),
                                      (3, 30, True), (6, 30, True),
                                      (6, 59, True), (7, 0, False), (21, 59, False)]:
            with self.subTest(hour=hour, minute=minute):
                self.clock = self.clock.replace(hour=hour, minute=minute)
                self.set_fan('a', 'on', 'Auto', 66)
                self.calls.clear()
                await self.run_restore()
                self.assertEqual(expected, bool(self.calls))

    async def test_night_cancels_countdown_timer(self):
        self.automation = self.automations['coway_night_mode_start']
        self.clock = self.clock.replace(hour=22)
        entity = 'select.synthetic_a_timer'
        self.entities.append(entity)
        self.devices[entity] = 'a'
        self.hass.states.async_set(entity, '8 Hours', {'options': ['OFF', '8 Hours']})
        await self.run_restore()
        self.assertEqual('OFF', self.hass.states.get(entity).state)

    async def test_night_failure_does_not_block_other_unit(self):
        self.automation = self.automations['coway_night_mode_start']
        self.clock = self.clock.replace(hour=22)
        self.fail.add(('set_percentage', 'fan.synthetic_a'))
        await self.run_restore()
        self.assertEqual(66, self.hass.states.get('fan.synthetic_b').attributes['percentage'])
        self.assertEqual('AQI Off', self.hass.states.get('select.synthetic_b_light').state)
        self.assertEqual('Off', self.hass.states.get('select.synthetic_a_light').state)

    def mismatch(self):
        sensor = self.package['template'][0]['binary_sensor'][0]
        return Template(sensor['state'], self.hass).async_render(parse_result=True)

    async def run_reconcile(self):
        self.hass.states.async_set('binary_sensor.coway_schedule_mismatch',
                                   'on' if self.mismatch() else 'off',
                                   {'online_purifiers': sum(self.hass.states.get(e).state not in
                                    ['unknown', 'unavailable'] for e in self.entities if e.startswith('fan.'))})
        async def dispatch(call):
            self.assertFalse(call.data['skip_condition'])
            entity = call.data['entity_id']
            if isinstance(entity, list):
                entity = entity[0]
            self.automation = self.automations['coway_night_mode_start' if entity.endswith('_start') else 'coway_night_mode_end']
            await self.run_restore()
        self.hass.services.async_register('automation', 'trigger', dispatch)
        recovery = self.automations['coway_schedule_reconcile']
        sequence = [*recovery['condition'], *recovery['action']]
        script = Script(self.hass, cv.SCRIPT_SCHEMA(sequence), 'test recovery',
                        'automation', log_exceptions=False)
        await script.async_run(context=Context())

    async def test_recovery_corrects_early_night_override(self):
        self.clock = self.clock.replace(hour=19)
        for suffix in ['a', 'b']:
            self.set_fan(suffix, 'on', None, 66)
            self.set_light(suffix, 'Off')
        self.assertTrue(self.mismatch())
        await self.run_reconcile()
        for suffix in ['a', 'b']:
            self.assert_restored(suffix)
        self.assertFalse(self.mismatch())
        self.calls.clear()
        await self.run_reconcile()
        self.assertEqual([], self.calls)

    async def test_recovery_corrects_three_thirty_shutdown(self):
        self.clock = self.clock.replace(hour=3, minute=30)
        await self.run_reconcile()
        for suffix in ['a', 'b']:
            fan = self.hass.states.get(f'fan.synthetic_{suffix}')
            self.assertEqual('on', fan.state)
            self.assertEqual(66, fan.attributes['percentage'])
            self.assertIsNone(fan.attributes['preset_mode'])
        self.assertFalse(self.mismatch())

    async def test_recovery_skips_outage_then_recovers(self):
        for suffix in ['a', 'b']:
            self.set_fan(suffix, 'unavailable', None)
        self.assertTrue(self.mismatch())
        await self.run_reconcile()
        self.assertEqual([], self.calls)
        self.set_fan('b', 'on', None, 66)
        await self.run_reconcile()
        self.assert_restored('b')
        self.assertFalse(any('synthetic_a' in entity for _, entity in self.calls))
        self.set_fan('a', 'on', None, 66)
        await self.run_reconcile()
        self.assert_restored('a')
        self.assertFalse(self.mismatch())

    async def test_auto_speed_changes_are_not_mismatches(self):
        for percentage in [0, 33, 66, 100]:
            for suffix in ['a', 'b']:
                self.set_fan(suffix, 'on', 'Auto', percentage)
                self.set_light(suffix, 'On')
            self.assertFalse(self.mismatch())
        self.set_fan('a', 'on', 'Auto (Eco)', 0)
        self.assertFalse(self.mismatch())
        await self.run_reconcile()
        self.assertEqual([], self.calls)

    async def test_missing_discovery_is_an_alertable_mismatch(self):
        self.entities.clear()
        self.assertTrue(self.mismatch())
        await self.run_reconcile()
        self.assertEqual([], self.calls)

    async def test_recovery_does_not_rewrite_correct_brightness(self):
        self.clock = self.clock.replace(hour=3, minute=30)
        for suffix in ['a', 'b']:
            entity = f'number.synthetic_{suffix}_brightness'
            self.airgradient_entities.append(entity)
            self.hass.states.async_set(entity, '5.0', {'friendly_name': 'Synthetic brightness'})
        await self.run_reconcile()
        self.assertFalse(any(service == 'set_value' for service, _ in self.calls))

    async def test_alert_delivery_and_clear(self):
        notifications = []
        events = []
        async def notification(call):
            notifications.append((call.service, dict(call.data)))
        self.hass.services.async_register('persistent_notification', 'create', notification)
        self.hass.services.async_register('persistent_notification', 'dismiss', notification)
        self.hass.bus.async_listen('indoor_alert_notification', lambda event: events.append(dict(event.data)))
        self.hass.states.async_set('binary_sensor.coway_schedule_mismatch', 'on',
                                   {'online_purifiers': 0, 'expected_mode': 'Auto, AQI light On'})
        for key in ['coway_schedule_failure_alert', 'coway_schedule_failure_clear']:
            script = Script(self.hass, cv.SCRIPT_SCHEMA(self.automations[key]['action']),
                            'test notification', 'automation', log_exceptions=False)
            await script.async_run(context=Context())
        await self.hass.async_block_till_done()
        self.assertEqual(['create', 'dismiss'], [service for service, _ in notifications])
        self.assertEqual('coway_schedule_failure', notifications[0][1]['notification_id'])
        self.assertEqual([{'incident': 'coway_schedule_failure', 'level': 'warning', 'path': '/indoor'}], events)

    async def test_recovery_and_alert_configuration(self):
        self.assertNotIn('coway_night_level_2_guard', self.automations)
        self.assertIn({'platform': 'homeassistant', 'event': 'start'},
                      self.automations['coway_night_mode_end']['trigger'])
        self.assertIn({'platform': 'time_pattern', 'minutes': '/5'},
                      self.automations['coway_schedule_reconcile']['trigger'])
        alert = self.automations['coway_schedule_failure_alert']
        self.assertEqual('00:10:00', alert['trigger'][0]['for'])
        self.assertEqual('indoor_alert_notification', alert['action'][1]['event'])
        self.assertEqual('persistent_notification.dismiss',
                         self.automations['coway_schedule_failure_clear']['action'][0]['service'])

    async def test_schedule_clock_is_portland_local_time(self):
        self.assertEqual(ZoneInfo('America/Los_Angeles'), self.clock.tzinfo)
        self.assertEqual('05:00', self.clock.replace(hour=22, minute=0).astimezone(
            ZoneInfo('UTC')).strftime('%H:%M'))
        self.assertEqual('14:00', self.clock.replace(hour=7, minute=0).astimezone(
            ZoneInfo('UTC')).strftime('%H:%M'))


if __name__ == '__main__':
    unittest.main()
