#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
WORK_DIRECTORY=$(mktemp -d "${TMPDIR:-/tmp}/coway-verifier.XXXXXX")
cleanup() {
  rm -rf "$WORK_DIRECTORY"
}
trap cleanup EXIT HUP INT TERM

if [ "$#" -ne 1 ]; then
  echo "usage: $0 ARCHIVE" >&2
  exit 64
fi

"$SCRIPT_DIR/verify-source.sh" "$1" "$WORK_DIRECTORY/extracted"
test -f "$WORK_DIRECTORY/extracted/custom_components/coway/manifest.json"

printf 'not the pinned archive\n' > "$WORK_DIRECTORY/bad-checksum.tar.gz"
set +e
"$SCRIPT_DIR/verify-source.sh" "$WORK_DIRECTORY/bad-checksum.tar.gz" \
  >"$WORK_DIRECTORY/checksum.stdout" 2>"$WORK_DIRECTORY/checksum.stderr"
STATUS=$?
set -e
test "$STATUS" -eq 65
grep -q 'checksum mismatch' "$WORK_DIRECTORY/checksum.stderr"

# Build a checksum-valid but path-invalid archive and run an isolated copy of
# the verifier with that checksum. This proves the traversal guard is active
# independently of the checksum guard.
python3 - "$WORK_DIRECTORY/bad-path.tar.gz" <<'PY'
import io
import sys
import tarfile

commit = "e0f29953f650b09c8d994aafba5c27634e0bb705"
with tarfile.open(sys.argv[1], "w:gz") as archive:
    payload = b"escape"
    member = tarfile.TarInfo(
        f"home-assistant-iocare-{commit}/../../outside"
    )
    member.size = len(payload)
    archive.addfile(member, io.BytesIO(payload))
PY

mkdir "$WORK_DIRECTORY/isolation"
cp "$SCRIPT_DIR/verify-source.sh" "$WORK_DIRECTORY/isolation/verify-source.sh"
BAD_PATH_SHA=$(shasum -a 256 "$WORK_DIRECTORY/bad-path.tar.gz" | awk '{print $1}')
awk -v checksum="$BAD_PATH_SHA" '
  /^COWAY_ARCHIVE_SHA256=/ { print "COWAY_ARCHIVE_SHA256=" checksum; next }
  { print }
' "$SCRIPT_DIR/source.lock" > "$WORK_DIRECTORY/isolation/source.lock"
chmod +x "$WORK_DIRECTORY/isolation/verify-source.sh"

set +e
"$WORK_DIRECTORY/isolation/verify-source.sh" "$WORK_DIRECTORY/bad-path.tar.gz" \
  >"$WORK_DIRECTORY/path.stdout" 2>"$WORK_DIRECTORY/path.stderr"
STATUS=$?
set -e
test "$STATUS" -eq 65
grep -q 'outside the expected commit directory' "$WORK_DIRECTORY/path.stderr"

echo "verifier positive, checksum-negative, and path-negative tests passed"
