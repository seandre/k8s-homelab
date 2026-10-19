#!/bin/sh
set -eu

# Temporary deployment overlay until the next immutable image includes the fix.
cp /opt/coway-compat/client.py /config/custom_components/coway/client.py
sed 's/from cowayaio import CowayClient/from .client import CowayClient/' \
  /config/custom_components/coway/coordinator.py > /config/custom_components/coway/coordinator.tmp
mv /config/custom_components/coway/coordinator.tmp /config/custom_components/coway/coordinator.py
