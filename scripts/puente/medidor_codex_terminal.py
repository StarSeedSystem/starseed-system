# -*- coding: utf-8 -*-
"""medidor_codex_terminal · adaptador ChatGPT/Codex: app-server + respaldo de registros

Por qué existe (2026-10-06):
---------------------------------------------------------------
El medidor Claude lee su crédito del plan directamente por terminal (soporte gratis),
lo mismo tiene el plan Plus de ChatGPT con Codex, pero con un saldo extra de créditos
(mayor flexibilidad). Así los créditos del plan + el extra entran en la misma familia
`creditos` del Mando y se enseña una tarjeta por cada crédito del usuario.

La fuente principal es el JSON-RPC de `codex app-server` por stdio (`/app-server`,
lin-1 por mensaje: initialize, initialized y `account/rateLimits/read`).
Si falla (proceso no arrancado, error, sin respuesta), se lee el respaldo:
`~/.codex/sessions/*/*/*/rollout-*.jsonl` (los 10 más recientes por fecha de modificación).
Cada evento trae un JSON con `"rate_limits"` (snake_case) que también trae el crédito,
el plan y las ventanas.

Dos fallos:
- Error del adaptador: se guarda el error, `ok: false` y `error` corto (sin secretos),
  `obsoleto: true`. Así se distingue un fallo temporal de un error permanente.
- Sin proceso y sin respaldo: se anota un error "sin respaldo" con `ok: false` y
  `obsoleto: true`, para que el recolector no vuelva a probar.

Todo es PÚRPENO: importar `subprocess.Popen` con `abrir`, no una abstracción; todo
el resto son tipos/puros.

Salida esperada (ver `architecture/medidores-credito.md` §3):
---------------------------------------------------------------
{
  "version": 1,
  "t": "ISO con zona local de ahora",
  "medidores": {
    "codex": {
      "id": "codex",
      "proveedor": "openai",
      "nombre": "ChatGPT · Codex",
      "tipo": "plan",
      "plan": "plus",
      "ventanas": [
        {"id": "5h", "etiqueta": "5 horas", "usado_pct": 0, "reinicia": "ISO"},
        {"id": "semana", "etiqueta": "Semana", "usado_pct": 100, "reinicia": "ISO"}
      ],
      "saldo": {"valor": 0, "unidad": "créditos"},
      "extras": {
        "bloqueado": "rate_limit_reached",
        "uso_normal": false,
        "reinicios_gratis": 1,
        "reinicio_gratis_vence": "ISO"
      },
      "enlace": "https://chatgpt.com/codex/settings/usage",
      "fuente": "terminal: codex app-server",
      "leido": "ISO del evento leido",
      "ok": true,
      "obsoleto": false,
      "error": null
    }
  }
}

Los campos NO aparecen nunca:
- accountId, id de un crédito, title, description, rateLimitUpsell
- claves, tokens, textos de publicidad, texto de conversaciones
"""

import json
import subprocess
import time
from collections import deque
from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple
from zoneinfo import ZoneInfo

import os
import sys

if sys.version_info >= (3, 9):
    from collections.abc import Iterable

DEFAULT_HOME = os.path.expanduser("~/.local/bin")


class _ErrorAccedido(Exception):
    """Se lanza cuando se necesita leer la HOME y no existe, para tests."""


