#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""imaginacion_recomendador · recomienda siguientes tareas de imaginación si quedan plantillas abiertas (IMG-des-simular).

Lee plantillas abiertas y contexto medido, y sugiere acciones concretas.
PURO: sin red, reloj por parámetro, disco solo lectura.
"""
from __future__ import annotations

import json
import os
from datetime import datetime
from typing import Callable, Dict, List, Optional

import imaginacion_contexto as IC
import imaginacion_plantilla as IP


ExisteFn = Callable[[str], bool]


def _leer_plantillas(mem_root: str) -> List[Dict]:
    """Lee plantillas abiertas de imaginacion/plantillas.json."""
    ruta = os.path.join(mem_root, "imaginacion", "plantillas.json")
    try:
        with open(ruta, encoding="utf-8") as f:
            datos = json.load(f)
        plantillas = datos.get("plantillas") if isinstance(datos, dict) else None
        if isinstance(plantillas, list):
            return [p for p in plantillas if isinstance(p, dict) and p.get("estado") == "abierta"]
    except (OSError, ValueError):
        pass
    return []


def _leer_contexto_medido(mem_root: str, ahora: datetime, existe: ExisteFn) -> Dict:
    """Lee el contexto medido de imaginacion_contexto.construir si hay datos."""
    # Intentar leer propuestas, progreso, tareas, medidores del disco
    propuestas_path = os.path.join(mem_root, "imaginacion", "propuestas.json")
    progreso_path = os.path.join(mem_root, "olas", "progreso.json")
    medidores_path = os.path.join(mem_root, "mando", "vigia-medidores.json")

    propuestas = []
    progreso = {}
    tareas = {}
    medidores = {}

    for ruta, destino in [(propuestas_path, "propuestas"), (progreso_path, "progreso"),
                           (medidores_path, "medidores")]:
        try:
            with open(ruta, encoding="utf-8") as f:
                datos = json.load(f)
            if destino == "propuestas":
                propuestas = datos.get("propuestas", []) if isinstance(datos, dict) else (datos if isinstance(datos, list) else [])
            elif destino == "progreso":
                progreso = datos if isinstance(datos, dict) else {}
            elif destino == "medidores":
                medidores = datos if isinstance(datos, dict) else {}
        except (OSError, ValueError):
            pass

    # Leer tareas de colas abiertas
    olas_dir = os.path.join(mem_root, "olas")
    try:
        for nombre in os.listdir(olas_dir):
            if nombre.startswith("cola-") and nombre.endswith(".json"):
                with open(os.path.join(olas_dir, nombre), encoding="utf-8") as f:
                    cola = json.load(f)
                for t in cola if isinstance(cola, list) else (cola.get("tareas", []) if isinstance(cola, dict) else []):
                    if isinstance(t, dict) and t.get("id"):
                        tareas[t["id"]] = {"archivos": t.get("archivos", []), "area": t.get("area", "")}
    except OSError:
        pass

    if not (propuestas or progreso or tareas or medidores):
        return {}

    ctx = IC.construir(propuestas, progreso, tareas, medidores, existe, ahora)
    return ctx


def _generar_recomendacion(plantilla: Dict, ctx: Dict, raiz: str) -> Dict:
    """Genera una recomendación concreta para una plantilla abierta."""
    titulo = plantilla.get("titulo", "Sin título")
    archivos = plantilla.get("archivos", [])
    archivos_reales = [a for a in archivos if os.path.exists(os.path.join(raiz, a))]

    recomendacion = {
        "id": f"rec-{plantilla.get('id', 'unknown')}",
        "plantilla_id": plantilla.get("id"),
        "titulo": f"Continuar: {titulo}",
        "accion": "implementar" if archivos_reales else "investigar",
        "archivos": archivos_reales[:3] if archivos_reales else archivos[:3],
        "contexto": ctx.get("texto", "")[:500] if ctx.get("texto") else "",
        "familias_evitar": ctx.get("secciones", []),
    }

    # Añadir criterio de aceptación basado en la plantilla
    if IP.PLANTILLA:
        recomendacion["criterio_aceptacion"] = "Verificar que los archivos existen y la implementación pasa tsc y pruebas"

    return recomendacion


def recomendar_siguientes(
    raiz_o_mem: str,
    ahora: datetime,
    existe: Optional[ExisteFn] = None,
) -> List[Dict]:
    """Recomienda siguientes pasos de imaginación si hay plantillas abiertas.

    Args:
        raiz_o_mem: Raíz del repo O starseed_memory_root (se detecta automáticamente)
        ahora: Timestamp actual
        existe: Función para verificar si un archivo existe (por defecto os.path.isfile)

    Returns:
        Lista de recomendaciones (vacía si no hay plantillas abiertas)
    """
    # Detectar si es raiz del repo o mem_root
    if raiz_o_mem.endswith("starseed_memory_root"):
        mem_root = raiz_o_mem
        raiz = os.path.dirname(mem_root)
    else:
        raiz = raiz_o_mem
        mem_root = os.path.join(raiz, "starseed_memory_root")

    existe_fn = existe or (lambda r: os.path.isfile(os.path.join(raiz, r)))

    # Leer plantillas abiertas
    plantillas = _leer_plantillas(mem_root)
    if not plantillas:
        return []

    # Leer contexto medido
    ctx = _leer_contexto_medido(mem_root, ahora, existe_fn)

    # Generar recomendaciones
    recomendaciones = []
    for plantilla in plantillas:
        rec = _generar_recomendacion(plantilla, ctx, raiz)
        recomendaciones.append(rec)

    return recomendaciones


def recomendar_para_propuesta(
    propuesta: Dict,
    raiz_o_mem: str,
    ahora: datetime,
    existe: Optional[ExisteFn] = None,
) -> Optional[Dict]:
    """Recomienda acción específica para una propuesta decidible."""
    if not isinstance(propuesta, dict) or not propuesta.get("id"):
        return None

    estado = propuesta.get("estado", "")
    if estado not in ("nueva", "pregunta", "esperando-aprobacion", "autodesarrollo"):
        return None

    # Leer contexto
    if raiz_o_mem.endswith("starseed_memory_root"):
        mem_root = raiz_o_mem
        raiz = os.path.dirname(mem_root)
    else:
        raiz = raiz_o_mem
        mem_root = os.path.join(raiz, "starseed_memory_root")

    existe_fn = existe or (lambda r: os.path.isfile(os.path.join(raiz, r)))
    ctx = _leer_contexto_medido(mem_root, ahora, existe_fn)

    # Generar recomendación basada en el estado y utilidad
    utilidad = propuesta.get("utilidad", 0.0)
    importancia = propuesta.get("importancia", "media")

    if estado == "autodesarrollo":
        accion = "ejecutar"
        detalle = "La propuesta está lista para autodesarrollo: asignar a la flota"
    elif estado == "esperando-aprobacion":
        accion = "revisar"
        detalle = f"Espera aprobación (importancia: {importancia}). Revisar utilidad {utilidad:.2f}."
    elif estado == "pregunta":
        accion = "aclarar"
        detalle = f"En estado pregunta: {propuesta.get('motivo', 'sin motivo')}. Aportar notas/referencias."
    else:  # nueva
        accion = "evaluar"
        detalle = f"Nueva propuesta con utilidad {utilidad:.2f}. Evaluar accionabilidad y archivos."

    return {
        "propuesta_id": propuesta["id"],
        "titulo": propuesta.get("titulo", ""),
        "accion": accion,
        "detalle": detalle,
        "utilidad": utilidad,
        "importancia": importancia,
        "archivos_existen": [a for a in (propuesta.get("archivos") or []) if existe_fn(a)],
        "contexto_resumido": ctx.get("texto", "")[:300] if ctx.get("texto") else "",
    }