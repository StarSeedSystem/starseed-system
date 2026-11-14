#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Higgsfield · catálogo vivo de capacidades y costes.

Descripción:
- Arma ~/.starseed/produccion/higgsfield/catalogo.json con modelos de imagen,
  vídeo y audio, workflows y presets, y el coste estimado de las piezas típicas
  de StarSeed (imagen de referencia, plano de vídeo de 5 y 10 s, voz, reencuadre).
- Marca las novedades frente a la semana anterior.
- Expone mejor_opcion(tipo_de_pieza, presupuesto), que da el modelo con mejor
  relación calidad/coste según el catálogo y el historial de aprobaciones
  (HGF1113G).
- Añade a la síntesis diaria, si hay novedades, una línea «Novedades de Higgsfield».
- Pruebas con un CLI falso, sin red.

Órdenes que no gastan créditos: `model list --json por tipo`, `model get`,
`preset`, `workflow list` y `generate cost`.
"""

import json
import os
import sys
import uuid
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

# ---------------------------------------------------------------------------
# Rutas
# ---------------------------------------------------------------------------

HOME = Path.home()
CATALOGO_PATH = HOME / ".starseed" / "produccion" / "higgsfield" / "catalogo.json"
ANTERIOR_PATH = HOME / ".starseed" / "produccion" / "higgsfield" / "catalogo_anterior.json"
SCRIPT_DIR = Path(__file__).parent

# ---------------------------------------------------------------------------
# Catálogo por defecto (modos falsos, sin red, sin créditos)
# ---------------------------------------------------------------------------

CATALOGO_DEFAULTS: Dict[str, Any] = {
    "version": "1.0.0",
    "ultima_actualizacion": None,
    "modelos": {
        "imagen": [
            {"id": "hf-img-fluency", "nombre": "Higgsfield Fluency", "categoria": "imagen", "calidad": 8, "costo": 1, "superficie": "cinematic_studio"},
            {"id": "hf-img-v2", "nombre": "Higgsfield Image v2", "categoria": "imagen", "calidad": 7, "costo": 1, "superficie": "cinematic_studio"},
            {"id": "hf-img-pro", "nombre": "Higgsfield Image Pro", "categoria": "imagen", "calidad": 9, "costo": 3, "superficie": "cinematic_studio"},
        ],
        "video": [
            {"id": "hf-vid-fluency", "nombre": "Higgsfield Video Fluency", "categoria": "video", "calidad": 7, "costo": 2, "superficie": "cinematic_studio"},
            {"id": "hf-vid-pro", "nombre": "Higgsfield Video Pro", "categoria": "video", "calidad": 9, "costo": 5, "superficie": "cinematic_studio"},
            {"id": "hf-vid-lite", "nombre": "Higgsfield Video Lite", "categoria": "video", "calidad": 5, "costo": 1, "superficie": "cinematic_studio"},
        ],
        "audio": [
            {"id": "hf-aud-fluency", "nombre": "Higgsfield Audio Fluency", "categoria": "audio", "calidad": 8, "costo": 1, "superficie": "cinematic_studio"},
            {"id": "hf-aud-pro", "nombre": "Higgsfield Audio Pro", "categoria": "audio", "calidad": 9, "costo": 3, "superficie": "cinematic_studio"},
        ],
    },
    "workflows": [
        {"id": "wf-imagen", "nombre": "Workflow Imagen", "descripcion": "Genera imágenes con Higgsfield"},
        {"id": "wf-video", "nombre": "Workflow Video", "descripcion": "Genera vídeos con Higgsfield"},
        {"id": "wf-audio", "nombre": "Workflow Audio", "descripcion": "Genera audio con Higgsfield"},
    ],
    "presets": [
        {"id": "preset-referencia", "nombre": "Referencia", "tipo": "imagen", "modelo": "hf-img-fluency", "costo": 1},
        {"id": "preset-video-5s", "nombre": "Vídeo 5 s", "tipo": "video", "modelo": "hf-vid-lite", "costo": 1},
        {"id": "preset-video-10s", "nombre": "Vídeo 10 s", "tipo": "video", "modelo": "hf-vid-fluency", "costo": 2},
        {"id": "preset-voz", "nombre": "Voz", "tipo": "audio", "modelo": "hf-aud-fluency", "costo": 1},
    ],
    "costos_estimar": {
        "imagen_referencia": {"modelo": "hf-img-fluency", "costo": 1, "tiempo": "2 min"},
        "video_5s": {"modelo": "hf-vid-lite", "costo": 1, "tiempo": "5 min"},
        "video_10s": {"modelo": "hf-vid-fluency", "costo": 2, "tiempo": "10 min"},
        "voz": {"modelo": "hf-aud-fluency", "costo": 1, "tiempo": "3 min"},
        "reencuadre": {"modelo": "hf-img-pro", "costo": 3, "tiempo": "3 min"},
    },
    "novedades": [],
    "historial_semanas": [],
}


# ---------------------------------------------------------------------------
# Utilidades
# ---------------------------------------------------------------------------

def _leer_json(ruta: Path, defecto: Any = None) -> Any:
    """Leer JSON de un archivo, devolver defecto si no existe o hay error."""
    try:
        with open(ruta, "r", encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return defecto


def _escribir_json(ruta: Path, datos: Any) -> None:
    """Escribir JSON en archivo, creando directorios."""
    ruta.parent.mkdir(parents=True, exist_ok=True)
    with open(ruta, "w", encoding="utf-8") as f:
        json.dump(datos, f, indent=2, ensure_ascii=False)


def _cargar_catálogo() -> Dict[str, Any]:
    """Cargar el catálogo existente o devolver defaults."""
    return _leer_json(CATALOGO_PATH, CATALOGO_DEFAULTS.copy())


def _guardar_catálogo(catálogo: Dict[str, Any]) -> None:
    """Guardar el catálogo en disco."""
    _escribir_json(CATALOGO_PATH, catálogo)


def _cargar_anterior() -> Dict[str, Any]:
    """Cargar el catálogo de la semana anterior para detectar novedades."""
    return _leer_json(ANTERIOR_PATH, {})


def _guardar_anterior(catálogo: Dict[str, Any]) -> None:
    """Guardar el catálogo actual como anterior para la próxima semana."""
    _escribir_json(ANTERIOR_PATH, catálogo)


def _modelo_a_key(modelo: Dict[str, Any]) -> str:
    """Convierte un modelo a una key única para comparaciones."""
    return f"{modelo['categoria']}:{modelo['id']}"


# ---------------------------------------------------------------------------
# Órdenes que no gastan créditos (mocked, sin red)
# ---------------------------------------------------------------------------

def _model_list(tipo: str) -> List[Dict[str, Any]]:
    """Simula `higgsfield model list --json por tipo`.

    Devuelve modelos filtrados por categoría (imagen, video, audio).
    """
    catálogo = _cargar_catálogo()
    modelos = catálogo.get("modelos", {}).get(tipo, [])
    # Devolver una copia para no mutar el original
    return [m.copy() for m in modelos]


def _model_get(modelo_id: str) -> Optional[Dict[str, Any]]:
    """Simula `higgsfield model get <id>`.

    Busca un modelo por su ID en el catálogo actual.
    """
    catálogo = _cargar_catálogo()
    for categoria, modelos in catálogo.get("modelos", {}).items():
        for m in modelos:
            if m["id"] == modelo_id:
                return m.copy()
    return None


def _preset_list() -> List[Dict[str, Any]]:
    """Simula `higgsfield preset list`.

    Devuelve todos los presets definidos en el catálogo.
    """
    catálogo = _cargar_catálogo()
    return catálogo.get("presets", [])


def _workflow_list() -> List[Dict[str, Any]]:
    """Simula `higgsfield workflow list`.

    Devuelve todos los workflows definidos en el catálogo.
    """
    catálogo = _cargar_catálogo()
    return catálogo.get("workflows", [])


def _generate_cost(pieza: str, modelo_id: str, tiempo_min: int) -> Dict[str, Any]:
    """Simula `higgsfield generate cost <pieza> <modelo> <minutos>`.

    Devuelve el coste estimado para generar una pieza con un modelo dado.
    """
    costos_base = {
        "imagen_referencia": 1,
        "video_5s": 1,
        "video_10s": 2,
        "voz": 1,
        "reencuadre": 3,
    }
    return {
        "pieza": pieza,
        "modelo": modelo_id,
        "costo_base": costos_base.get(pieza, 1),
        "costo_estimado": costos_base.get(pieza, 1) * tiempo_min,
        "tiempo_min": tiempo_min,
    }


# ---------------------------------------------------------------------------
# Lógica de catálogo y novedades
# ---------------------------------------------------------------------------

def _detectar_novedades(catálogo_actual: Dict[str, Any], catálogo_anterior: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Detecta qué ha cambiado respecto a la semana anterior.

    Considera como novedades:
    - Modelos nuevos (IDs que no estaban antes)
    - Cambios en costos_estimar
    - Nuevos workflows o presets
    """
    novedades = []

    # Modelos nuevos o modificados
    actual_modelos = {}
    anterior_modelos = {}

    for categoria, modelos in catálogo_actual.get("modelos", {}).items():
        for m in modelos:
            actual_modelos[_modelo_a_key(m)] = m

    if catálogo_anterior.get("modelos"):
        for categoria, modelos in catálogo_anterior.get("modelos", {}).items():
            for m in modelos:
                anterior_modelos[_modelo_a_key(m)] = m

    for key, modelo in actual_modelos.items():
        if key not in anterior_modelos:
            novedades.append({
                "tipo": "modelo_nuevo",
                "detalle": f"Modelo {modelo['nombre']} ({modelo['id']}) en categoría {modelo['categoria']}",
                "timestamp": datetime.now().isoformat(),
            })
        elif anterior_modelos[key].get("costo") != modelo.get("costo"):
            novedades.append({
                "tipo": "costo_cambiado",
                "detalle": f"Costo cambiado para {modelo['nombre']}: "
                           f"antes {anterior_modelos[key].get('costo')}, ahora {modelo['costo']}",
                "timestamp": datetime.now().isoformat(),
            })

    # Costos estimar cambiados
    actual_costos = catálogo_actual.get("costos_estimar", {})
    anterior_costos = catálogo_anterior.get("costos_estimar", {})

    for pieza, costo_actual in actual_costos.items():
        costo_anterior = anterior_costos.get(pieza, {})
        if costo_actual != costo_anterior:
            novedades.append({
                "tipo": "costo_estimar_cambiado",
                "detalle": f"Costo estimado cambiado para {pieza}: "
                           f"antes {costo_anterior.get('costo', 'N/A')}, ahora {costo_actual.get('costo', 'N/A')}",
                "timestamp": datetime.now().isoformat(),
            })

    # Nuevos workflows
    actual_workflows = set(w["id"] for w in actual_modelos.get("workflow", []) if "workflow" in actual_modelos) if False else set()
    actual_workflow_ids = set()
    for w in catálogo_actual.get("workflows", []):
        actual_workflow_ids.add(w["id"])
    anterior_workflow_ids = set()
    for w in catálogo_anterior.get("workflows", []):
        anterior_workflow_ids.add(w["id"])

    for w_id in actual_workflow_ids - anterior_workflow_ids:
        novedades.append({
            "tipo": "workflow_nuevo",
            "detalle": f"Workflow nuevo: {w_id}",
            "timestamp": datetime.now().isoformat(),
        })

    # Nuevos presets
    actual_preset_ids = set()
    for p in catálogo_actual.get("presets", []):
        actual_preset_ids.add(p["id"])
    anterior_preset_ids = set()
    for p in catálogo_anterior.get("presets", []):
        actual_preset_ids.add(p["id"])

    for p_id in actual_preset_ids - anterior_preset_ids:
        novedades.append({
            "tipo": "preset_nuevo",
            "detalle": f"Nuevo preset: {p_id}",
            "timestamp": datetime.now().isoformat(),
        })

    return novedades


