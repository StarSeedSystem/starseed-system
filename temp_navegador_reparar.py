#!/usr/bin/env python3
"""Reparador del enjambre para navegadores propios de MetaGenesis (NAV1112I).

Si hay esqueletos nuevos en ~/.starseed/navegador/reparar/, comprueba que no
lleven textos (solo etiquetas, roles y nombres de atributos; si alguno lleva
texto, lo descarta) y encola UNA tarea de código por lector roto en
olas/cola-nav-reparar.json, con el esqueleto como contexto y la instrucción
de ajustar solo el extractor puro y sus pruebas. Nunca más de una tarea
abierta por lector. Pruebas puras. Máximo 120 líneas por archivo.

El esqueleto HTML es la captura de una página que ha cambiado, sin textos
visibles pero con estructura intachable para guiar al reparador.
"""

import json
import os
import re
from pathlib import Path
from typing import Dict, Any

RUTA_REPARAR = Path.home() / ".starseed" / "navegador" / "reparar"
RUTA_COLA = Path("starseed_memory_root") / "olas" / "cola-nav-reparar.json"
RUTA_ESTADO = Path.home() / ".starseed" / "navegador" / "estado.json"


def _tiene_texto(html: str) -> bool:
    """Devuelve True si el HTML contiene texto visible fuera de atributos y etiquetas."""
    if not html:
        return False

    patron_sin_atributos = re.sub(r'\s*\w+="[^"]*"', '', html)
    patron_sin_textos = re.sub(r'<[^>]+>', '', patron_sin_atributos)
    patron_sin_textos = re.sub(r'&nbsp;', ' ', patron_sin_textos)
    patron_sin_textos = re.sub(r'&[a-z]+;', '', patron_sin_textos)
    patron_sin_textos = re.sub(r'\s+', ' ', patron_sin_textos)
    patron_sin_textos = patron_sin_textos.strip()
    return bool(patron_sin_textos)


def _esqueleto_valido(nombre: str) -> bool:
    """Devuelve True si el esqueleto no lleva texto visible."""
    ruta = RUTA_REPARAR / nombre
    try:
        contenido = ruta.read_text(encoding="utf-8", errors="replace")
        return not _tiene_texto(contenido)
    except (OSError, UnicodeDecodeError):
        return False


def _esqueleto_contiene_texto(nombre: str) -> bool:
    """Devuelve True si el esqueleto lleva texto visible (sí hay que encolar)."""
    ruta = RUTA_REPARAR / nombre
    try:
        contenido = ruta.read_text(encoding="utf-8", errors="replace")
        return _tiene_texto(contenido)
    except (OSError, UnicodeDecodeError):
        return False


def _cargar_cola() -> Dict:
    """Carga la cola de reparación desde el archivo JSON."""
    try:
        with open(RUTA_COLA, "r", encoding="utf-8") as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError):
        return {"ola": "NAV1112", "tareas": []}


def _guardar_cola(cola: Dict) -> None:
    """Guarda la cola en archivo JSON."""
    with open(RUTA_COLA, "w", encoding="utf-8") as f:
        json.dump(cola, f, ensure_ascii=False, indent=2)


def _sesion_por_nombre(nombre: str) -> str:
    """Devuelve el nombre de sesión a partir del nombre del archivo del esqueleto."""
    if nombre.startswith("20261112-insta-guardados-maggasukha"):
        return "instagram-maggasukha"
    if nombre.startswith("20261112-insta-guardados-sociedad"):
        return "instagram-sociedad"
    return "desconocida"


def _enviar_a_cola(lector: str, esqueleto: str) -> None:
    """Encola una tarea para reparar el extractor del lector dado."""
    cola = _cargar_cola()
    siguiente_id = len(cola.get("tareas", [])) + 1
    tarea_id = f"NAV1112I-{chr(64 + siguiente_id)}"
    prompt = (
        f"El lector roto es {lector}. La página ha cambiado: {esqueleto}. "
        f"Ajusta solo el extractor puro y sus tests. "
        f"Pruebas puras, sin mocks de Node, máximo 120 líneas por archivo."
    )
    nueva_tarea = {
        "id": tarea_id,
        "ola": "NAV1112",
        "titulo": f"Reparador del enjambre · {lector}",
        "archivos": [
            f"scripts/puente/lector_{lector}.py",
            f"scripts/puente/test_lector_{lector}.py"
        ],
        "depende": [],
        "prompt": prompt
    }
    cola.setdefault("tareas", []).append(nueva_tarea)
    _guardar_cola(cola)


def procesar() -> None:
    """Main: si hay esqueletos nuevos y válidos, descárguelos o encollos."""
    RUTA_REPARAR.mkdir(parents=True, exist_ok=True)

    for archivo in RUTA_REPARAR.glob("*.html"):
        if archivo.stat().st_size == 0:
            continue

        if _esqueleto_valido(archivo.name):
            try:
                archivo.unlink()
            except OSError:
                pass
            continue

        if _esqueleto_contiene_texto(archivo.name):
            nombre_lector = _sesion_por_nombre(archivo.name)
            esqueleto = archivo.read_text(encoding="utf-8", errors="replace")
            _enviar_a_cola(nombre_lector, esqueleto)
            try:
                archivo.unlink()
            except OSError:
                pass


if __name__ == "__main__":
    procesar()