def interpretar_rpc(resultado: Dict, ahora: float) -> List[Dict]:
    """Sanea el JSON-RPC de `account/rateLimits/read` a la forma del contrato.

    One-to-one con el adaptador real del 2026-10-06, pero con el id de medidor
    ``codex`` y el nombre ``ChatGPT · Codex``:

    - Para cada entrada de ``rateLimitsByLimitId`` (si falta, ``rateLimits``) con
      alguna ventana no nula:
        • id ``codex`` para ``limitId`` ``codex`` y ``codex-<limitId>`` para los demás
        • nombre ``ChatGPT · Codex`` o ``ChatGPT · Codex (<limitId>)``
        • proveedor ``openai``
        • tipo ``plan``
        • enlace ``https://chatgpt.com/codex/settings/usage``
        • fuente ``"terminal: codex app-server"``
        • ventanas (``primary`` → id ``5h``, etiqueta ``5 horas``; ``secondary`` → id
          ``semana``, etiqueta ``Semana``)
        • usado_pct = ``usedPercent``; reinicia = ISO local de ``resetsAt`` (segundos Unix)
        • saldo = {"valor": float(credits.balance), "unidad": "créditos"} si no está
          ilimitado, ``ilimitado``: true si ``unlimited``
        • extras: ``bloqueado`` (texto de ``rateLimitReachedType`` si no nulo),
          ``uso_normal`` (de ``ordinaryUsageAllowed``), ``reinicios_gratis``
          (``rateLimitResetCredits.availableCount``) y ``reinicio_gratis_vence`` (el
          ``expiresAt`` más cercano de los créditos con ``status`` ``available``, en ISO)
        • Se construye con LISTA BLANCA: jamás aparecen ``accountId``, el ``id`` de un
          crédito, ``title``, ``description`` ni ``rateLimitUpsell``
    - Si falta ``rateLimitsByLimitId``, se procesa ``rateLimits`` (entrada con
      limitId ``codex``) como un medidor.
    - Otra cosa (sin ventanas, vacío, campos extra) se omite.

    Devuelve una lista (a menudo con uno o cero elementos): la función es pura.
    """
    medidores: List[Dict] = []

    ordinary_usage_allowed = resultado.get("ordinaryUsageAllowed")

    reinicios_gratis = None
    reinicio_gratis_vence = None
    rate_limit_reset_credits = resultado.get("rateLimitResetCredits", {})
    if isinstance(rate_limit_reset_credits, dict):
        ac = rate_limit_reset_credits.get("availableCount")
        if isinstance(ac, (int, float)):
            reinicios_gratis = int(ac)
        credits_list = rate_limit_reset_credits.get("credits", [])
        if isinstance(credits_list, list):
            available = [c for c in credits_list if c.get("status") == "available"]
            if available:
                expires = max((c.get("expiresAt") for c in available if isinstance(c.get("expiresAt"), (int, float))), default=None)
                if expires is not None:
                    reinicio_gratis_vence = _unix_a_iso_local(expires)

    def procesa_entrada(limit_id: str, entrada: Dict) -> None:
        primary = entrada.get("primary")
        secondary = entrada.get("secondary")
        ventanas: List[Dict] = []
        if primary:
            w = primary.get("windowDurationMins")
            if isinstance(w, (int, float)):
                usado_pct = primary.get("usedPercent")
                resets_at = primary.get("resetsAt")
                if isinstance(usado_pct, (int, float)) and isinstance(resets_at, (int, float)):
                    ventanas.append({
                        "id": "5h",
                        "etiqueta": "5 horas",
                        "usado_pct": int(round(usado_pct)),
                        "reinicia": _unix_a_iso_local(resets_at),
                    })
        if secondary:
            w = secondary.get("windowDurationMins")
            if isinstance(w, (int, float)):
                usado_pct = secondary.get("usedPercent")
                resets_at = secondary.get("resetsAt")
                if isinstance(usado_pct, (int, float)) and isinstance(resets_at, (int, float)):
                    if usado_pct == 0:
                        pass
                    else:
                        ventanas.append({
                            "id": "semana",
                            "etiqueta": "Semana",
                            "usado_pct": int(round(usado_pct)),
                            "reinicia": _unix_a_iso_local(resets_at),
                        })

        if not ventanas:
            return

        nombre = (
            f"ChatGPT · Codex ({limit_id})" if limit_id != "codex" else "ChatGPT · Codex"
        )

        extra: Dict = {}
        bloqueado = entrada.get("rateLimitReachedType")
        if isinstance(bloqueado, str):
            extra["bloqueado"] = bloqueado

        if isinstance(ordinary_usage_allowed, bool):
            extra["uso_normal"] = not ordinary_usage_allowed

        extra_entry: Dict = {}
        for k, v in extra.items():
            if v is not None:
                extra_entry[k] = v
        if reinicios_gratis is not None:
            extra_entry["reinicios_gratis"] = reinicios_gratis
        if reinicio_gratis_vence is not None:
            extra_entry["reinicio_gratis_vence"] = reinicio_gratis_vence

        credits = entrada.get("credits", {})
        saldo: Optional[Dict] = None
        if isinstance(credits, dict):
            unlimited = credits.get("unlimited", False)
            if isinstance(unlimited, bool) and unlimited:
                saldo = {"ilimitado": True}
            else:
                balance = credits.get("balance")
                try:
                    if balance is not None:
                        saldo = {"valor": float(balance), "unidad": "créditos"}
                except (TypeError, ValueError):
                    pass

        ventanas_str = ", ".join(f'{v["etiqueta"]} {v["usado_pct"]}%' for v in ventanas)
        limit_id_sufijo = f"-{limit_id}" if limit_id != "codex" else ""
        medidores.append({
            "id": f"codex{limit_id_sufijo}" if limit_id_sufijo else "codex",
            "proveedor": "openai",
            "nombre": nombre,
            "tipo": "plan",
            "plan": entrada.get("planType") or "plus",
            "ventanas": ventanas,
            "saldo": saldo,
            "extras": extra_entry,
            "enlace": "https://chatgpt.com/codex/settings/usage",
            "fuente": "terminal: codex app-server",
        })

    rate_limits_by = resultado.get("rateLimitsByLimitId") or {}
    if isinstance(rate_limits_by, dict):
        for lid, entrada in rate_limits_by.items():
            if isinstance(lid, str) and isinstance(entrada, dict):
                procesa_entrada(lid, entrada)

    if not medidores and "rateLimits" in resultado and "rateLimitsByLimitId" not in resultado:
        rl = resultado.get("rateLimits", {})
        if isinstance(rl, dict):
            procesa_entrada(rl.get("limitId", "") or "codex", rl)

    return medidores


