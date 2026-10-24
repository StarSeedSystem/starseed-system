"""Small helpers shared by the checks. Standard library only, plus ffmpeg on the PATH."""
import json, subprocess


def probe(path):
    out = subprocess.check_output(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries',
                                   'stream=width,height,r_frame_rate:format=duration', '-of', 'json', path])
    info = json.loads(out)
    s = info['streams'][0]
    num, den = s.get('r_frame_rate', '30/1').split('/')
    return {'w': s['width'], 'h': s['height'], 'dur': float(info.get('format', {}).get('duration', 0) or 0),
            'fps': float(num) / float(den or 1)}


def gray_frames(path, fps, width, start=None, frames=None):
    """Yield (w, h, bytes) gray frames. Each byte is one pixel, 0 to 255."""
    info = probe(path)
    h = int(round(width * info['h'] / info['w'] / 2) * 2)
    cmd = ['ffmpeg', '-v', 'error']
    if start is not None:
        cmd += ['-ss', str(start)]
    cmd += ['-i', path]
    vf = f'scale={width}:{h},format=gray' if fps is None else f'fps={fps},scale={width}:{h},format=gray'
    cmd += ['-vf', vf]
    if frames:
        cmd += ['-frames:v', str(frames)]
    cmd += ['-f', 'rawvideo', '-']
    raw = subprocess.check_output(cmd)
    n = width * h
    return [raw[i:i + n] for i in range(0, len(raw) - n + 1, n)], width, h


def diff_stats(a, b, thr=14):
    """Return (mean abs difference, share of pixels that moved more than thr levels)."""
    total = 0
    moved = 0
    for x, y in zip(a, b):
        d = x - y if x > y else y - x
        total += d
        if d > thr:
            moved += 1
    n = len(a) or 1
    return total / n, moved / n
