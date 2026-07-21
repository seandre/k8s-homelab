#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
# shellcheck source=image.lock
# shellcheck disable=SC1091
. "$SCRIPT_DIR/image.lock"

if [ "$#" -ne 1 ]; then
  echo "usage: $0 COWAY_ARCHIVE" >&2
  exit 64
fi

ARCHIVE=$1
WORK_DIRECTORY=$(mktemp -d "${TMPDIR:-/tmp}/ha-image-context.XXXXXX")
cleanup() {
  rm -rf "$WORK_DIRECTORY"
}
trap cleanup EXIT HUP INT TERM

grep -Fx "FROM $HOME_ASSISTANT_BASE" "$SCRIPT_DIR/Dockerfile" >/dev/null
grep -F 'cowayaio==0.2.4' "$SCRIPT_DIR/requirements.lock" >/dev/null
grep -F 'sha256:05d49002fc9005159ff865f2429a13339d61975636c4c66077d90e2ee29891c8' \
  "$SCRIPT_DIR/requirements.lock" >/dev/null
if grep -i -E 'hacs|latest' "$SCRIPT_DIR/Dockerfile" >/dev/null; then
  echo "production image context contains a forbidden HACS or floating latest reference" >&2
  exit 65
fi

"$SCRIPT_DIR/prepare-context.sh" "$ARCHIVE" "$WORK_DIRECTORY/context"
"$SCRIPT_DIR/../coway-compat/verify-source.sh" \
  "$ARCHIVE" "$WORK_DIRECTORY/expected"
diff -r \
  "$WORK_DIRECTORY/expected/custom_components/coway" \
  "$WORK_DIRECTORY/context/custom_components/coway"

mkdir -p "$WORK_DIRECTORY/runtime-source"
cp -R "$WORK_DIRECTORY/context/custom_components/coway" \
  "$WORK_DIRECTORY/runtime-source/coway"
COWAY_SOURCE_DIRECTORY="$WORK_DIRECTORY/runtime-source/coway" \
  COWAY_CONFIG_DIRECTORY="$WORK_DIRECTORY/runtime-config" \
  "$SCRIPT_DIR/install-coway.sh"
printf 'stale\n' > "$WORK_DIRECTORY/runtime-config/custom_components/coway/stale-file"
COWAY_SOURCE_DIRECTORY="$WORK_DIRECTORY/runtime-source/coway" \
  COWAY_CONFIG_DIRECTORY="$WORK_DIRECTORY/runtime-config" \
  "$SCRIPT_DIR/install-coway.sh"
test ! -e "$WORK_DIRECTORY/runtime-config/custom_components/coway/stale-file"
diff -r \
  "$WORK_DIRECTORY/runtime-source/coway" \
  "$WORK_DIRECTORY/runtime-config/custom_components/coway"

echo "IE-003 pin, pristine-source, generated-context, and startup-copy tests passed"
