#!/usr/bin/env python3
"""Adaptador Codex/ChatGPT (app-server + respaldo de registros) — Medidor MC1007B.

Funciones puras (interpretar_rpc, interpretar_rollout) + wrapper polivalente (leer).
"""

from __future__ import annotations

import json
import subprocess
import threading
from datetime import datetime
from pathlib import Path
from queue import Queue
from typing import Any, Dict, Iterable, List, Optional


DEFAULT_HOME = Path.home()


def interpretar_rpc(resultado: Dict[str, Any], ahora: Optional[datetime] = None) -> List[Dict[str, Any]]:
    """Interpreta el resultado JSON-RPC de `account/rateLimits/read` según §2.2.

    Retorna un medidor por cada entrada de `rateLimitsByLimitId` (si falta, `rateLimits`)
    que tenga alguna ventana no nula.
    """
    if not isinstance(resultado, dict):
        return []

    ahora = ahora or datetime.now()

    def _caso(name: str, fuente: Optional[Dict[str, Any]], limit_id: str, nombre: str) -> Optional[Dict[str, Any]]:
        if not fuente:
            return None

        ventanas: List[Dict[str, Any]] = []
        if fuente.get("primary"):
            p = fuente["primary"]
            duracion = p.get("windowDurationMins")
            if duracion is not None:
                estado = "5 horas" if duracion == 300 else "Semana" if duracion == 10080 else f"{duracion} min"
                id_ventana = "5h" if duracion == 300 else "semana" if duracion == 10080 else f"{duracion}min"
                ventanas.append({
                    "id": id_ventana,
                    "etiqueta": estado,
                    "usado_pct": p.get("usedPercent", 0),
                    "reinicia": datetime.fromtimestamp(p.get("resetsAt", 0), tz=datetime.now().astimezone().tzinfo).isoformat(),
                })
        if fuente.get("secondary"):
            s = fuente["secondary"]
            duracion = s.get("windowDurationMins")
            if duracion is not None:
                estado = "5 horas" if duracion == 300 else "Semana" if duracion == 10080 else f"{duracion} min"
                id_ventana = "5h" if duracion == 300 else "semana" if duracion == 10080 else f"{duracion}min"
                ventanas.append({
                    "id": id_ventana,
                    "etiqueta": estado,
                    "usado_pct": s.get("usedPercent", 0),
                    "reinicia": datetime.fromtimestamp(s.get("resetsAt", 0), tz=datetime.now().astimezone().tzinfo).isoformat(),
                })

        if not ventanas:
            return None

        id_medidor = limit_id
        if limit_id != "codex" and not limit_id.startswith("codex-"):
            id_medidor = f"codex-{limit_id}"

        medidor: Dict[str, Any] = {
            "id": id_medidor,
            "proveedor": "openai",
            "nombre": nombre,
            "tipo": "plan",
            "ventanas": ventanas,
            "saldo": None,
            "extras": {},
            "fuente": f"terminal: codex app-server",
            "leido": ahora.isoformat(),
            "ok": True,
            "obsoleto": False,
            "error": None,
            "enlace": "https://chatgpt.com/codex/settings/usage",
        }

        if fuente.get("credits"):
            cre = fuente["credits"]
            if cre.get("balance") is not None:
                try:
                    valor = float(cre["balance"])
                except Exception:
                    valor = 0.0
                medidor["saldo"] = {"valor": valor, "unidad": "créditos"}
            if cre.get("unlimited"):
                medidor["saldo"] = {"valor": None, "unidad": "créditos"}
                if medidor.get("saldo") and isinstance(medidor["saldo"], dict):
                    medidor["saldo"]["ilimitado"] = True

        plan = fuente.get("planType")
        if plan:
            medidor["plan"] = plan
        bloqueado = fuente.get("rateLimitReachedType")
        if bloqueado:
            medidor["extras"]["bloqueado"] = bloqueado
        uso_normal = fuente.get("ordinaryUsageAllowed")
        if uso_normal is not None:
            medidor["extras"]["uso_normal"] = uso_normal
        reinicios_gratis = fuente.get("rateLimitResetCredits", {}).get("availableCount")
        if reinicios_gratis is not None:
            medidor["extras"]["reinicios_gratis"] = reinicios_gratis
        creditos_data = fuente.get("rateLimitResetCredits", {}).get("credits", [])
        if creditos_data:
            fechas = [
                c.get("expiresAt") for c in creditos_data if c.get("status") == "available" and c.get("expiresAt") is not None
            ]
            if fechas:
                mas_cercana = max(fechas)
                medidor["extras"]["reinicio_gratis_vence"] = datetime.fromtimestamp(mas_cercana, tz=datetime.now().astimezone().tzinfo).isoformat()

        return medidor

    fuente = resultado.get("rateLimitsByLimitId") or resultado.get("rateLimits")
    if not fuente or not isinstance(fuente, dict):
        return []

    result: List[Dict[str, Any]] = []

    for limit_id, datos in fuente.items():
        nombre = "ChatGPT · Codex" if limit_id == "codex" else f"ChatGPT · Codex ({limit_id})"
        medidor = _caso(limit_id, datos, limit_id, nombre)
        if medidor:
            result.append(medidor)

    return result


