#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Reconstruye el Puente cuando su código cambia, sin que nadie lo pida.

POR QUÉ EXISTE (2026-09-22). Alex lleva días diciendo «pero aun no ha cambiado nada de lo
que te he pedido, todo sigue igual» delante de una pantalla que, efectivamente, seguía
igual — y no porque el arreglo no estuviera hecho, sino porque **el Mando se sirve con
`next start`, o sea de un build compilado**. Editar `src/` no cambia nada de lo que se ve:
hasta que alguien corre `next build` y reinicia el servicio, la pantalla enseña el código
de la última compilación. `arrancar-mando.sh` ya lo decía por escrito («'next start' sirve
el build compilado, así que compila primero»), y aun así nadie compilaba: el paso vivía en
la cabeza de quien editaba. Un arreglo que solo existe en el disco no está entregado.

Esto lo cierra: cada `INTERVALO_S` se mira una huella de las fuentes de la pantalla; si no
coincide con la del último build, se reconstruye CON EL TURNO DE LA MÁQUINA (para no
pelearse por la RAM con los agentes) y se reinicia el servicio del Mando.

Lo que NO hace, a propósito:
  · No reconstruye por un cambio en Python ni en las colas: solo por lo que compila el
    build (`src/`, `public/`, configuración y dependencias).
  · No insiste con un build que ya falló con las MISMAS fuentes: esperaría volver a fallar
    igual, y un bucle de builds rojos deja la Mac de rodillas. Espera a que el código
    cambie (o a que pase `ESPERA_TRAS_FALLO_S`).
  · No interrumpe a nadie: el turno de la máquina se pide, no se arrebata.

  python3 scripts/puente/reconstruir_mando.py            # servicio
  python3 scripts/puente/reconstruir_mando.py --una-vez  # una pasada y salir
