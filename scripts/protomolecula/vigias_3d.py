#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Vigías de la Biblioteca 3D (AV1011G) — una vez al día."""
from __future__ import annotations
import json, sys, time, urllib.request, re
from pathlib import Path
RAIZ = Path(__file__).resolve().parents[2]
ESTADO_DIR = RAIZ / "starseed_memory_root" / "olas"
ESTADO_FILE = ESTADO_DIR / "vigia-3d-estado.json"
sys.path.insert(0, str(RAIZ / "scripts" / "puente"))
try: import puente as _puente
except Exception: _puente = None

def _get(url, cab=None, pl=20):
    req = urllib.request.Request(url, headers={"User-Agent":"starseed-vigias-3d/1.0",**(cab or {})})
    try:
        with urllib.request.urlopen(req, timeout=pl) as r:
            c = {k.lower():v for k,v in r.headers.items()}; c["x-url-final"]=r.geturl()
            return r.status, c, r.read().decode("utf-8","replace")
    except urllib.error.HTTPError as e: return e.code, {k.lower():v for k,v in (e.headers or {}).items()}, ""
    except Exception: return 0, {}, ""

def cargar() -> dict:
    try: return json.load(open(ESTADO_FILE,"r",encoding="utf-8"))
    except Exception: return {}

def guardar(s: dict):
    ESTADO_DIR.mkdir(parents=True, exist_ok=True)
    json.dump(s, open(ESTADO_FILE,"w",encoding="utf-8"), ensure_ascii=False, indent=2)

def avisar(t: str):
    if _puente:
        try: _puente.decir(t, quien="vigia-3d", tipo="aviso", tarea="AV1011G")
        except Exception: pass
    print("[vigia-3d] AVISO: %s" % t)

def cola(id_c: str, d: dict) -> Path:
    ruta = ESTADO_DIR / ("cola-vigia-3d-%s-%s.json" % (id_c, time.strftime("%Y%m%d")))
    ESTADO_DIR.mkdir(parents=True, exist_ok=True)
    open(ruta,"w",encoding="utf-8").write(json.dumps(d, ensure_ascii=False, indent=2)+"\n")
    return ruta

def gh_unimate() -> dict:
    st, _, c = _get("https://api.github.com/repos/Friedrich-M/UniMate/contents/README.md")
    texto = ""
    if st == 200:
        try:
            meta = json.loads(c) if c else {}
            if isinstance(meta, dict) and "content" in meta: texto = __import__("base64").b64decode(meta["content"]).decode("utf-8","replace")
        except Exception: pass
    else:
        _, _, texto = _get("https://raw.githubusercontent.com/Friedrich-M/UniMate/main/README.md")
    todo = "[TODO] Training and inference code will be released" in texto
    st2, _, ct = _get("https://api.github.com/repos/Friedrich-M/UniMate/contents/")
    infer = False
    if st2 == 200:
        try:
            for it in (json.loads(ct) if ct else []):
                if any(x in it.get("name","").lower() for x in ("inference","demo","infer")) and it.get("type") == "file":
                    infer = True; break
        except Exception: pass
    return {"tiene_inferencia":infer, "readme_todo":todo, "respuesta_api":st}

def hf_unimate() -> dict:
    st, _, c = _get("https://huggingface.co/api/models/Linzhan/UniMate")
    lic = None; decl = False
    if st == 200:
        try:
            d = json.loads(c); lic = d.get("license"); decl = bool(lic) and lic != "NOASSERTION"
        except Exception: pass
    return {"licencia_declarada":decl, "licencia_valor":lic, "respuesta_api":st}

def arxiv(code: str, url: str) -> dict:
    st, _, c = _get(url)
    cod = False
    if st == 200:
        for e in re.findall(r'href=["\'](https?://[^"\']+)["\']', c):
            if "github.com" in e or "gitlab" in e or "code" in e.lower(): cod = True; break
    return {"tiene_codigo":cod, "respuesta_api":st}

def main() -> int:
    s = cargar(); cambios = []; hoy = time.strftime("%Y-%m-%d")
    gh = gh_unimate(); prev = s.get("unimate_github",{})
    if gh["tiene_inferencia"] and not prev.get("tiene_inferencia", False): cambios.append(("unimate_github","inferencia publicada",gh))
    elif not gh["readme_todo"] and prev.get("readme_todo", True): cambios.append(("unimate_github","README TODO eliminado",gh))
    s["unimate_github"] = {**gh, "fecha":hoy}
    hf = hf_unimate(); prev = s.get("unimate_hf",{})
    if hf["licencia_declarada"] and not prev.get("licencia_declarada", False): cambios.append(("unimate_hf","licencia declarada: %s"%(hf["licencia_valor"] or "desconocida"),hf))
    s["unimate_hf"] = {**hf, "fecha":hoy}
    f3 = arxiv("filigree3d","https://export.arxiv.org/abs/2609.34900"); prev = s.get("filigree3d",{})
    if f3["tiene_codigo"] and not prev.get("tiene_codigo", False): cambios.append(("filigree3d","enlace a código detectado",f3))
    s["filigree3d"] = {**f3, "fecha":hoy}
    b3 = arxiv("btc3d","https://export.arxiv.org/abs/2609.39709"); prev = s.get("btc3d",{})
    if b3["tiene_codigo"] and not prev.get("tiene_codigo", False): cambios.append(("btc3d","enlace a código detectado",b3))
    s["btc3d"] = {**b3, "fecha":hoy}
    s["ultima_ejecucion"] = time.strftime("%Y-%m-%dT%H:%M:%SZ"); guardar(s)
    for clave, razon, datos in cambios:
        msg = "AV1011G · %s: %s (respuesta API: %s)" % (clave, razon, datos.get("respuesta_api","—"))
        avisar(msg)
        cola("%s-%s"%(clave,hoy), {"ola":"cola-vigia-3d-av1011g","tareas":[{"id":"AV1011G-%s"%clave,"ola":"Ola 1011C · Vigías 3D","titulo":"Instalar servicio local y escribir adaptador para %s"%clave,"archivos":["scripts/protomolecula/vigias_3d.py","scripts/protomolecula/test_vigias_3d.py"],"depende":[],"prompt":msg+". Adaptador nivel vivo (§8 contrato).","aprobacion":False,"modelo":"vigia-3d"}],"fecha":hoy,"cambio":{"clave":clave,"razon":razon,"datos":datos}})
        avisar("Cola creada para %s" % clave)
    return 0

if __name__ == "__main__": sys.exit(main())
