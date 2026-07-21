#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
# shellcheck source=../coway-compat/source.lock
. "$SCRIPT_DIR/../coway-compat/source.lock"

if [ "$#" -ne 1 ]; then
  echo "usage: $0 OUTPUT_ARCHIVE" >&2
  exit 64
fi

OUTPUT_ARCHIVE=$1
PARTIAL_ARCHIVE="${OUTPUT_ARCHIVE}.partial.$$"
cleanup() {
  rm -f "$PARTIAL_ARCHIVE"
}
trap cleanup EXIT HUP INT TERM

if [ -e "$OUTPUT_ARCHIVE" ]; then
  echo "output already exists: $OUTPUT_ARCHIVE" >&2
  exit 73
fi

curl --proto '=https' --tlsv1.2 --fail --show-error --silent --location \
  --retry 5 --retry-all-errors \
  --output "$PARTIAL_ARCHIVE" \
  "$COWAY_ARCHIVE_URL"
"$SCRIPT_DIR/../coway-compat/verify-source.sh" "$PARTIAL_ARCHIVE"
mv "$PARTIAL_ARCHIVE" "$OUTPUT_ARCHIVE"

echo "downloaded verified Coway archive: $OUTPUT_ARCHIVE"

