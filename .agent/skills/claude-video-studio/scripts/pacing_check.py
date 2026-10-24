"""pacing_check.py: hack 5, part two. Measures pacing from the pixels of a rendered video.

usage: python3 scripts/pacing_check.py <video.mp4> [--loop] [--max-gap 1.0] [--min-hold 0.3] [--end-hold 0]

Checks:
  1. No dead gaps: something visibly changes at least every --max-gap seconds.
     A 'change' is a 0.1 s step where more than 0.4% of pixels move by more than 14 levels.
  2. Nothing flashes: no shot shorter than --min-hold seconds between two hard cuts,
     and no element that pops in and out again inside --min-hold seconds.
Writes <video>-contact.jpg (one frame per second from 0 s, left to right) and <video>-pacing.json.
What counts as a change: big things moving. A small label sliding, or a slow colour fade, may not count,
so near a loop seam keep one big move going every second. Flicker faster than about 3 per second reads as a flash.
Exit code 0 = pass, 1 = fail."""
import argparse, json, os, subprocess, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _media import probe, gray_frames, diff_stats

ap = argparse.ArgumentParser()
ap.add_argument('video')
ap.add_argument('--max-gap', type=float, default=1.0)
ap.add_argument('--min-hold', type=float, default=0.3)
ap.add_argument('--end-hold', type=float, default=0.0, help='a final hold this long is allowed')
ap.add_argument('--loop', action='store_true', help='it loops: also measure the gap across the loop point')
a = ap.parse_args()
info = probe(a.video)
dur = info['dur']

# 1. dead gaps, at 10 steps per second
f10, w, h = gray_frames(a.video, 10, 240)
events = []
for i in range(1, len(f10)):
    _, moved = diff_stats(f10[i - 1], f10[i])
    if moved > 0.004:
        events.append(round(i / 10, 2))
pts = [0.0] + events + [round(dur, 2)]
gaps = [(pts[i], pts[i + 1], round(pts[i + 1] - pts[i], 2)) for i in range(len(pts) - 1)]
if a.loop and len(pts) > 2:   # the quiet time at the end runs straight into the quiet time at the start
    wrap = round((pts[-1] - pts[-2]) + (pts[1] - pts[0]), 2)
    gaps.append((pts[-2], pts[1], wrap))
dead = [g for g in gaps if g[2] > a.max_gap + 0.05]
if a.end_hold:
    dead = [g for g in dead if not (g[1] >= dur - 0.05 and g[2] <= a.end_hold + 0.05)]

# 2. flashes, at 30 steps per second
f30, _, _ = gray_frames(a.video, 30, 160)
k = max(1, int(round(a.min_hold / 2 * 30)))   # look this many frames either side
cuts, flashes = [], []
for i in range(1, len(f30)):
    _, moved = diff_stats(f30[i - 1], f30[i], 30)
    if moved > 0.35:
        cuts.append(i / 30)
for i in range(k, len(f30) - k, 2):
    _, ac = diff_stats(f30[i - k], f30[i], 30)
    _, ab = diff_stats(f30[i - k], f30[i + k], 30)
    if ac > 0.01 and ab < 0.25 * ac:
        flashes.append(round(i / 30, 2))
shots = [0.0] + cuts + [dur]
short_shots = [(round(shots[i], 2), round(shots[i + 1], 2)) for i in range(len(shots) - 1)
               if shots[i + 1] - shots[i] < a.min_hold - 0.01]
# merge flash frames that sit next to each other
merged = []
for t in flashes:
    if merged and t - merged[-1][1] <= 0.1:
        merged[-1][1] = t
    else:
        merged.append([t, t])

# contact sheet, one frame per second
base = os.path.splitext(a.video)[0]
cols = 6 if info['w'] >= info['h'] else 8
rows = max(1, int((dur + cols - 1) // cols))
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', a.video, '-vf',
                f'fps=1:round=down,scale={320 if info["w"] >= info["h"] else 180}:-2,tile={cols}x{rows}:padding=8:margin=8:color=white',
                '-frames:v', '1', '-q:v', '4', base + '-contact.jpg'], check=False)

rep = {'video': a.video, 'duration': round(dur, 2), 'change_steps': len(events),
       'longest_gap_s': max(g[2] for g in gaps), 'dead_gaps': dead,
       'hard_cuts': [round(c, 2) for c in cuts], 'too_short_shots': short_shots,
       'flashes': [m for m in merged], 'pass': not dead and not short_shots and not merged}
json.dump(rep, open(base + '-pacing.json', 'w'), indent=1)
print(f"pacing: longest gap {rep['longest_gap_s']} s (limit {a.max_gap}), {len(events)} change steps, "
      f"{len(cuts)} hard cuts")
for g in dead:
    print(f"  FAIL dead gap {g[0]} to {g[1]} s ({g[2]} s with nothing moving)")
for s in short_shots:
    print(f"  FAIL shot {s[0]} to {s[1]} s is shorter than {a.min_hold} s")
for m in merged:
    print(f"  FAIL something pops in and out around {m[0]} to {m[1]} s (on screen under {a.min_hold} s)")
print('PASS' if rep['pass'] else 'FAIL', '| contact sheet:', base + '-contact.jpg')
sys.exit(0 if rep['pass'] else 1)
