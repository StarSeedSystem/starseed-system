"""loop_check.py: hack 4. Proves a loop is seamless.

usage: python3 scripts/loop_check.py <video.mp4> [--project <dir>]

Test A (with --project): renders the frame at t = 0 and the frame at t = end with HyperFrames
  and compares them pixel by pixel. They must be the same picture.
Test B (always): compares the last frame of the video with the first. That jump must be no bigger
  than a normal step between two frames, so the seam is invisible when the video repeats.
Exit code 0 = pass, 1 = fail."""
import argparse, os, re, shutil, subprocess, sys, tempfile, statistics
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _media import probe, gray_frames, diff_stats

ap = argparse.ArgumentParser()
ap.add_argument('video')
ap.add_argument('--project')
a = ap.parse_args()
ok = True

if a.project:
    html = open(os.path.join(a.project, 'index.html')).read()
    D = float(re.search(r'data-duration="([\d.]+)"', html).group(1))
    tmp = tempfile.mkdtemp()
    # test a copy with the one-clock wrap switched off, so the frame at the end is really drawn at t = end
    proj = os.path.join(tmp, 'proj')
    shutil.copytree(a.project, proj, ignore=shutil.ignore_patterns('*.mp4', 'stills', '.hyperframes', 'out'))
    page = open(os.path.join(proj, 'index.html')).read()
    page = page.replace('<head>', '<head>\n<script>window.STUDIO_NO_WRAP = true;</script>', 1)
    open(os.path.join(proj, 'index.html'), 'w').write(page)
    hf = ['npx', '--yes', 'hyperframes@' + os.environ.get('HF_VERSION', '0.8.181')]
    subprocess.run(hf + ['snapshot', proj, '--at', f'0,{D}', '--no-end', '-o', tmp],
                   check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    pngs = sorted(f for f in os.listdir(tmp) if f.startswith('frame') and f.endswith('.png'))
    if len(pngs) < 2:
        print('FAIL could not grab both end frames:', pngs); sys.exit(1)
    first, last = os.path.join(tmp, pngs[0]), os.path.join(tmp, pngs[-1])
    fa, w, h = gray_frames(first, None, 640)
    fb, _, _ = gray_frames(last, None, 640)
    mean, moved = diff_stats(fa[0], fb[0], 8)
    same = moved < 0.0005
    ok &= same
    print(f"A. frame at 0 s vs frame at {D} s: {moved * 100:.3f}% of pixels differ "
          f"(mean {mean:.2f} levels) -> {'PASS, same picture' if same else 'FAIL, the loop does not close'}")

info = probe(a.video)
frames, w, h = gray_frames(a.video, None, 320)
steps = [diff_stats(frames[i - 1], frames[i])[0] for i in range(1, len(frames))]
seam = diff_stats(frames[-1], frames[0])[0]
typical = statistics.median(steps) if steps else 0
p90 = sorted(steps)[int(0.9 * (len(steps) - 1))] if steps else 0
limit = max(2.5 * typical, p90, 0.6)
seam_ok = seam <= limit
ok &= seam_ok
print(f"B. seam jump (last frame to first) {seam:.2f} levels; normal step {typical:.2f}, "
      f"limit {limit:.2f} -> {'PASS, seamless' if seam_ok else 'FAIL, you will see a jump when it repeats'}")
print('PASS' if ok else 'FAIL')
sys.exit(0 if ok else 1)
