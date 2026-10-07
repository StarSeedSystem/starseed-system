#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Adaptador ChatGPT/Codex por terminal (codex app-server + rollouts)."""

from __future__ import annotations

import json
import os
import queue
import subprocess
import sys
import threading
import time
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo


def _ventana_desde_objeto(obj: dict, limit_id: str, ahora: datetime) -> list[dict]:
    """Convierte primary/secondary en lista de ventanas con id y etiqueta según duración."""
    ventanas = []
    for clave in ("primary", "secondary"):
        win = obj.get(clave)
        if not win:
            continue
        used = win.get("usedPercent")
        if used is None:
            continue
        dur = win.get("windowDurationMins")
        if dur == 300:
            vid, etiq = "5h", "5 horas"
        elif dur == 10080:
            vid, etiq = "semana", "Semana"
        else:
            vid, etiq = f"{dur}min", f"{dur} min"
        resets_at = win.get("resetsAt")
        if isinstance(resets_at, (int, float)):
            reinicia = datetime.fromtimestamp(resets_at, tz=ahora.tzinfo or ZoneInfo("UTC")).isoformat()
        else:
            reinicia = ""
        ventanas.append({
            "id": vid,
            "etiqueta": etiq,
            "usado_pct": used,
            "reinicia": reinicia,
        })
    return ventanas


def _saldo_desde_credits(credits: dict) -> dict | None:
    if not credits:
        return None
    balance = credits.get("balance")
    unlimited = credits.get("unlimited", False)
    try:
        valor = float(balance) if balance is not None else 0.0
    except Exception:
        valor = 0.0
    saldo = {"valor": valor, "unidad": "créditos"}
    if unlimited:
        saldo["ilimitado"] = True
    return saldo


def _extras_desde_objeto(obj: dict, top: dict | None = None, ahora: datetime | None = None):
    extras = {}
    rlr = obj.get("rateLimitReachedType")
    if rlr:
        extras["bloqueado"] = rlr
    # ordinaryUsageAllowed puede estar en el objeto o en el resultado superior
    oua = obj.get("ordinaryUsageAllowed")
    if oua is None and top is not None:
        oua = top.get("ordinaryUsageAllowed")
    if oua is not None:
        extras["uso_normal"] = oua
    # rateLimitResetCredits puede estar arriba
    rrc = obj.get("rateLimitResetCredits")
    if rrc is None and top is not None:
        rrc = top.get("rateLimitResetCredits")
    if rrc:
        avail = rrc.get("availableCount")
        if isinstance(avail, int):
            extras["reinicios_gratis"] = avail
        credits_list = rrc.get("credits", [])
        expirys = [
            c.get("expiresAt")
            for c in credits_list
            if c.get("status") == "available" and c.get("expiresAt")
        ]
        if expirys:
            nearest = min(expirys)
            tz = ahora.tzinfo if ahora and ahora.tzinfo else ZoneInfo("UTC")
            extras["reinicio_gratis_vence"] = datetime.fromtimestamp(nearest, tz=tz).isoformat()
    return extras


def interpretar_rpc(resultado: dict, ahora: datetime) -> list[dict]:
    """Convierte la respuesta JSON-RPC de account/rateLimits/read en lista de medidores."""
    medidores = []
    rate_limits = resultado.get("rateLimitsByLimitId") or resultado.get("rateLimits")
    if not rate_limits:
        return medidores
    # Si rate_limits es dict de limitId->obj, iterar; si es objeto único, tratar como codex
    if isinstance(rate_limits, dict) and any(isinstance(v, dict) for v in rate_limits.values()):
        items = rate_limits.items()
    else:
        items = [("codex", rate_limits)]
    for limit_id, obj in items:
        if not isinstance(obj, dict):
            continue
        ventanas = _ventana_desde_objeto(obj, limit_id, ahora)
        if not ventanas:
            continue
        medidor_id = "codex" if limit_id == "codex" else f"codex-{limit_id}"
        nombre = "ChatGPT · Codex" if limit_id == "codex" else f"ChatGPT · Codex ({limit_id})"
        plan = obj.get("planType")
        saldo = _saldo_desde_credits(obj.get("credits"))
        extras = _extras_desde_objeto(obj, top=resultado, ahora=ahora)
        medidores.append({
            "id": medidor_id,
            "proveedor": "openai",
            "nombre": nombre,
            "tipo": "plan",
            "plan": plan,
            "ventanas": ventanas,
            "saldo": saldo,
            "extras": extras,
            "fuente": "terminal: codex app-server",
            "enlace": "https://chatgpt.com/codex/settings/usage",
            "leido": ahora.isoformat(),
            "ok": True,
            "obsoleto": False,
            "error": None,
        })
    return medidores


