# -*- coding: utf-8 -*-
"""Captura de pantalla de la ruta local que tocó cada tarea integrada.

Parte de la bandeja curada del Mando: cada reporte de una ola quiere que Alex
vea «hasta qué punto se ve». Este módulo decide qué rutas serviría una tarea
(lo PURO, sin red) y, aparte, captura esas rutas con Chrome headless cuando
se pide (lo IMPURO, que no se prueba).

PURO (sin red, lo que se testea):
    · rutas_de_archivos(archivos)   → rutas web que sirven esos archivos
    · nombre_captura(tarea, ruta)   → nombre de archivo seguro (sin barras ni acentos)
    · hace_falta_captura(estado, archivos) → bool (integrada y algo visible)

IMPURO (capa de accion, sin pruebas):
    · capturar(ruta, destino, puerto, espera_s) → usa Chrome headless o None
    · al ejecutarse solo: imprime el plan; con --aplicar, captura de verdad.
"""

import os
import re
import subprocess
import sys
import unicodedata

RUTA_MANDO = "/mando"
ESTADOS_INTEGRADAS = {"commit", "integrada", "integrado", "publicada", "publicado"}

# Un segmento de ruta que Next.js ignora en la URL: los grupos de ruta "(app)".
_GRUPO_RUTA = re.compile(r"^\(.*\)$")
_DINAMICO_RUTA = re.compile(r"[\[\]]")

_PREFIJO_APP = "src/app/"
_PREFIJO_COMPONENTE_MANDO = "src/components/mando/"


def _ruta_sirve_pagina(archivo):
    """Ruta web que sirve un archivo `page.tsx`; None si no es página util.

    Acota el alcance a páginas de App Router: archivos `src/app/<…>/page.tsx`.
    Los grupos de ruta "(grupo)" no cuentan en la URL; los segmentos dinámicos
    "[…]" no tienen URL concreta que capturar, así que se descartan.
    """
    if not (isinstance(archivo, str) and archivo.startswith(_PREFIJO_APP)):
        return None
    resto = archivo[len(_PREFIJO_APP) :]
    if not resto.endswith("/page.tsx"):
        return None
    segmentos = [s for s in resto[: -len("/page.tsx")].split("/") if s]
    segmentos = [s for s in segmentos if not _GRUPO_RUTA.match(s)]
    if not segmentos or any(_DINAMICO_RUTA.search(s) for s in segmentos):
        return None
    return "/" + "/".join(segmentos)


def _ruta_de_archivo(archivo):
    """Ruta web que sirve un archivo, o None si no sirve ninguna página útil."""
    ruta = _ruta_sirve_pagina(archivo)
    if ruta is not None:
        return ruta
    # Un componente del Mando vive en su única página: /mando.
    if isinstance(archivo, str) and archivo.startswith(_PREFIJO_COMPONENTE_MANDO):
        return RUTA_MANDO
    return None


def rutas_de_archivos(archivos):
    """Rutas web, en orden y sin duplicados, que sirven los archivos dados."""
    resultado = []
    visto = set()
    for archivo in archivos or []:
        ruta = _ruta_de_archivo(archivo)
        if ruta is not None and ruta not in visto:
            visto.add(ruta)
            resultado.append(ruta)
    return resultado


def nombre_captura(tarea, ruta):
    """Nombre de archivo seguro: sin barras, sin acentos, solo [a-z0-9-]."""
    base = unicodedata.normalize("NFKD", "%s%s" % (tarea, ruta))
    base = "".join(c for c in base if not unicodedata.combining(c))
    base = re.sub(r"[^A-Za-z0-9]+", "-", base).strip("-").lower()
    return base or "captura"


def hace_falta_captura(estado, archivos):
    """True solo cuando la tarea está integrada y toca algo que se ve."""
    if estado not in ESTADOS_INTEGRADAS:
        return False
    return bool(rutas_de_archivos(archivos))


RUTA_CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"


def capturar(ruta, destino, puerto=9002, espera_s=6):
    """Captura `ruta` local en `destino` con Chrome headless; None si no hay Chrome.

    No instala nada ni levanta la Mac: si el binario no existe devuelve None y
    una frase explicando por qué. El headless va por `--virtual-time-budget`
    para dejar que el JS pinte antes del screenshot.
    """
    if not os.path.exists(RUTA_CHROME):
        return None
    url = "http://localhost:%d%s" % (puerto, ruta)
    os.makedirs(os.path.dirname(destino), exist_ok=True)
    comando = [
        RUTA_CHROME,
        "--headless=new",
        "--disable-gpu",
        "--screenshot=%s" % destino,
        "--window-size=1440,900",
        "--virtual-time-budget=%d" % int(espera_s * 1000),
        url,
    ]
    try:
        proc = subprocess.run(comando, capture_output=True, timeout=60)
        if proc.returncode != 0:
            return None
        return destino if os.path.exists(destino) else None
    except (subprocess.TimeoutExpired, OSError):
        return None


def _destino_por_defecto():
    """Carpeta destino de capturas en el memory root (no versionada)."""
    return os.path.normpath(
        os.path.join(
            os.path.dirname(
                os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            ),
            "starseed_memory_root/mando/pruebas",
        )
    )


def _main(argv):
    """CLI: planifica o aplica capturas de una tarea y sus archivos."""
    if len(argv) < 3:
        _uso()
        return 2
    aplicar = "--aplicar" in argv
    args = [a for a in argv if a != "--aplicar"]
    tarea, archivos = args[1], args[2:]
    if not hace_falta_captura("commit", archivos):
        print("no hace falta captura: nada integrado que se vea")
        return 0
    destinos = []
    for ruta in rutas_de_archivos(archivos):
        nombre = nombre_captura(tarea, ruta) + ".png"
        destino = os.path.join(_destino_por_defecto(), nombre)
        destinos.append((ruta, destino))
        print("%s -> %s" % (ruta, destino))
        if aplicar:
            resultado = capturar(ruta, destino)
            if resultado is None:
                print("  (no se pudo capturar: falta Chrome o falló)")
            else:
                print("  capturada")
    if not destinos:
        print("sin rutas que capturar")
        return 0
    if not aplicar:
        print("(modo plan: pasa --aplicar para capturar de verdad)")
    return 0


def _uso():
    print("uso: python3 capturar_prueba.py <tarea> <archivo...> [--aplicar]")


if __name__ == "__main__":
    sys.exit(_main(sys.argv))
