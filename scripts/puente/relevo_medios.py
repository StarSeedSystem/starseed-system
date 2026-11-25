#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Relevo de medios — Mac, A1 de Oracle, Maggabox y nubes efímeras (RES1121A).

Registro de cada medio con su especialidad y quién lo releva.
Latido entre medios: si el Mac lleva N minutos sin latido, el A1 toma el relevo
con ARRENDAMIENTO (un solo lector por bot de Telegram).
Replicación de registros de canales y estado de olas a A1 y Maggabox.
Claves para el A1 viajan SOLO por oracle_nodo.py claves (archivo 600 del servicio).
Simulacro documentado: parar latido Mac → A1 responde en General en < N+2 min.

Funciones PURAS con sus pruebas en test_relevo_medios.py.
"""
from __future__ import annotations

import json
import re
import time
from typing import Any


# ─────────────────────────────── Registro de medios ───────────────────────────────

def registro_medios() -> dict[str, dict[str, str]]:
    """PURA. Registro canónico de medios, especialidades y relevos.

    Fuente única para todos los medios. Los nombres de los canales de dirección
    se leen de ~/.starseed/canales-direccion.json (sincronizador_direccion).
    """
    return {
        "mac": {
            "especialidad": "orquestador, puertas, cartero, presidente, bot Principal",
            "releva": "a1",
        },
        "a1": {
            "especialidad": "siempre encendido, bot de diseño, guardián de main, cola de respaldo, nube",
            "releva": "mac",
        },
        "maggabox": {
            "especialidad": "almacén (espejo de GitHub cada 15 min, versiones, respaldos cifrados), sin claves en claro",
            "releva": "a1",
        },
        "nube-gh": {
            "especialidad": "solo trabajo sin secretos de Alex",
            "releva": "a1",
        },
        "cloudroom": {
            "especialidad": "solo trabajo sin secretos de Alex",
            "releva": "a1",
        },
    }


# ─────────────────────────────── Latido y decisión de relevo ───────────────────────────────

def debe_relevo_mac(estado_mac: dict[str, Any], ahora: float, umbral_minutos: int = 5) -> tuple[bool, str]:
    """PURA. ¿Debe el A1 tomar el relevo del Mac?

    Args:
        estado_mac: dict con clave "latido" (epoch seconds del último latido)
        ahora: epoch seconds actual
        umbral_minutos: minutos sin latido para declarar muerto al Mac

    Returns:
        (debe_relevo, motivo)
    """
    latido = estado_mac.get("latido")
    if latido is None:
        return True, "Mac sin latido: relevo a A1"
    try:
        segundos_sin_latido = ahora - float(latido)
    except (TypeError, ValueError):
        return True, "Mac latido inválido: relevo a A1"
    umbral_segundos = umbral_minutos * 60
    if segundos_sin_latido >= umbral_segundos:
        return True, f"Mac {segundos_sin_latido:.0f}s sin latido (> {umbral_minutos} min): relevo a A1"
    return False, f"Mac viva ({segundos_sin_latido:.0f}s)"


# ─────────────────────────────── Arriendo de Telegram ───────────────────────────────

# Constantes del arriendo (mismas que lider_direccion.py)
CADUCA_S = 180
RECLAMA_S = 45
ESPERA_RANGO = (0, 10, 20)  # por prioridad 0, 1, 2


def _prioridad_neurona(neurona: str) -> int:
    """PURA. 0 = a1, 1 = mac, 2 = otras."""
    n = str(neurona or "").lower()
    if n.startswith(("a1", "oracle-a1")):
        return 0
    if n.startswith("mac"):
        return 1
    return 2


def decidir_arriendo_telegram(
    arriendo: dict[str, Any],
    neurona: str,
    ahora: float,
    prioridad: int | None = None,
) -> dict[str, Any]:
    """PURA. Decide qué hace una neurona con el arriendo de Telegram.

    Un solo lector por bot de Telegram (polling getUpdates). El arriendo
    garantiza que solo una neurona hace polling a la vez.

    Args:
        arriendo: dict con claves dueno, caduca, version, tomado
        neurona: id de la neurona que decide (ej. "oracle-a1-123", "mac-main")
        ahora: epoch seconds actual
        prioridad: 0 (a1), 1 (mac), 2 (otras). Si None, se deduce de neurona.

    Returns:
        dict con claves: actuar (bool), nuevo (dict|None), motivo (str)
    """
    a = arriendo if isinstance(arriendo, dict) else {}
    dueno = str(a.get("dueno") or "")
    vence = float(a.get("caduca") or 0)
    version = int(a.get("version") or 0)
    tomado = float(a.get("tomado") or 0)

    mi_prioridad = prioridad if prioridad is not None else _prioridad_neurona(neurona)

    nuevo = {
        "dueno": neurona,
        "caduca": ahora + CADUCA_S,
        "version": version + 1,
        "tomado": ahora,
    }
    tomar = {"actuar": True, "nuevo": nuevo}
    no_actuar = lambda motivo: {"actuar": False, "nuevo": None, "motivo": motivo}

    if not dueno:
        return dict(tomar, motivo="tomado: libre")
    if dueno == neurona:
        if vence > ahora:
            return no_actuar("líder vigente")
        return dict(tomar, nuevo=dict(nuevo, tomado=tomado), motivo="renovada")
    if vence > ahora:
        dueno_prioridad = _prioridad_neurona(dueno)
        if dueno_prioridad > mi_prioridad and (ahora - tomado) <= RECLAMA_S:
            return dict(tomar, motivo=f"tomado: {dueno} tiene peor prioridad")
        return no_actuar(f"dueño: {dueno}")
    # Caducado
    espera = ESPERA_RANGO[min(2, mi_prioridad)]
    if (ahora - vence) < espera:
        return no_actuar("espera su fila tras caducar")
    return dict(tomar, motivo=f"tomado: caducó el de {dueno}")


# ─────────────────────────────── Canales de dirección ───────────────────────────────

def nombres_canales_canonicos() -> dict[str, str]:
    """PURA. Los tres nombres canónicos de los canales de dirección.

    Fuente única: estos son los nombres de respaldo. El registro real está en
    ~/.starseed/canales-direccion.json y se lee con sincronizador_direccion.nombre_de_canal.
    """
    return {
        "principal": "Principal",
        "general": "General",
        "audiovisual": "Audiovisual y diseño",
    }


# ─────────────────────────────── Replicación de estado ───────────────────────────────

def serializar_estado_olas(estado: dict[str, Any]) -> str:
    """PURA. Serializa el estado de olas para replicación (JSON compacto)."""
    return json.dumps(estado, ensure_ascii=False, separators=(",", ":"))


def filtrar_para_maggabox(estado: dict[str, Any]) -> dict[str, Any]:
    """PURA. Filtra el estado para replicación en Maggabox (sin secretos).

    Maggabox es un nodo público: NO deben viajar tokens, claves, ni secretos.
    """
    def limpiar(obj: Any, ruta: str = "") -> Any:
        if isinstance(obj, dict):
            resultado = {}
            for k, v in obj.items():
                kl = k.lower()
                # Patrones de secretos que NO deben ir a Maggabox
                if any(p in kl for p in (
                    "token", "secret", "clave", "key", "password", "auth",
                    "firma", "privad", "private", "credential"
                )):
                    continue
                resultado[k] = limpiar(v, f"{ruta}.{k}")
            return resultado
        if isinstance(obj, list):
            return [limpiar(v, f"{ruta}[]") for v in obj]
        return obj

    return limpiar(estado)


# ─────────────────────────────── Claves para A1 ───────────────────────────────

def claves_para_a1() -> tuple[str, ...]:
    """PURA. Lista de claves que viajan al A1 vía oracle_nodo.py claves.

    SOLO proveedores gratuitos + bus + puerta de datos. NUNCA claves de pago
    (salvo ABLITERATION_API_KEY aprobada por Alex). Nunca imprime valores.
    """
    return (
        # Proveedores gratuitos (mismos que nube-gh.py secretos)
        "GEMINI_API_KEY",
        "GOOGLE_GENERATIVE_AI_API_KEY",
        "NVIDIA_API_KEY",
        "OPENROUTER_API_KEY",
        "XKIRO_API_KEY",
        "AIHUBMIX_API_KEY",
        "TOKENROUTER_API_KEY",
        "GROQ_API_KEY",
        "STARSEED_PASARELA_GROQ_KEY",
        "STARSEED_PASARELA_GROQ_URL",
        "STARSEED_PASARELA_GROQ_MODELOS",
        "STARSEED_PASARELA_GROQ_RPM",
        "STARSEED_PASARELA_GROQ_SOLO_REVISOR",
        # Abliteration.ai: única clave de pago aprobada (MQA1–MQA3)
        "ABLITERATION_API_KEY",
        # Bus público (Supabase anon)
        "NEXT_PUBLIC_SUPABASE_URL",
        "NEXT_PUBLIC_SUPABASE_ANON_KEY",
        # Secreto compartido de las máquinas de la fundación (bus MetaGenesis)
        "STARSEED_LANZADOR_SECRETO",
        # Hermes gateway en A1 (Telegram solo cuando es líder)
        "TELEGRAM_BOT_TOKEN",
        "TELEGRAM_CHAT_ID",
        # Puerta de datos del A1
        "PUERTA_DATOS_URL",
        "PUERTA_DATOS_FICHA_ENJAMBRE",
        # FreeLLMAPI en A1 (127.0.0.1)
        "FREELLMAPI_KEY",
        "HF_TOKEN",
        "STARSEED_PASARELA_FREELLMAPI_URL",
        "STARSEED_PASARELA_FREELLMAPI_KEY",
        "STARSEED_PASARELA_FREELLMAPI_MODELOS",
        "STARSEED_PASARELA_FREELLMAPI_RPM",
        # Mistral y Cerebras (modo Free)
        "MISTRAL_API_KEY",
        "CEREBRAS_API_KEY",
        # Síntesis de producción y OAuth Google (solo nombres)
        "TELEGRAM_SINTESIS_BOT_TOKEN",
        "TELEGRAM_SINTESIS_CHAT_ID",
        "GOOGLE_ACTIVIDAD_CLIENT_ID",
        "GOOGLE_ACTIVIDAD_CLIENT_SECRET",
    )


# ─────────────────────────────── Utilidades ───────────────────────────────

def ahora() -> float:
    """PURA. Tiempo actual en epoch seconds (inyectable para tests)."""
    return time.time()


if __name__ == "__main__":
    # Demo rápido
    print("Registro de medios:")
    for k, v in registro_medios().items():
        print(f"  {k}: {v['especialidad']} → releva a {v['releva']}")
    print("\nCanales canónicos:")
    for k, v in nombres_canales_canonicos().items():
        print(f"  {k}: {v}")
    print("\nClaves para A1:")
    for c in claves_para_a1():
        print(f"  {c}")