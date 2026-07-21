#!/bin/sh
set -eu

CHECK_DIRECTORY=$(mktemp -d "${TMPDIR:-/tmp}/ha-config-check.XXXXXX")
cleanup() {
  rm -rf "$CHECK_DIRECTORY"
}
trap cleanup EXIT HUP INT TERM

cp /opt/homelab-home-assistant/configuration.yaml "$CHECK_DIRECTORY/configuration.yaml"
python -m homeassistant --script check_config --config "$CHECK_DIRECTORY"
python -m unittest discover -v -s /opt/homelab-home-assistant/tests