def interpretar_rollout(lineas: Iterable[str], ahora: float) -> List[Dict]:
    """Del JSONL de sesiones de codex, el ÚLTIMO evento con "rate_limits" (en payload.rate_limits o payload.info.rate_limits) y alguna ventana no nula.

    Retorna medidores en la forma snake_case de §2.2 del contrato (versión para registro):
    {
      "limit_id": "codex",
      "primary": {"used_percent": 36.0, "window_minutes": 300, "resets_at": 1791242699},
      "secondary": {"used_percent": 99.0, "window_minutes": 10080, "resets_at": 1791605571},
      "credits": {"balance": "0"},
      "plan_type": "plus"
    }

    Cada medidor tiene:
    - id = limit_id (snake_case de limitId del contrato)
    - proveedor = "openai" si limit_id == "codex" else "openai" (aunque el contrato dice "openai" o "openai(<limit_id>)"?)
    - nombre = "ChatGPT · Codex" o "ChatGPT · Codex (<limitId>)" (igual que el RPC)
    - tipo = "plan"
    - enlace = "https://chatgpt.com/codex/settings/usage"
    - fuente = "registro de sesiones de codex"
    - leido = timestamp del evento (ISO con zona local)

    Se construye con LISTA BLANCA: jamás aparecen accountId, el id de un crédito,
    title, description, ni rateLimitUpsell.

    Líneas rotas se saltan.
    """
    medidores: List[Dict] = []
    evento: Optional[Dict] = None
    timestamp_leido: Optional[float] = None

    for linea in lineas:
        linea = linea.strip()
        if not linea:
            continue
        try:
            objeto = json.loads(linea)
            if not isinstance(objeto, dict):
                continue
            rate_limits = None
            if "rate_limits" in objeto:
                rate_limits = objeto.get("rate_limits")
            elif "payload" in objeto:
                rate_limits = objeto.get("payload", {}).get("rate_limits") or objeto.get("payload", {}).get("info", {}).get("rate_limits")
            elif "limit_id" in objeto or "primary" in objeto:
                rate_limits = objeto
            if isinstance(rate_limits, dict) and rate_limits:
                evento = rate_limits
                timestamp_leido = objeto.get("timestamp") if "timestamp" in objeto else objeto.get("leido")
        except Exception:
            continue

    if not isinstance(evento, dict):
        return []

    id_ventanas: List[Dict] = []

    def procesa_ventana(llave: str, ventana: Optional[Dict]) -> None:
        if not isinstance(ventana, dict):
            return
        w = ventana.get("window_minutes")
        u = ventana.get("used_percent")
        r = ventana.get("resets_at")
        if isinstance(w, (int, float)) and isinstance(u, (int, float)) and isinstance(r, (int, float)):
            if u == 0:
                return
            id_ventanas.append({
                "window_id": _ventana_a_id(w),
                "used_pct": int(round(u)),
                "reinicia": _unix_a_iso_local(r),
            })

    procesa_ventana("primary", evento.get("primary"))
    procesa_ventana("secondary", evento.get("secondary"))

    if not id_ventanas:
        return []

    extra: Dict = {}

    bloqueado = evento.get("rate_limit_reached_type")
    if isinstance(bloqueado, str):
        extra["bloqueado"] = bloqueado

    uso_normal = evento.get("ordinary_usage_allowed")
    if isinstance(uso_normal, bool):
        extra["uso_normal"] = not uso_normal

    reinicios_gratis = evento.get("rate_limit_reset_credits_available_count")
    if isinstance(reinicios_gratis, (int, float)):
        extra["reinicios_gratis"] = int(reinicios_gratis)

    reinicio_gratis_vence = evento.get("rate_limit_reset_credits_closest_available_expires_at")
    if isinstance(reinicio_gratis_vence, (int, float)):
        extra["reinicio_gratis_vence"] = _unix_a_iso_local(reinicio_gratis_vence)

    if extra:
        extra_entry: Dict = {}
        for k, v in extra.items():
            if v is not None:
                extra_entry[k] = v
        extra = extra_entry

    credits = evento.get("credits", {})
    saldo_fallback = None
    if isinstance(credits, dict):
        balance = credits.get("balance")
        if balance is not None:
            saldo_fallback = {"valor": float(balance), "unidad": "créditos"}

    limite_raw = evento.get("limit_id")
    if not limite_raw and "limit_id" in evento:
        limite_raw = evento["limit_id"]
    limit_id = str(limite_raw) if limite_raw else "codex"

    plan = evento.get("plan_type") or "plus"

    extra_entry = {}
    for k, v in extra.items():
        if v is not None:
            extra_entry[k] = v

    medidores.append({
        "id": f"codex-{limit_id}" if limit_id != "codex" else "codex",
        "proveedor": "openai",
        "nombre": f"ChatGPT · Codex ({limit_id})" if limit_id != "codex" else "ChatGPT · Codex",
        "tipo": "plan",
        "plan": plan,
        "ventanas": [
            {
                "id": iv["window_id"],
                "etiqueta": _id_a_etiqueta(iv["window_id"]),
                "usado_pct": iv["used_pct"],
                "reinicia": iv["reinicia"],
            }
            for iv in id_ventanas
        ],
        "saldo": saldo_fallback,
        "extras": extra_entry,
        "enlace": "https://chatgpt.com/codex/settings/usage",
        "fuente": "registro de sesiones de codex",
        "leido": _unix_a_iso_local(timestamp_leido) if isinstance(timestamp_leido, (int, float)) else None,
    })

    return medidores


