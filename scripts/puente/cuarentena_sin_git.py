#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Aparta a cuarentena los .ts/.tsx SIN git de `src/` que no transpilan (SUP0111B).

POR QUÉ EXISTE. El 31-10 a las 13:59 apareció en el checkout vivo `src/app/mando/page.tsx` SIN git y con JSX
inválido (dos hermanos en un `map` sin fragmento). Todas las builds fallaron durante horas, las de la Mac y las
del A1: el envío al A1 lleva el árbol de trabajo entero, también lo que git no conoce. Y lo que git no conoce no
sale en ninguna revisión: nadie lo ve hasta que rompe la build.

Qué hace, y qué NO:
  · Mira solo lo que git no conoce (`git ls-files --others --exclude-standard -- src`): lo versionado, nunca.
  · De eso, solo .ts/.tsx/.js/.jsx/.mjs y solo lo que esbuild dice que NO transpila (sin bundle: solo sintaxis).
  · Sin esbuild, o si esbuild no llega a opinar (no arranca, lo matan, falta node), no decide nada.
  · MUEVE (`os.renames`, nunca borra) a ~/.starseed/cuarentena/<AAAAMMDD-HHMM>-sin-git/<ruta relativa> y avisa
    en el canal común. Lo llama `reconstruir_mando.una_pasada` al principio, sin poder tumbarlo.
"""
import os
import re
import subprocess
import time

EXTENSIONES = (".ts", ".tsx", ".js", ".jsx", ".mjs")
#: Por extensión. Un `.js` con JSX es válido para Next (SWC) pero el cargador `js` de esbuild no lo traga: con `jsx`
#: pasa lo uno y lo otro, y no se aparta un archivo bueno por un falso rojo.
CARGADOR = {".ts": "ts", ".tsx": "tsx", ".js": "jsx", ".jsx": "jsx", ".mjs": "jsx"}
CUARENTENA = os.path.expanduser("~/.starseed/cuarentena")
#: Cada comprobación arranca node: una carpeta enorme sin git, en una Mac cargada, no puede atascar la pasada.
PRESUPUESTO_S = 90


def candidatos(lineas):
    """PURA: de la salida de `git ls-files --others --exclude-standard -- src`, las fuentes de código
    (.ts/.tsx/.js/.jsx/.mjs). Vale la lista de líneas o el texto crudo (con saltos de línea o NUL, de `-z`)."""
    if isinstance(lineas, str):
        lineas = re.split(r"[\0\n]", lineas)
    return [l for l in (str(x).rstrip("\r\n") for x in lineas or []) if l.endswith(EXTENSIONES)]


def orden_esbuild(esbuild, ruta):
    """PURA: la orden que solo transpila (sin bundle y sin escribir nada), con el cargador de la extensión."""
    ext = os.path.splitext(ruta)[1]
    return [esbuild, ruta, "--loader:%s=%s" % (ext, CARGADOR.get(ext, "jsx")), "--log-level=error", "--outfile=/dev/null"]


def veredicto(rc, salida):
    """PURA: True si esbuild lo traga; False si dice que tiene un error de sintaxis (un [ERROR] con ruta:línea:columna);
    None si no se puede saber (no arrancó, lo mataron, falta node, no encontró el archivo): ahí no se decide."""
    if rc == 0:
        return True
    texto = salida or ""
    return False if "[ERROR]" in texto and re.search(r":\d+:\d+:", texto) else None


def transpila(raiz, ruta):
    """True/False según `veredicto` de esbuild sobre `ruta` (relativa a `raiz`), o None si no hay esbuild."""
    esbuild = os.path.join(raiz, "node_modules", ".bin", "esbuild")
    if not (os.access(esbuild, os.X_OK) and os.path.isfile(os.path.join(raiz, ruta))):
        return None
    try:
        r = subprocess.run(orden_esbuild(esbuild, ruta), cwd=raiz, capture_output=True, text=True, errors="replace", timeout=60)
    except (OSError, subprocess.SubprocessError):
        return None
    return veredicto(r.returncode, (r.stderr or "") + (r.stdout or ""))


def _puente():
    """`puente.py` por su ruta, como `guardia-memoria.py`: por nombre, `puente` puede ser la carpeta scripts/puente."""
    import importlib.util
    espec = importlib.util.spec_from_file_location("puente", os.path.join(os.path.dirname(os.path.abspath(__file__)), "puente.py"))
    modulo = importlib.util.module_from_spec(espec)
    espec.loader.exec_module(modulo)
    return modulo


def _protegida(cuarentena):
    """True si mover a `cuarentena` ensuciaría la REAL desde una prueba (mismo criterio que `puente._canal_protegido`):
    así las pruebas de `una_pasada`, que llaman a `revisar(RAIZ)`, no escanean ni tocan el checkout vivo."""
    try:
        return os.path.abspath(cuarentena) == os.path.abspath(CUARENTENA) and bool(_puente()._en_pruebas())
    except Exception:  # noqa: BLE001  si no se sabe, se trabaja como siempre
        return False


def revisar(raiz, ahora=None, cuarentena=CUARENTENA):
    """MUEVE (nunca borra) a `<cuarentena>/<AAAAMMDD-HHMM>-sin-git/<ruta relativa>` cada fuente SIN git de `src/` que
    no transpila, y lo avisa con `puente.decir(texto, 'reconstruir', 'aviso')`. Devuelve las rutas movidas.
    En una prueba, con la cuarentena real, no hace nada (ver `_protegida`)."""
    if _protegida(cuarentena):
        return []
    try:
        r = subprocess.run(["git", "-C", raiz, "ls-files", "-z", "--others", "--exclude-standard", "--", "src"],
                           capture_output=True, text=True, errors="replace", timeout=60)
    except (OSError, subprocess.SubprocessError):
        return []
    destino = os.path.join(cuarentena, time.strftime("%Y%m%d-%H%M", time.localtime(ahora)) + "-sin-git")
    limite, movidos = time.time() + PRESUPUESTO_S, []
    for ruta in candidatos(r.stdout) if r.returncode == 0 else []:
        if time.time() > limite:
            break
        if transpila(raiz, ruta) is not False:
            continue
        nuevo = os.path.join(destino, ruta)
        while os.path.lexists(nuevo):  # ya hay uno igual en esta cuarentena: ese no se pisa
            nuevo += ".otro"
        try:
            os.renames(os.path.join(raiz, ruta), nuevo)
            movidos.append(ruta)
        except OSError:
            pass
    if movidos:
        texto = "Aparté %d archivo(s) SIN git de src/ que no transpilan (rompían toda build): %s → ~/.starseed/cuarentena/%s/" % (
            len(movidos), ", ".join(movidos[:5]), os.path.basename(destino))
        print(texto, flush=True)
        try:
            _puente().decir(texto, "reconstruir", "aviso")
        except Exception:  # noqa: BLE001
            pass
    return movidos
