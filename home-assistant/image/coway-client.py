"""Compatibility for malformed maintenance notices in cowayaio 0.2.6."""

from functools import wraps
import logging

from cowayaio import CowayClient as UpstreamCowayClient
from cowayaio.exceptions import CowayError, ServerMaintenance

LOGGER = logging.getLogger(__name__)


def recoverable_maintenance(method):
    """Let HA's continue_on_error isolate maintenance failures per device."""
    @wraps(method)
    async def command(*args, **kwargs):
        try:
            return await method(*args, **kwargs)
        except ServerMaintenance as error:
            # Upstream entity platforms translate CowayError to HomeAssistantError,
            # but miss ServerMaintenance because it is a separate exception type.
            raise CowayError("Coway servers are undergoing maintenance.") from error
    return command


class CowayClient(UpstreamCowayClient):
    async_set_power = recoverable_maintenance(UpstreamCowayClient.async_set_power)
    async_set_auto_mode = recoverable_maintenance(UpstreamCowayClient.async_set_auto_mode)
    async_set_fan_speed = recoverable_maintenance(UpstreamCowayClient.async_set_fan_speed)
    async_set_light = recoverable_maintenance(UpstreamCowayClient.async_set_light)
    async_set_light_mode = recoverable_maintenance(UpstreamCowayClient.async_set_light_mode)
    async_set_timer = recoverable_maintenance(UpstreamCowayClient.async_set_timer)

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
