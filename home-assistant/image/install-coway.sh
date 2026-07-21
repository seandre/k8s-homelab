#!/bin/sh
set -eu

SOURCE_DIRECTORY=${COWAY_SOURCE_DIRECTORY:-/usr/local/share/homelab-home-assistant/custom_components/coway}
CONFIG_DIRECTORY=${COWAY_CONFIG_DIRECTORY:-/config}
CUSTOM_COMPONENTS_DIRECTORY="$CONFIG_DIRECTORY/custom_components"
DESTINATION="$CUSTOM_COMPONENTS_DIRECTORY/coway"
STAGING="$CUSTOM_COMPONENTS_DIRECTORY/.coway.ie003.staging"

test -f "$SOURCE_DIRECTORY/manifest.json"
mkdir -p "$CUSTOM_COMPONENTS_DIRECTORY"
rm -rf "$STAGING"
cp -R "$SOURCE_DIRECTORY" "$STAGING"

# Replace the runtime copy as one directory rename after staging succeeds. This
# removes files left by an older integration version without changing the baked
# source. /config remains the only writable state location.
rm -rf "$DESTINATION"
mv "$STAGING" "$DESTINATION"

