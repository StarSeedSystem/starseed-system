# -*- coding: utf-8 -*-
"""Motores por línea de órdenes del Chat Director de Genesis.

Módulo puro salvo `correr`: construye órdenes para Claude (Mac), Hermes y
Codex (ChatGPT) y traduce sus salidas. Nunca guarda ni imprime claves.
"""

import json
import os
import re
import signal
import subprocess
import sys

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


DIRECCION = os.path.expanduser("~/.starseed/direccion-motor.json")


def direccion_motor(ruta=None) -> dict:
    """(2026-10-29, DIR1029A) Por dónde va la dirección: {'motor': 'hermes'|'claude', 'sesion': id|None}.
    STARSEED_DIRECCION_MOTOR manda sobre el archivo; sin nada, «claude» (lo de siempre)."""
    try:
        with open(ruta or DIRECCION, encoding="utf-8") as f:
            d = json.load(f) or {}
    except (OSError, ValueError):
        d = {}
    return {"motor": os.environ.get("STARSEED_DIRECCION_MOTOR") or d.get("motor") or "claude",
            "sesion": d.get("sesion") or None}


def orden_hermes(prompt: str, modelo=None, archivo_uso=None, sesion=None) -> list:
    # Con `sesion`, la respuesta sigue el hilo de esa sesión de Hermes («Dirección MetaGenesis»).
    orden = ["hermes"] + (["--resume", sesion] if sesion else []) + ["-z", prompt]
    if modelo and modelo != "predeterminado":
        orden += ["-m", modelo]
    if archivo_uso:
        orden += ["--usage-file", archivo_uso]
    return orden


# ── HER1111K · sesión de Hermes en pausa ──────────────────────────────────────────
# Cuando el gateway de Hermes muere a mitad de un turno, Hermes marca el turno perdido como
# «desconocido» y bloquea esa sesión hasta que una persona lo confirme. Cada mensaje posterior
# devuelve un aviso de pausa EN LUGAR de una respuesta (`hermes sessions discard --help`: con
# `--resume <id> -q` sale con código 3). Ese aviso no es una respuesta y nunca se publica como tal.
# Confirmar el turno perdido (`hermes sessions discard`) queda SIEMPRE en manos de una persona:
# aquí solo se reconoce la pausa y se compone el texto de la orden para decírsela a Alex.

CODIGO_PAUSA_HERMES = 3
#: Trozos del aviso (en minúsculas, apóstrofe recto). La redacción de Hermes puede cambiar:
#: basta con reconocer dos, o uno de los dos fuertes.
_PAUSA_FUERTES = ("hermes sessions discard", "this chat is paused")
_PAUSA_DEBILES = (
    "couldn't confirm how the last turn ended",
    "could not confirm how the last turn ended",
    "paused turn",
    "/discard",
    "your message was not sent",
    "won't re-run it by itself",
)
#: Un aviso de pausa es corto; una respuesta larga que lo mencione no lo es.
_PAUSA_MAX_CHARS = 1500
_ID_SESION = re.compile(r"hermes\s+sessions\s+discard\s+([A-Za-z0-9][A-Za-z0-9_\-]*)", re.IGNORECASE)
_ID_SESION_SUELTO = re.compile(r"\b(\d{8}_\d{6}_[0-9a-f]+)\b")
_FALLOS_HERMES = ("kept failing over", "every provider in the fallback chain", "invalid api key")


def es_pausa_hermes(rc, salida) -> bool:
    """PURA. ¿Lo que devolvió `hermes` es el aviso de sesión en pausa y no una respuesta?

    Por el código de salida (3 sin texto, o 3 con rastro del aviso) y por el texto (aunque el
    código sea 0, como se vio el 2026-11-11). Defensiva con la redacción: normaliza apóstrofes
    y mayúsculas, y solo mira salidas cortas.
    """
    texto = (salida or "").replace("\u2019", "'").replace("\u2018", "'").lower()
    fuertes = sum(1 for m in _PAUSA_FUERTES if m in texto)
    debiles = sum(1 for m in _PAUSA_DEBILES if m in texto)
    if rc == CODIGO_PAUSA_HERMES and (not texto.strip() or fuertes or debiles):
        return True
    if len(texto) > _PAUSA_MAX_CHARS:
        return False
    return fuertes >= 1 or debiles >= 2


def es_fallo_hermes(texto) -> bool:
    """PURA. «Ningún proveedor de la cadena contestó»: texto corto de error, no una respuesta."""
    bajo = (texto or "").lower()
    return len(bajo) < 600 and any(m in bajo for m in _FALLOS_HERMES)


def id_sesion_pausada(salida, por_defecto=None):
    """PURA. El id de sesión que nombra el aviso (`hermes sessions discard <id>`), o `por_defecto`."""
    texto = salida or ""
    for patron in (_ID_SESION, _ID_SESION_SUELTO):
        m = patron.search(texto)
        if m:
            return m.group(1)
    return por_defecto


def orden_reabrir_hermes(sesion) -> str:
    """PURA. La orden que REABRE la sesión, SOLO como texto para decírsela a Alex. No se ejecuta."""
    return "hermes sessions discard %s --yes" % sesion


def _registrar_pausa(crudo):
    try:
        import director_chat  # noqa: PLC0415 — mismo directorio

        crudo = director_chat.tachar(crudo)
    except Exception:  # noqa: BLE001 — el registro nunca rompe la entrega
        pass
    print("[hermes en pausa] salida cruda: %s" % crudo[:2000].replace("\n", " "), file=sys.stderr, flush=True)


def hermes_con_pausa(ejecutar, prompt, prompt_fresco, sesion, registrar=None):
    """Llama a Hermes; si su sesión está en pausa, reintenta en una sesión nueva (una sola vez).

    `ejecutar(prompt, sesion) -> (rc, salida, uso)` lanza la orden. `prompt_fresco()` devuelve el
    prompt con el contexto del hilo para la sesión nueva (sin `--resume` no recuerda nada).
    Devuelve {rc, salida, uso, pausa, fresca}: `pausa` es None o {sesion, crudo}; `fresca` es True
    si hay una respuesta válida de la sesión nueva. Si lo que queda es otro aviso de pausa, `salida`
    sale vacía y `rc` distinto de 0: quien llama sigue su camino de fallo.
    """
    registrar = registrar or _registrar_pausa
    rc, salida, uso = ejecutar(prompt, sesion)
    if not es_pausa_hermes(rc, salida):
        return {"rc": rc, "salida": salida, "uso": uso, "pausa": None, "fresca": False}
    registrar(salida or "(sin texto, rc=%s)" % rc)
    pausa = {"sesion": id_sesion_pausada(salida, sesion), "crudo": (salida or "")[:2000]}
    if not sesion:
        # Ya era una conversación nueva y aun así avisa de pausa: no hay otra vía que probar.
        return {"rc": rc or 1, "salida": "", "uso": uso, "pausa": pausa, "fresca": False}
    rc2, salida2, uso2 = ejecutar(prompt_fresco(), None)
    if es_pausa_hermes(rc2, salida2):
        registrar(salida2 or "(sin texto, rc=%s)" % rc2)
        return {"rc": rc2 or 1, "salida": "", "uso": uso2, "pausa": pausa, "fresca": False}
    bien = rc2 == 0 and bool((salida2 or "").strip()) and not es_fallo_hermes(salida2)
    return {"rc": rc2, "salida": salida2, "uso": uso2, "pausa": pausa, "fresca": bien}


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