"""
from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
import time

RAIZ = os.environ.get("STARSEED_ROOT") or os.path.expanduser("~/Documents/starseed-os-main")
ESTADO = os.path.join(RAIZ, "starseed_memory_root", "mando", "reconstruccion.json")
INTERVALO_S = int(os.environ.get("STARSEED_RECONSTRUIR_S", "180"))
ESPERA_TRAS_FALLO_S = int(os.environ.get("STARSEED_RECONSTRUIR_ESPERA_FALLO_S", "3600"))
SERVICIO = "com.starseed.mando"
#: Lo que de verdad entra en el build. `scripts/` y `starseed_memory_root/` NO están:
#: cambian cada minuto por el propio enjambre y reconstruirían la pantalla sin motivo.
FUENTES = ("src", "public")
ARCHIVOS = ("package.json", "package-lock.json", "next.config.ts", "next.config.js",
            "tailwind.config.ts", "tsconfig.json", "postcss.config.mjs")
#: Ni el build ni la pantalla dependen de esto, y cambia constantemente.
IGNORADOS = (".next", "node_modules", "__pycache__", ".git", ".DS_Store")


def huella_de(entradas) -> str:
    """PURA: la huella de un conjunto de archivos, como (ruta, mtime_ns, tamaño).

    Se ordena antes de resumir para que el orden en que el disco los devuelva no cambie la
    huella: si la huella variase sola, el servicio reconstruiría en cada pasada.
    """
    h = hashlib.sha256()
    for ruta, mtime, tam in sorted(entradas):
        h.update(("%s|%s|%s\n" % (ruta, mtime, tam)).encode("utf-8"))
    return h.hexdigest()[:16]


def _entradas(raiz=RAIZ):
    for nombre in ARCHIVOS:
        p = os.path.join(raiz, nombre)
        try:
            st = os.stat(p)
        except OSError:
            continue
        yield nombre, st.st_mtime_ns, st.st_size
    for carpeta in FUENTES:
        base = os.path.join(raiz, carpeta)
        for aqui, dirs, archivos in os.walk(base):
            dirs[:] = [d for d in dirs if d not in IGNORADOS]
            for a in archivos:
                if a in IGNORADOS:
                    continue
                p = os.path.join(aqui, a)
                try:
                    st = os.stat(p)
                except OSError:
                    continue
                yield os.path.relpath(p, raiz), st.st_mtime_ns, st.st_size


def huella_viva(raiz=RAIZ) -> str:
    return huella_de(_entradas(raiz))


def decidir(huella_actual, estado, ahora, espera_tras_fallo_s=ESPERA_TRAS_FALLO_S):
    """PURA: (reconstruir: bool, motivo: str).

    `estado` es lo guardado del build anterior: `huella_construida`, `ok`, `t` (epoch).
    """
    estado = estado if isinstance(estado, dict) else {}
    construida = estado.get("huella_construida")
    if not construida:
        return True, "no hay build registrado: la pantalla podría ser de cualquier versión"
    if construida == huella_actual:
        if estado.get("ok") is False:
            return False, "el último build falló con estas mismas fuentes: espero un cambio"
        return False, "la pantalla está al día"
    if estado.get("ok") is False and estado.get("huella_intentada") == huella_actual:
        try:
            desde = float(ahora) - float(estado.get("t") or 0)
        except (TypeError, ValueError):
            desde = espera_tras_fallo_s + 1
        if desde < espera_tras_fallo_s:
            return False, "el build de estas mismas fuentes falló hace %d min: espero" % int(desde / 60)
    return True, "las fuentes de la pantalla cambiaron desde el último build"


def _leer_estado(ruta=ESTADO) -> dict:
    try:
        with open(ruta, encoding="utf-8") as f:
            d = json.load(f)
        return d if isinstance(d, dict) else {}
    except Exception:
        return {}


def _guardar(datos, ruta=ESTADO) -> None:
    try:
        os.makedirs(os.path.dirname(ruta), exist_ok=True)
        with open(ruta, "w", encoding="utf-8") as f:
            json.dump(datos, f, ensure_ascii=False, indent=1)
    except OSError:
        pass


def primera_linea_de_error(salida) -> str:
    """PURA: la línea que de verdad explica por qué falló el build."""
    for linea in (salida or "").splitlines():
        l = linea.strip()
        if not l:
            continue
        if l.startswith("Type error:") or l.startswith("Error:") or "error TS" in l:
            return l[:300]
    for linea in reversed((salida or "").splitlines()):
        if linea.strip():
            return linea.strip()[:300]
    return "sin salida"


def reconstruir(huella_actual) -> dict:
    """Construye con el turno de la máquina y reinicia el Mando si salió bien."""
    _guardar(dict(_leer_estado(), estado="reconstruyendo", huella_intentada=huella_actual,
                  t=time.time(), visto=time.strftime("%Y-%m-%d %H:%M:%S")))
    empezo = time.time()
    entorno = dict(os.environ)
    # 2 GB por defecto no bastan con el enjambre vivo: el build muere por memoria.
    entorno.setdefault("NODE_OPTIONS", "--max-old-space-size=5120")
    try:
        r = subprocess.run(
            [sys.executable, os.path.join(RAIZ, "scripts", "puente", "con-turno.py"),
             "--", "npx", "next", "build"],
            cwd=RAIZ, capture_output=True, text=True, timeout=60 * 40, env=entorno,
        )
        ok = r.returncode == 0
        salida = (r.stdout or "") + (r.stderr or "")
    except Exception as e:
        ok, salida = False, "%s: %s" % (type(e).__name__, e)
    segundos = int(time.time() - empezo)
    datos = {
        "estado": "al-dia" if ok else "fallo",
        "ok": ok,
        "segundos": segundos,
        "t": time.time(),
        "visto": time.strftime("%Y-%m-%d %H:%M:%S"),
        "huella_intentada": huella_actual,
        "huella_construida": huella_actual if ok else _leer_estado().get("huella_construida"),
        "error": None if ok else primera_linea_de_error(salida),
    }
    _guardar(datos)
    print("[%s] build %s en %d s%s" % (time.strftime("%H:%M"), "ok" if ok else "FALLÓ",
                                       segundos, "" if ok else ": " + (datos["error"] or "")),
          flush=True)
    if ok:
        subprocess.run(["launchctl", "kickstart", "-k",
                        "gui/%d/%s" % (os.getuid(), SERVICIO)],
                       capture_output=True, text=True)
        print("Mando reiniciado: la pantalla ya sirve el código nuevo", flush=True)
    return datos


def una_pasada() -> bool:
    actual = huella_viva()
    estado = _leer_estado()
    hazlo, motivo = decidir(actual, estado, time.time())
    print("[%s] %s: %s" % (time.strftime("%H:%M"), "RECONSTRUYO" if hazlo else "espero", motivo),
          flush=True)
    if not hazlo:
        # Se anota igual: así el Puente puede decir «al día» con fecha, no de memoria.
        _guardar(dict(estado, visto=time.strftime("%Y-%m-%d %H:%M:%S"), huella_vista=actual))
        return False
    reconstruir(actual)
    return True


def main() -> int:
    if "--una-vez" in sys.argv:
        una_pasada()
        return 0
    print("Reconstructor del Mando · cada %d s · el build va con el turno de la máquina"
          % INTERVALO_S, flush=True)
    while True:
        try:
            una_pasada()
        except Exception as e:
            print("reconstruir-mando: %s: %s" % (type(e).__name__, e), flush=True)
        time.sleep(INTERVALO_S)


if __name__ == "__main__":
    sys.exit(main() or 0)
