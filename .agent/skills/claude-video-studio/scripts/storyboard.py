"""storyboard.py: show the Media-mode plan and what it will cost, before anything is spent.

usage: python3 scripts/storyboard.py <storyboard.json>

storyboard.json (Claude writes it; see examples/storyboard.json):
  {"title": "...", "format": "16:9", "seconds": 12,
   "shots": [{"time": "0.0-3.0", "graphic": "what the graphic does",
              "asset": {"kind": "code"}},                                   # pure code, free
             {"time": "3.0-8.0", "graphic": "...",
              "asset": {"kind": "user_photo", "path": "media/me.jpg"}},     # their photo, free
             {"time": "...", "graphic": "...",
              "asset": {"kind": "user_clip", "path": "media/demo.mp4"}},    # their clip, free
             {"time": "...", "graphic": "...",
              "asset": {"kind": "generate", "from": "media/me.jpg", "model": "seedance-2.0",
                        "prompt": "...", "duration": 5, "resolution": "720p"}}]}   # costs credits
Prints a table, the credit estimate for every 'generate' shot, and the total. Writes storyboard.md.
It never generates anything."""
import json, os, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sb = json.load(open(sys.argv[1]))
root = os.path.dirname(os.path.abspath(sys.argv[1]))
rows, total, unknown, sources, missing = [], 0.0, 0, set(), []
for n, s in enumerate(sb['shots'], 1):
    a = s.get('asset', {'kind': 'code'})
    kind = a.get('kind', 'code')
    cost = '0'
    if kind in ('user_photo', 'user_clip'):
        p = a.get('path', '')
        if not os.path.exists(os.path.join(root, p)) and not os.path.exists(p):
            missing.append(p)
        what = f"your {'photo' if kind == 'user_photo' else 'clip'}: {os.path.basename(p)}"
    elif kind == 'generate':
        frm = a.get('from')
        what = (f"Higgsfield {a.get('model', 'seedance-2.0')} clip "
                + (f"from {os.path.basename(frm)}" if frm else 'from text') + f", {a.get('duration', 5)} s, "
                f"{a.get('resolution', '720p')}. Prompt: \"{a.get('prompt', '')}\"")
        cmd = [sys.executable, os.path.join(HERE, 'higgsfield.py'), 'estimate', '--model', a.get('model', 'seedance-2.0'),
               '--duration', str(a.get('duration', 5)), '--resolution', a.get('resolution', '720p'),
               '--prompt', a.get('prompt', '')]
        if not frm:
            cmd.append('--text')
        r = subprocess.run(cmd, capture_output=True, text=True, cwd=root)
        try:
            est = json.loads(r.stdout.strip().splitlines()[-1])
        except Exception:
            est = {'credits': None, 'source': (r.stderr or r.stdout)[-200:]}
        sources.add(est['source'])
        if est['credits'] is None:
            cost, unknown = '?', unknown + 1
        else:
            cost = f"{est['credits']:g}"
            total += est['credits']
    else:
        what = 'code only (no media)'
    rows.append((n, s.get('time', ''), s.get('graphic', ''), what, cost))

gen = sum(1 for s in sb['shots'] if s.get('asset', {}).get('kind') == 'generate')
lines = [f"# Storyboard: {sb.get('title', 'untitled')}", '',
         f"{sb.get('format', '16:9')}, {sb.get('seconds', '?')} s. Nothing has been generated or spent yet.", '',
         '| Shot | Time (s) | What the graphic does | Asset | Credits |', '|---|---|---|---|---|']
lines += [f'| {n} | {t} | {g} | {w} | {c} |' for n, t, g, w, c in rows]
lines.append('')
if gen:
    tot = f'{total:g}' + (f' + {unknown} unknown' if unknown else '')
    lines.append(f"Total to generate {gen} clip{'s' if gen > 1 else ''}: about {tot} credits "
                 f"({'; '.join(sorted(sources))}). Failed jobs are not charged.")
    lines.append('')
    lines.append('Reply "yes" to generate. Anything else and I change the plan first.')
else:
    lines.append('No AI clips in this plan, so it costs 0 credits.')
if missing:
    lines.append('')
    lines.append('Missing files: ' + ', '.join(missing))
md = '\n'.join(lines)
open(os.path.join(root, 'storyboard.md'), 'w').write(md + '\n')
print(md)