def interpretar_rollout(lineas, ahora: datetime) -> list[dict]:
    """Extrae el último evento con rate_limits de un iterable de líneas JSONL (snake_case)."""
    ultimo_evento = None
    for linea in lineas:
        linea = linea.strip()
        if not linea:
            continue
        try:
            evento = json.loads(linea)
        except Exception:
            continue
        payload = evento.get("payload", {})
        rate_limits = payload.get("rate_limits") or payload.get("info", {}).get("rate_limits")
        if rate_limits:
            ultimo_evento = evento
    if not ultimo_evento:
        return []
    ts = ultimo_evento.get("timestamp")
    leido = datetime.fromtimestamp(ts, tz=ahora.tzinfo or ZoneInfo("UTC")).isoformat() if isinstance(ts, (int, float)) else ahora.isoformat()
    payload = ultimo_evento.get("payload", {})
    rl = payload.get("rate_limits") or payload.get("info", {}).get("rate_limits")
    if not isinstance(rl, dict):
        return []
    limit_id = rl.get("limit_id", "codex")
    def _snake_to_camel_win(w):
        if not isinstance(w, dict):
            return None
        return {
            "usedPercent": w.get("used_percent"),
            "windowDurationMins": w.get("window_minutes"),
            "resetsAt": w.get("resets_at"),
        }
    primary = _snake_to_camel_win(rl.get("primary"))
    secondary = _snake_to_camel_win(rl.get("secondary"))
    credits_raw = rl.get("credits") or {}
    # credits may have balance as string, ok
    rrc_raw = rl.get("rate_limit_reset_credits") or {}
    rrc = None
    if rrc_raw:
        rrc = {
            "availableCount": rrc_raw.get("available_count"),
            "credits": [
                {"status": c.get("status"), "expiresAt": c.get("expires_at")}
                for c in rrc_raw.get("credits", [])
            ],
        }
    obj = {
        "primary": primary,
        "secondary": secondary,
        "credits": credits_raw,
        "planType": rl.get("plan_type"),
        "rateLimitReachedType": rl.get("rate_limit_reached_type"),
        "ordinaryUsageAllowed": rl.get("ordinary_usage_allowed"),
        "rateLimitResetCredits": rrc,
    }
    medidores = interpretar_rpc({"rateLimitsByLimitId": {limit_id: obj}}, ahora)
    for m in medidores:
        m["fuente"] = "registro de sesiones de codex"
        m["leido"] = leido
    return medidores


def _fallback_rollouts(home: str, ahora: datetime) -> list[dict]:
    sessions_dir = Path(home) / ".codex" / "sessions"
    if not sessions_dir.is_dir():
        return []
    files = sorted(sessions_dir.rglob("rollout-*.jsonl"), key=lambda p: p.stat().st_mtime, reverse=True)[:10]
    for fpath in files:
        try:
            lineas = fpath.read_text(encoding="utf-8").splitlines()
            medidores = interpretar_rollout(lineas, ahora)
            if medidores:
                return medidores
        except Exception:
            continue
    return []


def leer(config=None, ahora=None, abrir=subprocess.Popen, home=None, tope_s=30) -> list[dict]:
    """Arranca codex app-server, pide account/rateLimits/read y devuelve medidores; con respaldo de rollouts."""
    ahora = ahora or datetime.now().astimezone()
    home = home or os.path.expanduser("~")
    bin_dir = Path(home) / ".local" / "bin"
    env = os.environ.copy()
    env["PATH"] = str(bin_dir) + (":" + env["PATH"] if env.get("PATH") else "")
    proc = None
    q = queue.Queue()
    def reader():
        try:
            for line in proc.stdout:
                q.put(line)
        except Exception:
            pass
    try:
        proc = abrir(
            ["codex", "app-server"],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
            bufsize=1,
            env=env,
        )
        t = threading.Thread(target=reader, daemon=True)
        t.start()
        # Enviar initialize, initialized, account/rateLimits/read
        msgs = [
            {"method": "initialize", "id": 0, "params": {"clientInfo": {"name": "starseed_medidor", "title": "StarSeed medidor", "version": "0.1.0"}}},
            {"method": "initialized"},
            {"method": "account/rateLimits/read", "id": 1},
        ]
        for m in msgs:
            proc.stdin.write(json.dumps(m) + "\n")
            proc.stdin.flush()
        # Esperar respuesta con id 1
        deadline = time.time() + tope_s
        while time.time() < deadline:
            try:
                line = q.get(timeout=0.5)
            except queue.Empty:
                continue
            try:
                resp = json.loads(line)
            except Exception:
                continue
            if resp.get("id") == 1:
                resultado = resp.get("result", {})
                return interpretar_rpc(resultado, ahora)
        # timeout
        return _fallback_rollouts(home, ahora)
    except FileNotFoundError:
        return _fallback_rollouts(home, ahora)
    except Exception:
        return _fallback_rollouts(home, ahora)
    finally:
        if proc and proc.poll() is None:
            try:
                proc.terminate()
                proc.wait(timeout=2)
            except Exception:
                try:
                    proc.kill()
                except Exception:
                    pass
    # si llegamos aquí sin retorno
    return [{"id": "codex", "proveedor": "openai", "nombre": "ChatGPT · Codex", "tipo": "plan",
             "fuente": "terminal: codex app-server", "enlace": "https://chatgpt.com/codex/settings/usage",
             "leido": ahora.isoformat(), "ok": False, "obsoleto": False, "error": "fallo al leer codex",
             "plan": None, "ventanas": [], "saldo": None, "extras": {}}]


if __name__ == "__main__":
    pass