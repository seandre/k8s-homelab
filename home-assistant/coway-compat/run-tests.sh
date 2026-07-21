#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
# shellcheck source=source.lock
. "$SCRIPT_DIR/source.lock"

usage() {
  echo "usage: $0 ARCHIVE" >&2
}

if [ "$#" -ne 1 ]; then
  usage
  exit 64
fi

WORK_DIRECTORY=$(mktemp -d "${TMPDIR:-/tmp}/coway-compat.XXXXXX")
BUILD_CONTEXT="$WORK_DIRECTORY/context"
cleanup() {
  rm -rf "$WORK_DIRECTORY"
}
trap cleanup EXIT HUP INT TERM

"$SCRIPT_DIR/verify-source.sh" "$1" "$BUILD_CONTEXT"
cp "$SCRIPT_DIR/Dockerfile" "$BUILD_CONTEXT/Dockerfile"
cp -R "$SCRIPT_DIR/tests" "$BUILD_CONTEXT/tests"

docker build \
  --build-arg "HOME_ASSISTANT_VERSION=$HOME_ASSISTANT_VERSION" \
  --build-arg "COWAYAIO_VERSION=$COWAYAIO_VERSION" \
  --label "dev.seandre.ie=COWAY-002" \
  --label "dev.seandre.coway.commit=$COWAY_COMMIT" \
  --label "dev.seandre.home-assistant.version=$HOME_ASSISTANT_VERSION" \
  --tag "homelab/coway-compat:${COWAY_VERSION}-ha${HOME_ASSISTANT_VERSION}" \
  "$BUILD_CONTEXT"

docker run --rm \
  "homelab/coway-compat:${COWAY_VERSION}-ha${HOME_ASSISTANT_VERSION}"
