#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""escritor_claude_plan.py · escritor Claude para tareas de planificación.

Integra `claude -p` como un escritor para tareas que requieren planeamiento:
- Generar planes de implementación
- Escribir documentación técnica  
- Analizar requisitos

Claude Code solo escribe con herramientas si:
1. La semana pasa del 85% de cupo (`lector_limites_claude`)
2. La sesión está bajo el 90% de uso
3. No hay claves API de Anthropic en el entorno de la tarea

Modelo recomendado: sonnet para escribir, opus solo para fallos difíciles.
Modo «plan»: genera plan estructurado sin escribir código inmediato.
Modo «escribir»: escribe y pasa las mismas puertas (tsc → vitest → revisión).

Contrato: devuelve (rc, salida) como los otros escritores.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import time
from typing import Optional

SEGUNDOS_ESCRITURA_CLAUDE = 1500
CODIGO_SIN_CAMBIOS = 0
CODIGO_FALLO = 1
CODIGO_TIMEOUT = 124

PISTAS_CUOTA = (
    "rate limit",
    "limit exceeded",
    "too many requests",
    "429",
    "quota",
    "daily limit",
    "credits exhausted",
)

PISTAS_SESION = (
    "not authenticated",
    "unauthorized",
    "invalid api key",
    "expired",
    "session",
    "login required",
)

PISTAS_CUPO_SEMANA = "semana pasada del 85%"
PISTAS_SESION_90 = "sesión del 90%"


def lector_limites_claude() -> dict:
    """Lee los límites de cupo de Claude desde la API.

    Devuelve: {"porcentaje_uso": float, "resta_horas": int, "valido": bool}
    Si falla, devuelve {"valido": False}.
    """
    try:
        r = subprocess.run(
            ["claude", "auth", "status"],
            capture_output=True,
            text=True,
            timeout=10
        )
        salida = r.stdout + r.stderr
        # Check for session expiration messages
        if any(p in salida.lower() for p in PISTAS_SESION):
            return {"porcentaje_uso": 100, "resta_horas": 0, "valido": False}
        if "weekly" in salida.lower():
            porcentaje = 0
            for partida in salida.split():
                if "%" in partida:
                    try:
                        porcentaje = float(partida.replace("%", ""))
                    except ValueError:
                        pass
            return {
                "porcentaje_uso": porcentaje,
                "resta_horas": 0,
                "valido": porcentaje < 85
            }
        if "session" in salida.lower() and "90" in salida:
            return {
                "porcentaje_uso": 90,
                "resta_horas": 0,
                "valido": False
            }
        return {"porcentaje_uso": 0, "resta_horas": 0, "valido": True}
    except Exception:
        return {"valido": False}


def claude_esta_disponible() -> bool:
    """¿Claude CLI está instalado y con sesión válida?

    Comprueba que:
    1. El binario `claude` existe en PATH
    2. La sesión está activa y con cupo suficiente
    """
    if not shutil.which("claude"):
        return False
    limite = lector_limites_claude()
    return limite.get("valido", False)


def orden_claude_plan(
    prompt: str,
    worktree: str,
    timeout_s: int = SEGUNDOS_ESCRITURA_CLAUDE,
    modelo: str = "sonnet"
) -> list[str]:
    """Construye la orden `claude -p` para planificar.

    Args:
        prompt: El prompt/planificación a ejecutar
        worktree: Directorio del worktree de la tarea
        timeout_s: Timeout en segundos
        modelo: Modelo a usar ('sonnet' o 'opus')

    Returns:
        Lista de argumentos para subprocess
    """
    clave_bin = shutil.which("claude") or os.path.expanduser("~/.local/bin/claude")
    # (DIR1126I) Sin «chat»: Claude Code no tiene ese subcomando; el modo no interactivo es `-p`.
    return [
        clave_bin,
        "-p",
        prompt,
        "--model", modelo,
        "--output-format", "text",
        "--permission-mode", "plan",
    ]


