#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Escritor Antigravity (`agy`) para el enjambre de StarSeed OS.

Integra `agy` (Antigravity CLI, ~/.local/bin/agy con sesión de Google de Alex)
como un escritor más del enjambre, con los mismos permisos que los demás:
trabaja SOLO dentro del worktree de la tarea, sin `--dangerously-skip-permissions`.

Modelos por coste (cuota de Antigravity, no del plan de Claude de Alex):
  - Tareas mecánicas: gemini-3.8-flash-medium
  - Tareas complejas: gemini-4-neon-high
  - Fallback tras 2 fallos: claude-sonnet-5-5-medium (por Antigravity)

Contador diario por modelo en el medidor; si agy responde con error de cuota
se pausa ese modelo hasta el día siguiente y la tarea pasa a otro escritor.
"""
from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import time
from pathlib import Path

# ── Constantes ────────────────────────────────────────────────────────────────

MODELO_MECANICO = "gemini-3.8-flash-medium"
MODELO_COMPLEJO = "gemini-4-neon-high"
MODELO_FALLBACK = "claude-sonnet-5-5-medium"

SEGUNDOS_AGY_ESCRITOR = 1800  # 30 min tope de una llamada de escritura
RUTA_MEDIDOR = os.path.expanduser("~/.starseed/agy-medidor.json")

# Pistas de error de cuota en la salida de agy (minúsculas)
PISTAS_CUOTA = (
    "quota",
    "cuota",
    "rate limit",
    "ratelimit",
    "resource exhausted",
    "too many requests",
    "429",
    "402",
    "insufficient",
    "credit",
    "billing",
    "limit exceeded",
    "daily limit",
)

# Pistas de sesión no válida
PISTAS_SESION = (
    "not logged in",
    "login required",
    "please log in",
    "unauthorized",
    "unauthenticated",
    "authentication",
    "session expired",
    "no session",
    "invalid api key",
    "api key",
    "permission denied",
)

# Pistas de tiempo agotado
PISTAS_TIEMPO = ("tiempo agotado", "timed out", "timeout", "[tiempo agotado]")

_TOPE_FALLO_CORTO = 600  # caracteres: solo salidas cortas cuentan como fallo


# ── Funciones puras ───────────────────────────────────────────────────────────

def es_tarea_mecanica(tarea: dict) -> bool:
    """PURA: ¿La tarea es mecánica (usa modelo barato) o compleja (usa modelo caro)?

    Mecánicas: solo documentación, tests, configuración, refactors simples.
    Complejas: código nuevo, lógica de negocio, arquitectura, APIs.
    """
    archivos = [str(a).lower() for a in (tarea.get("archivos") or [])]
    titulo = str(tarea.get("titulo") or "").lower()
    texto = " ".join(archivos + [titulo])

    # Palabras que indican tarea compleja
    complejas = (
        "nuevo",
        "crear",
        "implementar",
        "arquitectura",
        "api",
        "endpoint",
        "lógica",
        "logica",
        "algoritmo",
        "motor",
        "sistema",
        "integra",
        "refactor",
        "rediseñ",
        "diseñ",
    )
    # Palabras que indican tarea mecánica
    mecanicas = (
        "test",
        "prueba",
        "document",
        "docs/",
        "readme",
        "changelog",
        "config",
        "ajust",
        "corregir typo",
        "typo",
        "formato",
        "lint",
        "actualizar versión",
        "version",
        "bump",
    )

    if any(p in texto for p in complejas):
        return False
    if any(p in texto for p in mecanicas):
        return True
    # Por defecto: compleja (más prudente)
    return False


def modelo_para_tarea(tarea: dict, medidor: dict | None = None, ahora: float | None = None) -> str:
    """PURA: Elige el modelo según el tipo de tarea y el estado del medidor.

    Reglas:
    - Mecánica → MODELO_MECANICO (salvo que esté pausado por cuota)
    - Compleja → MODELO_COMPLEJO (salvo que esté pausado por cuota)
    - Si el modelo elegido está pausado → intenta el otro modelo principal
    - Si ambos principales están pausados → MODELO_FALLBACK (salvo que también esté pausado)
    - Si todos están pausados → devuelve el modelo mecánico (se intentará y fallará, la rotación lo saltará)
    """
    ahora = time.time() if ahora is None else ahora
    medidor = medidor or {}

    mecanica = es_tarea_mecanica(tarea)
    principal = MODELO_MECANICO if mecanica else MODELO_COMPLEJO
    alternativo = MODELO_COMPLEJO if mecanica else MODELO_MECANICO

    def pausado(modelo: str) -> bool:
        m = medidor.get(modelo) or {}
        hasta = float(m.get("pausado_hasta") or 0)
        return hasta > ahora

    if not pausado(principal):
        return principal
    if not pausado(alternativo):
        return alternativo
    if not pausado(MODELO_FALLBACK):
        return MODELO_FALLBACK
    return principal  # todos pausados: se intentará y la rotación lo manejará


def orden_agy(modelo: str, worktree: str, prompt: str, timeout_s: int = SEGUNDOS_AGY_ESCRITOR) -> list[str]:
    """PURA: Construye la orden `agy` para escribir en el worktree.

    NUNCA usa `--dangerously-skip-permissions`.
    stdin=DEVNULL, cwd=worktree.
    """
    agy_bin = shutil.which("agy") or os.path.expanduser("~/.local/bin/agy")
    return [
        agy_bin,
        "-p",
        prompt,
        "--mode",
        "accept-edits",
        "--sandbox",
        "--add-dir",
        worktree,
        "--model",
        modelo,
        "--print-timeout",
        f"{timeout_s}s",
        "--output-format",
        "json",
    ]


def _extraer_texto_json(datos: dict) -> str:
    if not isinstance(datos, dict):
        return ""
    for clave in ("response", "result", "text", "output", "content", "message"):
        valor = datos.get(clave)
        if isinstance(valor, str) and valor.strip():
            return valor.strip()
        if isinstance(valor, dict):
            # A veces viene anidado: {"message": {"content": "..."}}
            for subclave in ("content", "text", "output"):
                sub = valor.get(subclave)
                if isinstance(sub, str) and sub.strip():
                    return sub.strip()
    return ""


def _extraer_error_json(datos: dict | None) -> str:
    if not isinstance(datos, dict):
        return ""
    for clave in ("error", "errorMessage", "error_message", "message"):
        valor = datos.get(clave)
        if isinstance(valor, dict):
            valor = valor.get("message") or valor.get("type") or valor.get("description")
        if isinstance(valor, str) and valor.strip():
            return valor.strip()
    if datos.get("is_error") or datos.get("success") is False:
        return str(datos.get("message") or datos.get("response") or "agy devolvió un error").strip()
    if str(datos.get("status") or "").lower() in ("error", "failed", "failure"):
        return str(datos.get("message") or "agy devolvió un error").strip()
    return ""


def _extraer_uso_json(datos: dict | None) -> tuple[int, int]:
    uso = datos.get("usage") if isinstance(datos, dict) else None
    uso = uso if isinstance(uso, dict) else {}

    def entero(*claves):
        for clave in claves:
            valor = uso.get(clave)
            if isinstance(valor, (int, float)):
                return int(valor)
        return 0

    return entero("input_tokens", "prompt_tokens"), entero("output_tokens", "completion_tokens")


def leer_salida_agy(salida: str, rc: int = 0) -> dict:
    """PURA: Traduce la salida de `agy` (JSON o texto) a dict común.

    Devuelve: {"texto": str, "modelo": str|None, "tokens_entrada": int, "tokens_salida": int, "error": str|None}
    - Respuesta vacía, código != 0, tiempo agotado, cuota, sesión caída → error
    - error != None significa que el escritor falló y la tarea debe pasar a otro
    """
    crudo = (salida or "").strip()
    datos = None
    try:
        leido = json.loads(crudo)
        datos = leido if isinstance(leido, dict) else None
    except (TypeError, ValueError):
        datos = None

    error = _extraer_error_json(datos)
    texto = _extraer_texto_json(datos) if datos is not None else crudo
    modelo = datos.get("model") if isinstance(datos, dict) else None
    tokens_entrada, tokens_salida = _extraer_uso_json(datos)

    bajo = crudo.lower()
    if any(p in bajo for p in PISTAS_TIEMPO):
        error = error or "tiempo agotado"
    elif rc != 0 and not error:
        error = f"agy salió con código {rc}"
    if not error and not texto:
        error = "respuesta vacía de agy"
    if not error and len(texto) < _TOPE_FALLO_CORTO and any(p in texto.lower() for p in PISTAS_CUOTA):
        error = "cuota excedida: " + texto
    if not error and len(texto) < _TOPE_FALLO_CORTO and any(p in texto.lower() for p in PISTAS_SESION):
        error = "sesión inválida: " + texto

    return {
        "texto": "" if error else texto,
        "modelo": modelo,
        "tokens_entrada": tokens_entrada,
        "tokens_salida": tokens_salida,
        "error": error or None,
    }


def es_error_cuota(error: str | None) -> bool:
    """PURA: ¿El error es de cuota (pausar modelo hasta mañana)?"""
    if not error:
        return False
    return any(p in error.lower() for p in PISTAS_CUOTA)


def es_error_sesion(error: str | None) -> bool:
    """PURA: ¿El error es de sesión (requiere login manual)?"""
    if not error:
        return False
    return any(p in error.lower() for p in PISTAS_SESION)


def es_error_tiempo(error: str | None) -> bool:
    """PURA: ¿El error es de timeout?"""
    if not error:
        return False
    return any(p in error.lower() for p in PISTAS_TIEMPO)


# ── Medidor diario (toca disco) ───────────────────────────────────────────────

def _leer_medidor() -> dict:
    try:
        with open(RUTA_MEDIDOR, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def _guardar_medidor(datos: dict) -> None:
    try:
        os.makedirs(os.path.dirname(RUTA_MEDIDOR), exist_ok=True)
        tmp = RUTA_MEDIDOR + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(datos, f, ensure_ascii=False, indent=1)
        os.replace(tmp, RUTA_MEDIDOR)
    except OSError:
        pass


def _limpiar_medidor_antiguo(datos: dict, ahora: float) -> dict:
    """Quita entradas de días anteriores (más de 24h)."""
    return {k: v for k, v in datos.items() if isinstance(v, dict) and float(v.get("actualizado", 0)) > ahora - 86400}


def registrar_uso(modelo: str, tokens_entrada: int, tokens_salida: int, ahora: float | None = None) -> None:
    """Anota uso exitoso del modelo (no toca pausas)."""
    ahora = time.time() if ahora is None else ahora
    datos = _limpiar_medidor_antiguo(_leer_medidor(), ahora)
    m = datos.get(modelo) or {}
    m["usos"] = int(m.get("usos") or 0) + 1
    m["tokens_entrada"] = int(m.get("tokens_entrada") or 0) + tokens_entrada
    m["tokens_salida"] = int(m.get("tokens_salida") or 0) + tokens_salida
    m["ultimo_exito"] = ahora
    m["actualizado"] = ahora
    datos[modelo] = m
    _guardar_medidor(datos)


def pausar_modelo_por_cuota(modelo: str, ahora: float | None = None) -> None:
    """Marca el modelo como pausado hasta el día siguiente (medianoche local)."""
    ahora = time.time() if ahora is None else ahora
    # Medianoche local del día siguiente
    from time import localtime, mktime
    lm = localtime(ahora)
    manana = mktime((lm.tm_year, lm.tm_mon, lm.tm_mday + 1, 0, 0, 0, 0, 0, -1))
    datos = _limpiar_medidor_antiguo(_leer_medidor(), ahora)
    m = datos.get(modelo) or {}
    m["pausado_hasta"] = manana
    m["motivo_pausa"] = "cuota excedida"
    m["actualizado"] = ahora
    datos[modelo] = m
    _guardar_medidor(datos)


def modelo_pausado(modelo: str, ahora: float | None = None) -> bool:
    """¿Está el modelo pausado por cuota?"""
    ahora = time.time() if ahora is None else ahora
    m = _leer_medidor().get(modelo) or {}
    return float(m.get("pausado_hasta") or 0) > ahora


def estado_medidor() -> dict:
    """Estado actual del medidor para Genesis / debug."""
    ahora = time.time()
    datos = _limpiar_medidor_antiguo(_leer_medidor(), ahora)
    return {
        modelo: {
            "usos": m.get("usos", 0),
            "tokens_entrada": m.get("tokens_entrada", 0),
            "tokens_salida": m.get("tokens_salida", 0),
            "pausado": float(m.get("pausado_hasta") or 0) > ahora,
            "pausado_hasta": m.get("pausado_hasta"),
            "motivo_pausa": m.get("motivo_pausa"),
            "ultimo_exito": m.get("ultimo_exito"),
        }
        for modelo, m in datos.items()
    }


# ── Ejecución (no pura, para el orquestador) ──────────────────────────────────

def escribir_con_agy(prompt: str, modelo: str, worktree: str, log: str, timeout: int = SEGUNDOS_AGY_ESCRITOR, tid: str | None = None) -> tuple[int, str]:
    """Ejecuta `agy` para escribir en el worktree. Contrato igual que `opencode`/`codex`.

    Devuelve (rc, salida). Registra uso en medidor si éxito.
    """
    cmd = orden_agy(modelo, worktree, prompt, timeout)
    agy_bin = cmd[0]

    if not os.path.exists(agy_bin):
        return 127, f"agy no encontrado en {agy_bin} (instala Antigravity CLI y haz login con Google)"

    desde = os.path.getsize(log) if os.path.exists(log) else 0
    with open(log, "a", encoding="utf-8") as f:
        f.write(f"\n$ {' '.join(cmd)} · {time.strftime('%Y-%m-%d %H:%M:%S')} · prompt por stdin ({len(prompt)} caracteres)\n")
        f.flush()
        proc = subprocess.Popen(
            cmd,
            cwd=worktree,
            stdin=subprocess.DEVNULL,  # IMPORTANTE: agy espera entrada si no se cierra
            stdout=f,
            stderr=subprocess.STDOUT,
            env={**os.environ, "STARSEED_IDE": "enjambre"},
            start_new_session=True,
            text=True,
        )
        try:
            rc = proc.wait(timeout=timeout)
        except subprocess.TimeoutExpired:
            try:
                os.killpg(os.getpgid(proc.pid), 9)
            except Exception:
                pass
            rc = 124

    try:
        with open(log, encoding="utf-8", errors="replace") as f:
            f.seek(desde)
            salida = f.read()
    except Exception:
        salida = ""

    # Si salió bien, registrar uso
    if rc == 0:
        parseado = leer_salida_agy(salida, rc)
        if not parseado.get("error"):
            registrar_uso(modelo, parseado["tokens_entrada"], parseado["tokens_salida"])
        elif es_error_cuota(parseado.get("error")):
            pausar_modelo_por_cuota(modelo)

    return rc, salida


def agy_disponible() -> bool:
    """¿Está `agy` instalado y con sesión de Google iniciada?"""
    agy_bin = shutil.which("agy") or os.path.expanduser("~/.local/bin/agy")
    if not os.path.exists(agy_bin):
        return False
    # Comprobación rápida: versión (no gasta cuota)
    try:
        r = subprocess.run([agy_bin, "--version"], capture_output=True, text=True, timeout=10)
        return r.returncode == 0
    except Exception:
        return False


# ── Integración con el orquestador (punto de entrada) ─────────────────────────

def es_modelo_antigravity(modelo: str) -> bool:
    """PURA: ¿Este escritor se atiende con Antigravity CLI? Prefijo `antigravity/` o `agy/`."""
    n = str(modelo or "")
    return n.startswith("antigravity/") or n.startswith("agy/")


def modelo_sin_prefijo(modelo: str) -> str:
    """PURA: Quita el prefijo `antigravity/` o `agy/`."""
    nombre = str(modelo or "")
    if nombre.startswith("antigravity/"):
        nombre = nombre.split("/", 1)[1]
    elif nombre.startswith("agy/"):
        nombre = nombre.split("/", 1)[1]
    return nombre


def es_modelo_agy(modelo: str) -> bool:
    """PURA: ¿Este escritor se atiende con Antigravity CLI? Prefijo `agy/` (legacy)."""
    return str(modelo or "").startswith("agy/")


# Alias para compatibilidad hacia atrás
modelo_agy_sin_prefijo = modelo_sin_prefijo


# Modelos que el enjambre puede usar con agy (se añaden a la rotación si agy está disponible)
MODELOS_AGY = [
    f"agy/{MODELO_MECANICO}",
    f"agy/{MODELO_COMPLEJO}",
    f"agy/{MODELO_FALLBACK}",
]