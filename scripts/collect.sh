#!/bin/bash
# Unpack every guru_*.zip from ~/Downloads into orders/, then reconcile
# against the 434 entries the court publishes.
set -u
DEST="/Users/divayanshisharama/Desktop/Data scrapping/orders"
DL="/Users/divayanshisharama/Downloads"
mkdir -p "$DEST"

shopt -s nullglob
zips=("$DL"/guru_*.zip)
if [ ${#zips[@]} -eq 0 ]; then echo "no guru_*.zip in $DL yet"; exit 0; fi

for z in "${zips[@]}"; do
  unzip -o -q -j "$z" -d "$DEST" && echo "unpacked $(basename "$z")"
done

echo
echo "--- integrity ---"
bad=0
for f in "$DEST"/*.pdf; do
  [ -e "$f" ] || continue
  if [ "$(head -c 4 "$f")" != "%PDF" ]; then echo "CORRUPT: $(basename "$f")"; bad=$((bad+1)); fi
done
echo "non-PDF files: $bad"

echo
echo "--- coverage ---"
have=$(ls -1 "$DEST"/*.pdf 2>/dev/null | wc -l | tr -d ' ')
echo "PDFs on disk: $have"
python3 - <<'PY'
import os, re
d = "/Users/divayanshisharama/Desktop/Data scrapping/orders"
got = set()
for f in os.listdir(d):
    m = re.match(r"^(\d{3})_", f)
    if m: got.add(int(m.group(1)))
want_new = set([50]) | set(range(185, 435))   # what this run was responsible for
missing = sorted(want_new - got)
print("this run should have fetched: %d" % len(want_new))
print("of those, on disk:            %d" % len(want_new & got))
print("still missing:                %s" % (missing if missing else "none"))
officemate = sorted(set(range(1,50)) | set(range(51,185)))
print()
print("officemate's 183 (entries 1-49, 51-184) are NOT here - they hold those.")
print("full set of 434 needs their %d + our %d" % (len(officemate), len(want_new)))
PY
