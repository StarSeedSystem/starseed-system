"""higgsfield.py: talk to the Higgsfield API for Media mode. Standard library only.

Your key never goes in chat. Put it in your shell (export HIGGSFIELD_API_KEY=...) or in a file
called .env in your project folder:  HIGGSFIELD_API_KEY=your_key_id:your_key_secret
Get one at https://console.higgsfield.ai . This script never prints it.

usage:
  python3 scripts/higgsfield.py check                         is a key set? (prints yes/no only)
  python3 scripts/higgsfield.py estimate --model seedance-2.0 --duration 5 --resolution 720p [--text]
  python3 scripts/higgsfield.py generate --model seedance-2.0 --image photo.jpg --prompt "..." \\
          --duration 5 --resolution 720p --out media/shot2.mp4 --yes
'generate' SPENDS CREDITS. It refuses to run without --yes. Only pass --yes after the person said yes
to the storyboard and its cost.
Base URL: HIGGSFIELD_API_BASE (default https://platform.higgsfield.ai; the docs also show https://api.higgsfield.ai)."""
import argparse, json, mimetypes, os, shutil, subprocess, sys, time, uuid, urllib.request, urllib.error

BASE = os.environ.get('HIGGSFIELD_API_BASE', 'https://platform.higgsfield.ai').rstrip('/')
MODELS = {
    # name: image-to-video endpoint, text-to-video endpoint, CLI job type (for free price checks), limits
    'seedance-2.0': {'i2v': 'bytedance/seedance-2.0/image-to-video', 't2v': 'bytedance/seedance-2.0/text-to-video',
                     'cli': 'seedance_2_0', 'dur': (4, 15), 'res': ['480p', '720p', '1080p', '4k'], 'audio': True,
                     'end_image': True},
    'seedance-2.5': {'i2v': 'bytedance/seedance-2.5/image-to-video', 't2v': 'bytedance/seedance-2.5/text-to-video',
                     'cli': 'seedance_2_5', 'dur': (4, 30), 'res': ['480p', '720p', '1080p'], 'audio': True,
                     'end_image': True},
    'kling-3-turbo': {'i2v': 'kling-video/v3.0-turbo/image-to-video', 't2v': None, 'cli': 'kling3_0_turbo',
                      'dur': (3, 15), 'res': ['720p', '1080p'], 'audio': False, 'end_image': False},
}


def load_key():
    k = os.environ.get('HIGGSFIELD_API_KEY')
    if not k and os.environ.get('HF_API_KEY_ID') and os.environ.get('HF_API_KEY_SECRET'):
        k = os.environ['HF_API_KEY_ID'] + ':' + os.environ['HF_API_KEY_SECRET']
    if not k:
        for d in (os.getcwd(), os.path.dirname(os.getcwd())):
            p = os.path.join(d, '.env')
            if os.path.exists(p):
                for line in open(p):
                    if line.strip().startswith('HIGGSFIELD_API_KEY='):
                        k = line.split('=', 1)[1].strip().strip('"').strip("'")
    return k or None