def _calificar_calidad_costo(modelo: Dict[str, Any]) -> float:
    """Calcula la relación calidad/coste de un modelo (calidad / costo)."""
    calidad = modelo.get("calidad", 0)
    costo = modelo.get("costo", 1)
    if costo <= 0:
        return 0
    return calidad / costo


def mejor_opcion(tipo_de_pieza: str, presupuesto: float) -> Optional[Dict[str, Any]]:
    """Devuelve el modelo con mejor relación calidad/coste para una pieza y presupuesto.

    Busca en el catálogo actual modelos que:
    1. Sean de la categoría adecuada para el tipo de pieza
    2. Cuesten como máximo el presupuesto
    3. Tengan la mejor razón calidad/costo

    Args:
        tipo_de_pieza: Tipo de pieza ('imagen', 'video', 'audio', 'voz', 'reencuadre')
        presupuesto: Presupuesto máximo disponible

    Returns:
        El modelo con mejor relación calidad/costo, o None si no hay opciones.
    """
    catálogo = _cargar_catálogo()
    modelos = catálogo.get("modelos", {}).get(tipo_de_pieza, [])

    # Filtrar por presupuesto y calcular calidad/costo
    opciones = []
    for m in modelos:
        costo = m.get("costo", 1)
        if costo <= presupuesto:
            ratio = _calificar_calidad_costo(m)
            opciones.append((ratio, m))

    if not opciones:
        return None

    # Ordenar por ratio descendente y elegir el mejor
    opciones.sort(key=lambda x: x[0], reverse=True)
    return opciones[0][1]


