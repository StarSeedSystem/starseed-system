#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Vigía de proveedores gratis del Dream · cada 6 h (IMG-diaria).

`hermes model --refresh` + una petición por modelo `:free`; a los 3 fallos seguidos
marca `deprecated: true` en `modelos-gratuitos.md` y rota en `metodologia-ia.md` §2.

Cron: 17 */6 * * * python3 <repo>/scripts/puente/vigia_proveedores_gratis.py
Memoria: --catalogo starseed_memory_root/dream/modelos-gratuitos.md \
         --metodologia starseed_memory_root/metodologia-ia.md
"""
import argparse, json, os, re, subprocess, sys

RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ESTADO = os.path.expanduser("~/.starseed/vigia-gratuitos.json")
MAX_FALLOS = 2
_ID = re.compile(r"`([A-Za-z0-9][A-Za-z0-9_.-]*/[^`\s]+:free)`")

def modelos_de(texto):
    fuera, vistos = [], set()
    for linea in (texto or "").splitlines():
        m = _ID.search(linea)
        if m and m.group(1) not in vistos:
            vistos.add(m.group(1))
            proveedor, _, modelo = m.group(1).partition("/")
            fuera.append({"id": m.group(1), "proveedor": proveedor, "modelo": modelo,
                          "deprecado": "deprecated: true" in linea.lower()})
    return fuera

def decidir(anteriores, resultados):
    nuevo, deprecados = {}, set()
    for ident, ok in resultados.items():
        fallos = 0 if ok else int((anteriores.get(ident) or {}).get("fallos") or 0) + 1
        nuevo[ident] = {"fallos": fallos}
        if fallos > MAX_FALLOS:
            deprecados.add(ident)
    for ident, ent in (anteriores or {}).items():
        nuevo.setdefault(ident, ent)
    return nuevo, deprecados

def marcar(texto, deprecados):
    salida = []
    for linea in (texto or "").splitlines():
        m = _ID.search(linea)
        if m and m.group(1) in deprecados:
            linea = (re.sub(r"deprecated:\s*\w+", "deprecated: true", linea, flags=re.I)
                     if "deprecated:" in linea.lower() else linea.rstrip() + " · deprecated: true")
        salida.append(linea)
    return "\n".join(salida) + ("\n" if texto and texto.endswith("\n") else "")

def rotar(texto, deprecados):
    en, activo = False, None
    for linea in (texto or "").splitlines():
        if re.match(r"##\s*2\.", linea):
            en = True
        elif en and linea.strip().startswith("## "):
            en = False
        elif en and activo is None:
            m = _ID.search(linea)
            if m and m.group(1) not in deprecados:
                activo = m.group(1)
    fija = "> **Activo:** `%s`" % activo if activo else "> **Activo:** ninguno"
    if re.search(r"(?m)^> \*\*Activo:\*\*", texto or ""):
        return activo, re.sub(r"(?m)^> \*\*Activo:\*\*.*$", fija, texto)
    return (activo, (texto or "").rstrip() + "\n\n" + fija + "\n") if activo else (None, texto)

def _leer(ruta):
    try:
        with open(ruta, encoding="utf-8") as f:
            return f.read()
    except OSError:
        return ""

def _escribir(ruta, texto):
    os.makedirs(os.path.dirname(os.path.abspath(ruta)), exist_ok=True)
    with open(ruta, "w", encoding="utf-8") as f:
        f.write(texto)

def sondear(proveedor, modelo, timeout=60):
    try:
        r = subprocess.run(["hermes", "-z", "di ok", "-m", modelo, "--provider", proveedor,
                            "--safe-mode"], capture_output=True, text=True, timeout=timeout)
        return r.returncode == 0 and bool((r.stdout or "").strip())
    except Exception:
        return False

def pasada(catalogo, metodologia, estado, refrescar=True):
    if refrescar:
        try:
            subprocess.run(["hermes", "model", "--refresh"], capture_output=True, timeout=180)
        except Exception:
            pass
    texto = _leer(catalogo)
    modelos = modelos_de(texto)
    anteriores = json.loads(_leer(estado) or "{}")
    resultados = {m["id"]: sondear(m["proveedor"], m["modelo"])
                  for m in modelos if not m["deprecado"]}
    nuevo, deprecados = decidir(anteriores, resultados)
    _escribir(catalogo, marcar(texto, deprecados))
    _escribir(estado, json.dumps(nuevo, ensure_ascii=False, indent=1))
    activo, meta = rotar(_leer(metodologia) or texto, deprecados)
    if os.path.exists(metodologia):
        _escribir(metodologia, meta)
    vivos = sum(1 for v in resultados.values() if v)
    return "VIGÍA GRATIS · %d modelos · %d vivos · %d deprecados · activo %s" % (
        len(modelos), vivos, len(deprecados), activo or "ninguno")

def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--catalogo", default=os.path.join(RAIZ, "modelos-gratuitos.md"))
    ap.add_argument("--metodologia", default=os.path.join(RAIZ, "metodologia-ia.md"))
    ap.add_argument("--estado", default=ESTADO)
    a = ap.parse_args(argv)
    print(pasada(a.catalogo, a.metodologia, a.estado))
    return 0

if __name__ == "__main__":
    sys.exit(main())
