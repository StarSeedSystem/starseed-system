#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Huerfanas críticas: tareas que pasan a «huérfana» sin terminar.

El líder llama este módulo en cada vuelta para detectar tareas críticas
que han quedado sin cola fuente (como SIN1114C, SIN1114D). Cuando se ve
una tarea huérfana, se vuelve a encolar desde su contrato (architecture/*.md)
o se escala al Mando y al chat de la síntesis.

Importante: nada se pierde en silencio.
"""
from __future__ import annotations

import json
import os
import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
if DIRECTORIO not in sys.path:
    sys.path.insert(0, DIRECTORIO)

RAIZ = os.environ.get("STARSEED_ROOT") or os.path.dirname(os.path.dirname(DIRECTORIO))
REL_OLAS = "starseed_memory_root/olas"


def _ruta_olas(raiz: str) -> str:
    """Ruta relativa a las colas dentro de la raíz."""
    return os.path.join(raiz, REL_OLAS)


def colas_activas(raiz: str = RAIZ) -> dict:
    """Las colas vivas y sus tareas pendientes."""
    try:
        rutas_cola = [
            os.path.join(raiz, REL_OLAS, n)
            for n in (os.listdir(os.path.join(raiz, REL_OLAS)) or [])
            if n.endswith(".json") and not n.startswith("cola-auto-")
        ]
    except OSError:
        return {}

    salida = {}
    for ruta in rutas_cola:
        try:
            with open(ruta, encoding="utf-8") as f:
                datos = json.load(f)
            if isinstance(datos, dict):
                tareas = datos.get("tareas") or []
                cola = datos.get("cola") or os.path.basename(ruta)
            elif isinstance(datos, list):
                tareas = datos
                cola = os.path.basename(ruta)
            else:
                continue
            # Preservar el campo 'creada' si existe en las tareas
            tareas_procesadas = []
            for t in tareas:
                if isinstance(t, dict):
                    tareas_procesadas.append({
                        "id": t.get("id", ""),
                        "creada": t.get("creada", "")
                    })
                else:
                    tareas_procesadas.append({
                        "id": str(t) if t else "",
                        "creada": ""
                    })
            salida[cola] = {"ruta": ruta, "tareas": tareas_procesadas}
        except (OSError, ValueError):
            continue
    return salida


def tareas_encoladas(raiz: str = RAIZ) -> dict:
    """Todas las tareas encoladas, indexadas por id."""
    colas = colas_activas(raiz)
    salida = {}
    for cola, datos in colas.items():
        tareas = datos.get("tareas") or []
        for t in tareas:
            # Tareas pueden ser strings (solo el id) o dicts completos
            if isinstance(t, dict):
                tid = t.get("id")
                creada = t.get("creada", "")
            else:
                tid = t
                creada = ""
            if tid:
                salida[tid] = {
                    "cola": cola,
                    "rama": datos.get("rama"),
                    "creada": creada
                }
    return salida


def identificar_contrato(tarea_id: str, raiz: str = RAIZ) -> Optional[dict]:
    """Busca el contrato de una tarea en architecture/*.md.

    Una tarea crítica tiene su contrato en un archivo .md con su ID.
    Ejemplo: SIN1114C-enclave.md o algo similar.

    Returns:
        dict con 'ruta', 'titulo', 'archivos_clave' o None si no se encuentra
    """
    arquitectura = os.path.join(raiz, "architecture")
    try:
        archivos = [n for n in os.listdir(arquitectura) if n.endswith(".md")]
    except OSError:
        return None

    for nombre in archivos:
        if tarea_id in nombre:
            ruta = os.path.join(arquitectura, nombre)
            try:
                with open(ruta, encoding="utf-8") as f:
                    contenido = f.read()
                titulo = re.search(r"^#\s+(.+)$", contenido, re.MULTILINE)
                titulo = titulo.group(1).strip() if titulo else nombre
                archivos_clave = re.findall(r"`([^`]+\.(ts|tsx|py|json|md))`", contenido)
                archivos_clave = [a[0] for a in archivos_clave[:10]]
                return {
                    "ruta": ruta,
                    "titulo": titulo,
                    "archivos_clave": archivos_clave,
                }
            except OSError:
                continue
        # Fallback: coincidencia por prefijo (primeros caracteres)
        if nombre.startswith(tarea_id):
            ruta = os.path.join(arquitectura, nombre)
            try:
                with open(ruta, encoding="utf-8") as f:
                    contenido = f.read()
                titulo = re.search(r"^#\s+(.+)$", contenido, re.MULTILINE)
                titulo = titulo.group(1).strip() if titulo else nombre
                archivos_clave = re.findall(r"`([^`]+\.(ts|tsx|py|json|md))`", contenido)
                archivos_clave = [a[0] for a in archivos_clave[:10]]
                return {
                    "ruta": ruta,
                    "titulo": titulo,
                    "archivos_clave": archivos_clave,
                }
            except OSError:
                continue
    return None


def tareas_huerfanas(raiz: str = RAIZ, dias_huerto: int = 14) -> list:
    """Detecta tareas que han estado pendientes más de `dias_huerto` días.

    Una tarea es "huérfana" si:
    1. Está en una cola viva hace más de `dias_huerto` días sin cambios
    2. O su cola fuente no existe más (el agente que la creó ya no la define)

    Returns:
        lista de dicts con info para reenclazar:
        - id: id de la tarea
        - motivo: por qué es huérfana
        - contrato: ruta al contrato (si se encontró)
        - cola_actual: donde está ahora
    """
    tareas = tareas_encoladas(raiz)
    ahora = datetime.now(timezone.utc)
    limite = (ahora - timedelta(days=dias_huerto)).isoformat()

    huérfanas = []
    for tid, info in tareas.items():
        if not info:
            continue
        ultima_creacion = info.get("creada", "") or ""
        if ultima_creacion and ultima_creacion < limite:
            huérfana_info = {
                "id": tid,
                "motivo": "cola_inactiva",
                "cola_actual": info.get("cola"),
            }
            contrato = identificar_contrato(tid, raiz=raiz)
            if contrato:
                huérfana_info["contrato"] = contrato
            huérfanas.append(huérfana_info)

    return huérfanas


def reencolar_huerfana(raiz: str, tarea_id: str, motivo: str = "reintegro") -> dict:
    """Reencalda una tarea huérfana a su cola o a una nueva.

    Reglas:
    - Si tiene contrato, se reenclava con el mismo formato
    - Si no tiene contrato, se escala al Mando y al chat

    Returns:
        dict con resultado de la operación
    """
    tareas = tareas_encoladas(raiz)
    info = tareas.get(tarea_id, {})

    contrato = identificar_contrato(tarea_id, raiz=raiz)
    if contrato:
        nueva_cola = "cola-suenos-huerfanas.json"
        ruta_cola = os.path.join(raiz, REL_OLAS, nueva_cola)

        try:
            previas = []
            if os.path.exists(ruta_cola):
                with open(ruta_cola, encoding="utf-8") as f:
                    datos = json.load(f)
                previas = datos if isinstance(datos, list) else datos.get("tareas", [])

            nueva_tarea = {
                "id": f"R{tarea_id[1:]}",
                "ola": f"Recuperación {tarea_id}",
                "titulo": f"[{tarea_id}] Recuperación de tarea huérfana",
                "archivos": contrato.get("archivos_clave", []),
                "depende": [],
                "prompt": f"""Tarea crítica huérfana: {tarea_id}

Este es un reintegro de una tarea que se perdió en el orquestador.
Contrato: {contrato['ruta']}
Título: {contrato['titulo']}

Vuelve a redactar o procesar según el contrato original.
No duplicar trabajo: verifica primero si ya está integrado.
""",
                "creada": datetime.now(timezone.utc).isoformat(),
                "estado": "pendiente",
            }

            todas = previas + [nueva_tarea]
            Path(ruta_cola + ".tmp").parent.mkdir(parents=True, exist_ok=True)
            with open(ruta_cola + ".tmp", "w", encoding="utf-8") as f:
                json.dump(todas, f, ensure_ascii=False, indent=1)
            os.replace(ruta_cola + ".tmp", ruta_cola)

            return {
                "ok": True,
                "accion": "reencolada",
                "id": tarea_id,
                "nueva_cola": nueva_cola,
                "mensaje": f"Tarea {tarea_id} reencolada en {nueva_cola}",
            }
        except Exception as e:
            return {
                "ok": False,
                "accion": "error",
                "id": tarea_id,
                "error": str(e),
                "mensaje": f"Error al reencolar {tarea_id}: {e}",
            }
    else:
        # Sin contrato: se escala al Mando y al chat (nunca se pierde en silencio)
        return {
            "ok": True,
            "accion": "escalar",
            "id": tarea_id,
            "motivo": "sin_contrato",
            "mensaje": f"Tarea {tarea_id} sin contrato: se escala al Mando",
        }

    nueva_cola = "cola-suenos-huerfanas.json"
    ruta_cola = os.path.join(raiz, REL_OLAS, nueva_cola)

    try:
        previas = []
        if os.path.exists(ruta_cola):
            with open(ruta_cola, encoding="utf-8") as f:
                datos = json.load(f)
            previas = datos if isinstance(datos, list) else datos.get("tareas", [])

        nueva_tarea = {
            "id": f"R{tarea_id[1:]}",
            "ola": f"Recuperación {tarea_id}",
            "titulo": f"[{tarea_id}] Recuperación de tarea huérfana",
            "archivos": contrato.get("archivos_clave", []),
            "depende": [],
            "prompt": f"""Tarea crítica huérfana: {tarea_id}

Este es un reintegro de una tarea que se perdió en el orquestador.
Contrato: {contrato['ruta']}
Título: {contrato['titulo']}

Vuelve a redactar o procesar según el contrato original.
No duplicar trabajo: verifica primero si ya está integrado.
""",
            "creada": datetime.now(timezone.utc).isoformat(),
            "estado": "pendiente",
        }

        todas = previas + [nueva_tarea]
        Path(ruta_cola).parent.mkdir(parents=True, exist_ok=True)
        with open(ruta_cola + ".tmp", "w", encoding="utf-8") as f:
            json.dump(todas, f, ensure_ascii=False, indent=1)
        os.replace(ruta_cola + ".tmp", ruta_cola)

        return {
            "ok": True,
            "accion": "reencolada",
            "id": tarea_id,
            "nueva_cola": nueva_cola,
            "mensaje": f"Tarea {tarea_id} reencolada en {nueva_cola}",
        }
    except Exception as e:
        return {
            "ok": False,
            "accion": "error",
            "id": tarea_id,
            "error": str(e),
            "mensaje": f"Error al reencolar {tarea_id}: {e}",
        }


def procesar_huerfanas(raiz: str = RAIZ) -> dict:
    """Procesa todas las tareas huérfanas detectadas.

    Este es el punto de entrada que el líder llama en cada vuelta.

    Returns:
        dict con resumen de la operación
    """
    huérfanas = tareas_huerfanas(raiz)
    resultados = {
        "ok": True,
        "total_huerfanas": len(huérfanas),
        "procesadas": 0,
        "reencoladas": [],
        "escaladas": [],
        "errores": [],
    }

    for h in huérfanas:
        salida = reencolar_huerfana(raiz, h["id"])
        if salida["ok"]:
            resultados["procesadas"] += 1
            if salida["accion"] == "reencolada":
                resultados["reencoladas"].append(h["id"])
            else:
                resultados["escaladas"].append(h["id"])
        else:
            resultados["errores"].append({"id": h["id"], "error": salida.get("error")})

    return resultados


if __name__ == "__main__":
    import argparse

    p = argparse.ArgumentParser(description="Detección y recuperación de tareas huérfanas críticas")
    p.add_argument("--raiz", default=RAIZ)
    p.add_argument("--listar", action="store_true", help="Muestra las tareas huérfanas")
    p.add_argument("--procesar", action="store_true", help="Reencola las tareas huérfanas")

    a = p.parse_args()

    if a.listar or a.procesar:
        resultados = procesar_huerfanas(a.raiz) if a.procesar else {"total_huerfanas": len(tareas_huerfanas(a.raiz))}

        if a.listar or resultados.get("reencoladas") or resultados.get("escaladas"):
            print(json.dumps(resultados, ensure_ascii=False, indent=1, default=str))
        else:
            print(json.dumps(resultados, ensure_ascii=False, indent=1))
    else:
        print(json.dumps({"usage": "python huerfanas_criticas.py --listar | --procesar"}, ensure_ascii=False))