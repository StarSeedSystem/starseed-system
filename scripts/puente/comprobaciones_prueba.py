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
# PRB1111W · Señales: el vocabulario fijo con el que el banco de pruebas (banco_pruebas.py) propone «bien» o «falla»
# leyendo los registros de los aparatos. Una comprobación puede llevar una (`senal`); el banco NUNCA la marca.
SENALES = ("enlace-ble-hora", "voz-sin-corte", "llamada-ble", "video-sin-negro", "video-fps-ble", "video-sin-pausa-mudo",
           "video-pausa-ancho", "voz-limpia-lejos", "camara-abre", "camara-cambia", "camara-conserva", "arranque-limpio")
# Trozos del texto de las comprobaciones de 38 y 39 → señal (el primero que encaja; en minúsculas, sin tildes).
_SENAL_POR_TEXTO = (
    ("mismo wi-fi una hora", "enlace-ble-hora"),
    ("apagar el wi-fi de la tablet: la voz sigue", "voz-sin-corte"),
    ("wi-fi apagado desde antes", "llamada-ble"),
    ("llamar desde la tablet a la mac", "llamada-ble"),
    ("nunca se queda en negro", "video-sin-negro"),
    ("solo por bluetooth, 2 minutos", "video-fps-ble"),
    ("silenciar los dos microfonos", "video-sin-pausa-mudo"),
    ("video en pausa: la senal solo alcanza", "video-pausa-ancho"),
    ("alejando mas: la voz sigue limpia", "voz-limpia-lejos"),
    ("abre su propia camara", "camara-abre"),
    ("cambiar a la camara del iphone", "camara-cambia"),
    ("camara que no abre", "camara-conserva"),
    ("la app arranca y funciona normal", "arranque-limpio"),
)
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
            nueva = {"id": str(c["id"])[:20], "texto": str(c["texto"])[:400],
                     "aparato": str(c.get("aparato") or "")[:40],
                     "estado": c.get("estado") if c.get("estado") in ESTADOS else "pendiente",
                     "nota": str(c.get("nota") or "")[:400], "quien": str(c.get("quien") or "")[:40],
                     "t": c.get("t") if isinstance(c.get("t"), str) else None}
            # PRB1111W: campos opcionales; ausentes = null y no se escriben (el archivo de siempre no cambia).
            if c.get("senal") in SENALES:
                nueva["senal"] = c["senal"]
            ar = c.get("arreglo")
            if isinstance(ar, dict) and isinstance(ar.get("t"), str):
                nueva["arreglo"] = {"t": ar["t"][:30], "quien": str(ar.get("quien") or "")[:40],
                                    "nota": str(ar.get("nota") or "")[:500], "peticion": str(ar.get("peticion") or "")[:40]}
            lista.append(nueva)
        fuera["pruebas"][str(n)] = {"version": str(p.get("version") or ""), "sha": str(p.get("sha") or ""),
                                    "comprobaciones": lista,
                                    "aprobacion": p.get("aprobacion") if isinstance(p.get("aprobacion"), dict) else None}
    return fuera


def registrar(datos, prueba, textos, aparato="", version="", sha="", quien="director", t=None, senal=""):
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
        nueva = {"id": cid, "texto": texto[:400], "aparato": aparato[:40], "estado": "pendiente",
                 "nota": "", "quien": quien[:40], "t": t}
        if senal in SENALES:
            nueva["senal"] = senal
        p["comprobaciones"].append(nueva)
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


def _sin_tildes(texto):
    import unicodedata
    return "".join(c for c in unicodedata.normalize("NFD", str(texto or "").lower()) if unicodedata.category(c) != "Mn")


def senal_de_texto(texto):
    """PURA (PRB1111W): la señal que corresponde al texto de una comprobación (None si ninguna)."""
    t = _sin_tildes(texto)
    return next((s for trozo, s in _SENAL_POR_TEXTO if trozo in t), None)


def asignar_senales(datos, prueba):
    """PURA (PRB1111W): pone `senal` a las comprobaciones de la prueba que no la tienen y cuyo texto la sugiere
    → (datos, ids cambiados). No toca estados ni notas."""
    datos = normalizar(datos)
    n = numero_de_prueba(prueba)
    p = datos["pruebas"].get(str(n)) if n is not None else None
    cambiados = []
    for c in (p or {}).get("comprobaciones", []):
        s = None if c.get("senal") else senal_de_texto(c["texto"])
        if s:
            c["senal"] = s
            cambiados.append(c["id"])
    return datos, cambiados


