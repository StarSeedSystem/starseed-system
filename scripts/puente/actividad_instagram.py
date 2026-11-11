# -*- coding: utf-8 -*-
"""Actividad de Instagram SOLO desde la exportación oficial «Descargar tu información».
Lee saved_posts.json y saved_collections.json sueltos o dentro del zip oficial
instagram-<usuario>-<fecha>-<id>.zip en ~/.starseed/actividad/entrada/instagram/ o
~/Downloads/. Nunca abre instagram.com, ni usa la sesión de Alex, ni borra zips.
Fichas privadas con enlace, autor y fecha; incremental por enlace."""
from __future__ import annotations
import fcntl, json, os, re, zipfile
from datetime import datetime, timezone
from pathlib import Path
URL_RE = re.compile(r"https?://[^\s\"'<>]+")
ZIP_RE = re.compile(r"^instagram-.+-\d{4}-\d{2}-\d{2}-.+\.zip$", re.I)
DIRECTORIOS = (os.path.expanduser("~/.starseed/actividad/entrada/instagram"), os.path.expanduser("~/Downloads"))
def _pares(obj):
    if isinstance(obj, dict):
        for k, v in obj.items():
            if str(k).lower() == "label_values" and isinstance(v, list):
                for p in v:
                    if isinstance(p, dict) and isinstance(p.get("value"), str): yield str(p.get("label", "")).lower(), p["value"]
            elif isinstance(v, (str, int, float)) and not isinstance(v, bool): yield str(k).lower(), v
            else: yield from _pares(v)
    elif isinstance(obj, list):
        for v in obj: yield from _pares(v)
def _urls(e):
    urls = [u.rstrip(").,;") for _, valor in _pares(e) if isinstance(valor, str) for u in URL_RE.findall(valor)]
    return list(dict.fromkeys(urls))
