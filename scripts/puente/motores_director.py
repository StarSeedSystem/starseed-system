# -*- coding: utf-8 -*-
"""Motores por línea de órdenes del Chat Director de Genesis.

Módulo puro salvo `correr`: construye órdenes para Claude (Mac), Hermes,
Antigravity (`agy`, con la sesión de Google de Alex) y Codex (ChatGPT) y
traduce sus salidas. Nunca guarda ni imprime claves.
"""

import contextlib
import json
import os
import re
import signal
import subprocess
import sys
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Optional

# GEM1119C: integración con flota Antigravity
try:
    from antigravity_flota import (
        obtener_modelo_para_papel,
        en_reserva,
        medir_tiempo_arranque_agy,
        proponer_reduccion_tokens_base,
        registrar_uso,
    )
except ImportError:
    # Fallback si no está disponible (ej. en tests sin el módulo)
    def obtener_modelo_para_papel(papel: str, modelo_actual: str | None = None):
        return "gemini-4-hydrogen-high", ["claude-opus-5-5-high", "hermes", "codex"]
    def en_reserva(modelo: str) -> bool:
        return False
    def medir_tiempo_arranque_agy(modelo: str, prompt: str = "OK"):
        return 0.0, 0
    def proponer_reduccion_tokens_base():
        return []
    def registrar_uso(modelo: str, duracion_seg: float, error_cuota: str | None = None):
        pass

MODELO_DIRECTOR = "claude-opus-5-5"
#: GEM1118A · Antigravity CLI (`agy`) con la cuenta de Google de Alex: cuota de Antigravity,
#: sin clave de API ni plan de Claude. El modelo de plan es para mensajes largos o de plan.
MODELO_AGY = "gemini-3.8-flash-medium"
MODELO_AGY_PLAN = "gemini-4-neon-medium"

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


#: (DIR1121E, 2026-11-21) Herramientas del servidor MCP `starseed-director` que la dirección puede usar: leer y
#: escribir el Chat Director y poner frenos a la publicación. `produccion_reanudar` NO: quitar un freno es de Alex.
MCP_DIRECTOR_PERMITIDAS = (
    "director_leer", "director_decir", "director_bandeja", "director_responder",
    "produccion_estado", "produccion_candidatos", "produccion_historial",
    "produccion_vetar", "produccion_pausar",
)

#: Órdenes de MetaGenesis que la dirección puede ejecutar (prefijos exactos; lista CERRADA). Son las herramientas
#: propias del proyecto, con sus puertas y cerrojos dentro: canales, capacidad, nube, pruebas, relevo y lectura de git.
ORDENES_METAGENESIS = (
    "python3 scripts/puente/director_chat.py",
    "python3 scripts/puente/sincronizador_direccion.py publicar-canal",
    "python3 scripts/puente/buscar_capacidad.py",
    "python3 scripts/puente/repartir-a-nube.py",
    "python3 scripts/puente/nube-gh.py lanzar",
    "python3 scripts/puente/director_pruebas.py",
    "python3 scripts/puente/antigravity_flota.py modelos",
    "python3 scripts/puente/antigravity_flota.py uso",
    "python3 scripts/puente/antigravity_flota.py papel",
    "python3 scripts/puente/archivar_worktrees.py",
    "starseed-relevo",
    "starseed-enjambre.py",
    "git status", "git log", "git diff", "git show", "git worktree list",
    "launchctl list",
)

#: Nunca, ni aunque otra regla lo abriera: publicar o reescribir main, borrar, claves, el A1, parar servicios.
ORDENES_VETADAS = (
    "git push", "git reset", "git checkout", "git commit", "rm", "sudo", "curl", "ssh", "kill", "pkill",
    "launchctl kickstart", "launchctl bootout", "launchctl unload",
    "python3 scripts/puente/commit-seguro.py", "python3 scripts/puente/autopublicar.py",
    "python3 scripts/puente/oracle_nodo.py", "python3 scripts/puente/nube-gh.py secretos",
)


def permisos_del_presidente() -> tuple:
    """PURA (DIR1121E). (permitidas, vetadas) para `claude -p`. Antes solo leía (Read, Glob, Grep) y contestaba «no tengo
    terminal ni permiso de escritura en el Chat Director; se me denegó director_leer». En modo `-p` lo que no está
    permitido se deniega solo; las vetadas van además escritas por si un ajuste del usuario abriera más."""
    permitidas = ["Read,Glob,Grep"]
    permitidas += ["mcp__starseed-director__%s" % n for n in MCP_DIRECTOR_PERMITIDAS]
    permitidas += ["Bash(%s:*)" % o for o in ORDENES_METAGENESIS]
    vetadas = ["Edit,Write,NotebookEdit,WebFetch,WebSearch,Task", "mcp__starseed-director__produccion_reanudar"]
    vetadas += ["Bash(%s:*)" % o for o in ORDENES_VETADAS]
    return permitidas, vetadas


