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
        tam_gb: Tamaño del modelo en GB (p.ej. 3.3 para 4b, 6.6 para 9b).
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
# MQB6

def puede_cargar(mem_disponible_mb: int | None, intercambio_libre_mb: int | None, compilando: bool) -> tuple[bool, str]:
    """Verifica si el nodo tiene memoria suficiente y no está compilando.

    Args:
        mem_disponible_mb: Memoria disponible en MB desde /proc/meminfo (None si no se pudo leer).
        intercambio_libre_mb: Memoria de intercambio libre en MB desde /proc/meminfo (None si no se pudo leer).
        compilando: True si el nodo está compilando (tsc, next build, vitest).

    Returns:
        (bool, motivo): True si puede cargar, False con motivo en español.
    """
    errores = []

    if mem_disponible_mb is None:
        errores.append("no se pudo leer la memoria disponible")
    elif mem_disponible_mb < 5200:
        errores.append(f"memoria disponible {mem_disponible_mb} MB, hacen falta 5200")

    if intercambio_libre_mb is None:
        errores.append("no se pudo leer el intercambio libre")
    elif intercambio_libre_mb < 1024:
        errores.append(f"intercambio libre {intercambio_libre_mb} MB, hace falta 1024")

    if compilando:
        errores.append("el nodo está compilando")

    if not errores:
        return True, "ok"

    return False, " ".join(errores)

def esta_compilando(lineas_de_procesos: list[str]) -> bool:
    """Verifica si alguna línea de ps muestra que el nodo está compilando.

    Args:
        lineas_de_procesos: Líneas del archivo /proc/<pid>/cmdline o salida similar.

    Returns:
        True si se encuentra next build, tsc (como palabra completa) o vitest.
    """
    import re

    patron_tsc = r"tsc"

    # Unir todas las líneas en un solo string para detectar patrones que pueden estar
    # en líneas diferentes (p.ej. "next" en una línea y "build" en otra)
    texto_completo = " ".join(lineas_de_procesos)
    texto_min = texto_completo.lower()

    if "next build" in texto_min or "vitest" in texto_min or re.search(patron_tsc, texto_min):
        return True

    return False

