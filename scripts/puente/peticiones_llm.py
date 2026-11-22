#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Enrutador de modelos con catálogo vivo, NIM, OpenRouter y salud compartida (PET1116A, PET1121B).

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
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Callable, Sequence

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

FRELLMAPI_TTL_S = 30 * 60
CATALOGO_TTL_S = 6 * 60 * 60
CATALOGO_OPENROUTER_DEF = SALUD_DEF / "catalogo_openrouter_free.json"
ULTIMO_BUENO_FREELLM_DEF = SALUD_DEF / "catalogo_freellmapi_ultimo_bueno.json"
ULTIMO_BUENO_OPENROUTER_DEF = SALUD_DEF / "catalogo_openrouter_ultimo_bueno.json"
PENALIZACION_FALLOS = 3
PAUSA_RUTA_S = 30 * 60

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


def _catalogo_valido(
    catalogo: dict[str, Any], ahora: datetime, ttl_s: int = FRELLMAPI_TTL_S
) -> bool:
    ts = catalogo.get("timestamp")
    if not ts:
        return False
    try:
        entonces = datetime.fromisoformat(ts)
        return (ahora - entonces).total_seconds() < ttl_s
    except Exception:
        return False


def _catalogo_vivo(
    nombre: str,
    url: str,
    ruta: Path,
    ultima_buena: Path,
    ttl_s: int,
    aceptar: Callable[[dict[str, Any]], bool],
    http_get: HttpGetFn,
    ahora_fn: AhoraFn,
    log_fn: LogFn | None = None,
) -> list[str]:
    ahora = ahora_fn()
    catalogo = _leer_json(ruta, {})
    modelos = catalogo.get("modelos", [])
    if _catalogo_valido(catalogo, ahora, ttl_s) and modelos:
        if log_fn:
            log_fn(f"Catálogo {nombre} en caché: {len(modelos)} modelos")
        return modelos
    try:
        datos = http_get(url).get("data", [])
        nuevos = [m["id"] for m in datos if isinstance(m, dict) and m.get("id") and aceptar(m)]
        if not nuevos:
            raise ValueError("catálogo vacío")
        _escribir_atomico(ruta, {"timestamp": ahora.isoformat(), "modelos": nuevos})
        _escribir_atomico(ultima_buena, {"timestamp": ahora.isoformat(), "modelos": nuevos})
        if log_fn:
            log_fn(f"Catálogo {nombre} actualizado: {len(nuevos)} modelos")
        return nuevos
    except Exception as e:
        modelos = catalogo.get("modelos") or _leer_json(ultima_buena, {}).get("modelos", [])
        if modelos and log_fn:
            log_fn(f"Catálogo {nombre} sin red, usando caché caducado / última buena ({len(modelos)} modelos)")
        elif log_fn:
            log_fn(f"Catálogo {nombre} sin modelos: {e}")
        if modelos:
            _escribir_atomico(ruta, {"timestamp": ahora.isoformat(), "modelos": modelos})
        return modelos


def obtener_catalogo_freellmapi(
    http_get: HttpGetFn,
    ahora_fn: AhoraFn,
    log_fn: LogFn | None = None,
) -> list[str]:
    """Obtiene modelos vivos de FreeLLMAPI (/v1/models). Cache 30 min, nunca guarda 0 modelos."""
    def aceptar(m: dict[str, Any]) -> bool:
        id_modelo = str(m.get("id") or "")
        return id_modelo != "auto" and "claude" not in id_modelo.lower()

    modelos = _catalogo_vivo(
        "FreeLLMAPI", "http://127.0.0.1:3001/v1/models",
        CATALOGO_DEF, ULTIMO_BUENO_FREELLM_DEF, FRELLMAPI_TTL_S,
        aceptar, http_get, ahora_fn, log_fn,
    )
    if not modelos and log_fn:
        log_fn("FreeLLMAPI sin modelos: revisar 127.0.0.1:3001 y sus claves")
    return modelos