def _fecha(e):
    for clave, valor in _pares(e):
        if clave != "timestamp": continue
        try: seg = float(valor)
        except (TypeError, ValueError): continue
        if seg > 1e12: seg /= 1000.0
        if seg > 0: return datetime.fromtimestamp(seg, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    et = dict(_pares(e))
    for clave in ("saved on", "guardado el", "date", "fecha", "timestamp"):
        valor = et.get(clave)
        if isinstance(valor, str) and valor.strip(): return valor.strip()
    return ""
def _autor(e):
    et = dict(_pares(e))
    for clave in ("owner", "username", "autor", "author", "user"):
        valor = et.get(clave)
        if isinstance(valor, str) and valor.strip(): return valor.strip()
    titulo = e.get("title") if isinstance(e, dict) else None
    return titulo.strip() if isinstance(titulo, str) and "http" not in titulo and titulo.strip() else str(et.get("name", "")).strip()
def es_zip_oficial(nombre): return bool(ZIP_RE.match(os.path.basename(str(nombre))))
def _ficha(e, coleccion=None):
    if not isinstance(e, dict): return None
    urls = _urls(e)
    if not urls: return None
    autor = _autor(e); titulo = e.get("title") or dict(_pares(e)).get("title")
    f = {"fuente": "instagram", "enlace": urls[0], "autor": autor, "fecha": _fecha(e), "privado": True}
    if isinstance(titulo, str) and titulo.strip() and titulo.strip() != autor: f["titulo"] = titulo.strip()
    if coleccion: f["coleccion"] = str(coleccion)
    return f
def _lista(datos, *claves):
    return next(([x for x in datos[clave] if isinstance(x, dict)] for clave in claves if isinstance(datos, dict) and isinstance(datos.get(clave), list)), [])
def leer_saved_posts(datos): return [f for f in map(_ficha, _lista(datos, "saved_saved_media", "saved_media", "saved_posts")) if f]
def _de_coleccion(col):
    anidadas = next((col[c] for c in ("media", "saved_saved_media", "items", "posts") if isinstance(col.get(c), list)), None)
    if anidadas is None: return [f for f in [_ficha(col)] if f]
    return [f for f in (_ficha(x, col.get("name") or col.get("title")) for x in anidadas) if f]
def leer_saved_collections(datos): return [f for col in _lista(datos, "saved_collections") for f in _de_coleccion(col)]
def deduplicar(fichas):
    vistos, salida = set(), []
    for f in fichas:
        if f.get("enlace") and f["enlace"] not in vistos: vistos.add(f["enlace"]); salida.append(f)
    return salida
def leer_exportacion(archivos):
    pares = list(archivos.items()) if isinstance(archivos, dict) else list(archivos)
    fichas = []
    for nombre, datos in pares:
        if str(nombre).lower().endswith("saved_posts.json"): fichas += leer_saved_posts(datos)
        elif str(nombre).lower().endswith("saved_collections.json"): fichas += leer_saved_collections(datos)
    return deduplicar(fichas)
def _leer_json(ruta):
    try: return json.loads(Path(ruta).read_text(encoding="utf-8"))
    except (OSError, ValueError): return None
def _de_zip(ruta):
    try:
        with zipfile.ZipFile(ruta) as z:
            return [(n, json.loads(z.read(n))) for n in z.namelist() if n.lower().endswith(("saved_posts.json", "saved_collections.json"))]
    except (zipfile.BadZipFile, OSError, ValueError): return []
def recoger_exportaciones(directorios=None):
    pares = []
    for directorio in directorios or DIRECTORIOS:
        raiz = Path(directorio).expanduser()
        if not raiz.is_dir(): continue
        for nombre in ("saved_posts.json", "saved_collections.json"):
            pares += [(str(r), d) for r in raiz.rglob(nombre) if r.is_file() for d in [_leer_json(r)] if d is not None]
        pares += [p for r in sorted(raiz.glob("*.zip")) if es_zip_oficial(r.name) for p in _de_zip(r)]
    return pares
def _escribir(ruta, datos):
    ruta = Path(ruta); ruta.parent.mkdir(parents=True, exist_ok=True)
    ruta.with_name(ruta.name + ".tmp").write_text(json.dumps(datos, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(ruta.with_name(ruta.name + ".tmp"), ruta)
def _cerrojo(base):
    ruta = base / "instagram" / "cerrojo"; ruta.parent.mkdir(parents=True, exist_ok=True)
    f = open(ruta, "w"); fcntl.flock(f, fcntl.LOCK_EX | fcntl.LOCK_NB)
    return f
def ejecutar(directorios=None, base=None, ahora=None, escribir=True):
    base = Path(base or os.path.expanduser("~/.starseed/actividad"))
    try: cerrojo = _cerrojo(base)
    except OSError: return {"ok": False, "motivo": "otra pasada en curso", "fichas": [], "nuevas": 0}
    pares = recoger_exportaciones(directorios)
    if not pares: cerrojo.close(); return {"ok": False, "motivo": "sin exportación oficial de Instagram", "fichas": [], "nuevas": 0}
    fichas = leer_exportacion(pares); indice = _leer_json(base / "instagram" / "indice.json") or {}
    vistos = {str(x) for x in indice.get("enlaces", []) if x}
    nuevas = deduplicar([f for f in fichas if f["enlace"] not in vistos])
    if escribir and nuevas:
        dia = datetime.now(timezone.utc).strftime("%Y-%m-%d") if ahora is None else ahora.strftime("%Y-%m-%d") if hasattr(ahora, "strftime") else str(ahora)
        destino = base / "fichas" / f"{dia}-instagram.json"; previas = _leer_json(destino)
        _escribir(destino, deduplicar((previas if isinstance(previas, list) else []) + nuevas))
        _escribir(base / "instagram" / "indice.json", {"enlaces": sorted(vistos | {f["enlace"] for f in nuevas})})
    cerrojo.close()
    return {"ok": True, "fichas": nuevas, "nuevas": len(nuevas), "total": len(fichas), "archivos": len(pares)}
if __name__ == "__main__": print(json.dumps(ejecutar(), ensure_ascii=False, indent=2))