def _ventana_a_id(minutos: float) -> str:
    if minutos == 300:
        return "5h"
    if minutos == 10080:
        return "semana"
    return f"{int(minutos)}min"


def _id_a_etiqueta(window_id: str) -> str:
    if window_id == "5h":
        return "5 horas"
    if window_id == "semana":
        return "Semana"
    return f"{window_id} min"


def _unix_a_iso_local(segundos: float) -> str:
    try:
        segundos_int = int(float(segundos))
        dt = datetime.fromtimestamp(segundos_int, tz=ZoneInfo("America/Mexico_City"))
        return dt.isoformat()
    except Exception:
        return datetime.fromtimestamp(int(float(segundos)), tz=ZoneInfo("America/Mexico_City")).isoformat()


def leer(
    config: Optional[Dict] = None,
    ahora: Optional[float] = None,
    abrir: Optional[object] = None,
    home: Optional[str] = None,
    tope_s: int = 30,
) -> List[Dict]:
    """Lee el estado del crédito de ChatGPT/Codex.

    Si existe el binario `codex app-server`, se arranca con subprocess.Popen (devuelto por
    `abrir`) → entradas `[initialize, initialized, account/rateLimits/read]` → se espera la
    respuesta con `id` 1. Si falla, se contesta con `{"id": "codex", …,"ok": False,
    "error": "<motivo corto>"}`.

    Si falla o no hay proceso (`FileNotFoundError`), se recupera con los 10 `rollout-*.jsonl`
    más recientes de `<home>/.codex/sessions/*/*/*/` (los logs históricos). La primera línea
    útil (último evento con `rate_limits`) da uno o varios medidores.

    Si tampoco hay respaldo, se devuelve `[{"id": "codex", "ok": False, "error": "<motivo>",
    "obsoleto": true}]`.

    Nunca lanza excepción; todos los errores terminan en la lista de salida.
    """
    ahora = ahora or time.time()
    home = home or DEFAULT_HOME

    errores: List[str] = []
    leido: List[str] = []

    try:
        abrir_func = abrir or subprocess.Popen
        proc = abrir_func(
            ["codex", "app-server"],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
            bufsize=1,
            encoding="utf-8",
            errors="replace",
            cwd=home,
        )

        def hilo_lector():
            for linea in iter(proc.stdout.readline, ""):
                leido.append(linea.strip())

        import threading
        hilo = threading.Thread(target=hilo_lector)
        hilo.daemon = True
        hilo.start()

        for msg in (
            {"method": "initialize", "id": 0, "params": {"clientInfo": {"name": "starseed_medidor", "title": "StarSeed medidor", "version": "0.1.0"}}},
            {"method": "initialized"},
            {"method": "account/rateLimits/read", "id": 1},
        ):
            try:
                proc.stdin.write(json.dumps(msg) + "\n")
                proc.stdin.flush()
            except Exception as e:
                errores.append(f"write: {e}")
                break

        for _ in range(tope_s * 10):
            if not hilo.is_alive() and not leido:
                break
            hilo.join(timeout=0.1)
            if hilo.is_alive():
                continue
            if leido:
                break
            time.sleep(0.1)

        proc.terminate()
        try:
            proc.wait(timeout=2)
        except Exception:
            try:
                proc.kill()
            except Exception:
                pass

        if errores:
            return [{"id": "codex", "ok": False, "error": "; ".join(errores), "obsoleto": True}]

        for linea in leido:
            if not linea:
                continue
            try:
                objeto = json.loads(linea)
                if isinstance(objeto, dict) and objeto.get("id") == 1:
                    resultado = objeto.get("result")
                    if isinstance(resultado, dict):
                        medidores = interpretar_rpc(resultado, ahora)
                        for m in medidores:
                            m["leido"] = _unix_a_iso_local(ahora)
                        return medidores
            except Exception:
                continue

        return [{"id": "codex", "ok": False, "error": "sin respuesta con id 1", "obsoleto": True}]

    except FileNotFoundError:
        return _leer_rollout(home, ahora)
    except Exception as e:
        return [{"id": "codex", "ok": False, "error": f"terminal: {e}", "obsoleto": True}]


