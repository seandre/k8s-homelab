#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
# shellcheck source=source.lock
. "$SCRIPT_DIR/source.lock"

usage() {
  echo "usage: $0 ARCHIVE [OUTPUT_DIRECTORY]" >&2
  echo "download: $COWAY_ARCHIVE_URL" >&2
}

if [ "$#" -lt 1 ] || [ "$#" -gt 2 ]; then
  usage
  exit 64
fi

ARCHIVE=$1
OUTPUT_DIRECTORY=${2:-}

if [ ! -f "$ARCHIVE" ]; then
  echo "archive not found: $ARCHIVE" >&2
  exit 66
fi

if command -v sha256sum >/dev/null 2>&1; then
  ACTUAL_SHA256=$(sha256sum "$ARCHIVE" | awk '{print $1}')
else
  ACTUAL_SHA256=$(shasum -a 256 "$ARCHIVE" | awk '{print $1}')
fi

if [ "$ACTUAL_SHA256" != "$COWAY_ARCHIVE_SHA256" ]; then
  echo "Coway archive checksum mismatch" >&2
  echo "expected: $COWAY_ARCHIVE_SHA256" >&2
  echo "actual:   $ACTUAL_SHA256" >&2
  exit 65
fi

PREFIX="home-assistant-iocare-$COWAY_COMMIT/"
if ! tar -tzf "$ARCHIVE" | awk -v prefix="$PREFIX" '
  index($0, prefix) != 1 { bad = 1 }
  /(^|\/)\.\.($|\/)/ { bad = 1 }
  END { exit bad }
'; then
  echo "archive contains a path outside the expected commit directory" >&2
  exit 65
fi

MANIFEST_PATH="${PREFIX}custom_components/coway/manifest.json"
MANIFEST=$(tar -xOzf "$ARCHIVE" "$MANIFEST_PATH")
printf '%s' "$MANIFEST" | python3 -c '
import json
import sys

manifest = json.load(sys.stdin)
expected = {
    "domain": "coway",
    "version": sys.argv[1],
    "requirements": [f"cowayaio=={sys.argv[2]}"],
}
actual = {key: manifest.get(key) for key in expected}
if actual != expected:
    raise SystemExit(f"unexpected manifest pin: {actual!r}")
' "$COWAY_VERSION" "$COWAYAIO_VERSION"

if [ -n "$OUTPUT_DIRECTORY" ]; then
  if [ -e "$OUTPUT_DIRECTORY" ]; then
    echo "output directory already exists: $OUTPUT_DIRECTORY" >&2
    exit 73
  fi
  mkdir -p "$OUTPUT_DIRECTORY/custom_components"
  tar -xzf "$ARCHIVE" \
    -C "$OUTPUT_DIRECTORY/custom_components" \
    --strip-components=2 \
    "${PREFIX}custom_components/coway"
  test -f "$OUTPUT_DIRECTORY/custom_components/coway/manifest.json"
fi

echo "verified Coway $COWAY_VERSION at $COWAY_COMMIT ($ACTUAL_SHA256)"