def interpretar_rollout(lineas: Iterable[str], ahora: Optional[datetime] = None) -> List[Dict[str, Any]]:
    """Interpreta líneas JSONL de respaldo (rollout-*.jsonl) según §2.2.

    Devuelve el ÚLTIMO evento con `"rate_limits"` (en `payload.rate_limits` o
    `payload.info.rate_limits`) y alguna ventana no nula, por `limit_id` (snake_case §2.2).
    """
    ahora = ahora or datetime.now()
    ultimo_evento = None

    for linea in lineas:
        if not linea or not linea.strip():
            continue
        try:
            evento = json.loads(linea.strip())
            rate = evento.get("rate_limits") or evento.get("payload", {}).get("rate_limits") or evento.get("payload", {}).get("info", {}).get("rate_limits")
            if rate:
                ultimo_evento = (evento, rate)
        except Exception:
            continue

    if not ultimo_evento:
        return []

    evento, rate = ultimo_evento
    limit_id = rate.get("limit_id") or "codex"

    def _caso(snake: Dict[str, Any], nombre: str) -> Optional[Dict[str, Any]]:
        ventanas = []
        for key in ("primary", "secondary"):
            if snake.get(key):
                val = snake[key]
                duracion = val.get("window_minutes")
                if duracion is None:
                    continue
                estado = "5 horas" if duracion == 300 else "Semana" if duracion == 10080 else f"{duracion} min"
                id_ventana = "5h" if duracion == 300 else "semana" if duracion == 10080 else f"{duracion}min"
                ventanas.append({
                    "id": id_ventana,
                    "etiqueta": estado,
                    "usado_pct": val.get("used_percent", 0),
                    "reinicia": datetime.fromtimestamp(val.get("resets_at", 0), tz=datetime.now().astimezone().tzinfo).isoformat(),
                })

        if not ventanas:
            return None

        id_medidor = limit_id
        if limit_id != "codex" and not limit_id.startswith("codex-"):
            id_medidor = f"codex-{limit_id}"

        saldo = None
        if snake.get("credits", {}).get("balance") is not None:
            try:
                valor = float(snake["credits"]["balance"])
            except Exception:
                valor = 0.0
            saldo = {"valor": valor, "unidad": "créditos"}

        medidor: Dict[str, Any] = {
            "id": id_medidor,
            "proveedor": "openai",
            "nombre": nombre,
            "tipo": "plan",
            "ventanas": ventanas,
            "saldo": saldo,
            "extras": {},
            "fuente": "registro de sesiones de codex",
            "leido": datetime.fromtimestamp(evento.get("timestamp", 0), tz=datetime.now().astimezone().tzinfo).isoformat(),
            "ok": True,
            "obsoleto": False,
            "error": None,
            "enlace": "https://chatgpt.com/codex/settings/usage",
        }
        if snake.get("plan_type"):
            medidor["plan"] = snake["plan_type"]
        if snake.get("rate_limit_reached_type"):
            medidor["extras"]["bloqueado"] = snake["rate_limit_reached_type"]
        if snake.get("ordinary_usage_allowed") is not None:
            medidor["extras"]["uso_normal"] = snake["ordinary_usage_allowed"]

        return medidor

    result: List[Dict[str, Any]] = []

    for key, val in rate.items():
        if key in ("primary", "secondary"):
            snake = {"used_percent": val.get("used_percent") or val.get("usedPercent", 0),
                     "window_minutes": val.get("window_minutes") or val.get("windowDurationMins"),
                     "resets_at": val.get("resets_at") or val.get("resetsAt"),
                     "plan_type": val.get("plan_type") or val.get("planType"),
                     "credits": {"balance": val.get("credits", {}).get("balance")},
                     "rate_limit_reached_type": val.get("rate_limit_reached_type") or val.get("rateLimitReachedType"),
                     "ordinary_usage_allowed": val.get("ordinary_usage_allowed") or val.get("ordinaryUsageAllowed")}
            nombre = "ChatGPT · Codex" if limit_id == "codex" else f"ChatGPT · Codex ({limit_id})"
            m = _caso({"primary": snake}, nombre)
            if m:
                result.append(m)

    return result