def heredar(datos, prueba, desde=None, version="", sha="", t=None, quien="director"):
    """PURA (PRB1111W): crea la entrada de la prueba (versión y commit) y, si está vacía, le copia las comprobaciones de la
    prueba anterior (o de `desde`) como PENDIENTES con su señal → (datos, ids nuevos). Idempotente."""
    datos = normalizar(datos)
    n = numero_de_prueba(prueba)
    if n is None:
        raise ValueError("prueba no válida: %r" % prueba)
    p = datos["pruebas"].setdefault(str(n), {"version": "", "sha": "", "comprobaciones": [], "aprobacion": None})
    if version:
        p["version"] = version
    if sha and not p["sha"]:
        p["sha"] = sha.lower()
    nuevos = []
    if not p["comprobaciones"]:
        previas = [int(k) for k in datos["pruebas"] if int(k) < n and datos["pruebas"][k]["comprobaciones"]]
        base = datos["pruebas"].get(str(numero_de_prueba(desde))) if desde else (
            datos["pruebas"][str(max(previas))] if previas else None)
        for c in (base or {}).get("comprobaciones", []):
            datos, ids = registrar(datos, n, [c["texto"]], aparato=c["aparato"], quien=quien, t=t, senal=c.get("senal") or "")
            nuevos += ids
    return datos, nuevos


def pedir_arreglo(datos, prueba, cid, quien, nota, t, peticion="", minutos=5):
    """PURA (PRB1111W): anota en la comprobación que se pidió arreglo → (datos, anotado). Si ya se pidió hace menos de
    `minutos`, no cambia nada (anotado=False). ValueError si no existe."""
    datos = normalizar(datos)
    n = numero_de_prueba(prueba)
    p = datos["pruebas"].get(str(n)) if n is not None else None
    c = next((c for c in (p or {}).get("comprobaciones", []) if c["id"] == cid), None)
    if not c:
        raise ValueError("no existe la comprobación %s de la prueba %s" % (cid, prueba))
    previo = (c.get("arreglo") or {}).get("t")
    if previo and t:
        try:
            dif = (datetime.datetime.strptime(t[:19], "%Y-%m-%dT%H:%M:%S") - datetime.datetime.strptime(previo[:19], "%Y-%m-%dT%H:%M:%S")).total_seconds()
            if 0 <= dif < minutos * 60:
                return datos, False
        except ValueError:
            pass
    c["arreglo"] = {"t": t, "quien": quien[:40], "nota": (nota or "")[:500], "peticion": peticion[:40]}
    return datos, True


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
        if c.get("senal") or c.get("arreglo"):
            lineas.append("       %s%s" % (("señal: %s" % c["senal"]) if c.get("senal") else "",
                                           (" · arreglo pedido el %s por %s" % (c["arreglo"]["t"], c["arreglo"]["quien"])) if c.get("arreglo") else ""))
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
    r.add_argument("--senal", default="", choices=("",) + SENALES, help="señal con la que el banco propone el resultado")
    m = sub.add_parser("marcar", help="marcar el resultado de una comprobación")
    m.add_argument("prueba")
    m.add_argument("id")
    m.add_argument("estado", choices=ESTADOS)
    m.add_argument("--nota", default=None)
    m.add_argument("--quien", default="director")
    g = sub.add_parser("senales", help="asignar a las comprobaciones de una prueba la señal que sugiere su texto")
    g.add_argument("prueba")
    v = sub.add_parser("ver", help="ver las comprobaciones")
    v.add_argument("prueba", nargs="?")
    a = ap.parse_args(argv)
    datos = leer()
    try:
        if a.orden == "registrar":
            if a.sha and not re.match(r"^[0-9a-fA-F]{7,40}$", a.sha):
                raise ValueError("commit no válido: %r" % a.sha)
            datos, nuevos = registrar(datos, a.prueba, a.textos, a.aparato, a.version, a.sha, a.quien, _ahora(), a.senal)
            escribir(datos)
            print("registradas %d: %s" % (len(nuevos), ", ".join(nuevos) or "ninguna nueva"))
        elif a.orden == "senales":
            datos, cambiados = asignar_senales(datos, a.prueba)
            escribir(datos)
            print("señal asignada a %d: %s" % (len(cambiados), ", ".join(cambiados) or "ninguna"))
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
