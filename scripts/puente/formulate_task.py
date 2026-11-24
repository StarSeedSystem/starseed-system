#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""formulate_task · formular la siguiente tarea inteligente con motor real (IMG-des-simular).
 
Sustituye el random.choice de blueprints por llamada a motor real (starseed-sub o proveedor).
La función es PURA salvo la llamada al motor (inyectable).
"""
from __future__ import annotations

import json
import os
import re
import signal
import subprocess
import tempfile
import unicodedata
from datetime import datetime
from typing import Callable, Dict, Optional

import autodesarrollo_fuentes as AF
import autodesarrollo_decidir as AD


MotorReal = Callable[[str, str], str]  # (prompt, rol) -> JSON string respuesta


PROMPT_BASE = (
    "Comprueba si sigue haciendo falta; si ya está hecho, responde NO APLICA. "
    "Si hace falta: {titulo}. {cuerpo} "
    "Máximo 3 archivos y 120 líneas por archivo; tsc y pruebas en verde."
)


def _id_seguro(v: str, n: int = 60) -> str:
    """Identificador seguro para ids y nombres de archivo: [a-z0-9-], sin acentos, ≤ n."""
    t = unicodedata.normalize("NFKD", str(v or "").strip().lower())
    t = "".join(c for c in t if not unicodedata.combining(c))
    t = re.sub(r"[^a-z0-9]+", "-", t).strip("-")
    return t[:n].strip("-") or "x"


def _extraer_json(texto: str) -> Optional[Dict]:
    """Extrae el primer objeto JSON válido del texto."""
    if not isinstance(texto, str) or "{" not in texto:
        return None
    principio = texto.find("{")
    fin = texto.rfind("}")
    if fin <= principio:
        return None
    try:
        return json.loads(texto[principio:fin + 1])
    except (json.JSONDecodeError, ValueError):
        return None


def _llamar_starseed_sub(prompt: str, rol: str = "codigo", popen=None, plazo_s: float = 120) -> str:
    """Llama a starseed-sub como motor de fallback (gratuito, local).

    (SUP1124G, MEDIDO el 24-11) `starseed-sub codigo` es un agente de código (`opencode run`): con el repo como
    carpeta de trabajo editaba ese árbol, y al vencer el plazo `subprocess.run` cortaba solo al hijo directo, así que
    el agente seguía vivo con un vitest entero. Una prueba del puente (sin motor inyectado) lo lanzó en el árbol de
    pruebas de la autopublicación y la swap dejó la Mac con 0,4 GB de disco. Ahora corre en una carpeta temporal
    vacía y en su propia sesión, y al vencer el plazo se corta su grupo entero. `popen` se inyecta en las pruebas."""
    vacio = json.dumps({"propuesta": {"titulo": "", "cuerpo": "", "tipo": "codigo", "referencias": [], "archivos": []}})
    popen = popen or subprocess.Popen
    try:
        with tempfile.TemporaryDirectory(prefix="starseed-formular-") as carpeta:
            proc = popen(["starseed-sub", rol, prompt], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
                         cwd=carpeta, start_new_session=True)
            try:
                salida, _ = proc.communicate(timeout=plazo_s)
            except subprocess.TimeoutExpired:
                try:
                    os.killpg(proc.pid, signal.SIGTERM)  # el grupo entero: el agente y lo que lanzó
                except OSError:
                    pass
                try:
                    proc.communicate(timeout=10)
                except Exception:  # noqa: BLE001
                    pass
                return vacio
            if proc.returncode == 0 and (salida or "").strip():
                return salida.strip()
    except (FileNotFoundError, OSError):
        pass
    return vacio


def formulate_next_intelligent_task(
    propuesta: Dict,
    mem_root: str,
    ahora: datetime,
    motor: Optional[MotorReal] = None,
    rol: str = "codigo",
) -> Dict:
    """Formular la siguiente tarea inteligente para una propuesta aprobada/autodesarrollo.

    Args:
        propuesta: Propuesta normalizada con id, titulo, cuerpo, archivos, utilidad, importancia, fuente, estado
        mem_root: Ruta a starseed_memory_root
        ahora: Timestamp actual
        motor: Función motor real (prompt, rol) -> JSON string. Si None, usa starseed-sub.
        rol: Rol para el motor (codigo, diseno, investigacion, etc.)

    Returns:
        Dict con la tarea formulada (id, ola, titulo, tipo, modo, area, archivos, prompt, etc.)
    """
    # Validar propuesta
    if not isinstance(propuesta, dict) or not propuesta.get("id") or not propuesta.get("titulo"):
        raise ValueError("Propuesta inválida: falta id o titulo")

    estado = propuesta.get("estado", "")
    if estado not in ("autodesarrollo", "aprobada", "encargada"):
        raise ValueError(f"Propuesta en estado no formulable: {estado}")

    # Determinar motor a usar
    motor_real = motor or _llamar_starseed_sub

    # Construir prompt con la plantilla base
    titulo = str(propuesta.get("titulo", "")).strip()
    cuerpo = str(propuesta.get("cuerpo", "")).strip()
    archivos = propuesta.get("archivos") or []
    prompt = PROMPT_BASE.format(titulo=titulo, cuerpo=cuerpo[:600])

    # Añadir contexto medido si existe
    contexto_path = os.path.join(mem_root, "imaginacion", "contexto.json")
    if os.path.exists(contexto_path):
        try:
            with open(contexto_path, encoding="utf-8") as f:
                ctx = json.load(f)
            if ctx.get("archivos"):
                prompt += f"\n\nArchivos que existen (cítalos tal cual): {', '.join(ctx['archivos'][:10])}"
        except (OSError, ValueError):
            pass

    # Llamar al motor real
    respuesta = motor_real(prompt, rol)
    datos = _extraer_json(respuesta)

    if not datos or not isinstance(datos.get("propuesta"), dict):
        # Fallback: tarea mínima con lo que tenemos
        propuesta_motor = {"titulo": titulo, "cuerpo": cuerpo, "tipo": rol, "referencias": [], "archivos": archivos[:3]}
    else:
        propuesta_motor = datos["propuesta"]

    # Construir la tarea final
    pid = propuesta["id"]
    fuente_prefijo = pid.split(":")[0] if ":" in pid else "img"
    # Usar el sufijo del id de la propuesta (después de los dos puntos) para el id de la tarea
    id_sufijo = pid.split(":", 1)[1] if ":" in pid else _id_seguro(titulo)
    version = propuesta.get("version", 1)
    tarea_id = f"IMG-{fuente_prefijo}-{id_sufijo}-v{version}"

    # Determinar tipo y modo según la vía
    via = AD.via(propuesta, None) if hasattr(AD, "via") else "codigo"
    fuente = propuesta.get("fuente", "")
    if via == "entregable" or fuente == "agentes":
        tipo_tarea = "analisis"
        modo = "libre"
        prefijo_ola = "Imaginación · ENTREGABLE"
    elif via == "astraura":
        tipo_tarea = "analisis"
        modo = "reimaginar"
        prefijo_ola = "Imaginación · astraura"
    else:
        tipo_tarea = "analisis"
        modo = "libre"
        prefijo_ola = "Imaginación · autodesarrollo"

    archivos_finales = propuesta_motor.get("archivos") or archivos[:3]
    if not isinstance(archivos_finales, list):
        archivos_finales = [archivos_finales] if archivos_finales else []

    tarea = {
        "id": tarea_id,
        "ola": f"{prefijo_ola} {ahora.strftime('%Y-%m-%d')}",
        "titulo": propuesta_motor.get("titulo") or titulo,
        "tipo": tipo_tarea,
        "modo": modo,
        "area": "imaginacion",
        "archivos": archivos_finales[:3],
        "depende": [],
        "propuesta": {
            k: propuesta.get(k)
            for k in ("id", "fuente", "agente", "tipo", "ambito", "titulo", "cuerpo",
                      "referencias", "archivos", "version", "version_de")
            if propuesta.get(k) is not None
        },
        "prompt": prompt,
    }

    # Añadir rol y capacidad para diseño/investigación
    if rol in ("diseno", "investigacion", "contenido"):
        tarea.update(rol=rol, capacidad="alta")

    return tarea


def formular_lote(
    propuestas: list,
    mem_root: str,
    ahora: datetime,
    motor: Optional[MotorReal] = None,
) -> list:
    """Formular múltiples tareas de un lote (para aprobadas automáticas)."""
    tareas = []
    for p in propuestas:
        try:
            rol = "diseno" if p.get("tipo") in ("diseno", "contenido", "investigacion") else "codigo"
            tarea = formulate_next_intelligent_task(p, mem_root, ahora, motor, rol)
            tareas.append(tarea)
        except Exception:
            continue  # Saltar propuestas que fallen, loguear en producción
    return tareas