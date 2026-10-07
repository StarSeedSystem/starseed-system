# -*- coding: utf-8 -*-
"""Motores por línea de órdenes del Chat Director de Genesis.

Módulo puro salvo `correr`: construye órdenes para Claude (Mac), Hermes y
Codex (ChatGPT) y traduce sus salidas. Nunca guarda ni imprime claves.
"""

import json
import os
import signal
import subprocess

MODELO_DIRECTOR = "claude-opus-5-5"

_CLAVES_PROHIBIDAS = ("ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN")


def entorno_sin_claves_api(env: dict) -> dict:
    """Copia el entorno quitando las claves de API de Anthropic.

    Con ellas, `claude` usa la clave de API sin saldo en vez del inicio de
    sesión de claude.ai («Credit balance is too low», 2026-10-04).
    """
    limpio = dict(env)
    for clave in _CLAVES_PROHIBIDAS:
        limpio.pop(clave, None)
    return limpio


def orden_claude(prompt: str, modelo: str = MODELO_DIRECTOR, sesion=None) -> list:
    orden = [
        "claude",
        "-p",
        prompt,
        "--model",
        modelo,
        "--output-format",
        "json",
        "--max-turns",
        "6",
        "--allowedTools",
        "Read,Glob,Grep",
        "--disallowedTools",
        "Bash,Edit,Write,NotebookEdit,WebFetch,WebSearch,Task",
    ]
    if sesion:
        orden += ["--resume", sesion]
    return orden


def leer_claude(salida: str) -> dict:
    """Traduce el JSON de `claude --output-format json` a un dict común."""
    try:
        datos = json.loads(salida)
    except (json.JSONDecodeError, TypeError):
        return {
            "texto": "",
            "sesion": None,
            "tokens_entrada": 0,
            "tokens_salida": 0,
            "coste": 0.0,
            "error": "salida de claude no es JSON válido",
        }
    uso = datos.get("usage") or {}
    return {
        "texto": datos.get("result") or "",
        "sesion": datos.get("session_id"),
        "tokens_entrada": uso.get("input_tokens") or 0,
        "tokens_salida": uso.get("output_tokens") or 0,
        "coste": datos.get("total_cost_usd") or 0.0,
        "error": datos.get("result") if datos.get("is_error") else None,
    }


def orden_hermes(prompt: str, modelo=None, archivo_uso=None) -> list:
    orden = ["hermes", "-z", prompt]
    if modelo and modelo != "predeterminado":
        orden += ["-m", modelo]
    if archivo_uso:
        orden += ["--usage-file", archivo_uso]
    return orden


def orden_codex(modelo: str, raiz: str) -> list:
    """El prompt va por stdin («-» final)."""
    return [
        "codex",
        "exec",
        "-m",
        modelo,
        "-s",
        "read-only",
        "--skip-git-repo-check",
        "-C",
        raiz,
        "-",
    ]


def prompt_director(pregunta: str, historial: list, contexto: str) -> str:
    partes = [
        "Eres la dirección de Genesis de StarSeed OS. Responde en "
        "español, claro y breve.",
        "Reglas: no escribes código (lo escribe el enjambre tarea a tarea); "
        "propones olas, verificas puertas y decides rumbo; termina siempre "
        "con un informe de uso corto.",
    ]
    if contexto:
        partes.append("Contexto:\n" + contexto[:12000])
    if historial:
        lineas = []
        for turno in historial[-12:]:
            quien = "Alex" if turno.get("rol") == "alex" else "Dirección"
            lineas.append(f"{quien}: {turno.get('texto', '')}")
        partes.append("Historial:\n" + "\n".join(lineas))
    partes.append("Pregunta de Alex: " + pregunta)
    return "\n\n".join(partes)


def correr(orden, entrada=None, segundos=300, env=None, cwd=None):
    """Ejecuta la orden en su propio grupo de procesos.

    Devuelve (rc, salida); al agotar el tiempo mata el grupo completo.
    """
    proc = subprocess.Popen(
        orden,
        stdin=subprocess.PIPE if entrada is not None else None,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        env=env,
        cwd=cwd,
        start_new_session=True,
        text=True,
    )
    try:
        salida, _ = proc.communicate(input=entrada, timeout=segundos)
        return proc.returncode, salida or ""
    except subprocess.TimeoutExpired:
        try:
            os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
        except (ProcessLookupError, PermissionError):
            pass
        salida, _ = proc.communicate()
        return -9, (salida or "") + "\n[tiempo agotado]"