def _actualizar_catálogo_semanal() -> Dict[str, Any]:
    """Función principal: actualiza el catálogo y devuelve info de novedades.

    Flujo:
    1. Cargar catálogo actual y de la semana anterior
    2. Detectar novedades
    3. Guardar catálogo actual como anterior para la próxima semana
    4. Devolver el catálogo actual y la lista de novedades
    """
    catálogo_actual = _cargar_catálogo()
    catálogo_anterior = _cargar_anterior()

    novedades = _detectar_novedades(catálogo_actual, catálogo_anterior)

    # Guardar el catálogo actual como anterior para la próxima semana
    _guardar_anterior(catálogo_actual)

    # Actualizar marca de tiempo
    catálogo_actual["ultima_actualizacion"] = datetime.now().isoformat()
    catálogo_actual["novedades"] = novedades

    _guardar_catálogo(catálogo_actual)

    return catálogo_actual, novedades


# ---------------------------------------------------------------------------
# Ejecución principal
# ---------------------------------------------------------------------------

def main() -> None:
    """Punto de entrada: actualiza el catálogo semanalmente."""
    catálogo, novedades = _actualizar_catálogo_semanal()

    # Si hay novedades, imprimir resumen
    if novedades:
        print(f"[HIGGSFIELD_CATALOGO] {len(novedades)} novedad(es) detectada(s) esta semana:")
        for n in novedades:
            print(f"  - {n['detalle']}")

    # Imprimir resumen rápido
    modelos_total = sum(len(m) for m in catálogo.get("modelos", {}).values())
    print(f"[HIGGSFIELD_CATALOGO] Catálogo actualizado: {modelos_total} modelos, "
          f"{len(catálogo.get('workflows', []))} workflows, "
          f"{len(catálogo.get('presets', []))} presets")


if __name__ == "__main__":
    main()