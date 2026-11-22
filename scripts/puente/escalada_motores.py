#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Escalada automática al mejor motor disponible para tareas bloqueadas.

Módulo puro (sin I/O) que implementa una escalera de motores recorrida por:
1. Escritores gratuitos (ya probados)
2. Antigravity CLI (agy: gemini-4, claude-sonnet-5-5 con créditos; opus solo para diseño/arquitectura)
3. CLI de Claude del Mac (presupuesto «Opus de los directores»)
4. Codex si tiene cuota
5. A1 (director principal)

Reglas:
- Nunca agota un motor: deja reserva del 20%
- Lleva al motor fuerte el registro del fallo y reescrituras anteriores
- Solo pasa a pedir_a_alex cuando TODOS los motores están agotados o la tarea toca algo reservado a Alex
- Las tareas «Desbloquear la publicación (<sha>)» se cierran solas cuando una publicación posterior pasa
- Lo que de verdad necesita a Alex le llega en UN resumen al canal General
"""

from __future__ import annotations

import time
from typing import Any, Dict, List, Optional

DEFAULT_TIende_DIARIO = {
    "agy_mecanicos": 50,
    "agy_complejos": 20,
    "agy_fallback": 30,
    "claude_mac_opus": 1,
    "claude_mac_sonnet": 5,
    "codex": 0.2,
    "a1": 1,
}


def calcular_tope_diario(tope_base: int, porcentaje_reserva: float = 0.2) -> int:
    """Calcula el tope ajustado con reserva del porcentaje especificado."""
    if tope_base <= 0:
        return 0
    return int(tope_base * (1 - porcentaje_reserva))


def escalera_motores(
    tarea: Dict[str, Any],
    es_arquitectura: bool = False,
    es_diseño: bool = False,
) -> List[Dict[str, Any]]:
    """Construye la escalera de motores para una tarea.

    Cada peldaño es un dict con:
    - tipo: 'gratuito' | 'agy' | 'claude_mac' | 'codex' | 'a1'
    - cuenta: nombre de la cuenta (para contar uso)
    - modelo: id del modelo si está disponible
    - tope_diario: cuántas tareas puede atender hoy
    - clave_entorno: nombre de variable de entorno para disponibilidad

    Reglas:
    - Los gratuitos van primero: modelos libres del enjambre
    - agy va después: gemini-4 y claude-sonnet-5-5 con créditos
    - Opus de claude_mac SOLO para diseño o arquitectura
    - Codex con suscripción de Alex
    - A1 como último recurso
    """
    escalera: List[Dict[str, Any]] = []

    escalera.append({
        "tipo": "gratuito",
        "cuenta": "libre",
        "modelo": None,
        "tope_diario": 100,
        "clave_entorno": "STARSEED_MOTORES_GRATIS",
        "prioridad": 1,
    })

    escalera.append({
        "tipo": "agy",
        "cuenta": "agy_mecanicos",
        "modelo": "agy/gemini-3.8-flash-medium",
        "tope_diario": calcular_tope_diario(DEFAULT_TIende_DIARIO["agy_mecanicos"]),
        "clave_entorno": "STARSEED_PASARELA_FREELLMAPI_KEY",
        "prioridad": 2,
    })

    escalera.append({
        "tipo": "agy",
        "cuenta": "agy_complejos",
        "modelo": "agy/gemini-4-neon-high",
        "tope_diario": calcular_tope_diario(DEFAULT_TIende_DIARIO["agy_complejos"]),
        "clave_entorno": "STARSEED_PASARELA_FREELLMAPI_KEY",
        "prioridad": 3,
    })

    if es_diseño or es_arquitectura:
        escalera.append({
            "tipo": "claude_mac",
            "cuenta": "claude_mac_opus",
            "modelo": "claude-opus-5-5",
            "tope_diario": DEFAULT_TIende_DIARIO["claude_mac_opus"],
            "clave_entorno": "STARSEED_CLAU_MAC_OPUS_DISPONIBLE",
            "prioridad": 4,
        })

    escalera.append({
        "tipo": "claude_mac",
        "cuenta": "claude_mac_sonnet",
        "modelo": "anthropic/claude-3-7-sonnet-20250219",
        "tope_diario": calcular_tope_diario(DEFAULT_TIende_DIARIO["claude_mac_sonnet"]),
        "clave_entorno": "STARSEED_CLAUD_MAC_DISPONIBLE",
        "prioridad": 5,
    })

    escalera.append({
        "tipo": "agy",
        "cuenta": "agy_fallback",
        "modelo": "agy/claude-sonnet-5-5-medium",
        "tope_diario": 30,
        "clave_entorno": "STARSEED_PASARELA_FREELLMAPI_KEY",
        "prioridad": 6,
    })

    escalera.append({
        "tipo": "codex",
        "cuenta": "codex",
        "modelo": "codex/gpt-5.6-sol",
        "tope_diario": DEFAULT_TIende_DIARIO["codex"],
        "clave_entorno": "OPENAI_API_KEY",
        "prioridad": 7,
    })

    escalera.append({
        "tipo": "a1",
        "cuenta": "a1",
        "modelo": None,
        "tope_diario": 1,
        "clave_entorno": None,
        "prioridad": 8,
    })

    return escalera


def _probleedor_excluido(modelo: str, salud: Dict[str, Any], ahora: str) -> bool:
    """Devuelve True si el modelo debe excluirse por salud del proveedor."""
    if not salud or not modelo:
        return False

    proveedor = modelo.split("/")[0] if "/" in modelo else modelo
    estado_prov = salud.get(proveedor, {})
    if not isinstance(estado_prov, dict):
        return False

    if estado_prov.get("estado") == "caido":
        return True

    sin_cupo = estado_prov.get("sin_cupo_hasta")
    if sin_cupo:
        from datetime import datetime
        try:
            ahora_dt = datetime.now()
            sin_cupo_str = sin_cupo if isinstance(sin_cupo, str) else sin_cupo
            if "T" in sin_cupo_str:
                sin_cupo_dt = datetime.fromisoformat(
                    sin_cupo_str.replace("Z", "+00:00").replace(tzinfo=None)
                    if "+" not in sin_cupo_str else sin_cupo_str
                )
            else:
                sin_cupo_dt = datetime.strptime(sin_cupo_str, "%Y-%m-%d %H:%M:%S")
            if sin_cupo_dt > ahora_dt:
                return True
        except Exception:
            pass

    return False


def siguiente_motor(
    tarea: Dict[str, Any],
    intentos: int,
    disponibilidad: Dict[str, Any],
    presupuesto: Dict[str, Any],
    es_arquitectura: bool = False,
    es_diseño: bool = False,
) -> Optional[Dict[str, Any]]:
    """Determina el siguiente motor para escribir una tarea bloqueada.

    Args:
        tarea: El dict de la tarea con id, titulo, archivos, etc.
        intentos: Número de intentos fallidos previos (0 = primer intento)
        disponibilidad: Dict con estado de disponibilidad de motores:
            - 'agy': bool (instalado y sesión válida)
            - 'codex_ok': bool (tiene cuota)
            - 'claude_mac': bool (sesión disponible)
            - 'modelos_libres': list[str] (modelos gratuitos disponibles)
            - 'salud_proveedores': dict {proveedor: {estado, sin_cupo_hasta}}
        presupuesto: Dict con topes diarios por cuenta:
            - fecha: 'YYYY-MM-DD'
            - agy_mecanicos: int (usados hoy)
            - agy_complejos: int (usados hoy)
            - claude_mac_opus: int (usos hoy)
            - claude_mac_sonnet: int (usos hoy)
            - codex: float (porcentaje usado)
        es_arquitectura: True si la tarea es de arquitectura (usa opus)
        es_diseño: True si la tarea es de diseño (usa opus de agy)

    Returns:
        Dict con {tipo, modelo, cuenta, motivo} o None si no hay motor disponible.
    """
    if not tarea:
        return None

    if not disponibilidad:
        disponibilidad = {}

    if disponibilidad == {}:
        return None

    hoy = presupuesto.get("fecha", time.strftime("%Y-%m-%d"))

    if not presupuesto:
        presupuesto = {
            "fecha": hoy,
            "agy_mecanicos": 0,
            "agy_complejos": 0,
            "claude_mac_opus": 0,
            "claude_mac_sonnet": 0,
            "codex": 0.0,
            "a1": 0,
        }

    escalera = escalera_motores(tarea, es_arquitectura, es_diseño)

    modelo_actual = (tarea.get("modelo") or "").lower()
    salud = disponibilidad.get("salud_proveedores", {})

    for peldaño in escalera:
        tipo = peldaño["tipo"]
        cuenta = peldaño["cuenta"]
        modelo = peldaño.get("modelo")
        tope_diario = peldaño["tope_diario"]

        if tipo == "gratuito":
            usados = presupuesto.get("libre", 0)
            tope_libre = tope_diario * 0.8
            if usados >= tope_libre:
                continue

            modelos_libres = disponibilidad.get("modelos_libres", [])
            if not modelos_libres:
                continue

            modelo_valido = None
            for m in modelos_libres:
                if not m or m == modelo_actual:
                    continue
                if _probleedor_excluido(m, salud, hoy):
                    continue
                modelo_valido = m
                break

            if modelo_valido:
                return {
                    "tipo": "gratuito",
                    "modelo": modelo_valido,
                    "cuenta": "libre",
                    "motivo": f"reintento gratuito {intentos + 1}: modelo liberado disponible",
                }

        elif tipo == "agy":
            if not disponibilidad.get("agy"):
                continue

            cuenta_key = peldaño["cuenta"]
            usados = presupuesto.get(cuenta_key, 0)
            tope = peldaño.get("tope_diario", tope_diario)

            if usados >= tope:
                continue

            if modelo_actual and "agy" in modelo_actual:
                continue

            modelo_agy = peldaño.get("modelo")
            if not modelo_agy:
                continue

            return {
                "tipo": "agy",
                "modelo": modelo_agy,
                "cuenta": cuenta_key,
                "motivo": f"escalada a Antigravity CLI ({modelo_agy})",
            }

        elif tipo == "claude_mac":
            if not disponibilidad.get("claude_mac"):
                continue

            if es_arquitectura or es_diseño:
                cuenta_key = "claude_mac_opus"
            else:
                cuenta_key = "claude_mac_sonnet"

            usados = presupuesto.get(cuenta_key, 0)
            tope = peldaño.get("tope_diario", 1)

            if usados >= tope:
                continue

            modelo_claude = peldaño.get("modelo")
            if not modelo_claude:
                continue

            return {
                "tipo": "claude_mac",
                "modelo": modelo_claude,
                "cuenta": cuenta_key,
                "motivo": f"escalada a Claude en el Mac ({modelo_claude})",
            }

        elif tipo == "codex":
            if not disponibilidad.get("codex_ok"):
                continue

            tope_codex = presupuesto.get("codex", 0.2)
            if tope_codex >= 0.8:
                continue

            modelo_codex = peldaño.get("modelo")
            if not modelo_codex:
                continue

            return {
                "tipo": "codex",
                "modelo": modelo_codex,
                "cuenta": "codex",
                "motivo": "escalada a Codex (suscripción ChatGPT de Alex)",
            }

        elif tipo == "a1":
            tope_a1 = peldaño.get("tope_diario", 1)
            usados_a1 = presupuesto.get("a1", 0)
            if usados_a1 >= tope_a1:
                return None  # A1 also exhausted: all motors drained
            presupuesto["a1"] = usados_a1 + 1
            return {
                "tipo": "a1",
                "modelo": None,
                "cuenta": "a1",
                "motivo": "todos los motores agotados: requiere decisión de Alex",
            }

    return None


def es_tarea_publicacion(tarea: Dict[str, Any], asuntos: List[str]) -> bool:
    """PURA: ¿La tarea es 'Desbloquear la publicación (<sha>)' y el sha ya está en main?

    Las tareas de este tipo se cierran solas cuando una publicación posterior pasa.
    """
    titulo = str(tarea.get("titulo", "")).lower()
    if "desbloquear la publicación" not in titulo:
        return False

    import re
    match = re.search(r'desbloquear la publicación\s+([a-f0-9]{7,40})', titulo)
    if not match:
        return False

    sha = match.group(1)
    for asunto in asuntos:
        if sha in asunto.lower():
            return True
    return False