def orden_claude(prompt: str, modelo: str = MODELO_DIRECTOR, sesion=None) -> list:
    permitidas, vetadas = permisos_del_presidente()
    orden = [
        "claude",
        "-p",
        prompt,
        "--model",
        modelo,
        "--output-format",
        "json",
        "--max-turns",
        "12",
        "--allowedTools",
        *permitidas,
        "--disallowedTools",
        *vetadas,
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
_FALLOS_HERMES = (
    "kept failing over",
    "every provider in the fallback chain",
    "invalid api key",
    "gateway connection failed",
    "gateway starting:",
    "gateway unavailable",
    "gateway exited",
    "error: gateway",
    "no local fallback",
)


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
    """PURA. «Ningún proveedor de la cadena contestó» o timeout: texto corto de error, no una respuesta."""
    bajo = (texto or "").lower()
    return len(bajo) < 600 and (any(m in bajo for m in _FALLOS_HERMES) or "[tiempo agotado]" in bajo)


def es_fallo_tiempo_agotado(texto) -> bool:
    """PURA. La salida contiene «[tiempo agotado]» (marca de _corren al matar por timeout).
    Igual que es_fallo_hermes: solo en salidas cortas (< 600 chars) para no confundir
    con una respuesta larga que mencione la frase por casualidad."""
    bajo = (texto or "").lower()
    return len(bajo) < 600 and "[tiempo agotado]" in bajo


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


#: DIR1111N · tiempos de las llamadas a proveedores. Lo que espera una persona: el Director presidente y
#: los intentos en sesión nueva no pasan de dos minutos (medido el 2026-11-11: una sesión nueva de Hermes
#: contesta en ~30-40 s cuando contesta; si no, se queda colgada hasta el tope, sea cual sea el contexto).
SEGUNDOS_PROVEEDOR_PRESIDENTE = 120
SEGUNDOS_SESION_FRESCA = 120
SEGUNDOS_AVISO_TELEGRAM = 60

# ── GEM1118A · Antigravity CLI (`agy`) como motor de la dirección ────────────────
# `agy` pide la entrada por terminal si no se le cierra: sin `stdin=DEVNULL` se queda colgado
# hasta que alguien escribe. `SIN_ENTRADA` es la marca para que `_correr` abra DEVNULL.
SEGUNDOS_AGY = SEGUNDOS_PROVEEDOR_PRESIDENTE + 15
#: Un prompt más largo que esto (o una revisión de plan) usa el modelo de plan.
TOPE_PROMPT_AGY = 6000
SIN_ENTRADA = object()

_AGY_FALLOS = (
    "quota", "rate limit", "ratelimit", "resource exhausted", "too many requests",
    "429", "402", "not logged in", "login required", "please log in", "unauthorized",
    "unauthenticated", "authentication", "session expired", "no session", "invalid api key",
    "api key", "permission denied", "insufficient", "credit", "billing",
    "tiempo agotado", "timed out", "timeout",
    "jetski: no output produced", "permission that headless mode cannot prompt",
    "auto-denied", "\"command\" permission",
)
_AGY_PERMISOS = (
    "jetski: no output produced",
    "permission that headless mode cannot prompt",
    "\"command\" permission",
    "auto-denied",
)
_AGY_TOPE_FALLO = 600


def orden_agy(prompt: str, modelo=None, segundos=None) -> list:
    """La orden de `agy` con la sesión de Google de Alex (100 % headless sin GUI).

    `--mode plan` (nunca `--dangerously-skip-permissions`): la dirección propone, no toca el repo.
    """
    segundos = int(segundos or SEGUNDOS_AGY)
    return [
        "agy",
        "-p",
        prompt,
        "--model",
        modelo or MODELO_AGY,
        "--mode",
        "plan",
        "--disable-slash-commands",
        "--print-timeout",
        "%ds" % segundos,
        "--output-format",
        "json",
    ]


def _extraer_json_agy(crudo: str):
    """Intenta parsear `crudo` como dict JSON incluso si hay líneas de stderr delante del objeto raíz."""
    if not crudo:
        return None
    try:
        leido = json.loads(crudo)
        return leido if isinstance(leido, dict) else None
    except (TypeError, ValueError):
        pass
    decodificador = json.JSONDecoder()
    # Priorizar `{` al inicio de línea (del último al primero) para no capturar subobjetos como `usage`.
    inicio_linea = [i for i, ch in enumerate(crudo) if ch == "{" and (i == 0 or crudo[i - 1] in "\r\n")]
    otros = [i for i, ch in enumerate(crudo) if ch == "{" and i not in inicio_linea][::-1][:8]
    claves_raiz = ("response", "result", "text", "output", "content", "error", "errorMessage", "error_message", "status", "conversation_id")
    respaldo = None
    for idx in list(reversed(inicio_linea))[:8] + otros:
        try:
            obj, _ = decodificador.raw_decode(crudo[idx:])
            if not isinstance(obj, dict):
                continue
            if any(k in obj for k in claves_raiz):
                return obj
            if respaldo is None:
                respaldo = obj
        except ValueError:
            continue
    return respaldo


def _texto_agy(datos) -> str:
    if not isinstance(datos, dict):
        return ""
    for clave in ("response", "result", "text", "output", "content"):
        valor = datos.get(clave)
        if isinstance(valor, str) and valor.strip():
            return valor.strip()
    return ""


def _error_agy(datos) -> str:
    if not isinstance(datos, dict):
        return ""
    for clave in ("error", "errorMessage", "error_message"):
        valor = datos.get(clave)
        if isinstance(valor, dict):
            valor = valor.get("message") or valor.get("type")
        if valor:
            return str(valor).strip()
    if datos.get("is_error") or datos.get("success") is False:
        return str(datos.get("message") or datos.get("response") or "agy devolvió un error").strip()
    if str(datos.get("status") or "").lower() in ("error", "failed", "failure"):
        return str(datos.get("message") or "agy devolvió un error").strip()
    return ""


def _uso_agy(datos):
    uso = datos.get("usage") if isinstance(datos, dict) else None
    uso = uso if isinstance(uso, dict) else {}

    def entero(*claves):
        for clave in claves:
            valor = uso.get(clave)
            if isinstance(valor, (int, float)):
                return int(valor)
        return 0

    return entero("input_tokens", "prompt_tokens"), entero("output_tokens", "completion_tokens")


def leer_agy(salida, rc=0) -> dict:
    """PURA. Traduce la salida de `agy` (JSON, stderr+JSON o texto) al dict común del Director.

    Respuesta vacía, permiso headless denegado, código distinto de 0, «[tiempo agotado]», cuota
    o sesión caída cuentan como fallo: `texto` sale vacío y `error` dice el motivo, para que el
    Director pase al motor siguiente y nunca publique un error o JSON crudo como respuesta.
    """
    crudo = (salida or "").strip()
    datos = _extraer_json_agy(crudo)

    error = _error_agy(datos)
    texto = _texto_agy(datos) if datos is not None else crudo
    modelo = datos.get("model") if isinstance(datos, dict) else None
    tokens_entrada, tokens_salida = _uso_agy(datos)

    bajo = crudo.lower()
    if "[tiempo agotado]" in bajo:
        error = error or "tiempo agotado"
    elif rc != 0 and not error:
        error = "agy salió con código %s" % rc
    if not error and not texto and any(p in bajo for p in _AGY_PERMISOS):
        error = "agy headless pidió permiso de comando no interactivo y no produjo respuesta"
    if not error and not texto:
        error = "respuesta vacía de agy"
    if not error and any(p in bajo for p in _AGY_PERMISOS) and len(crudo) < 2000 and not texto:
        error = "agy headless sin salida por permiso denegado"
    if not error and len(texto) < _AGY_TOPE_FALLO and any(m in texto.lower() for m in _AGY_FALLOS):
        error = texto
    return {
        "texto": "" if error else texto,
        "modelo": modelo,
        "tokens_entrada": tokens_entrada,
        "tokens_salida": tokens_salida,
        "error": error or None,
    }


#: DIR1111N · gancho opcional: un `callable` que devuelve un gestor de contexto. El cartero lo usa para
#: soltar el cerrojo de su estado mientras dura la llamada bloqueante (nadie espera detrás de un proveedor).
SOLTAR_DURANTE_LLAMADA = None


def correr(orden, entrada=None, segundos=300, env=None, cwd=None):
    """Ejecuta la orden en su propio grupo de procesos.

    Devuelve (rc, salida); al agotar el tiempo mata el grupo completo.
    """
    gancho = SOLTAR_DURANTE_LLAMADA
    with (gancho() if gancho else contextlib.nullcontext()):
        return _correr(orden, entrada, segundos, env, cwd)


def _correr(orden, entrada, segundos, env, cwd):
    if entrada is SIN_ENTRADA:  # GEM1118A: `agy` espera si hereda la entrada; DEVNULL lo cierra.
        entrada, stdin = None, subprocess.DEVNULL
    else:
        stdin = subprocess.PIPE if entrada is not None else None
    proc = subprocess.Popen(
        orden,
        stdin=stdin,
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
        try:
            # DIR1111N: un nieto que conserve la tubería no debe colgar al cartero tras matar el grupo.
            salida, _ = proc.communicate(timeout=10)
        except subprocess.TimeoutExpired:
            salida = ""
        return -9, (salida or "") + "\n[tiempo agotado]"


# ════════════════════════════════════════════════════════════════════════════
# GEM1119C · Antigravity para dirección: planes, revisiones, decisiones largas
# ════════════════════════════════════════════════════════════════════════════

PAPEL_DIRECCION = "director_presidente"
# Tiempo para trabajo en segundo plano (sin tope de 120 s del chat): 10 min por defecto
SEGUNDOS_AGY_FONDO = 600


@dataclass
class ResultadoAgyFondo:
    """Resultado de una llamada a agy en segundo plano."""
    texto: str
    modelo: str
    tokens_entrada: int
    tokens_salida: int
    duracion_seg: float
    error: str | None = None
    en_reserva: bool = False
    fallback_usado: str | None = None


def _aviso_inicio_agy(papel: str, modelo: str, callback: Callable[[str], None] | None = None) -> None:
    """Envía aviso al chat de que empieza el trabajo en segundo plano con agy."""
    msg = f"[agy · {papel}] Iniciando con {modelo} (trabajo en segundo plano, sin tope de 120 s)…"
    if callback:
        callback(msg)
    else:
        print(msg, file=sys.stderr, flush=True)


def _aviso_fin_agy(papel: str, modelo: str, ok: bool, duracion: float, tokens_entrada: int,
                   callback: Callable[[str], None] | None = None) -> None:
    """Envía aviso al chat de que terminó el trabajo en segundo plano."""
    estado = "completado" if ok else "falló"
    msg = (f"[agy · {papel}] {estado} con {modelo} en {duracion:.1f}s "
           f"({tokens_entrada} tokens entrada)")
    if callback:
        callback(msg)
    else:
        print(msg, file=sys.stderr, flush=True)


def correr_agy_fondo(
    prompt: str,
    papel: str = PAPEL_DIRECCION,
    callback_aviso: Callable[[str], None] | None = None,
    segundos: int = SEGUNDOS_AGY_FONDO,
) -> ResultadoAgyFondo:
    """Ejecuta `agy` en segundo plano para tareas largas de la dirección.

    Flujo:
    1. Obtiene el modelo para el papel (con reserva del 20 %).
    2. Si el modelo principal está en reserva o falla, usa alternativas (agy → Hermes → Codex).
    3. Mide tiempo de arranque y tokens de base.
    4. Registra uso en el medidor (~/.starseed/antigravity-uso.json).
    5. Devuelve resultado estructurado con aviso de inicio/fin vía callback.

    Args:
        prompt: Prompt completo para la tarea (plan, revisión, informe, decisión).
        papel: Papel que define el modelo (default: "director_presidente").
        callback_aviso: Función para enviar avisos al chat (recibe str).
        segundos: Timeout para la llamada (default 600s = 10 min).

    Returns:
        ResultadoAgyFondo con texto, modelo, tokens, duración, error y fallback usado.
    """
    # 1. Modelo principal y alternativas para el papel
    modelo_principal, alternativas = obtener_modelo_para_papel(papel)
    en_reserva_principal = en_reserva(modelo_principal)

    # Si el principal está en reserva, la primera alternativa ya fue puesta al frente por obtener_modelo_para_papel
    modelos_a_probar = [modelo_principal] + alternativas

    # 2. Aviso de inicio
    _aviso_inicio_agy(papel, modelos_a_probar[0], callback_aviso)

    # 3. Probar modelos en orden (agy → Hermes → Codex)
    for i, modelo in enumerate(modelos_a_probar):
        es_agy = not modelo.startswith(("hermes", "codex", "nim/", "xkiro/", "openrouter", "aihubmix", "llm7"))
        inicio = time.perf_counter()
        error_cuota: str | None = None
        fallback_usado = None if i == 0 else modelo

        try:
            if es_agy:
                # Llamada a agy con stdin=DEVNULL, modo plan, timeout extendido
                orden = orden_agy(prompt, modelo=modelo, segundos=segundos)
                rc, salida = correr(orden, entrada=SIN_ENTRADA, segundos=segundos, cwd=Path.cwd())
                datos = leer_agy(salida, rc)
                texto = datos.get("texto", "")
                tokens_entrada = datos.get("tokens_entrada", 0)
                tokens_salida = datos.get("tokens_salida", 0)
                error = datos.get("error")
                if error and any(p in error.lower() for p in ("quota", "rate limit", "429", "402", "credit", "billing")):
                    error_cuota = error
            elif modelo == "hermes":
                # Fallback a Hermes
                orden = orden_hermes(prompt)
                rc, salida = correr(orden, entrada=SIN_ENTRADA, segundos=segundos, cwd=Path.cwd())
                # Hermes no devuelve JSON estructurado; parseo simple
                texto = salida.strip() if rc == 0 else ""
                tokens_entrada = 0
                tokens_salida = 0
                error = None if rc == 0 and texto else (salida.strip() or "hermes falló")
            elif modelo == "codex":
                # Fallback a Codex
                orden = orden_codex("gpt-4o", Path.cwd())
                rc, salida = correr(orden, entrada=prompt, segundos=segundos, cwd=Path.cwd())
                texto = salida.strip() if rc == 0 else ""
                tokens_entrada = 0
                tokens_salida = 0
                error = None if rc == 0 and texto else (salida.strip() or "codex falló")
            else:
                # Otros proveedores (nim, xkiro, etc.) - no implementados aquí
                continue

            duracion = time.perf_counter() - inicio

            # 4. Registrar uso si es agy
            if es_agy:
                registrar_uso(modelo, duracion, error_cuota)

            # 5. Éxito
            if texto and not error:
                _aviso_fin_agy(papel, modelo, True, duracion, tokens_entrada, callback_aviso)
                return ResultadoAgyFondo(
                    texto=texto,
                    modelo=modelo,
                    tokens_entrada=tokens_entrada,
                    tokens_salida=tokens_salida,
                    duracion_seg=duracion,
                    error=None,
                    en_reserva=en_reserva_principal,
                    fallback_usado=fallback_usado,
                )
            else:
                # Fallo de este modelo, continuar con el siguiente
                if error_cuota:
                    _aviso_fin_agy(papel, modelo, False, duracion, tokens_entrada, callback_aviso)
                continue

        except Exception as e:
            duracion = time.perf_counter() - inicio
            if es_agy:
                registrar_uso(modelo, duracion, str(e))
            continue

    # 6. Todos fallaron
    _aviso_fin_agy(papel, modelos_a_probar[0], False, 0, 0, callback_aviso)
    return ResultadoAgyFondo(
        texto="",
        modelo=modelos_a_probar[0],
        tokens_entrada=0,
        tokens_salida=0,
        duracion_seg=0,
        error="Todos los modelos fallaron o están en reserva",
        en_reserva=en_reserva_principal,
        fallback_usado="ninguno",
    )


def medir_y_proponer_optimizacion_agy(modelo: str = "gemini-3.8-flash-low") -> dict:
    """Mide tiempo de arranque y tokens base de agy y propone optimizaciones.

    Returns:
        dict con 'tiempo_arranque_seg', 'tokens_base_estimados', 'propuestas'
    """
    tiempo, tokens = medir_tiempo_arranque_agy(modelo)
    propuestas = proponer_reduccion_tokens_base()
    return {
        "modelo": modelo,
        "tiempo_arranque_seg": round(tiempo, 2),
        "tokens_base_estimados": tokens,
        "propuestas": propuestas,
    }


def obtener_modelo_direccion() -> tuple[str, list[str]]:
    """Obtiene el modelo principal y alternativas para el papel 'director_presidente'.

    Returns:
        (modelo_principal, lista_alternativas)
    """
    return obtener_modelo_para_papel(PAPEL_DIRECCION)


# Para compatibilidad con código existente que usa MODELO_AGY / MODELO_AGY_PLAN
def modelo_agy_para_prompt(prompt: str) -> str:
    """Selecciona el modelo agy según la longitud del prompt (compatibilidad)."""
    if len(prompt) > TOPE_PROMPT_AGY:
        return MODELO_AGY_PLAN
    return MODELO_AGY
