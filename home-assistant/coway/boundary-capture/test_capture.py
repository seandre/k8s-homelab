import importlib.util
import json
from pathlib import Path
import unittest
from unittest.mock import Mock

spec = importlib.util.spec_from_file_location('capture', Path(__file__).with_name('capture.py'))
capture = importlib.util.module_from_spec(spec)
spec.loader.exec_module(capture)


class CaptureTests(unittest.TestCase):
    def test_all_writes_blocked_after_login(self):
        session = Mock()
        readonly = capture.ReadOnlySession(session)
        readonly.post('authentication')
        readonly.authentication = False
        for method in ['post', 'put', 'patch', 'delete']:
            with self.assertRaises(RuntimeError):
                getattr(readonly, method)('forbidden')
        self.assertEqual(1, session.post.call_count)
        session.put.assert_not_called()
        session.patch.assert_not_called()
        session.delete.assert_not_called()
        readonly.get('read-only')
        session.get.assert_called_once_with('read-only')

    def test_vendor_payload_is_strictly_redacted(self):
        attrs = {'0001': 1, '0002': 1, '0003': 2, '0007': 'private_identifier', '0008': 0}
        data = {'familyId': '01', 'sensorInfo': {}, 'private': 'never-output',
                'deviceStatusData': {'data': {'statusInfo': {'attributes': attrs}}},
                'coreData': [{'data': {'timezoneId': 'America/Kentucky/Louisville'}}]}
        html = '<script>' + json.dumps(data, separators=(',', ':')) + '</script>'
        result = capture.extract(html)
        self.assertEqual(1, result['power_code'])
        self.assertEqual(2, result['speed_code'])
        self.assertIsNone(result['light_code'])
        self.assertNotIn('private', json.dumps(result))
        self.assertEqual('America/Kentucky/Louisville', result['embedded_timezone'])

    def test_aliases_never_return_unknown_names(self):
        self.assertEqual('bedroom', capture.alias('Bedroom Coway'))
        self.assertEqual('living_room', capture.alias('Living Room Coway'))
        self.assertIsNone(capture.alias('private vendor identifier'))


if __name__ == '__main__':
    unittest.main()