def obtener_catalogo_openrouter_free(
    http_get: HttpGetFn,
    ahora_fn: AhoraFn,
    log_fn: LogFn | None = None,
) -> list[str]:
    """Modelos :free con endpoint de chat desde /api/v1/models. Cache 6 h y última lista buena."""
    def aceptar(m: dict[str, Any]) -> bool:
        id_modelo = str(m.get("id") or "")
        if not id_modelo.endswith(":free") or "claude" in id_modelo.lower():
            return False
        puntos = m.get("supported_endpoints")
        if puntos is None:
            return True
        return "/v1/chat/completions" in puntos

    return _catalogo_vivo(
        "OpenRouter", "https://openrouter.ai/api/v1/models",
        CATALOGO_OPENROUTER_DEF, ULTIMO_BUENO_OPENROUTER_DEF, CATALOGO_TTL_S,
        aceptar, http_get, ahora_fn, log_fn,
    )


# ─────────────────────────────── Salud compartida ───────────────────────────────

SALUD_KEY = "modelos_llm"

def _leer_salud() -> dict[str, Any]:
    return _leer_json(ESTADO_DEF, {})


def _guardar_salud(estado: dict[str, Any]) -> None:
    _escribir_atomico(ESTADO_DEF, estado)


def _linea_rutas_vivas(salud: dict[str, Any], ahora: datetime) -> dict[str, str]:
    """Línea de rutas vivas que /estado lee de estado.json (detalle de sesiones)."""
    rutas = salud.get("rutas", {})
    vivas, pausadas = [], []
    for ruta, info in rutas.items():
        hasta = info.get("hasta")
        if hasta:
            try:
                if datetime.fromisoformat(hasta) > ahora:
                    pausadas.append(f"{ruta} {hasta[11:16]}")
                    continue
            except ValueError:
                pass
        if info.get("ultimo_exito"):
            vivas.append(ruta)
    texto = "vivas: " + (", ".join(vivas) or "ninguna")
    if pausadas:
        texto += " · en pausa 30 min: " + ", ".join(pausadas)
    return {"estado": "viva" if vivas else "caída", "detalle": texto}


def registrar_exito(modelo: str, ruta: str, ahora_fn: AhoraFn) -> None:
    """Registra un éxito, limpia fallos y actualiza la línea de rutas vivas."""
    ahora = ahora_fn()
    estado = _leer_salud()
    salud = estado.get(SALUD_KEY, {})
    salud["ultimo_exito"] = {"modelo": modelo, "ruta": ruta, "timestamp": ahora.isoformat()}
    fallos = salud.get("fallos_consecutivos", {})
    fallos.pop(modelo, None)
    salud["fallos_consecutivos"] = fallos
    info = salud.setdefault("rutas", {}).setdefault(ruta, {})
    info.update({"ultimo_exito": ahora.isoformat(), "fallos": 0, "modelo": modelo})
    info.pop("hasta", None)
    estado[SALUD_KEY] = salud
    estado.setdefault("detalle", {})["rutas LLM"] = _linea_rutas_vivas(salud, ahora)
    _guardar_salud(estado)


def registrar_fallo(modelo: str, ruta: str, ahora_fn: AhoraFn) -> int:
    """Cuenta fallos; al tercero pausa la ruta 30 min y lo refleja en /estado."""
    ahora = ahora_fn()
    estado = _leer_salud()
    salud = estado.get(SALUD_KEY, {})
    fallos = salud.get("fallos_consecutivos", {})
    fallos[modelo] = fallos.get(modelo, 0) + 1
    salud["fallos_consecutivos"] = fallos
    info = salud.setdefault("rutas", {}).setdefault(ruta, {})
    if info.get("modelo") != modelo:
        info["fallos"] = info.get("fallos", 0) + 1
        info["modelo"] = modelo
    if info["fallos"] >= PENALIZACION_FALLOS:
        info["hasta"] = (ahora + timedelta(seconds=PAUSA_RUTA_S)).isoformat()
    estado[SALUD_KEY] = salud
    estado.setdefault("detalle", {})["rutas LLM"] = _linea_rutas_vivas(salud, ahora)
    _guardar_salud(estado)
    return fallos[modelo]


def obtener_ultimo_exito() -> dict[str, str] | None:
    """Devuelve {modelo, ruta, timestamp} del último éxito o None."""
    estado = _leer_salud()
    return estado.get(SALUD_KEY, {}).get("ultimo_exito")


def modelo_con_cuota_agotada(modelo: str) -> bool:
    """Verifica si un modelo tiene 3 fallos seguidos (cuota agotada probable)."""
    estado = _leer_salud()
    fallos = estado.get(SALUD_KEY, {}).get("fallos_consecutivos", {})
    return fallos.get(modelo, 0) >= PENALIZACION_FALLOS


