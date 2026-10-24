#!/usr/bin/env bash
# new_project.sh: make a fresh HyperFrames project.
# usage: bash scripts/new_project.sh <dir> [16x9|9x16] [seconds] [style id]
# With a style id that has a reference piece (styles/<id>/index.html), the project starts as a copy
# of that piece, so you change words, colours and timing instead of starting from nothing.
set -e
HERE=$(cd "$(dirname "$0")/.." && pwd)
DIR=${1:?usage: new_project.sh <dir> [16x9|9x16] [seconds]}
FMT=${2:-16x9}; SEC=${3:-9}; STYLE=${4:-}
if [ -e "$DIR/index.html" ]; then echo "$DIR already has an index.html. Pick a new folder."; exit 1; fi
mkdir -p "$DIR/media"
cp "$HERE/templates/motion/"{index.html,studio.js,hyperframes.json,meta.json} "$DIR/"
if [ -n "$STYLE" ]; then
  [ -f "$HERE/styles/$STYLE/STYLE.md" ] || { echo "No style called $STYLE. Look in $HERE/styles/"; exit 1; }
  cp "$HERE/styles/$STYLE/STYLE.md" "$DIR/STYLE.md"
  if [ -f "$HERE/styles/$STYLE/index.html" ]; then
    cp "$HERE/styles/$STYLE/index.html" "$DIR/index.html"
    if [ -f "$HERE/styles/$STYLE/studio.js" ]; then cp "$HERE/styles/$STYLE/studio.js" "$DIR/studio.js"
    elif ! grep -q 'studio.js' "$DIR/index.html"; then rm -f "$DIR/studio.js"; fi
    PW=$(grep -oE 'data-width="[0-9]+"' "$DIR/index.html" | head -1 | grep -oE '[0-9]+')
    PH=$(grep -oE 'data-height="[0-9]+"' "$DIR/index.html" | head -1 | grep -oE '[0-9]+')
    PD=$(grep -oE 'data-duration="[0-9.]+"' "$DIR/index.html" | head -1 | grep -oE '[0-9.]+')
    if [ "$FMT" = 9x16 ]; then WW=1080; WH=1920; else WW=1920; WH=1080; fi
    echo "new project: $DIR, started from the $STYLE reference piece (${PW} x ${PH}, ${PD} s)."
    if [ "$PW" != "$WW" ] || [ "$PH" != "$WH" ]; then
      echo "WARNING: you asked for $WW x $WH but this piece is $PW x $PH. Lay the scene out again for $WW x $WH"
      echo "         (change data-width/data-height, the viewport and the page size, then re-place everything). Never just crop."
    fi
    if [ "$PD" != "$SEC" ] && [ "$PD" != "$SEC.0" ]; then
      echo "WARNING: you asked for $SEC s but this piece is $PD s. Change data-duration and re-time the beats."
    fi
    exit 0
  fi
fi
if [ "$FMT" = 9x16 ]; then W=1080; H=1920; else W=1920; H=1080; fi
# set size and length in the template
sed -i.bak -e "s/width=1920, height=1080/width=$W, height=$H/" \
  -e "s/width: 1920px; height: 1080px/width: ${W}px; height: ${H}px/g" \
  -e "s/data-duration=\"9\"/data-duration=\"$SEC\"/" \
  -e "s/data-width=\"1920\" data-height=\"1080\"/data-width=\"$W\" data-height=\"$H\"/" "$DIR/index.html"
rm -f "$DIR/index.html.bak"
echo "new project: $DIR ($W x $H, $SEC s). Edit $DIR/index.html, then: bash $HERE/scripts/stills.sh $DIR"
