#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Director de acciones de Alex: refresca la lista cada 10 min y avisa UNA vez
cuando algo cambia. No repite el aviso mientras la acción siga ahí.

Alex (2026-09-20): «para todo lo que requiera de mi accion recuerda enviarme los
enlaces directos y/o los comandos para la terminal si es necesario».

`acciones-de-alex.py` arma la lista y la deja en `starseed_memory_root/mando/
acciones-de-alex.json`. Esto, cada INTERVALO_S, la vuelve a generar y la
compara con la anterior. Si aparece una acción que antes no estaba, avisa UNA
vez por el canal común con el título, el enlace y la orden. Si una acción
desaparece, lo dice también: saber que algo ya está resuelto vale tanto como
saber que falta. Y no repite el aviso mientras la acción siga ahí — Telegram es
para avisos importantes, y una lista que se repite cada diez minutos deja de
leerse en dos días.

La decisión de «qué es una novedad» es PURA y vive en `acciones-director-logic.py`,
así que su puerta la puede medir sin efectos (mismo patrón que los demás
módulos de `scripts/puente`).

  python3 scripts/puente/director-acciones.py
"""

import importlib.util
import json
import os
import subprocess
import sys
import time

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
if DIRECTORIO not in sys.path:
    sys.path.insert(0, DIRECTORIO)

_spec = importlib.util.spec_from_file_location(
    "acciones_director_logic", os.path.join(DIRECTORIO, "acciones-director-logic.py")
)
_A = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_A)

_spec_p = importlib.util.spec_from_file_location(
    "puente", os.path.join(DIRECTORIO, "puente.py")
)
_p = importlib.util.module_from_spec(_spec_p)
_spec_p.loader.exec_module(_p)

RAIZ = os.environ.get("STARSEED_ROOT") or "/Users/alex/Documents/starseed-os-main"
INTERVALO_S = int(os.environ.get("STARSEED_ACCIONES_S", "600"))
RUTA = os.path.join(RAIZ, "starseed_memory_root", "mando", "acciones-de-alex.json")
AVISADOS = os.path.join(
    RAIZ, "starseed_memory_root", "mando", "acciones-director-avisados.json"
)


def _leer(ruta, por_defecto):
    try:
        with open(ruta, encoding="utf-8") as fh:
            return json.load(fh)
    except Exception:
        return por_defecto


def _acciones():
    """La lista de acciones tal y como está escrita en el JSON (vacía si falla)."""
    return (_leer(RUTA, {}) or {}).get("acciones") or []


def _antes():
    """La última lista que comparó, o la vacía si es la primera pasada."""
    return _leer(AVISADOS, {}).get("ultima") or []


def _anotar(acciones, novedades):
    """Guarda la lista actual y los id ya anunciados, atómico (tmp + replace)."""
    carpeta = os.path.dirname(AVISADOS)
    os.makedirs(carpeta, exist_ok=True)
    datos = {
        "ultima": acciones or [],
        "avisados": sorted(
            set(_leer(AVISADOS, {}).get("avisados") or [])
            | {str(a.get("id")) for a, _ in novedades}
        ),
    }
    tmp = AVISADOS + ".tmp"
    json.dump(datos, open(tmp, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    os.replace(tmp, AVISADOS)


def _anunciar(accion, como):
    """Manda una línea al canal común con el título, el enlace y la orden."""
    os.environ["STARSEED_QUIEN"] = "director-acciones"
    linea = "%s: %s" % (
        "nueva" if como == "nueva" else "resuelta",
        accion.get("titulo") or accion.get("id"),
    )
    if accion.get("enlace"):
        linea += " · %s" % accion["enlace"]
    if accion.get("comando"):
        linea += " · orden: %s" % accion["comando"]
    _p.decir(linea, "director-acciones", "aviso")
    return linea


def main():
    print(
        "Director de acciones de Alex · cada %d s · %s" % (INTERVALO_S, RUTA),
        flush=True,
    )
    while True:
        try:
            subprocess.run(
                [sys.executable, os.path.join(DIRECTORIO, "acciones-de-alex.py")],
                cwd=RAIZ,
                capture_output=True,
                timeout=120,
            )
            antes, ahora = _antes(), _acciones()
            novedades = _A.novedades(antes, ahora)
            anunciables = _A.para_anunciar(
                novedades, _leer(AVISADOS, {}).get("avisados")
            )
            for accion, como in anunciables:
                print(_anunciar(accion, como), flush=True)
            _anotar(ahora, anunciables)
        except Exception as e:
            print("director-acciones: %s: %s" % (type(e).__name__, e), flush=True)
        time.sleep(INTERVALO_S)


if __name__ == "__main__":
    sys.exit(main() or 0)
