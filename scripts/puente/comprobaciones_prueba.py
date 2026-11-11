#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Comprobaciones en aparatos de cada versión de prueba (VER1111F · contrato centro-versiones-1105.md §10.3).

Un solo archivo, `~/.starseed/produccion/pruebas-comprobaciones.json`, lo usan este comando (los directores, desde
la terminal) y el panel «Versiones de prueba» de Genesis (Alex, con un toque). Formato:

  {"formato": 1, "pruebas": {"36": {
      "version": "0.5.1-prueba.36", "sha": "<40>",
      "comprobaciones": [{"id": "c1", "texto": "…", "aparato": "Mac", "estado": "pendiente|bien|falla",
                          "nota": "", "quien": "", "t": "<ISO>"}],
      "aprobacion": null | {"t", "version", "sha", "lanzar_sha", "quien", "comprobaciones": {…}}}}}

Uso:
  comprobaciones_prueba.py registrar 36 --aparato Mac --sha a8051ea953… "Tres llamadas por Bluetooth" "…"
  comprobaciones_prueba.py marcar 36 c2 falla --nota "video negro" --quien director
  comprobaciones_prueba.py ver [36]

La prueba se nombra por su número: «36», «prueba36», «prueba.36» y «0.5.1-prueba.36» valen lo mismo.
`STARSEED_PRODUCCION_DIR` cambia la carpeta (las pruebas usan una temporal). Nunca aprueba: eso solo lo hace Alex
en la Genesis local.
"""
import argparse
import datetime
import json
import os
import re
import sys

ESTADOS = ("pendiente", "bien", "falla")
NOMBRE = "pruebas-comprobaciones.json"
_NUM = re.compile(r"^(?:v?\d+\.\d+\.\d+-)?(?:prueba\.?)?(\d{1,5})$")


def carpeta():
    return os.environ.get("STARSEED_PRODUCCION_DIR") or os.path.expanduser("~/.starseed/produccion")


def ruta_archivo():
    return os.path.join(carpeta(), NOMBRE)


def numero_de_prueba(texto):
    """PURA: '0.5.1-prueba.36' | 'prueba36' | 'prueba.36' | '36' → 36 (None si no es una prueba)."""
    m = _NUM.match(str(texto or "").strip().lower())
    return int(m.group(1)) if m else None


def normalizar(datos):
    """PURA: lo leído del disco → archivo válido (lo que no encaja se descarta, nunca rompe)."""
    fuera = {"formato": 1, "pruebas": {}}
    pruebas = (datos or {}).get("pruebas") if isinstance(datos, dict) else None
    for clave, p in (pruebas or {}).items():
        n = numero_de_prueba(clave)
        if n is None or not isinstance(p, dict):
            continue
        lista = []
        for c in p.get("comprobaciones") or []:
            if not isinstance(c, dict) or not str(c.get("id") or "").strip() or not str(c.get("texto") or "").strip():
                continue
            lista.append({"id": str(c["id"])[:20], "texto": str(c["texto"])[:400],
                          "aparato": str(c.get("aparato") or "")[:40],
                          "estado": c.get("estado") if c.get("estado") in ESTADOS else "pendiente",
                          "nota": str(c.get("nota") or "")[:400], "quien": str(c.get("quien") or "")[:40],
                          "t": c.get("t") if isinstance(c.get("t"), str) else None})
        fuera["pruebas"][str(n)] = {"version": str(p.get("version") or ""), "sha": str(p.get("sha") or ""),
                                    "comprobaciones": lista,
                                    "aprobacion": p.get("aprobacion") if isinstance(p.get("aprobacion"), dict) else None}
    return fuera


def registrar(datos, prueba, textos, aparato="", version="", sha="", quien="director", t=None):
    """PURA: añade las comprobaciones (un texto repetido no se duplica) → (datos, ids nuevos)."""
    datos = normalizar(datos)
    n = numero_de_prueba(prueba)
    if n is None:
        raise ValueError("prueba no válida: %r" % prueba)
    p = datos["pruebas"].setdefault(str(n), {"version": "", "sha": "", "comprobaciones": [], "aprobacion": None})
    if version:
        p["version"] = version
    if sha:
        p["sha"] = sha.lower()
    hechos = {c["texto"].strip().lower() for c in p["comprobaciones"]}
    siguiente = 1 + max([int(c["id"][1:]) for c in p["comprobaciones"] if re.match(r"^c\d+$", c["id"])] or [0])
    nuevos = []
    for texto in textos:
        texto = (texto or "").strip()
        if not texto or texto.lower() in hechos:
            continue
        cid = "c%d" % siguiente
        siguiente += 1
        hechos.add(texto.lower())
        p["comprobaciones"].append({"id": cid, "texto": texto[:400], "aparato": aparato[:40], "estado": "pendiente",
                                    "nota": "", "quien": quien[:40], "t": t})
        nuevos.append(cid)
    return datos, nuevos


def marcar(datos, prueba, cid, estado, nota="", quien="director", t=None):
    """PURA: cambia el estado (y la nota) de una comprobación → datos. ValueError si no existe."""
    if estado not in ESTADOS:
        raise ValueError("estado no válido: %r (pendiente, bien o falla)" % estado)
    datos = normalizar(datos)
    n = numero_de_prueba(prueba)
    p = datos["pruebas"].get(str(n)) if n is not None else None
    c = next((c for c in (p or {}).get("comprobaciones", []) if c["id"] == cid), None)
    if not c:
        raise ValueError("no existe la comprobación %s de la prueba %s" % (cid, prueba))
    c.update(estado=estado, quien=quien[:40], t=t)
    if nota is not None:
        c["nota"] = nota[:400]
    return datos


def resumen(p):
    """PURA: {'total', 'bien', 'falla', 'pendiente'} de una prueba."""
    cs = (p or {}).get("comprobaciones") or []
    return {"total": len(cs), **{e: sum(1 for c in cs if c["estado"] == e) for e in ESTADOS}}


def leer(ruta=None):
    try:
        with open(ruta or ruta_archivo(), encoding="utf-8") as f:
            return normalizar(json.load(f))
    except (OSError, ValueError):
        return normalizar(None)


def escribir(datos, ruta=None):
    ruta = ruta or ruta_archivo()
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    tmp = "%s.tmp-%d" % (ruta, os.getpid())
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(datos, f, ensure_ascii=False, indent=2)
        f.write("\n")
    os.replace(tmp, ruta)


def _ahora():
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _texto_prueba(n, p):
    r = resumen(p)
    lineas = ["prueba.%s %s %s · %d de %d comprobaciones hechas (%d bien, %d falla)" % (
        n, p.get("version") or "", (p.get("sha") or "")[:10], r["bien"] + r["falla"], r["total"], r["bien"], r["falla"])]
    for c in p["comprobaciones"]:
        lineas.append("  %-4s %-9s %s%s%s" % (c["id"], c["estado"], ("[%s] " % c["aparato"]) if c["aparato"] else "",
                                              c["texto"], (" · " + c["nota"]) if c["nota"] else ""))
    if p.get("aprobacion"):
        lineas.append("  aprobada en Genesis el %s" % p["aprobacion"].get("t"))
    return "\n".join(lineas)


def main(argv=None):
    ap = argparse.ArgumentParser(description="Comprobaciones en aparatos de las versiones de prueba")
    sub = ap.add_subparsers(dest="orden", required=True)
    r = sub.add_parser("registrar", help="registrar las comprobaciones de una prueba")
    r.add_argument("prueba")
    r.add_argument("textos", nargs="+")
    r.add_argument("--aparato", default="")
    r.add_argument("--version", default="")
    r.add_argument("--sha", default="")
    r.add_argument("--quien", default="director")
    m = sub.add_parser("marcar", help="marcar el resultado de una comprobación")
    m.add_argument("prueba")
    m.add_argument("id")
    m.add_argument("estado", choices=ESTADOS)
    m.add_argument("--nota", default=None)
    m.add_argument("--quien", default="director")
    v = sub.add_parser("ver", help="ver las comprobaciones")
    v.add_argument("prueba", nargs="?")
    a = ap.parse_args(argv)
    datos = leer()
    try:
        if a.orden == "registrar":
            if a.sha and not re.match(r"^[0-9a-fA-F]{7,40}$", a.sha):
                raise ValueError("commit no válido: %r" % a.sha)
            datos, nuevos = registrar(datos, a.prueba, a.textos, a.aparato, a.version, a.sha, a.quien, _ahora())
            escribir(datos)
            print("registradas %d: %s" % (len(nuevos), ", ".join(nuevos) or "ninguna nueva"))
        elif a.orden == "marcar":
            datos = marcar(datos, a.prueba, a.id, a.estado, a.nota, a.quien, _ahora())
            escribir(datos)
            print("prueba.%s %s → %s" % (numero_de_prueba(a.prueba), a.id, a.estado))
        else:
            claves = [str(numero_de_prueba(a.prueba))] if a.prueba else sorted(datos["pruebas"], key=int)
            for n in claves:
                if n in datos["pruebas"]:
                    print(_texto_prueba(n, datos["pruebas"][n]))
    except ValueError as e:
        print("error: %s" % e, file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