def orden_claude_escribir(
    prompt: str,
    worktree: str,
    timeout_s: int = SEGUNDOS_ESCRITURA_CLAUDE,
    modelo: str = "sonnet"
) -> list[str]:
    """Construye la orden de Claude Code para escribir en el worktree.

    (DIR1126I, 26-11) Antes era `claude exec -m … -s workspace-write -C …`, que es la sintaxis
    de `codex exec`: Claude Code no la entiende, cada intento moría en ~4 s sin tocar nada y la
    tarea acababa «sin cambios» (DIS1126A, ENJ1126B, NEU1126E-d1b…). Ahora: `claude -p` (no
    interactivo) con el prompt por stdin, el worktree como directorio de trabajo (cwd del
    proceso), edición de archivos aceptada y solo las herramientas que hacen falta. Nunca
    `--dangerously-skip-permissions`.
    """
    clave_bin = shutil.which("claude") or os.path.expanduser("~/.local/bin/claude")
    return [
        clave_bin,
        "-p",
        "--model", modelo,
        "--output-format", "text",
        "--permission-mode", "acceptEdits",
        "--allowedTools",
        "Read,Edit,MultiEdit,Write,Glob,Grep,LS,"
        "Bash(npx tsc:*),Bash(npx vitest:*),Bash(git status:*),Bash(git diff:*),Bash(ls:*)",
    ]


def entorno_claude() -> dict:
    """(DIR1126I) El entorno del proceso sin claves de la API de Anthropic: Claude escribe con la
    sesión del plan (llavero o CLAUDE_CODE_OAUTH_TOKEN), nunca con una clave de pago."""
    env = dict(os.environ)
    for clave in ("ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_BASE_URL"):
        env.pop(clave, None)
    return env


def es_error_cuota_claude(salida: str) -> bool:
    """¿El error es de cuota?"""
    bajo = (salida or "").lower()
    return any(p in bajo for p in PISTAS_CUOTA)


def es_error_sesion_claude(salida: str) -> bool:
    """¿El error es de sesión/cuenta?"""
    bajo = (salida or "").lower()
    return any(p in bajo for p in PISTAS_SESION)


def leer_salida_claude(salida: str, rc: int = 0) -> dict:
    """Parsea la salida de Claude CLI.

    Devuelve: {
        "texto": str,
        "tokens_entrada": int,
        "tokens_salida": int,
        "error": str|None,
        "sin_cambios": bool
    }
    """
    texto = (salida or "").strip()
    if rc == 0 and not texto:
        return {"texto": "", "tokens_entrada": 0, "tokens_salida": 0, "error": "respuesta vacía", "sin_cambios": False}

    if rc == 0:
        for pista in PISTAS_CUOTA:
            if pista in texto.lower():
                return {"texto": "", "tokens_entrada": 0, "tokens_salida": 0, "error": f"cuota: {pista}", "sin_cambios": False}

    if es_error_sesion_claude(texto):
        return {"texto": "", "tokens_entrada": 0, "tokens_salida": 0, "error": "sesión inválida", "sin_cambios": False}

    return {
        "texto": texto,
        "tokens_entrada": 0,
        "tokens_salida": 0,
        "error": None,
        "sin_cambios": False
    }


def es_modelo_claude(modelo: str) -> bool:
    """¿Este escritor se atiende con Claude CLI? Prefijo `claude/`."""
    return str(modelo or "").startswith("claude/")


def claude_sin_prefijo(modelo: str) -> str:
    """Quita el prefijo `claude/`."""
    nombre = str(modelo or "")
    if nombre.startswith("claude/"):
        nombre = nombre.split("/", 1)[1]
    return nombre or "sonnet"


ESCRITOR_CLAUDE_DISPONIBLE = claude_esta_disponible()
MODELOS_CLAUDE = ["claude/sonnet", "claude/opus"]


