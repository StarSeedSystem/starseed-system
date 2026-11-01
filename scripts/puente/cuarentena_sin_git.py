#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Aparta a cuarentena lo de src/ SIN git que no transpila (SUP0111B, incidente del 31-10).

A las 13:59 del 31-10 apareció en el checkout vivo `src/app/mando/page.tsx` SIN git y con
JSX inválido (dos hermanos en un `map` sin fragmento). Ni la Mac ni el A1 volvieron a
compilar durante horas: el envío al A1 lleva el árbol de trabajo, así que el archivo roto
viajó con él. El reconstructor solo veía «fue por memoria» y esperaba; nadie apartaba al
culpable.

Esto lo cierra: en cada pasada, y ANTES de decidir nada, se mira lo que `git ls-files
--others --exclude-standard` devuelve de `src/` (candidatos SIN git), se transpila cada uno
con esbuild (sintaxis, sin tipos: eso ya lo mira tsc) y el que NO transpila SE MUEVE —nunca
se borra— a `~/.starseed/cuarentena/<AAAAMMDD-HHMM>-sin-git/<ruta relativa>`, con aviso en
el canal. Sin esbuild no se decide nada: mejor compilar igual que mover archivos buenos.

Un módulo de decisiones puro, con su prueba en test_cuarentena_sin_git.py.
"""

import importlib.util
import os
import subprocess
import time

RAIZ = os.environ.get("STARSEED_ROOT") or os.path.expanduser("~/Documents/starseed-os-main")
CARPETA_CUARENTENA = os.path.expanduser("~/.starseed/cuarentena")
#: Solo código que pueda tumbar una build: fuentes JS/TS de src/.
EXTENSIONES = (".ts", ".tsx", ".js", ".jsx", ".mjs")


def candidatos(lineas) -> list[str]:
    """PURA: de la salida de `git ls-files --others --exclude-standard -- src`, solo código."""
    vistos: list[str] = []
    for linea in lineas or []:
        limpio = str(linea).strip().strip('"')
        if limpio and limpio.lower().endswith(EXTENSIONES):
            vistos.append(limpio.replace("\\", "/"))
    return sorted(set(vistos))


def transpila(raiz, ruta):
    """¿Transpila a sintaxis pura? True/False, o None si no hay esbuild (entonces nada).

    Sin `--bundle`: un archivo roto basta para saberlo; el loader es por extensión. No
    se comprueban tipos (eso es tsc); se comprueba que el archivo sea COMPLETABLE, que
    fue lo que el 31-10 tumbó toda build durante horas.
    """
    esbuild = os.path.join(raiz, "node_modules", ".bin", "esbuild")
    if not os.path.exists(esbuild):
        return None
    try:
        r = subprocess.run([esbuild, ruta, "--log-level=error", "--outfile=/dev/null"],
                           cwd=raiz, capture_output=True, text=True, timeout=60)
    except (OSError, subprocess.SubprocessError):
        return None
    return r.returncode == 0


def apartar(raiz, ruta, destino) -> bool:
    """MUEVE el archivo a cuarentena con os.renames (nunca borra). True si lo movió."""
    origen = os.path.join(raiz, ruta)
    if not os.path.isfile(origen):
        return False
    sello = time.strftime("%Y%m%d-%H%M")
    final = os.path.join(destino, "%s-sin-git" % sello, ruta)
    try:
        os.renames(origen, final)  # crea los intermedios; si falta algo, OSError y aquí se acaba
        return True
    except OSError as e:
        print("cuarentena: no pude mover %s: %s" % (ruta, e), flush=True)
        return False


def aviso_de(movidos) -> str:
    """PURA: el texto que va al canal cuando hay apartados."""
    return ("%d archivo(s) sin git de src/ no transpilan y van a cuarentena: %s"
            % (len(movidos), ", ".join(movidos)[:300]))


def revisar(raiz=RAIZ, destino=CARPETA_CUARENTENA) -> list[str]:
    """Aparta cada candidato que no transpila y avisa. Devuelve lo movido."""
    try:
        r = subprocess.run(
            ["git", "ls-files", "--others", "--exclude-standard", "--", "src"],
            cwd=raiz, capture_output=True, text=True, timeout=30)
    except (OSError, subprocess.SubprocessError):
        return []
    if r.returncode != 0:
        return []
    movidos: list[str] = []
    for ruta in candidatos(r.stdout.splitlines()):
        if transpila(raiz, ruta) is False and apartar(raiz, ruta, destino):
            movidos.append(ruta)
    if not movidos:
        return []
    texto = aviso_de(movidos)
    print("[" + time.strftime("%H:%M") + "] " + texto, flush=True)
    try:
        _p.decir(texto, "reconstruir", "aviso")
    except Exception as e:  # noqa: BLE001  el canal no puede tumbar a la cuarentena
        print("cuarentena: sin canal: %s: %s" % (type(e).__name__, e), flush=True)
    return movidos


#: `puente.py` se carga por sitio como en guardia-memoria.py; `decir` no escribe en pruebas.
_espec = importlib.util.spec_from_file_location(
    "puente", os.path.join(os.path.dirname(os.path.abspath(__file__)), "puente.py")
)
assert _espec is not None and _espec.loader is not None
_p = importlib.util.module_from_spec(_espec)
_espec.loader.exec_module(_p)


def main() -> int:  # uso a mano: python3 scripts/puente/cuarentena_sin_git.py
    revisar()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
