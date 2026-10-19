"""Exercise the pinned client's real notice parser without network access."""
import importlib.util
import pathlib
import unittest
from unittest.mock import AsyncMock, patch

from cowayaio import CowayClient as UpstreamCowayClient
from cowayaio.exceptions import ServerMaintenance

spec = importlib.util.spec_from_file_location("coway_client_compat", pathlib.Path(__file__).with_name("coway-client.py"))
compat = importlib.util.module_from_spec(spec)
spec.loader.exec_module(compat)


class MaintenanceTests(unittest.IsolatedAsyncioTestCase):
    async def test_malformed_notice(self):
        # No constructor or credentials: the notice parser only needs these fields.
        client = object.__new__(compat.CowayClient)
        client.check_token = False
        client.server_maintenance = None
        client.access_token = "synthetic"
        client._get_endpoint = AsyncMock(side_effect=[
            {"data": {"content": [{"noticeSeq": 1}]}},
            {"data": {"noticeSeq": 1, "content": "<p>[EDT] Maintenance dates to be announced</p>"}},
        ])
        await client.async_server_maintenance_notice()
        self.assertEqual(client._get_endpoint.await_count, 2)

    async def test_valid_notice_preserves_window(self):
        client = object.__new__(compat.CowayClient)
        client.check_token = False
        client.server_maintenance = None
        client.access_token = "synthetic"
        client._get_endpoint = AsyncMock(side_effect=[
            {"data": {"content": [{"noticeSeq": 1}]}},
            {"data": {"noticeSeq": 1, "content": "<p>[EDT] 2026-10-20 01:00 to 2026-10-20 02:00</p>"}},
        ])
        await client.async_server_maintenance_notice()
        self.assertIsNotNone(client.server_maintenance["start_date_time"])
        self.assertIsNotNone(client.server_maintenance["end_date_time"])

    async def test_other_errors_propagate(self):
        for error in (ServerMaintenance("synthetic"), AttributeError("unrelated")):
            with patch.object(UpstreamCowayClient, "async_server_maintenance_notice", new=AsyncMock(side_effect=error)):
                with self.assertRaises(type(error)):
                    await object.__new__(compat.CowayClient).async_server_maintenance_notice()


if __name__ == "__main__":
    unittest.main()