def call(method, url, body=None, key=None, headers=None, raw=None):
    h = {'Content-Type': 'application/json'}
    if key:
        h['Authorization'] = 'Key ' + key
    h.update(headers or {})
    data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
    req = urllib.request.Request(url, data=data, method=method, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            txt = r.read().decode() or '{}'
            return r.status, (json.loads(txt) if txt.strip().startswith(('{', '[')) else {})
    except urllib.error.HTTPError as e:
        txt = e.read().decode(errors='replace')
        try:
            return e.code, json.loads(txt)
        except Exception:
            return e.code, {'detail': txt[:300]}


def payload(m, a, image_url=None, end_url=None):
    body = {'duration': int(a.duration), 'resolution': a.resolution}
    if a.prompt:
        body['prompt'] = a.prompt
    if image_url:
        body['image_url'] = image_url
    if end_url and MODELS[m]['end_image']:
        body['end_image_url'] = end_url
    if MODELS[m]['audio']:
        body['generate_audio'] = False      # sound is added in the edit, not baked into each clip
    if not image_url and getattr(a, 'aspect', None):
        body['aspect_ratio'] = a.aspect
    return body


def endpoint(m, text):
    ep = MODELS[m]['t2v' if text else 'i2v']
    if not ep:
        sys.exit(f'{m} has no text-to-video. Use seedance-2.0 for clips without a photo.')
    return ep


def estimate(m, a, key):
    """Return (credits or None, where the number came from). Never spends anything."""
    text = getattr(a, 'text', False)
    if key:
        body = payload(m, a, None if text else 'https://example.com/placeholder.jpg')
        code, r = call('POST', f'{BASE}/estimate/{endpoint(m, text)}', body, key)
        if code == 200 and 'credits' in r:
            return float(r['credits']), 'Higgsfield API estimate'
        if code == 401:
            return None, 'key was rejected (401). Check it in https://console.higgsfield.ai'
    if shutil.which('higgsfield'):
        # the Higgsfield CLI can also price a job for free; we send no images, only the settings
        cmd = ['higgsfield', 'generate', 'cost', MODELS[m]['cli'], '--prompt', a.prompt or 'camera move',
               '--duration', str(a.duration), '--resolution', a.resolution, '--json']
        r = subprocess.run(cmd, capture_output=True, text=True, stdin=subprocess.DEVNULL, timeout=60)
        try:
            return float(json.loads(r.stdout)['credits']), 'Higgsfield CLI price check'
        except Exception:
            pass
    return None, 'unknown until a key is set'


def upload(path, key):
    ctype = mimetypes.guess_type(path)[0] or 'image/jpeg'
    code, r = call('POST', f'{BASE}/files/generate-upload-url', {'content_type': ctype}, key)
    if code != 200:
        sys.exit(f'upload url failed ({code}): {r.get("detail")}')
    hdrs = dict(r.get('upload_headers') or {'Content-Type': ctype})
    req = urllib.request.Request(r['upload_url'], data=open(path, 'rb').read(), method='PUT', headers=hdrs)
    with urllib.request.urlopen(req, timeout=300):
        pass
    return r['public_url']


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('cmd', choices=['check', 'estimate', 'generate'])
    ap.add_argument('--model', default='seedance-2.0', choices=sorted(MODELS))
    ap.add_argument('--image')
    ap.add_argument('--end-image')
    ap.add_argument('--prompt', default='')
    ap.add_argument('--duration', type=int, default=5)
    ap.add_argument('--resolution', default='720p')
    ap.add_argument('--aspect', default='16:9')
    ap.add_argument('--text', action='store_true', help='text to video (no photo)')
    ap.add_argument('--out')
    ap.add_argument('--yes', action='store_true', help='I have approval to spend credits')
    a = ap.parse_args()
    key = load_key()
    if a.cmd == 'check':
        print('key: yes (hidden)' if key else 'key: no. Add HIGGSFIELD_API_KEY to your shell or a .env file. Never paste it in chat.')
        return
    m = a.model
    lo, hi = MODELS[m]['dur']
    if not lo <= a.duration <= hi or a.resolution not in MODELS[m]['res']:
        sys.exit(f'{m} takes {lo} to {hi} s and {", ".join(MODELS[m]["res"])}.')
    if a.cmd == 'estimate':
        c, src = estimate(m, a, key)
        print(json.dumps({'model': m, 'duration': a.duration, 'resolution': a.resolution,
                          'credits': c, 'source': src}))
        return
    # generate: spends credits
    if not a.yes:
        sys.exit('Not generating: this spends credits. Show the storyboard and cost, get a yes, then add --yes.')
    if not key:
        sys.exit('No key. Add HIGGSFIELD_API_KEY to your shell or a .env file (never in chat).')
    if not a.out:
        sys.exit('Need --out path/for/clip.mp4')
    text = a.text or not a.image
    image_url = None if text else upload(a.image, key)
    end_url = upload(a.end_image, key) if a.end_image else None
    body = payload(m, a, image_url, end_url)
    code, r = call('POST', f'{BASE}/{endpoint(m, text)}', body, key, {'Idempotency-Key': str(uuid.uuid4())})
    if code not in (200, 201, 202) or 'status_url' not in r:
        sys.exit(f'submit failed ({code}): {r.get("detail", r)}')
    print(f'submitted, request {r["request_id"]}. Waiting (usually 1 to 4 minutes)...', flush=True)
    delay, t0 = 2.0, time.time()
    while True:
        code, s = call('GET', r['status_url'], None, key)
        if code == 200 and s.get('status') in ('completed', 'failed', 'nsfw', 'canceled'):
            break
        if code in (401, 404):
            sys.exit(f'status check failed ({code}): {s.get("detail")}')
        if time.time() - t0 > 1200:
            sys.exit(f'still running after 20 minutes. Request id: {r["request_id"]}')
        time.sleep(delay)
        delay = min(delay * 1.5, 10.0)
    if s['status'] != 'completed':
        sys.exit(f'generation {s["status"]}: {s.get("error") or ""} (failed jobs are not charged)')
    url = (s.get('video') or {}).get('url')
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    urllib.request.urlretrieve(url, a.out)
    print(f'saved {a.out}')


if __name__ == '__main__':
    main()
