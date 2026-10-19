#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
COMPAT_DIRECTORY="$SCRIPT_DIR/../coway-compat"

if [ "$#" -ne 2 ]; then
  echo "usage: $0 COWAY_ARCHIVE OUTPUT_DIRECTORY" >&2
  exit 64
fi

ARCHIVE=$1
OUTPUT_DIRECTORY=$2

if [ -e "$OUTPUT_DIRECTORY" ]; then
  echo "output directory already exists: $OUTPUT_DIRECTORY" >&2
  exit 73
fi

"$COMPAT_DIRECTORY/verify-source.sh" "$ARCHIVE" "$OUTPUT_DIRECTORY"
patch -d "$OUTPUT_DIRECTORY" -p1 < "$SCRIPT_DIR/coway-token-refresh.patch"
sed 's/from cowayaio import CowayClient/from .client import CowayClient/' \
  "$OUTPUT_DIRECTORY/custom_components/coway/coordinator.py" > "$OUTPUT_DIRECTORY/coordinator.tmp"
mv "$OUTPUT_DIRECTORY/coordinator.tmp" "$OUTPUT_DIRECTORY/custom_components/coway/coordinator.py"
cp "$SCRIPT_DIR/coway-client.py" "$OUTPUT_DIRECTORY/custom_components/coway/client.py"
cp "$SCRIPT_DIR/Dockerfile" "$OUTPUT_DIRECTORY/Dockerfile"
cp "$SCRIPT_DIR/install-coway.sh" "$OUTPUT_DIRECTORY/install-coway.sh"
cp "$SCRIPT_DIR/verify-image.sh" "$OUTPUT_DIRECTORY/verify-image.sh"
cp "$SCRIPT_DIR/configuration.yaml" "$OUTPUT_DIRECTORY/configuration.yaml"
cp "$SCRIPT_DIR/requirements.lock" "$OUTPUT_DIRECTORY/requirements.lock"
cp "$SCRIPT_DIR/coway-client.py" "$OUTPUT_DIRECTORY/coway-client.py"
cp "$SCRIPT_DIR/test-maintenance-notice.py" "$OUTPUT_DIRECTORY/test-maintenance-notice.py"
cp -R "$COMPAT_DIRECTORY/tests" "$OUTPUT_DIRECTORY/tests"
cp "$SCRIPT_DIR/../coway/test_schedule.py" "$OUTPUT_DIRECTORY/tests/test_schedule.py"
cp "$SCRIPT_DIR/../coway/night-schedule.yaml" "$OUTPUT_DIRECTORY/tests/night-schedule.yaml"

echo "prepared checksum-verified IE-003 build context: $OUTPUT_DIRECTORY"
