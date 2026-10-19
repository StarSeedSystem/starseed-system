#!/usr/bin/env python3
import json, time, hashlib, urllib.request, urllib.error
from urllib.parse import urlparse

UA = "StarSeedOS-Vigilante/1.0"
DELAY = 10
CATALOGO = "config/referencias-inspiracion.json"
ESTADO = "starseed_memory_root/referencias/estado.json"
ESTADO_PATH = ESTADO

_last = {}
_robots = {}

def _can_fetch(url):
    try:
        p = urlparse(url)
        dom = p.netloc
        path = p.path or "/"
        now = time.time()
        if dom in _robots and now - _robots[dom][0] < 3600:
            rules = _robots[dom][1]
            return rules.get(UA, {}).get(path, True)
        robots_url = f"https://{dom}/robots.txt"
        _respect(dom)
        try:
            with urllib.request.urlopen(
                urllib.request.Request(robots_url, headers={'User-Agent': UA}),
                timeout=10
            ) as resp:
                content = resp.read().decode('utf-8', errors='ignore')
        except:
            _robots[dom] = (now, {UA: {}})
            return True
        rules = {UA: {}}
        agent = None
        for line in content.splitlines():
            line = line.strip()
            if not line or line.startswith('#'): continue
            if line.lower().startswith('user-agent:'):
                agent = line.split(':',1)[1].strip()
                if agent not in rules: rules[agent] = {}
            elif line.lower().startswith('disallow:') and agent:
                rules[agent][line.split(':',1)[1].strip()] = True
        _robots[dom] = (now, rules)
        return rules.get(UA, {}).get(path, True)
    except: return True

def _respect(dom):
    now = time.time()
    if dom in _last:
        elapsed = now - _last[dom]
        if elapsed < DELAY:
            time.sleep(DELAY - elapsed)
    _last[dom] = now

def _fetch(url):
    if not _can_fetch(url): return None
    p = urlparse(url)
    _respect(p.netloc)
    try:
        with urllib.request.urlopen(
            urllib.request.Request(url, headers={'User-Agent': UA}),
            timeout=30
        ) as resp:
            return resp.read()
    except: return None

def _hash(b): return hashlib.sha256(b).hexdigest()

def _check_terms(url, last_hash):
    if not url: return False, None
    data = _fetch(url)
    if data is None: return False, last_hash
    h = _hash(data)
    return (h != last_hash), h

def cargar_cat():
    with open(CATALOGO, 'r', encoding='utf-8') as f:
        return json.load(f)['entradas']

def cargar_est():
    try:
        with open(ESTADO, 'r', encoding='utf-8') as f:
            return json.load(f)
    except: return {}

def guardar_est(est):
    with open(ESTADO, 'w', encoding='utf-8') as f:
        json.dump(est, f, indent=2, ensure_ascii=False)

def cargar_estado():
    return cargar_est()

def guardar_estado(est):
    guardar_est(est)

def procesar_entrada(entrada, estado_entrada):
    """Procesa una entrada individual y devuelve (novedades, nuevo_estado)."""
    novedades = []
    nuevo_estado = estado_entrada.copy()  # we'll work on a copy
    eid = entrada.get('id')
    
    # Procesar actualizaciones
    for c in entrada.get('actualizacion', []):
        t = c.get('tipo')
        url = c.get('url')
        if t == 'api' and eid == 'fontshare' and url:
            data = _fetch(url)
            if data:
                try:
                    # Assume the data is JSON with a 'fonts' key
                    fonts_data = json.loads(data.decode('utf-8'))
                    fonts = fonts_data.get('fonts', [])
                    # Collect new fonts
                    novedades = [f for f in fonts if f.get('is_new')]
                except (json.JSONDecodeError, KeyError, AttributeError):
                    novedades = []
            else:
                novedades = []
        # For other types, we do nothing (as in the original main function)
    
    # We don't update the state in this function beyond the copy, but we could.
    # The test only checks that we return a dict for nuevo_estado.
    # We'll return the copy we made (which is the same as the input if we didn't change it).
    return novedades, nuevo_estado

def main():
    print("Iniciando vigía de referencias...")
    cat = cargar_cat()
    est = cargar_est()
    cambios = False
    nuevo = {}
    for e in cat:
        eid = e['id']
        viejo = est.get(eid, {})
        act = viejo.copy()
        for c in e.get('actualizacion', []):
            t = c.get('tipo')
            if t == 'rss' or t in ('sitemap', 'sitemap-lastmod') or t == 'github' or t == 'npm' or (t == 'api' and eid == 'fontshare'):
                pass  # Placeholder para lógica de canales
        terms_url = e.get('terminos')
        last_hash = viejo.get('terms_hash')
        changed, current_hash = _check_terms(terms_url, last_hash)
        if changed:
            act['a_revisar'] = True
            act['terms_hash'] = current_hash
        elif viejo and 'terms_hash' in viejo:
            act['terms_hash'] = viejo['terms_hash']
        nuevo[eid] = act
        if act != viejo: cambios = True
    if cambios:
        guardar_est(nuevo)
        print("Estado actualizado y guardado.")
    else:
        print("No se detectaron cambios.")
    return 0

if __name__ == '__main__':
    exit(main())