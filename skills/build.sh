#!/usr/bin/env bash
# Build the LVBL Cowork skill package.
#
# Syncs shared reference docs out of docs/, then produces a ZIP with the layout
# claude.ai expects (skill directory INSIDE the zip, not files at the root).
#
# Upload the result at claude.ai → Settings → Capabilities → Skills.
set -euo pipefail

SKILL="lv-battle-league"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/.." && pwd)"
SRC="$HERE/$SKILL"
OUT="$HERE/dist"

[ -f "$SRC/SKILL.md" ] || { echo "No SKILL.md at $SRC" >&2; exit 1; }

echo "Syncing shared references from docs/"
# scoring.md is audience-neutral league rules — one source of truth for both the
# repo and the skill. Everything else in references/ is written for the skill.
cp "$REPO/docs/scoring.md" "$SRC/references/scoring.md"
echo "  references/scoring.md"

echo "Validating SKILL.md"
python3 - "$SRC/SKILL.md" <<'PY'
import re, sys
text = open(sys.argv[1]).read()
m = re.match(r'^---\n(.*?)\n---\n', text, re.S)
if not m:
    sys.exit("SKILL.md is missing YAML frontmatter")
fm = m.group(1)

name = re.search(r'^name:\s*(\S+)', fm, re.M)
if not name:
    sys.exit("frontmatter has no name")
name = name.group(1)
if not re.fullmatch(r'[a-z0-9-]{1,64}', name):
    sys.exit(f"invalid name {name!r} — lowercase, digits, hyphens, max 64")

desc = re.search(r'^description:\s*(.*?)(?=\n[a-z_]+:|\Z)', fm, re.S | re.M)
if not desc:
    sys.exit("frontmatter has no description")
desc = ' '.join(desc.group(1).split())
if len(desc) > 200:
    sys.exit(f"description is {len(desc)} chars — claude.ai caps it at 200")

lines = text.count('\n') + 1
if lines > 500:
    sys.exit(f"SKILL.md is {lines} lines — keep it under 500")

print(f"  name={name} desc={len(desc)}/200 lines={lines}/500")
PY

echo "Packaging"
rm -rf "$OUT"
mkdir -p "$OUT"
# Zip from the parent so the archive contains lv-battle-league/... at its root.
( cd "$HERE" && zip -qr "$OUT/$SKILL.zip" "$SKILL" -x '*.DS_Store' )

echo
echo "Built $OUT/$SKILL.zip"
unzip -l "$OUT/$SKILL.zip" | tail -n +4 | head -n -2 | awk '{print "  " $4}'
echo
echo "Upload at claude.ai -> Settings -> Capabilities -> Skills"