def texto_rutas_vivas(ahora_fn: AhoraFn | None = None) -> str:
    """Texto de rutas vivas/en pausa para /estado y para el informe final."""
    ahora = ahora_fn() if ahora_fn else datetime.now()
    return _linea_rutas_vivas(_leer_salud(), ahora)["detalle"]


def ruta_en_pausa(rutas: dict[str, Any], ruta: str, ahora: datetime) -> bool:
    """Una ruta con 3 fallos queda en pausa 30 min."""
    hasta = (rutas.get(ruta) or {}).get("hasta")
    if not hasta:
        return False
    try:
        return datetime.fromisoformat(hasta) > ahora
    except ValueError:
        return False


def ordenar_intentos(
    intentos: Sequence[tuple[str, str, Any]],
    estado_salud: dict[str, Any],
    ahora: datetime,
) -> list[tuple[str, str, Any]]:
    """Ordena por éxito reciente y descarta rutas en pausa; puro y sin E/S."""
    rutas = estado_salud.get(SALUD_KEY, {}).get("rutas", {})
    activos = [i for i in intentos if not ruta_en_pausa(rutas, i[1], ahora)]

    def prioridad(item: tuple[str, str, Any], indice: int) -> tuple[int, float, int]:
        info = rutas.get(item[1]) or {}
        ts = info.get("ultimo_exito")
        if not ts:
            return (1, 0.0, indice)
        try:
            segundos = max(0.0, (ahora - datetime.fromisoformat(ts)).total_seconds())
        except ValueError:
            segundos = 10 ** 12
        return (0, segundos, indice)

    ordenados = sorted(enumerate(activos), key=lambda par: prioridad(par[1], par[0]))
    return [item for _, item in ordenados]


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
    clave = leer_clave("FREELLMAPI_KEY") or leer_clave("STARSEED_PASARELA_FREELLMAPI_KEY") or ""
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
        codigo = resp.get("description") or ""
        detalle = " · ".join(x for x in (str(codigo), str(err)) if x)
        log_fn(f"FreeLLMAPI sin respuesta de {modelo}: {detalle or 'cuerpo vacío'}")
    return "", ""


def _llamar_nim(
    modelo: str,
    mensajes: list[dict[str, str]],
    max_tokens: int,
    http_post: HttpPostFn,
    leer_clave: LeerClaveFn,
    log_fn: LogFn | None = None,
) -> tuple[str, str]:
    clave = leer_clave("NIM_KEY") or leer_clave("NVIDIA_API_KEY") or ""
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
        codigo = resp.get("description") or ""
        detalle = " · ".join(x for x in (str(codigo), str(err)) if x)
        log_fn(f"NIM sin respuesta de {modelo}: {detalle or 'cuerpo vacío'}")
    return "", ""


