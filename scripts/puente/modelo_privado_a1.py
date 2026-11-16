"""Modelo privado del A1: estado y declaración de la pasarela solo si el servicio responde.

Módulo PURO: sin red, sin reloj, sin almacenamiento. Todo se inyecta.
"""

from __future__ import annotations

import json
from typing import Any


def estado_del_servicio(
    version_json: str | dict[str, Any],
    tags_json: str | dict[str, Any],
    etiqueta: str,
    ahora_iso: str,
) -> dict[str, Any]:
    """Estado del servicio Ollama en el A1.

    Args:
        version_json: Respuesta de GET /api/version ({"version": "..."}).
        tags_json: Respuesta de GET /api/tags ({"models": [{"name": "..."}, ...]}).
        etiqueta: Etiqueta del modelo esperada (p.ej. "huihui_ai/qwen3.5-abliterated:4b").
        ahora_iso: Timestamp ISO 8601 de "ahora" (inyectado).

    Returns:
        Dict con claves: vivo (bool), etiqueta (str), instalado (bool),
        desde (str|None), motivo (str).
        vivo = True solo si version contesta Y etiqueta está en models[].name.
        motivo dice cuál de las dos falla (o "ok" si ambas pasan).
    """
    # Parsear version_json
    if isinstance(version_json, str):
        try:
            version_data = json.loads(version_json)
        except json.JSONDecodeError:
            version_data = {}
    else:
        version_data = version_json or {}

    # Parsear tags_json
    if isinstance(tags_json, str):
        try:
            tags_data = json.loads(tags_json)
        except json.JSONDecodeError:
            tags_data = {}
    else:
        tags_data = tags_json or {}

    version_ok = bool(version_data.get("version"))
    models = tags_data.get("models", [])
    etiqueta_instalada = any(m.get("name") == etiqueta for m in models)

    vivo = version_ok and etiqueta_instalada

    if vivo:
        motivo = "ok"
    elif not version_ok and not etiqueta_instalada:
        motivo = "version_caida_y_etiqueta_falta"
    elif not version_ok:
        motivo = "version_caida"
    else:
        motivo = "etiqueta_no_instalada"

    return {
        "vivo": vivo,
        "etiqueta": etiqueta,
        "instalado": etiqueta_instalada,
        "desde": ahora_iso if vivo else None,
        "motivo": motivo,
    }


def declaracion_pasarela(
    estado: dict[str, Any],
    base: str = "http://127.0.0.1:11434/v1",
    rpm: int = 2,
) -> dict[str, str] | None:
    """Declaración de la pasarela privada del A1.

    La pasarela EXISTE solo mientras el servicio responde (estado["vivo"] == True).
    Nada se escribe en disco.

    Args:
        estado: Resultado de estado_del_servicio.
        base: URL base de la pasarela (compatible OpenAI).
        rpm: Peticiones por minuto permitidas.

    Returns:
        Dict con STARSEED_PASARELA_PRIVADO_URL, _KEY, _MODELOS, _RPM, _SOLO_REVISOR
        o None si no está vivo.
    """
    if not estado.get("vivo"):
        return None

    etiqueta = estado.get("etiqueta", "")
    return {
        "STARSEED_PASARELA_PRIVADO_URL": base,
        "STARSEED_PASARELA_PRIVADO_KEY": "sin-clave",
        "STARSEED_PASARELA_PRIVADO_MODELOS": etiqueta,
        "STARSEED_PASARELA_PRIVADO_RPM": str(rpm),
        "STARSEED_PASARELA_PRIVADO_SOLO_REVISOR": "1",
    }


def tokens_por_segundo_esperados(tam_b: float, ctx_tokens: int) -> float:
    """Tokens por segundo de escritura esperados según medida en el A1.

    Regla medida (base qwen3.5:4b = 3.3 GB):
    - Escritura ≈ 4.8 t/s con 1.500 tokens de entrada
    - Con 11.000 tokens → ×0.5 (≈2.4 t/s)
    - Escala inversa con GB del modelo: × (3.3 / tam_b)

    Args:
        tam_b: Tamaño del modelo en GB (p.ej. 3.3 para 4b, 6.6 para 9b).
        ctx_tokens: Tokens de contexto de entrada.

    Returns:
        t/s de escritura esperados.
    """
    base_tps = 4.8 * (3.3 / tam_b)
    if ctx_tokens >= 11000:
        base_tps *= 0.5
    return base_tps


def plazo_estimado_s(tam_gb: float, entrada_tokens: int, salida_tokens: int) -> float:
    """Plazo estimado en segundos para decidir si una tarea cabe.

    La lectura va ≈3× más rápido que la escritura.
    Tiempo = (entrada_tokens / (3 * escritura_tps)) + (salida_tokens / escritura_tps)

    Args:
        tam_gb: Tamaño del modelo en GB.
        entrada_tokens: Tokens de entrada (prompt + contexto).
        salida_tokens: Tokens de salida esperados.

    Returns:
        Segundos estimados.
    """
    escritura_tps = tokens_por_segundo_esperados(tam_gb, entrada_tokens)
    lectura_tps = escritura_tps * 3.0
    t_lectura = entrada_tokens / lectura_tps if lectura_tps > 0 else 0.0
    t_escritura = salida_tokens / escritura_tps if escritura_tps > 0 else 0.0
    return t_lectura + t_escritura