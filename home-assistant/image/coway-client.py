"""Compatibility for malformed maintenance notices in cowayaio 0.2.6."""

import logging

from cowayaio import CowayClient as UpstreamCowayClient

LOGGER = logging.getLogger(__name__)


class CowayClient(UpstreamCowayClient):
    async def async_server_maintenance_notice(self):
        """Allow device polling when the optional notice date cannot be parsed."""
        try:
            return await super().async_server_maintenance_notice()
        except AttributeError as error:
            # Only the upstream unchecked regex match is recoverable. Network,
            # authentication and actual ServerMaintenance errors still propagate.
            traceback = error.__traceback__
            while traceback.tb_next is not None:
                traceback = traceback.tb_next
            if (
                error.name != "groups"
                or error.obj is not None
                or traceback.tb_frame.f_code.co_name != "async_server_maintenance_notice"
            ):
                raise
            LOGGER.warning("Coway maintenance notice has an unrecognized date format; checking device availability directly")
