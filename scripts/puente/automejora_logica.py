#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Lógica de automejora MTN1027D (Meta^n): funciones puro, sin red ni disco.
Contrato: architecture/automejora-meta-n.md §3–§5 — Meta^n propone, StarSeed juzga integra.
Todas las funciones son PURO: sin `node:*`, sin importar módulos de Node,
sin claves, sin rutas del disco (solo nombres de variables de entorno)."""

from __future__ import annotations

import hashlib
import json
import os
import re
from datetime import datetime
from pathlib import Path

CAPAS_VALIDAS = ("regla", "needle", "jev", "bitnet", "llm", "persona")

LIMITE_CARACTERES = 1200
CASOS_MINIMOS_RETIRO = 50
CAIDA_MINIMA_RETIRO = 0.03


# ---------------------------------------------------------------------------
# 1. tareas_desde_experiencias –parte las experiencias por huella SHA-256:
#    70 % entrenamiento, 30 % APARTADAS (siempre las mismas).
# ---------------------------------------------------------------------------

def tareas_desde_experiencias(experiencias: list[dict], capa: str) -> dict:
    """Crea tareas de Meta^n a partir de experiencias con resultado conocido.

    70 % de las experiencias van a entrenamiento; 30 % se apartan (siempre la misma
    división por huella SHA-256 del task_id). Devuelve un dict con dos listas:
    - "entrenamiento": experiencias con su verification_script
    - "apartadas": dos sublistas — "con_etiqueta" (para el juez) y
      "sin_script" (lo único que entra en la caja, sin verification_script)."""
    if capa not in CAPAS_VALIDAS:
        raise ValueError(f"capa desconocida: {capa}")

    # Filtrar solo experiencias con resultado conocido
    con_resultado = [
        e for e in experiencias
        if e.get("resultado") is not None
    ]

    # Calcular huella SHA-256 de cada id y clasificar
    entrenamiento = []
    apartadas_con_etiqueta = []
    apartadas_sin_script = []

    for exp in con_resultado:
        task_id = exp.get("id", "")
        sha = hashlib.sha256(task_id.encode()).hexdigest()
        # Los primeros 2 hex chars determinan el bucket: 00-69 → 70%, 70-ff → 30%
        bucket = int(sha[:2], 16)

        # Construir la experiencia de tarea
        tarea = {
            "task_id": task_id,
            "description": exp.get("entrada", ""),
            "capa": exp.get("capa", capa),
            "estado": exp.get("salida", ""),
            "verification_script": None,
        }

        if bucket < 70:  # 70 % → entrenamiento
            tarea["verification_script"] = _script_verificacion(task_id, exp)
            entrenamiento.append(tarea)
        else:  # 30 % → apartadas
            # Versión sin verification_script para la lista que entra en la caja
            apartada_sin = {
                "task_id": task_id,
                "description": exp.get("entrada", ""),
                "capa": exp.get("capa", capa),
                "estado": exp.get("salida", ""),
            }
            # Versión con etiqueta para el juez (tiene verification_script)
            apartada_con = {
                "task_id": task_id,
                "description": exp.get("entrada", ""),
                "capa": exp.get("capa", capa),
                "estado": exp.get("salida", ""),
                "verification_script": tarea["verification_script"],
            }
            apartadas_sin_script.append(apartada_sin)
            apartadas_con_etiqueta.append(apartada_con)

    return {
        "entrenamiento": entrenamiento,
        "apartadas": {
            "con_etiqueta": apartadas_con_etiqueta,
            "sin_script": apartadas_sin_script,
        },
    }


def _script_verificacion(task_id: str, exp: dict) -> str | None:
    """Genera un script de verificación a partir de la experiencia."""
    salida = exp.get("salida", "")
    if isinstance(salida, dict) and "resultado" in salida:
        ok = bool(salida.get("resultado"))
        return json.dumps({"ok": ok, "task_id": task_id, "capa": exp.get("capa", "")},
                          ensure_ascii=False)
    return None


# ---------------------------------------------------------------------------
# 2. pauta_fija – texto si es el mismo en todos los casos, si no None
# ---------------------------------------------------------------------------

def pauta_fija(textos_por_caso: list[str] | None) -> str | None:
    """Devuelve el texto si es idéntico en todos los casos, None si varían o la lista
    está vacía. Es el texto de estrategia que no depende del caso individual."""
    if not textos_por_caso:
        return None
    primero = textos_por_caso[0]
    if any(t != primero for t in textos_por_caso[1:]):
        return None
    return primero


# ---------------------------------------------------------------------------
# 3. sanear_pauta – mismas reglas que sanearDirectiva de directivas.ts
#    (copia la lista, valida caracteres y restricciones).
# ---------------------------------------------------------------------------

def sanear_pauta(texto: str) -> dict:
    """Sanea el texto de una pauta propuesta: la deja lista o dice por qué se rechaza.
    Mismísimas reglas que sanearDirectiva de src/lib/astraura/capas/directivas.ts."""
    limpio = texto.strip()
    if not limpio:
        return {"ok": False, "texto": "", "motivo": "vacía"}
    if len(limpio) > LIMITE_CARACTERES:
        return {"ok": False, "texto": "", "motivo": f"supera {LIMITE_CARACTERES} caracteres"}
    # RE_URL
    if re.search(r"(?:https?://|www\.)\S+", limpio, re.IGNORECASE):
        return {"ok": False, "texto": "", "motivo": "contiene una URL"}
    # RE_DOMINIO
    if re.search(r"\b[\w-]{2,}\.(?:com|net|org|io|dev|app|ai|xyz|info)\b", limpio, re.IGNORECASE):
        return {"ok": False, "texto": "", "motivo": "contiene una URL"}
    # RE_BLOQUE_CODIGO
    if "```" in limpio:
        return {"ok": False, "texto": "", "motivo": "contiene un bloque de código"}
    # RE_FORMA_CLAVE (simplificada: sk-, mv2_, ghp_, AIza, o 20+ chars alfanuméricos)
    if re.search(r"\b(?:sk-|mv2_|ghp_)|AIza|\b[A-Za-z0-9]{20,}\b", limpio):
        return {"ok": False, "texto": "", "motivo": "contiene algo con forma de clave"}
    # RE_VARIABLE_ENTORNO
    if re.search(r"\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b", limpio):
        return {"ok": False, "texto": "", "motivo": "contiene un nombre de variable de entorno"}
    # RE_TEMAS_PROHIBIDOS
    if re.search(r"\b(?:permisos?|permissions?|n[úu]cleos?|kernels?|contrase[ñn]as?|passwords?|passwd)\b", limpio, re.IGNORECASE):
        return {"ok": False, "texto": "", "motivo": "habla de permisos, núcleo o contraseñas"}
    # RE_IGNORAR_INSTRUCCIONES
    if re.search(
        r"\b(?:ignor\w*|olv[íi]d\w*|desobedezc\w*|disregard\w*|bypass\w*|override)\b"
        r"[^.;]{0,32}?\b(?:instrucciones|instrucci[óo]n|instructions?|reglas?|rules?|[óo]rdenes|orders?|prompts?|directivas|directives?)\b",
        limpio, re.IGNORECASE,
    ):
        return {"ok": False, "texto": "", "motivo": "pide ignorar instrucciones"}

    return {"ok": True, "texto": limpio}


# ---------------------------------------------------------------------------
# 4. propuestas_de_ayuda – cada función de code_library → una tarea del enjambre
# ---------------------------------------------------------------------------

def propuestas_de_ayuda(
    injected_codes: list[dict],
    capa: str,
    fecha: str,
) -> list[dict]:
    """Convierte cada función de code_library en una propuesta de tarea del enjambre.

    Cada función → una tarea con id `AMJ<fecha><n>`, ≤ 3 archivos en
    `scripts/puente/ayudantes_<capa>.py` y su prueba, prompt que empieza por
    «Comprueba primero si sigue haciendo falta» y lleva la función como referencia.
    Ignora `task_solution_map`."""
    if capa not in CAPAS_VALIDAS:
        raise ValueError(f"capa desconocida: {capa}")

    propuestas = []
    for i, code in enumerate(injected_codes):
        n = i + 1
        task_id = f"AMJ{fecha}{n}"

        # Extraer la función de code_library si existe
        code_library = code.get("code_library", {}) or {}
        # Tomamos la primera función del library como referencia
        func_name = list(code_library.keys())[0] if code_library else f"help_{n}"

        # Los archivos a crear: ayudante + prueba, límite 3
        max_archivos = 3
        archivos = min(n, max_archivos)

        propuesta = {
            "task_id": task_id,
            "description": f"Implementa la función {func_name} para la capa {capa}",
            "capa": capa,
            "fecha": fecha,
            "archivos": [
                f"scripts/puente/ayudantes_{capa}.py",
                f"scripts/puente/test_ayudantes_{capa}.py",
            ][: archivos * 2],
            "prompt_inicio": "Comprueba primero si sigue haciendo falta",
            "referencia_funcion": func_name,
            "ignora": "task_solution_map",
        }
        propuestas.append(propuesta)

    return propuestas


# ---------------------------------------------------------------------------
# 5. veredicto – evalúa si la pauta mejora la base
# ---------------------------------------------------------------------------

def veredicto(
    acierto_base: float,
    acierto_con: float,
    n: int,
    margen: float = 0.03,
    n_min: int = 20,
) -> dict:
    """Evalúa si la pauta nueva mejora sobre la base.

    Pasa si acierto_con >= acierto_base + margen Y n >= n_min.
    Devuelve un dict con el resultado y la diferencia (redondeado a 2 decimals)."""
    if n < n_min:
        return {
            "aprueba": False,
            "motivo": f"solo {n} casos (mínimo {n_min})",
            "diferencia": round(acierto_con - acierto_base, 2),
        }

    diferencia = round(acierto_con - acierto_base, 2)
    if diferencia >= margen:
        return {
            "aprueba": True,
            "motivo": f"mejora {diferencia:.2f} ≥ {margen:.2f}",
            "diferencia": diferencia,
        }
    return {
        "aprueba": False,
        "motivo": f"caída {diferencia:.2f} < {margen:.2f}",
        "diferencia": diferencia,
    }


# ---------------------------------------------------------------------------
# 6. nueva_version – añade al historial; activa o "propuesta" según preguntar;
#    la anterior pasa a "anterior". Pruebas con experiencias falsas.
# ---------------------------------------------------------------------------

def nueva_version(
    archivo_directivas: dict,
    pauta: dict,
    acierto: float,
    base: float,
    n: int,
    fecha: str,
    origen: str,
    preguntar: bool,
) -> dict:
    """Añade una nueva versión al historial de directivas.

    Si `preguntar` es True, la nueva versión tiene estado "propuesta";
    si False, el juez decide y la pone "activa" o "anterior".

    La versión anterior pasa a "anterior". Devuelve el archivo NUEVO;
    el original queda intacto."""
    if not isinstance(archivo_directivas, dict):
        raise ValueError("archivo_directivas debe ser un dict")

    # Copiar para no mutar el original
    nuevo = {"v": archivo_directivas.get("v", 1), "capa": archivo_directivas.get("capa", ""),}

    historial = list(archivo_directivas.get("historial", []))

    # Determinar estado de la nueva versión
    if preguntar:
        estado_nueva = "propuesta"
    else:
        # El juez decide: si mejora, "activa"; si no, "anterior"
        veredicto_obj = veredicto(base, acierto, n)
        if veredicto_obj["aprueba"]:
            estado_nueva = "activa"
        else:
            estado_nueva = "anterior"

    # Crear la nueva entrada de directiva
    nueva_directiva = {
        "capa": archivo_directivas.get("capa", ""),
        "version": len(historial) + 1,
        "texto": pauta.get("texto", ""),
        "sha256": hashlib.sha256(
            pauta.get("texto", "").encode()).hexdigest()[:16],
        "acierto": acierto,
        "base": base,
        "n": n,
        "fecha": fecha,
        "origen": origen,
        "estado": estado_nueva,
    }

    # La versión anterior pasa a "anterior" si la nueva es "activa"
    if estado_nueva == "activa":
        # Marcar la versión activa anterior como "anterior" (no "retirada")
        for i, d in enumerate(historial):
            if d.get("estado") == "activa":
                historial[i] = {**d, "estado": "anterior", "motivo": "nueva versión activa"}
                break
        # No need for the extra loop — "anterior" already handles the chain

    historial.append(nueva_directiva)

    return {
        "v": nuevo.get("v", 1),
        "capa": nuevo.get("capa", ""),
        "historial": historial,
    }