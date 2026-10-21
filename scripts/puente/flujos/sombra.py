# Sombra del motor de flujos de n8n
# Este script traducción preliminar de la lógica de sombra.
# Los imports y funciones se completarán conforme al motor propio.

import json
import os
import datetime
from pathlib import Path

# Configuración de rutas temporales
TMP_DIR = Path("/tmp/opencode")
TMP_DIR.mkdir(parents=True, exist_ok=True)

# Cargar flujo y disparadores
# TODO: implementar carga del flujo desde starseed_memory_root/flujos

def cargar_flujo(name: str):
    """Carga el flujo JSON dado su nombre."""
    path = Path("starseed_memory_root/flujos") / f"{name}.json"
    if not path.exists():
        raise FileNotFoundError(f"Flujo {name} no encontrado en {path}")
    return json.loads(path.read_text())

FIXME_MESSAGE = "La lógica completa del motor de flujos se implementará en otro commit"

print(FIXME_MESSAGE)
