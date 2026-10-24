#!/usr/bin/env bash
# doctor.sh: check the tools this skill needs. Prints one fix command per missing tool.
# usage: bash scripts/doctor.sh [motion|media]
MODE=${1:-motion}
ok=1
say() { printf '%-10s %s\n' "$1" "$2"; }

if command -v node >/dev/null; then
  v=$(node -p 'process.versions.node.split(".")[0]')
  if [ "$v" -ge 22 ]; then say node "ok ($(node -v))"; else say node "too old ($(node -v)). Fix: install Node 22 or newer from https://nodejs.org"; ok=0; fi
else say node "missing. Fix: install Node 22 or newer from https://nodejs.org"; ok=0; fi

for t in ffmpeg ffprobe; do
  if command -v $t >/dev/null; then say $t ok; else say $t "missing. Fix: brew install ffmpeg"; ok=0; fi
done

if command -v python3 >/dev/null; then say python3 "ok"; else say python3 "missing. Fix: brew install python"; ok=0; fi

if [ "$MODE" = media ]; then
  if [ -n "$HIGGSFIELD_API_KEY" ] || [ -n "$HF_API_KEY_ID" ] || grep -qs '^HIGGSFIELD_API_KEY=' .env; then
    say higgsfield "key found (not shown)"
  else
    say higgsfield "no key. Make a file called .env in this folder with one line: HIGGSFIELD_API_KEY=your_key_id:your_key_secret (from https://console.higgsfield.ai). Never paste it into chat."
  fi
fi

[ $ok = 1 ] && echo "ready" || { echo "fix the lines above, then run this again"; exit 1; }
