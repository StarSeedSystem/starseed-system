#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Maggabit: lista única de exclusiones y respaldo de desarrollo (MAG1117).

Una sola lista (`config/respaldo-exclusiones.txt`) gobierna todas las copias:
REGENERABLE (peso muerto), ARBOLES (worktrees) y CLAVES (secretos que nunca
salen del origen). Contrato: disco ausente → «sin-disco», sin esperar; todo
subprocess con timeout → «sin-respuesta» si el volumen exFAT no responde;
nunca se borra en el origen; «mkstempsock» no cuenta como fallo; y no se
imprimen nunca tokens, claves ni URLs con credenciales.
"""

import argparse
import os
import subprocess
import time

RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
RUTA_EXCLUSIONES = os.path.join(RAIZ, "config", "respaldo-exclusiones.txt")

SECCIONES = ("REGENERABLE", "ARBOLES", "CLAVES")
SEGUNDOS_LIMITE = 1800  # timeout del subprocess: exFAT puede no responder
SIN_RESPUESTA = "sin-respuesta"
SIN_DISCO = "sin-disco"
SIN_LISTA = "sin-lista"


def leer_exclusiones(texto):
    """PURA: texto de la lista única → {sección: [patrones]}, en orden."""
    secciones = {nombre: [] for nombre in SECCIONES}
    actual = None
    for linea in texto.splitlines():
        limpia = linea.strip()
        if not limpia:
            continue
        if limpia.startswith("#"):
            actual = next((n for n in SECCIONES if n in limpia.upper()), actual)
        elif actual:
            secciones[actual].append(limpia)
    return secciones


def orden_rsync(origen, destino, exclusiones, limite_kbps=None, simulacro=False):
    """PURA: argv de la copia (`--delete` solo limpia el destino).

    `exclusiones` es la lista única: ruta (str) → `--exclude-from`; dict →
    reglas inline, con las excepciones «!» primero como `--include`.
    """
    if isinstance(exclusiones, dict):
        reglas = []
        for excepcion in (True, False):
            for nombre in SECCIONES:
                for patron in exclusiones.get(nombre, []):
                    if patron.startswith("!") == excepcion:
                        reglas.append(("--include=" if excepcion else "--exclude=")
                                      + patron.lstrip("!"))
    else:
        reglas = ["--exclude-from", exclusiones]
    return (["rsync", "-a", "--delete"]
            + (["--bwlimit=%d" % int(limite_kbps)] if limite_kbps else [])
            + reglas + (["--dry-run"] if simulacro else []) + [origen, destino])


def resumen(salida, rc):
    """PURA: salida y código de retorno de rsync → dict de estado legible."""
    lineas = [l for l in (salida or "").splitlines() if l.strip()]
    socket_fallido = any("mkstempsock" in l for l in lineas)
    estado = (SIN_RESPUESTA if rc is None or rc == SIN_RESPUESTA
              else "ok" if rc == 0 or socket_fallido else "fallo")
    return {"estado": estado, "lineas": len(lineas), "rc": rc,
            "avisos": [l for l in lineas if "mkstempsock" in l]}


def respaldar(origen, destino, exclusiones=None, limite_kbps=None, simulacro=False,
              existe=None, ejecutar=None, reloj=None):
    """Copia de desarrollo: E/S fina con todo inyectable.

    Disco ausente: «sin-disco» y se vuelve sin llamar a rsync (principio 0).
    Sin lista única: «sin-lista» — mejor no respaldar que copiar claves.
    Volumen sin respuesta: «sin-respuesta»; nunca se cuelga.
    """
    existe = existe or os.path.exists
    ejecutar = ejecutar or subprocess.run
    reloj = reloj or time.monotonic
    if not existe(destino):
        return {"estado": SIN_DISCO, "lineas": 0, "avisos": [], "rc": None, "segundos": 0.0}
    ruta = exclusiones if isinstance(exclusiones, str) else RUTA_EXCLUSIONES
    if not existe(ruta):
        return {"estado": SIN_LISTA, "lineas": 0, "avisos": [], "rc": None, "segundos": 0.0}
    argv = orden_rsync(origen, destino, ruta, limite_kbps=limite_kbps,
                       simulacro=simulacro)
    comienzo = reloj()
    try:
        hecho = ejecutar(argv, capture_output=True, text=True, timeout=SEGUNDOS_LIMITE)
        salida = "\n".join(p for p in (hecho.stdout, hecho.stderr) if p)
        codigo = hecho.returncode
    except subprocess.TimeoutExpired:
        salida, codigo = "", SIN_RESPUESTA
    resultado = resumen(salida, codigo)
    resultado["segundos"] = round(reloj() - comienzo, 1)
    return resultado


def main(argv=None):
    """Punto de entrada del respaldo desde la terminal."""
    p = argparse.ArgumentParser(description="Respaldo de desarrollo a Maggabit.")
    p.add_argument("origen", help="Carpeta a respaldar (la raíz del repo).")
    p.add_argument("destino", help="Carpeta destino en Maggabit.")
    p.add_argument("--exclusiones", default=RUTA_EXCLUSIONES, help="Lista única.")
    p.add_argument("--limite-kbps", type=int, default=None, help="kB/s máximos.")
    p.add_argument("--simulacro", action="store_true", help="Ensayo --dry-run.")
    datos = p.parse_args(argv)
    estado = respaldar(datos.origen, datos.destino, datos.exclusiones,
                       limite_kbps=datos.limite_kbps, simulacro=datos.simulacro)
    print(estado["estado"])
    return 0 if estado["estado"] in ("ok", SIN_DISCO) else 1


if __name__ == "__main__":
    raise SystemExit(main())
