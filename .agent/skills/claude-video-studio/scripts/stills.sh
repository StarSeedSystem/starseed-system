#!/usr/bin/env bash
# stills.sh: hack 5. Grab still frames at shot boundaries BEFORE the full render.
# usage: bash scripts/stills.sh <project dir> [times, comma separated]   e.g. 0,3,6
# With no times it takes 0, one third, two thirds and the end.
set -e
HF="npx --yes hyperframes@${HF_VERSION:-0.8.181}"
DIR=$(cd "${1:?usage: stills.sh <dir> [t1,t2,t3]}" && pwd)
D=$(grep -oE 'data-duration="[0-9.]+"' "$DIR/index.html" | head -1 | grep -oE '[0-9.]+')
AT=${2:-$(python3 -c "d=$D; print(','.join(str(round(x,2)) for x in (0, d/3, 2*d/3, d-0.05)))")}
OUT="$DIR/stills"; rm -rf "$OUT"; mkdir -p "$OUT"
$HF snapshot "$DIR" --at "$AT" --no-end -o "$OUT" >/dev/null
# small copies so they are cheap to look at
for f in "$OUT"/*.png; do ffmpeg -v error -y -i "$f" -vf scale=960:-2 -q:v 7 "${f%.png}.jpg"; done
# one small sheet of all of them (image readers often refuse big files)
[ -f "$OUT/contact-sheet.jpg" ] && ffmpeg -v error -y -i "$OUT/contact-sheet.jpg" -vf scale=1400:-2 -q:v 8 "$OUT/peek.jpg"
ls "$OUT"/*.jpg
echo "Look at each still. Fix what is wrong. Only then run render.sh."