def leer(config: Optional[Dict[str, Any]] = None, ahora: Optional[datetime] = None,
        abrir: Any = subprocess.Popen, home: Optional[str] = None, tope_s: int = 30) -> List[Dict[str, Any]]:
    """Lanza `codex app-server`, manda RPC, lee respuesta y, si falla, usa respaldo de `~/.codex/sessions/*/*/*/rollout-*.jsonl`.

    Nunca lanza excepción: responde con `ok: False`, `error` y `obsoleto: true` si todo falla.
    """
    ahora = ahora or datetime.now()
    home_path = Path(home) if home else DEFAULT_HOME
    sesion_path = home_path / ".codex" / "sessions"

    lista_lineas: List[str] = []
    event_queue: Queue[str] = Queue()
    proceso: Optional[subprocess.Popen] = None

    def _lector(proc: subprocess.Popen, cola: Queue[str]):
        if proc.stdout:
            for linea in proc.stdout:
                cola.put(linea)

    try:
        proceso = abrir(
            ["codex", "app-server"],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
            bufsize=1,
            cwd=home_path / ".starseed" / "medidores-entrada"
        )

        if proceso and proceso.stdout:
            thread = threading.Thread(target=_lector, args=(proceso, event_queue), daemon=True)
            thread.start()

            mensajes = [
                {"method": "initialize", "id": 0, "params": {"clientInfo": {"name": "starseed_medidor", "title": "StarSeed medidor", "version": "0.1.0"}}},
                {"method": "initialized"},
                {"method": "account/rateLimits/read", "id": 1},
            ]
            if proceso and proceso.stdin:
                for mensaje in mensajes:
                    proceso.stdin.write(json.dumps(mensaje) + "\n")
                    proceso.stdin.flush()

            respuesta = []
            inicio = ahora.timestamp()
            while True:
                if ahora.timestamp() - inicio > tope_s:
                    raise TimeoutError("Tope de espera")
                try:
                    linea = event_queue.get(timeout=0.1)
                except:
                    continue
                if not linea:
                    continue
                linea = linea.strip()
                if not linea:
                    continue
                try:
                    obj = json.loads(linea)
                    if obj.get("id") == 1:
                        respuesta.append(obj)
                        break
                except Exception:
                    continue

            if respuesta:
                return interpretar_rpc(respuesta[0], ahora)

    except Exception as e:
        return [{"id": "codex", "proveedor": "openai", "nombre": "ChatGPT · Codex", "tipo": "plan", "ok": False, "obsoleto": True, "error": str(e)[:100], "fuente": f"terminal: codex app-server"}]
    finally:
        if proceso:
            try:
                if proceso.poll() is None:
                    proceso.terminate()
                    proceso.wait(timeout=5)
            except Exception:
                try:
                    proceso.kill()
                    proceso.wait(timeout=5)
                except Exception:
                    pass

    archivos = sorted(sesion_path.rglob("rollout-*.jsonl"), key=lambda p: p.stat().st_mtime, reverse=True)[:10]
    for archivo in archivos:
        try:
            datos = archivo.read_text(encoding="utf-8").splitlines()
            resultado = interpretar_rollout(datos, ahora)
            if resultado:
                return resultado
        except Exception:
            continue

    return [{"id": "codex", "proveedor": "openai", "nombre": "ChatGPT · Codex", "tipo": "plan", "ok": False, "obsoleto": True, "error": "No se pudo leer desde la terminal ni desde el respaldo", "fuente": f"terminal: codex app-server"}]
