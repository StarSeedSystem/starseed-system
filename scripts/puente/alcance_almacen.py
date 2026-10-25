#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""alcance_almacen · disco privado del agente de alcance (INV1025J).

Carpeta `~/.starseed/alcance/` con permisos 700 y archivos 600, escritura atómica. NUNCA
bajo `starseed_memory_root`, que se espeja a Drive (R5). `home` se inyecta en las pruebas.
"""

import json
import os
import re
from pathlib import Path


def carpeta(home=None):
    """Carpeta privada; jamás bajo starseed_memory_root (R5)."""
    base = Path(home or "~").expanduser().resolve()
    if "starseed_memory_root" in base.parts:
        raise ValueError("el almacén de alcance no vive bajo starseed_memory_root")
    return base / ".starseed" / "alcance"


def ruta(nombre, home=None):
    if not re.fullmatch(r"[a-z0-9_-]+\.json", nombre or ""):
        raise ValueError("archivo no permitido: %r" % (nombre,))
    return carpeta(home) / nombre


def leer(nombre, defecto, home=None):
    try:
        return json.loads(ruta(nombre, home).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return defecto


def escribir(nombre, datos, home=None):
    """Atómico: carpeta 700 y archivo 600 aunque ya existieran."""
    destino = carpeta(home)
    destino.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(destino, 0o700)
    tmp = destino / (nombre + ".tmp-%d" % os.getpid())
    tmp.write_text(json.dumps(datos, ensure_ascii=False, indent=1), encoding="utf-8")
    os.chmod(tmp, 0o600)
    os.replace(tmp, destino / nombre)
    return destino / nombre
