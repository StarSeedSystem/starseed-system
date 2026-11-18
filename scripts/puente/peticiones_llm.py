#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Enrutador de modelos con catálogo vivo, NIM, OpenRouter y salud compartida (PET1116A).

Núcleo puro con E/S inyectable. Sustituye a llm() en peticiones_telegram.py y
peticiones_productor.py (quita la lista fija MODELOS).
"""
from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime
from pathlib import Path
from typing import Any, Callable

# Rutas por defecto
RAIZ_DEF = Path(__file__).parent.parent.parent
SALUD_DEF = RAIZ_DEF / "starseed_memory_root" / "salud"
ESTADO_DEF = SALUD_DEF / "estado.json"
CATALOGO_DEF = SALUD_DEF / "catalogo_freellmapi.json"

# Tipos para E/S inyectable
HttpGetFn = Callable[[str], dict[str, Any]]
HttpPostFn = Callable[[str, bytes, dict[str, str]], dict[str, Any]]
AhoraFn = Callable[[], datetime]
LeerClaveFn = Callable[[str], str | None]
LogFn = Callable[[str], None]

# ─────────────────────────────── Utilidades HTTP ───────────────────────────────

def _respuesta_http(abrir: Callable[[], Any]) -> dict[str, Any]:
    try:
        with abrir() as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        try:
            return json.load(e)
        except Exception:
            return {"ok": False, "description": f"HTTP {e.code}"}
    except Exception as e:
        return {"ok": False, "description": type(e).__name__}


# ─────────────────────────────── Catálogo vivo FreeLLMAPI ───────────────────────────────

CATALOGO_TTL_S = 30 * 60  # 30 minutos

def _leer_json(ruta: Path, defecto: Any = None) -> Any:
    try:
        with open(ruta, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return defecto


def _escribir_atomico(ruta: Path, datos: Any) -> None:
    ruta.parent.mkdir(parents=True, exist_ok=True)
    import tempfile
    fd, tmp = tempfile.mkstemp(dir=ruta.parent, prefix=".tmp_")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(datos, f, ensure_ascii=False, indent=1)
            f.write("\n")
        os.replace(tmp, ruta)
    except BaseException:
        if os.path.exists(tmp):
            os.unlink(tmp)
        raise


def _catalogo_valido(catalogo: dict[str, Any], ahora: datetime) -> bool:
    ts = catalogo.get("timestamp")
    if not ts:
        return False
    try:
        entonces = datetime.fromisoformat(ts)
        return (ahora - entonces).total_seconds() < CATALOGO_TTL_S
    except Exception:
        return False


def obtener_catalogo_freellmapi(
    http_get: HttpGetFn,
    ahora_fn: AhoraFn,
    log_fn: LogFn | None = None,
) -> list[str]:
    """Obtiene modelos vivos de FreeLLMAPI (/v1/models). Cache 30 min."""
    ahora = ahora_fn()
    catalogo = _leer_json(CATALOGO_DEF, {})
    if _catalogo_valido(catalogo, ahora):
        modelos = catalogo.get("modelos", [])
        if log_fn:
            log_fn(f"Catálogo FreeLLMAPI en caché: {len(modelos)} modelos")
        return modelos

    url = "http://127.0.0.1:3001/v1/models"
    try:
        resp = http_get(url)
        data = resp.get("data", [])
        modelos = [m["id"] for m in data if isinstance(m, dict) and m.get("id")]
        # Filtrar: nunca "auto" ni modelos Claude
        modelos_filtrados = [m for m in modelos if m != "auto" and "claude" not in m.lower()]
        _escribir_atomico(CATALOGO_DEF, {
            "timestamp": ahora.isoformat(),
            "modelos": modelos_filtrados,
        })
        if log_fn:
            log_fn(f"Catálogo FreeLLMAPI actualizado: {len(modelos_filtrados)} modelos")
        return modelos_filtrados
    except Exception as e:
        if log_fn:
            log_fn(f"Error obteniendo catálogo FreeLLMAPI: {e}")
        # Devolver caché aunque esté caducado
        modelos = catalogo.get("modelos", [])
        if log_fn:
            log_fn(f"Usando catálogo caducado: {len(modelos)} modelos")
        return modelos


# ─────────────────────────────── Salud compartida ───────────────────────────────

SALUD_KEY = "modelos_llm"

def _leer_salud() -> dict[str, Any]:
    return _leer_json(ESTADO_DEF, {})


def _guardar_salud(estado: dict[str, Any]) -> None:
    _escribir_atomico(ESTADO_DEF, estado)


def registrar_exito(modelo: str, ruta: str, ahora_fn: AhoraFn) -> None:
    """Registra un éxito: modelo, ruta, timestamp."""
    estado = _leer_salud()
    salud = estado.get(SALUD_KEY, {})
    salud["ultimo_exito"] = {
        "modelo": modelo,
        "ruta": ruta,
        "timestamp": ahora_fn().isoformat(),
    }
    # Limpiar fallos consecutivos de este modelo
    fallos = salud.get("fallos_consecutivos", {})
    if modelo in fallos:
        del fallos[modelo]
    salud["fallos_consecutivos"] = fallos
    estado[SALUD_KEY] = salud
    _guardar_salud(estado)


def registrar_fallo(modelo: str, ruta: str, ahora_fn: AhoraFn) -> int:
    """Registra un fallo y devuelve fallos consecutivos de ese modelo."""
    estado = _leer_salud()
    salud = estado.get(SALUD_KEY, {})
    fallos = salud.get("fallos_consecutivos", {})
    fallos[modelo] = fallos.get(modelo, 0) + 1
    salud["fallos_consecutivos"] = fallos
    estado[SALUD_KEY] = salud
    _guardar_salud(estado)
    return fallos[modelo]


def obtener_ultimo_exito() -> dict[str, str] | None:
    """Devuelve {modelo, ruta, timestamp} del último éxito o None."""
    estado = _leer_salud()
    return estado.get(SALUD_KEY, {}).get("ultimo_exito")


def modelo_con_cuota_agotada(modelo: str) -> bool:
    """Verifica si un modelo tiene fallos consecutivos >= 2 (cuota agotada probable)."""
    estado = _leer_salud()
    fallos = estado.get(SALUD_KEY, {}).get("fallos_consecutivos", {})
    return fallos.get(modelo, 0) >= 2


# ─────────────────────────────── Rutas de modelos ───────────────────────────────

RUTA_FREELLM = "freellmapi"
RUTA_NIM = "nim"
RUTA_OPENROUTER = "openrouter_free"
RUTA_HERMES = "hermes"

MODELOS_NIM = ["minimax-m3.1-flash", "nemotron-3.5-lightning"]

def _llamar_freellmapi(
    modelo: str,
    mensajes: list[dict[str, str]],
    max_tokens: int,
    http_post: HttpPostFn,
    leer_clave: LeerClaveFn,
    log_fn: LogFn | None = None,
) -> tuple[str, str]:
    clave = leer_clave("FREELLMAPI_KEY") or ""
    cuerpo = json.dumps({
        "model": modelo,
        "messages": mensajes,
        "max_tokens": max_tokens,
        "temperature": 0.2,
    }).encode()
    url = "http://127.0.0.1:3001/v1/chat/completions"
    resp = http_post(url, cuerpo, {
        "Authorization": f"Bearer {clave}",
        "Content-Type": "application/json",
    })
    usado = str(resp.get("model") or modelo)
    texto = ((resp.get("choices") or [{}])[0].get("message") or {}).get("content") or ""
    if "claude" in usado.lower():
        return "", ""
    if texto.strip():
        return texto.strip(), usado
    if log_fn:
        err = (resp.get("error") or {}).get("message", "") if isinstance(resp.get("error"), dict) else ""
        log_fn(f"FreeLLMAPI sin respuesta de {modelo}: {err}")
    return "", ""


def _llamar_nim(
    modelo: str,
    mensajes: list[dict[str, str]],
    max_tokens: int,
    http_post: HttpPostFn,
    leer_clave: LeerClaveFn,
    log_fn: LogFn | None = None,
) -> tuple[str, str]:
    clave = leer_clave("NIM_KEY") or ""
    # max_tokens alto para razonamiento
    cuerpo = json.dumps({
        "model": modelo,
        "messages": mensajes,
        "max_tokens": max(max_tokens, 4000),
        "temperature": 0.2,
    }).encode()
    url = "https://integrate.api.nvidia.com/v1/chat/completions"
    resp = http_post(url, cuerpo, {
        "Authorization": f"Bearer {clave}",
        "Content-Type": "application/json",
    })
    usado = str(resp.get("model") or modelo)
    texto = ((resp.get("choices") or [{}])[0].get("message") or {}).get("content") or ""
    if texto.strip():
        return texto.strip(), usado
    if log_fn:
        err = (resp.get("error") or {}).get("message", "") if isinstance(resp.get("error"), dict) else ""
        log_fn(f"NIM sin respuesta de {modelo}: {err}")
    return "", ""


def _llamar_openrouter_free(
    mensajes: list[dict[str, str]],
    max_tokens: int,
    http_post: HttpPostFn,
    leer_clave: LeerClaveFn,
    log_fn: LogFn | None = None,
) -> tuple[str, str]:
    clave = leer_clave("OPENROUTER_KEY") or ""
    # Solo modelos :free
    modelos_free = [
        "meta-llama/llama-3.1-8b-instruct:free",
        "mistralai/mistral-7b-instruct:free",
        "google/gemma-2-9b-it:free",
        "qwen/qwen-2.5-7b-instruct:free",
    ]
    for modelo in modelos_free:
        cuerpo = json.dumps({
            "model": modelo,
            "messages": mensajes,
            "max_tokens": max_tokens,
            "temperature": 0.2,
        }).encode()
        resp = http_post("https://openrouter.ai/api/v1/chat/completions", cuerpo, {
            "Authorization": f"Bearer {clave}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://starseed-os.vercel.app",
            "X-Title": "StarSeed OS",
        })
        usado = str(resp.get("model") or modelo)
        texto = ((resp.get("choices") or [{}])[0].get("message") or {}).get("content") or ""
        if "claude" in usado.lower():
            continue
        if texto.strip():
            return texto.strip(), usado
        if log_fn:
            err = (resp.get("error") or {}).get("message", "") if isinstance(resp.get("error"), dict) else ""
            log_fn(f"OpenRouter sin respuesta de {modelo}: {err}")
    return "", ""


def _llamar_hermes(
    mensajes: list[dict[str, str]],
    max_tokens: int,
    http_post: HttpPostFn,
    log_fn: LogFn | None = None,
) -> tuple[str, str]:
    """Hermes: pasarela de la Mac en 127.0.0.1:3011 si está viva."""
    cuerpo = json.dumps({
        "model": "hermes",
        "messages": mensajes,
        "max_tokens": max_tokens,
        "temperature": 0.2,
    }).encode()
    try:
        resp = http_post("http://127.0.0.1:3011/v1/chat/completions", cuerpo, {
            "Content-Type": "application/json",
        })
        usado = str(resp.get("model") or "hermes")
        texto = ((resp.get("choices") or [{}])[0].get("message") or {}).get("content") or ""
        if texto.strip():
            return texto.strip(), usado
    except Exception as e:
        if log_fn:
            log_fn(f"Hermes no disponible: {e}")
    return "", ""


# ─────────────────────────────── Enrutador principal ───────────────────────────────

ESPERA_DESPUES_FALLO_S = 5

class ModeloNoDisponible(Exception):
    """Ningún modelo respondió."""
    pass


def llm(
    mensajes: list[dict[str, str]],
    max_tokens: int = 1500,
    *,
    http_get: HttpGetFn | None = None,
    http_post: HttpPostFn | None = None,
    ahora_fn: AhoraFn | None = None,
    leer_clave: LeerClaveFn | None = None,
    log_fn: LogFn | None = None,
) -> tuple[str, str]:
    """
    Enrutador de modelos con catálogo vivo y salud compartida.

    Orden de rutas:
    1. FreeLLMAPI (catálogo vivo /v1/models cada 30 min, modelos con nombre)
    2. NIM directo (minimax-m3.1-flash, nemotron-3.5-lightning, max_tokens alto)
    3. OpenRouter :free
    4. Hermes (pasarela Mac 127.0.0.1:3011) si está viva

    Nunca "auto" ni modelos Claude.
    Espera tras cada fallo, último éxito primero.
    Salud en salud/estado.json compartida con el sanador.
    Si ninguno responde: lanza ModeloNoDisponible.
    """
    # Inyección de dependencias con valores por defecto
    if http_get is None:
        def http_get_def(url: str) -> dict[str, Any]:
            return _respuesta_http(lambda: urllib.request.urlopen(url, timeout=30))
        http_get = http_get_def

    if http_post is None:
        def http_post_def(url: str, cuerpo: bytes, headers: dict[str, str]) -> dict[str, Any]:
            req = urllib.request.Request(url, cuerpo, headers)
            return _respuesta_http(lambda: urllib.request.urlopen(req, timeout=150))
        http_post = http_post_def

    if ahora_fn is None:
        ahora_fn = datetime.now

    if leer_clave is None:
        def leer_clave_def(nombre: str) -> str | None:
            return os.environ.get(nombre)
        leer_clave = leer_clave_def

    if log_fn is None:
        def log_fn_def(msg: str) -> None:
            print(f"[peticiones_llm] {msg}", flush=True)
        log_fn = log_fn_def

    ahora = ahora_fn()

    # 1. Obtener catálogo vivo FreeLLMAPI
    modelos_freellmapi = obtener_catalogo_freellmapi(http_get, ahora_fn, log_fn)

    # 2. Construir lista ordenada de intentos: último éxito primero, luego catálogo, luego NIM, OpenRouter, Hermes
    intentos: list[tuple[str, str, Callable]] = []  # (modelo, ruta, funcion_llamada)

    # Último éxito primero
    ultimo = obtener_ultimo_exito()
    if ultimo:
        modelo_ultimo = ultimo["modelo"]
        ruta_ultimo = ultimo["ruta"]
        # Verificar que el modelo del último éxito sigue disponible en su ruta
        if ruta_ultimo == RUTA_FREELLM and modelo_ultimo in modelos_freellmapi:
            intentos.append((modelo_ultimo, RUTA_FREELLM, _llamar_freellmapi))
        elif ruta_ultimo == RUTA_NIM and modelo_ultimo in MODELOS_NIM:
            intentos.append((modelo_ultimo, RUTA_NIM, _llamar_nim))

    # Resto de modelos FreeLLMAPI (excluyendo el último éxito si ya está)
    for modelo in modelos_freellmapi:
        if not intentos or intentos[0][0] != modelo:
            intentos.append((modelo, RUTA_FREELLM, _llamar_freellmapi))

    # Modelos NIM
    for modelo in MODELOS_NIM:
        if not modelo_con_cuota_agotada(modelo):
            intentos.append((modelo, RUTA_NIM, _llamar_nim))

    # OpenRouter :free
    intentos.append(("openrouter_free", RUTA_OPENROUTER, _llamar_openrouter_free))

    # Hermes
    intentos.append(("hermes", RUTA_HERMES, _llamar_hermes))

    # Ejecutar intentos en orden
    for modelo, ruta, llamar in intentos:
        # Saltar si el modelo tiene cuota agotada (2+ fallos consecutivos)
        if modelo_con_cuota_agotada(modelo):
            if log_fn:
                log_fn(f"Saltando {modelo} ({ruta}): cuota agotada probable")
            continue

        if log_fn:
            log_fn(f"Intentando {modelo} vía {ruta}...")

        try:
            if ruta == RUTA_FREELLM:
                texto, usado = llamar(modelo, mensajes, max_tokens, http_post, leer_clave, log_fn)
            elif ruta == RUTA_NIM:
                texto, usado = llamar(modelo, mensajes, max_tokens, http_post, leer_clave, log_fn)
            elif ruta == RUTA_OPENROUTER:
                texto, usado = llamar(mensajes, max_tokens, http_post, leer_clave, log_fn)
            else:  # HERMES
                texto, usado = llamar(mensajes, max_tokens, http_post, log_fn)
        except Exception as e:
            if log_fn:
                log_fn(f"Excepción en {modelo} ({ruta}): {e}")
            texto, usado = "", ""

        if texto.strip():
            registrar_exito(modelo, ruta, ahora_fn)
            if log_fn:
                log_fn(f"Éxito con {usado} vía {ruta}")
            return texto, usado

        # Fallo: registrar y esperar
        registrar_fallo(modelo, ruta, ahora_fn)
        if log_fn:
            log_fn(f"Fallo {modelo} ({ruta}), esperando {ESPERA_DESPUES_FALLO_S}s...")
        time.sleep(ESPERA_DESPUES_FALLO_S)

    # Ningún modelo respondió
    raise ModeloNoDisponible("Ningún modelo disponible en ninguna ruta")


# ─────────────────────────────── Interpretación por reglas (fallback) ───────────────────────────────

def interpretar_por_reglas(texto: str) -> dict[str, Any]:
    """Interpretación por reglas cuando no hay modelos disponibles."""
    from peticiones_reglas import por_reglas
    return por_reglas(texto)


def mensaje_sin_modelos(ahora_fn: AhoraFn | None = None) -> str:
    """Mensaje cuando no hay modelos: 'recibido; sin modelos ahora, reintento a las HH:MM por <ruta>'."""
    if ahora_fn is None:
        ahora_fn = datetime.now
    ahora = ahora_fn()
    # Próximo reintento en 5 minutos
    from datetime import timedelta
    proximo = ahora + timedelta(minutes=5)
    hhmm = proximo.strftime("%H:%M")
    return f"Recibido ✓ Sin modelos disponibles ahora. Reintento a las {hhmm} por enrutador automático."


def escalar_salud_directores(texto_peticion: str, log_fn: LogFn | None = None) -> None:
    """Escala a salud_directores (cola-auto-salud)."""
    if log_fn:
        log_fn(f"ESCALADO salud_directores: {texto_peticion[:200]}")
    # En producción, esto encolaría en starseed_memory_root/salud/cola-auto-salud.json
    # Por ahora solo log


# ─────────────────────────────── Función de alto nivel con fallback ───────────────────────────────

def llm_con_fallback(
    mensajes: list[dict[str, str]],
    max_tokens: int = 1500,
    *,
    http_get: HttpGetFn | None = None,
    http_post: HttpPostFn | None = None,
    ahora_fn: AhoraFn | None = None,
    leer_clave: LeerClaveFn | None = None,
    log_fn: LogFn | None = None,
) -> tuple[str, str]:
    """
    Llama al enrutador; si falla, usa interpretación por reglas y devuelve mensaje de reintento.
    Nunca lanza excepción: siempre devuelve (texto, modelo_usado).
    """
    try:
        return llm(mensajes, max_tokens,
                   http_get=http_get, http_post=http_post,
                   ahora_fn=ahora_fn, leer_clave=leer_clave, log_fn=log_fn)
    except ModeloNoDisponible:
        if log_fn:
            log_fn("Todos los modelos fallaron: usando interpretación por reglas")
        # Interpretación por reglas del último mensaje de usuario
        ultimo_usuario = next((m["content"] for m in reversed(mensajes) if m["role"] == "user"), "")
        reglas = interpretar_por_reglas(ultimo_usuario)
        mensaje = mensaje_sin_modelos(ahora_fn)
        escalar_salud_directores(ultimo_usuario, log_fn)
        return mensaje, "reglas"


# ─────────────────────────────── CLI para pruebas ───────────────────────────────

def main(argv: list[str] | None = None) -> int:
    import sys
    argv = list(argv) if argv is not None else sys.argv[1:]
    if not argv:
        print("Uso: python3 peticiones_llm.py <comando> [args]")
        print("Comandos:")
        print("  catalogo           Muestra catálogo FreeLLMAPI actual")
        print("  salud              Muestra salud de modelos")
        print("  probar <mensaje>   Prueba el enrutador con un mensaje")
        return 0

    cmd = argv[0]

    if cmd == "catalogo":
        def http_get(url: str) -> dict[str, Any]:
            return _respuesta_http(lambda: urllib.request.urlopen(url, timeout=30))
        modelos = obtener_catalogo_freellmapi(http_get, datetime.now, print)
        print(f"Modelos FreeLLMAPI ({len(modelos)}):")
        for m in modelos:
            print(f"  - {m}")
        return 0

    if cmd == "salud":
        estado = _leer_salud()
        salud = estado.get(SALUD_KEY, {})
        print(json.dumps(salud, ensure_ascii=False, indent=1))
        return 0

    if cmd == "probar":
        if len(argv) < 2:
            print("Falta mensaje")
            return 1
        mensaje = " ".join(argv[1:])
        texto, modelo = llm_con_fallback([{"role": "user", "content": mensaje}], log_fn=print)
        print(f"Modelo: {modelo}")
        print(f"Respuesta: {texto[:500]}")
        return 0

    print(f"Comando desconocido: {cmd}")
    return 1


if __name__ == "__main__":
    import sys
    sys.exit(main())