def _llamar_openrouter_free(
    modelo: str,
    mensajes: list[dict[str, str]],
    max_tokens: int,
    http_post: HttpPostFn,
    leer_clave: LeerClaveFn,
    log_fn: LogFn | None = None,
) -> tuple[str, str]:
    clave = leer_clave("OPENROUTER_KEY") or leer_clave("OPENROUTER_API_KEY") or ""
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
    if "claude" not in usado.lower() and texto.strip():
        return texto.strip(), usado
    if log_fn:
        err = (resp.get("error") or {}).get("message", "") if isinstance(resp.get("error"), dict) else ""
        codigo = resp.get("description") or ""
        detalle = " · ".join(x for x in (str(codigo), str(err)) if x)
        log_fn(f"OpenRouter sin respuesta de {modelo}: {detalle or 'cuerpo vacío'}")
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
    3. OpenRouter :free (catálogo vivo /api/v1/models cada 6 h, solo chat)
    4. Hermes (pasarela Mac 127.0.0.1:3011) si está viva

    Nunca "auto" ni modelos Claude. El orden lo manda la salud reciente;
    3 fallos de ruta pausan esa vía 30 min. Espera 5 s tras cada fallo.
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

    def leer_clave_multi(nombre: str) -> str | None:
        from entorno import leer_clave as leer_clave_entorno
        valor = leer_clave_entorno(nombre)
        if valor:
            return valor
        for archivo in (Path.home() / ".hermes" / ".env",):
            try:
                with open(archivo, encoding="utf-8") as f:
                    for linea in f:
                        if "=" not in linea:
                            continue
                        k, v = linea.strip().split("=", 1)
                        if k.strip().removeprefix("export ") == nombre and v.strip().strip('"').strip("'"):
                            return v.strip().strip('"').strip("'")
            except OSError:
                continue
        return None

    leer_clave_inyectada = leer_clave

    def leer_clave_combinada(nombre: str) -> str | None:
        if leer_clave_inyectada:
            valor = leer_clave_inyectada(nombre)
            if valor:
                return valor
        return leer_clave_multi(nombre)

    leer_clave = leer_clave_combinada

    if log_fn is None:
        def log_fn_def(msg: str) -> None:
            print(f"[peticiones_llm] {msg}", flush=True)
        log_fn = log_fn_def

    ahora = ahora_fn()
    estado_salud = _leer_salud()

    # 1. Catálogos vivos: FreeLLMAPI (30 min) y OpenRouter :free (6 h)
    modelos_freellmapi = obtener_catalogo_freellmapi(http_get, ahora_fn, log_fn)
    modelos_openrouter = obtener_catalogo_openrouter_free(http_get, ahora_fn, log_fn)

    # La línea de rutas vivas la lee /estado desde estado.json → detalle
    estado_salud.setdefault("detalle", {})["rutas LLM"] = _linea_rutas_vivas(
        estado_salud.get(SALUD_KEY, {}), ahora
    )
    _guardar_salud(estado_salud)

    # 2. Construir intentos; el orden lo afina la salud reciente por ruta
    intentos: list[tuple[str, str, Callable]] = []

    ultimo = obtener_ultimo_exito()
    if ultimo:
        modelo_ultimo = ultimo["modelo"]
        ruta_ultimo = ultimo["ruta"]
        if ruta_ultimo == RUTA_FREELLM and modelo_ultimo in modelos_freellmapi:
            intentos.append((modelo_ultimo, RUTA_FREELLM, _llamar_freellmapi))
        elif ruta_ultimo == RUTA_NIM and modelo_ultimo in MODELOS_NIM:
            intentos.append((modelo_ultimo, RUTA_NIM, _llamar_nim))
        elif ruta_ultimo == RUTA_OPENROUTER and modelo_ultimo in modelos_openrouter:
            intentos.append((modelo_ultimo, RUTA_OPENROUTER, _llamar_openrouter_free))

    for modelo in modelos_freellmapi:
        if not intentos or intentos[0][0] != modelo:
            intentos.append((modelo, RUTA_FREELLM, _llamar_freellmapi))

    for modelo in MODELOS_NIM:
        if not modelo_con_cuota_agotada(modelo):
            intentos.append((modelo, RUTA_NIM, _llamar_nim))

    for modelo in modelos_openrouter:
        intentos.append((modelo, RUTA_OPENROUTER, _llamar_openrouter_free))

    if not modelos_openrouter:
        intentos.append(("openrouter_free", RUTA_OPENROUTER, _llamar_openrouter_free))

    intentos.append(("hermes", RUTA_HERMES, _llamar_hermes))
    intentos = ordenar_intentos(intentos, estado_salud, ahora)

    # Ejecutar intentos en orden
    for modelo, ruta, llamar in intentos:
        # Saltar si el modelo tiene cuota agotada (3 fallos consecutivos)
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
                texto, usado = llamar(modelo, mensajes, max_tokens, http_post, leer_clave, log_fn)
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
        print("  catalogo-or        Muestra modelos :free de OpenRouter con endpoint de chat")
        print("  salud              Muestra salud de modelos y estado de las rutas")
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

    if cmd == "catalogo-or":
        def http_get(url: str) -> dict[str, Any]:
            return _respuesta_http(lambda: urllib.request.urlopen(url, timeout=30))
        modelos = obtener_catalogo_openrouter_free(http_get, datetime.now, print)
        print(f"Modelos OpenRouter :free ({len(modelos)}):")
        for m in modelos:
            print(f"  - {m}")
        return 0

    if cmd == "salud":
        estado = _leer_salud()
        salud = estado.get(SALUD_KEY, {})
        print(json.dumps(salud, ensure_ascii=False, indent=1))
        print(texto_rutas_vivas())
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