def _leer_rollout(home: Optional[str], ahora: float) -> List[Dict]:
    import glob

    home = home or DEFAULT_HOME
    dir_base = os.path.join(home, ".codex", "sessions")
    if not os.path.isdir(dir_base):
        return [{"id": "codex", "ok": False, "error": "sin respaldo", "obsoleto": True}]

    archivos = glob.glob(os.path.join(dir_base, "*", "*", "*", "rollout-*.jsonl"))
    if not archivos:
        return [{"id": "codex", "ok": False, "error": "sin respaldo", "obsoleto": True}]

    archivos.sort(key=os.path.getmtime, reverse=True)
    seleccionados = archivos[:10]

    todos_medidores: List[Dict] = []
    leido_fallback = None

    for ruta in seleccionados:
        try:
            with open(ruta, encoding="utf-8") as f:
                lineas = [l.strip() for l in f if l.strip()]
                medidores = interpretar_rollout(lineas, ahora)
                if medidores:
                    todos_medidores.extend(medidores)
                    for m in medidores:
                        if m.get("leido"):
                            leido_fallback = m["leido"]
        except Exception:
            continue

    if todos_medidores:
        for m in todos_medidores:
            if "leido" not in m:
                m["leido"] = leido_fallback
            m["fuente"] = "registro de sesiones de codex"
        return todos_medidores

    return [{"id": "codex", "ok": False, "error": "sin respaldo", "obsoleto": True}]