def escribir_con_claude(
    prompt: str,
    modelo: str,
    cwd: str,
    log: str,
    timeout: int = SEGUNDOS_ESCRITURA_CLAUDE,
    tid: Optional[str] = None
) -> tuple[int, str]:
    """Ejecuta Claude CLI para escribir en el worktree.

    Args:
        prompt: El prompt a ejecutar
        modelo: Modelo con prefijo 'claude/'
        cwd: Worktree donde escribir
        log: Ruta del archivo de log
        timeout: Timeout en segundos
        tid: ID de la tarea (para tracking)

    Returns:
        (rc, salida) - rc 0 si éxito, 124 si timeout, 1 si fallo
    """
    if not ESCRITOR_CLAUDE_DISPONIBLE:
        return CODIGO_FALLO, "Claude no escribe aquí: no disponible o sin cupo semanal ≥ 85%"

    modelo_limpio = claude_sin_prefijo(modelo)
    try:
        orden = orden_claude_escribir(prompt, cwd, timeout, modelo_limpio)
    except Exception:
        return CODIGO_FALLO, "error construyendo orden de Claude"

    desde = os.path.getsize(log) if os.path.exists(log) else 0
    ahora = time.strftime("%Y-%m-%d %H:%M:%S")
    with open(log, "a", encoding="utf-8") as f:
        f.write(f"\n$ {' '.join(orden)} · {ahora} · prompt ({len(prompt)} caracteres)\n")
        f.flush()
        rc = CODIGO_FALLO
        try:
            proc = subprocess.Popen(
                orden,
                cwd=cwd,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                errors="replace",
                start_new_session=True,
                env=entorno_claude(),
            )
            try:
                # (DIR1126I) El prompt va por stdin (antes no se pasaba en absoluto).
                salida, _ = proc.communicate(input=prompt, timeout=timeout)
                rc = proc.returncode
            except subprocess.TimeoutExpired:
                try:
                    os.killpg(os.getpgid(proc.pid), 9)
                except Exception:
                    proc.kill()
                rc = CODIGO_TIMEOUT
                salida = "TIMEOUT"
        except Exception as e:
            rc = CODIGO_FALLO
            salida = str(e)

    # (DIR1126I) También cuando falla: sin la salida en el registro nadie veía por qué moría.
    with open(log, "a", encoding="utf-8") as f:
        f.write(salida or "")

    return rc, salida


def planificar_tarea(
    titulo: str,
    archivos: list[str],
    prompt_base: str,
    cwd: str,
    log: str,
    tid: Optional[str] = None
) -> tuple[int, str, dict]:
    """Genera un plan estructurado con Claude.

    Usa modo «plan»: genera plan sin escribir código inmediatamente.
    Devuelve (rc, texto_plan, metadata).
    """
    if not ESCRITOR_CLAUDE_DISPONIBLE:
        return CODIGO_FALLO, "Claude no disponible", {"tipo": "sin_disponibilidad"}

    modelo = "sonnet"
    prompt_completo = (
        f"{prompt_base}\n\n"
        f"Tarea: {titulo}\n"
        f"Archivos requeridos: {', '.join(archivos) if archivos else 'Ninguno'}\n"
        f"\nGenera un plan estructurado con:\n"
        f"1. Análisis de requisitos\n"
        f"2. Arquitectura propuesta\n"
        f"3. Archivos a crear/modificar\n"
        f"4. Pasos de implementación\n"
    )

    rc, salida, metadata = escribir_con_claude(
        prompt_completo, f"claude/{modelo}", cwd, log,
        timeout=SEGUNDOS_ESCRITURA_CLAUDE * 2, tid=tid
    )

    if rc == CODIGO_FALLO and es_error_cuota_claude(salida):
        metadata["error_cuota"] = True

    return rc, salida, metadata


__all__ = [
    "SEGUNDOS_ESCRITURA_CLAUDE",
    "CODIGO_SIN_CAMBIOS",
    "CODIGO_FALLO",
    "CODIGO_TIMEOUT",
    "lector_limites_claude",
    "claude_esta_disponible",
    "orden_claude_plan",
    "orden_claude_escribir",
    "es_error_cuota_claude",
    "es_error_sesion_claude",
    "leer_salida_claude",
    "es_modelo_claude",
    "claude_sin_prefijo",
    "ESCRITOR_CLAUDE_DISPONIBLE",
    "MODELOS_CLAUDE",
    "escribir_con_claude",
    "planificar_tarea",
]