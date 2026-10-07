#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Adaptador Codex / ChatGPT por terminal (§2.2, §3 del contrato)."""

from __future__ import annotations

import json
import os
import re
import subprocess
from datetime import datetime
from zoneinfo import ZoneInfo


def _etiqueta_ventana(mins: int):
    if mins == 300:
        return "5 horas", "5h"
    if mins == 10080:
        return "Semana", "semana"
    return f"{mins} min", f"{mins}min"


def interpretar_rpc(resultado: dict, ahora: datetime | None = None) -> list[dict]:
    ahora = ahora or datetime.now().astimezone()
    # Fuente de datos: primero rateLimitsByLimitId, luego rateLimits, luego el dict completo
    raw = resultado.get("rateLimitsByLimitId")
    if raw is None:
        raw = resultado.get("rateLimits")
    if raw is None:
        # Si no hay ninguna de esas, intentar tratar el propio resultado como una entrada
        if isinstance(resultado, dict) and ("primary" in resultado or "limitId" in resultado):
            raw = {"codex": resultado}
        else:
            raw = {}
    # Construir diccionario de entradas
    entradas = {}
    if isinstance(raw, dict):
        # Si parece una entrada única (rateLimits o similar con primary/limitId a nivel superior)
        if isinstance(raw.get("limitId"), str) or ("primary" in raw and isinstance(raw.get("primary"), dict)):
            lid_raw = raw.get("limitId", "codex")
            limit_id_str = str(lid_raw) if isinstance(lid_raw, str) else "codex"
            entradas = {limit_id_str: raw}
        else:
            # Caso rateLimitsByLimitId: los valores son entradas individuales
            for k, v in raw.items():
                if isinstance(v, dict) and ("primary" in v or "secondary" in v or "limitId" in v):
                    key_str = str(k) if k is not None else "codex"
                    entradas[key_str] = v
                elif isinstance(v, dict) and ("usedPercent" in v or "resetsAt" in v):
                    entradas[str(k) if str(k) != "codex" else "codex"] = v
            # Si aún no tenemos entradas y raw es un dict simple con datos
            if not entradas and isinstance(raw, dict) and ("primary" in raw or "limitId" in raw):
                lid_raw = raw.get("limitId", "codex")
                limit_id_str = str(lid_raw) if isinstance(lid_raw, str) else "codex"
                entradas = {limit_id_str: raw}
            # Si raw es un dict que NO es rateLimitsByLimitId pero tiene una clave única con datos
            if not entradas and isinstance(raw, dict) and len(raw) == 1:
                first_key, first_val = next(iter(raw.items()))
                if isinstance(first_val, dict) and ("primary" in first_val or "limitId" in first_val):
                    entradas = {str(first_key): first_val}
    # Si raw es una lista o vacío, sin entradas
    if not isinstance(entradas, dict) or not entradas:
        # Intentar extraer directamente de resultado (rateLimits como entrada única)
        rate_limits = resultado.get("rateLimits")
        if isinstance(rate_limits, dict) and ("primary" in rate_limits or "limitId" in rate_limits):
            entradas = {rate_limits.get("limitId", "codex"): rate_limits}
        else:
            entradas = {}
    medidores = []
    for limit_key, info in entradas.items():
        # Omitir si info no tiene ventanas con datos
        ventanas_data = []
        for ventana_key in ("primary", "secondary"):
            obj = info.get(ventana_key)
            if isinstance(obj, dict) and (obj.get("usedPercent") is not None or obj.get("resetsAt") is not None or obj.get("windowDurationMins") is not None):
                ventanas_data.append(obj)
        # También considerar ventanas que tengan datos aunque no tengan primary/secondary explícito
        # Según contrato, solo primary y secondary
        if not ventanas_data:
            # Si no hay datos de ventana, omitir esta entrada completa (ej. premium con todo nulo)
            continue
        # Construir ventanas
        ventanas = []
        for ventana_key in ("primary", "secondary"):
            obj = info.get(ventana_key)
            if not isinstance(obj, dict):
                continue
            mins = obj.get("windowDurationMins")
            usado_pct = obj.get("usedPercent")
            resets_at = obj.get("resetsAt")
            # Ventana no nula si al menos un campo relevante no es None
            if mins is None and usado_pct is None and resets_at is None:
                continue
            if mins is not None:
                etiq, vid = _etiqueta_ventana(mins)
            else:
                # Por defecto según tipo de ventana
                if ventana_key == "primary":
                    etiq, vid = "5 horas", "5h"
                else:
                    etiq, vid = "Semana", "semana"
            reinicia_str = None
            if resets_at is not None:
                try:
                    ts = int(resets_at)
                    fecha = datetime.fromtimestamp(ts, tz=ZoneInfo("UTC")).astimezone(ZoneInfo("America/Mexico_City"))
                    reinicia_str = fecha.isoformat()
                except Exception:
                    pass
            ventanas.append({
                "id": vid,
                "etiqueta": etiq,
                "usado_pct": usado_pct if usado_pct is not None else 0,
                "reinicia": reinicia_str,
            })
        # Si después del filtro no quedan ventanas, omitir
        if not ventanas:
            continue
        # Id y nombre
        base_id_raw = info.get("limitId", limit_key)
        base_id = base_id_raw if isinstance(base_id_raw, str) else (str(base_id_raw) if base_id_raw is not None else "codex")
        if base_id == "codex":
            med_id = "codex"
            nombre = "ChatGPT · Codex"
        else:
            med_id = f"codex-{base_id}"
            nombre = f"ChatGPT · Codex ({base_id})"
        # Saldo
        credits = info.get("credits") or {}
        saldo_obj = {}
        balance_val = credits.get("balance")
        try:
            saldo_obj["valor"] = float(balance_val) if balance_val is not None and balance_val != "" else 0.0
        except (TypeError, ValueError):
            saldo_obj["valor"] = 0.0
        saldo_obj["unidad"] = "créditos"
        unlimited = credits.get("unlimited")
        if unlimited is True:
            saldo_obj["ilimitado"] = True
        # Extras
        extras = {}
        bloqueado = info.get("rateLimitReachedType")
        if bloqueado is not None:
            extras["bloqueado"] = bloqueado
        uso_normal = info.get("ordinaryUsageAllowed")
        if uso_normal is not None:
            extras["uso_normal"] = uso_normal
        reset_credits = info.get("rateLimitResetCredits") or {}
        reinicios_gratis = reset_credits.get("availableCount")
        if reinicios_gratis is not None:
            extras["reinicios_gratis"] = reinicios_gratis
        # Reinicio gratis vence: expiresAt más cercano de los available
        credits_list = reset_credits.get("credits") or []
        available_credits = [c for c in credits_list if isinstance(c, dict) and c.get("status") == "available"]
        exp_times = []
        for c in available_credits:
            exp = c.get("expiresAt")
            if exp is not None:
                try:
                    exp_times.append(int(exp))
                except (TypeError, ValueError):
                    pass
        if exp_times:
            exp_times.sort()
            fecha_vence = datetime.fromtimestamp(exp_times[0], tz=ZoneInfo("UTC")).astimezone(ZoneInfo("America/Mexico_City"))
            extras["reinicio_gratis_vence"] = fecha_vence.isoformat()
        # Plan
        plan_type = info.get("planType")
        medidor = {
            "id": med_id,
            "nombre": nombre,
            "proveedor": "openai",
            "tipo": "plan",
            "plan": plan_type,
            "enlace": "https://chatgpt.com/codex/settings/usage",
            "fuente": "terminal: codex app-server",
            "ventanas": ventanas,
            "saldo": saldo_obj,
            "extras": extras,
            "leido": ahora.isoformat(),
            "ok": True,
            "obsoleto": False,
            "error": None,
        }
        # Lista blanca de claves permitidas (nada prohibido debe aparecer)
        # Las claves construidas son solo las de arriba; no hay accountId, title, description, rateLimitUpsell, id de crédito
        medidores.append(medidor)
    return medidores


def interpretar_rollout(lineas, ahora: datetime | None = None) -> list[dict]:
    ahora = ahora or datetime.now().astimezone()
    eventos = []
    for linea in lineas:
        linea = linea if linea is not None else ""
        if not linea or not linea.strip():
            continue
        try:
            evento = json.loads(linea)
        except Exception:
            continue
        payload = evento.get("payload") or {}
        info_payload = payload.get("info") or {}
        rate_limits = payload.get("rate_limits") or info_payload.get("rate_limits")
        if rate_limits is None:
            rate_limits = evento.get("rate_limits")
        if rate_limits is None:
            # Intentar con snake_case directamente en payload
            rate_limits = payload.get("rate_limits")
        if rate_limits is None:
            continue
        # Solo eventos con alguna ventana no nula
        def ventana_tiene_datos(obj):
            if not isinstance(obj, dict):
                return False
            return obj.get("used_percent") is not None or obj.get("resets_at") is not None or obj.get("window_minutes") is not None
        primary = rate_limits.get("primary") or {}
        secondary = rate_limits.get("secondary") or {}
        if ventana_tiene_datos(primary) or ventana_tiene_datos(secondary):
            eventos.append({"evento": evento, "rate_limits": rate_limits})
    if not eventos:
        return []
    ultimo = eventos[-1]
    rate_limits = ultimo["rate_limits"]
    evento_obj = ultimo["evento"]
    limit_id_raw = rate_limits.get("limit_id", rate_limits.get("limitId", "codex"))
    limit_id = str(limit_id_raw) if limit_id_raw is not None else "codex"
    ventanas = []
    for ventana_key in ("primary", "secondary"):
        obj = rate_limits.get(ventana_key)
        if not isinstance(obj, dict):
            continue
        mins = obj.get("window_minutes")
        usado_pct = obj.get("used_percent")
        resets_at = obj.get("resets_at")
        if mins is None and usado_pct is None and resets_at is None:
            continue
        if mins is not None:
            etiq, vid = _etiqueta_ventana(mins)
        else:
            if ventana_key == "primary":
                etiq, vid = "5 horas", "5h"
            else:
                etiq, vid = "Semana", "semana"
        reinicia_str = None
        if resets_at is not None:
            try:
                ts = int(resets_at)
                fecha = datetime.fromtimestamp(ts, tz=ZoneInfo("UTC")).astimezone(ZoneInfo("America/Mexico_City"))
                reinicia_str = fecha.isoformat()
            except Exception:
                pass
        ventanas.append({
            "id": vid,
            "etiqueta": etiq,
            "usado_pct": usado_pct if usado_pct is not None else 0,
            "reinicia": reinicia_str,
        })
    if not ventanas:
        return []
    if limit_id == "codex":
        med_id = "codex"
        nombre = "ChatGPT · Codex"
    else:
        med_id = f"codex-{limit_id}"
        nombre = f"ChatGPT · Codex ({limit_id})"
    credits_obj = rate_limits.get("credits") or {}
    saldo_obj = {}
    balance_val = credits_obj.get("balance")
    try:
        saldo_obj["valor"] = float(balance_val) if balance_val is not None and balance_val != "" else 0.0
    except (TypeError, ValueError):
        saldo_obj["valor"] = 0.0
    saldo_obj["unidad"] = "créditos"
    unlimited = credits_obj.get("unlimited")
    if unlimited is True:
        saldo_obj["ilimitado"] = True
    extras = {}
    bloqueado = rate_limits.get("rate_limit_reached_type") or rate_limits.get("rateLimitReachedType")
    if bloqueado is not None:
        extras["bloqueado"] = bloqueado
    uso_normal = rate_limits.get("ordinary_usage_allowed") or rate_limits.get("ordinaryUsageAllowed")
    if uso_normal is not None:
        extras["uso_normal"] = uso_normal
    reset_credits_obj = rate_limits.get("rate_limit_reset_credits") or rate_limits.get("rateLimitResetCredits") or {}
    reinicios_gratis = reset_credits_obj.get("available_count") or reset_credits_obj.get("availableCount")
    if reinicios_gratis is not None:
        extras["reinicios_gratis"] = reinicios_gratis
    credits_list = reset_credits_obj.get("credits") or []
    available_credits = [c for c in credits_list if isinstance(c, dict) and c.get("status") == "available"]
    exp_times = []
    for c in available_credits:
        exp = c.get("expires_at") or c.get("expiresAt")
        if exp is not None:
            try:
                exp_times.append(int(exp))
            except (TypeError, ValueError):
                pass
    if exp_times:
        exp_times.sort()
        fecha_vence = datetime.fromtimestamp(exp_times[0], tz=ZoneInfo("UTC")).astimezone()
        extras["reinicio_gratis_vence"] = fecha_vence.isoformat()
    plan_type = rate_limits.get("plan_type") or rate_limits.get("planType")
    medidor = {
        "id": med_id,
        "nombre": nombre,
        "proveedor": "openai",
        "tipo": "plan",
        "plan": plan_type,
        "enlace": "https://chatgpt.com/codex/settings/usage",
        "fuente": "registro de sesiones de codex",
        "leido": evento_obj.get("timestamp", "") if isinstance(evento_obj.get("timestamp"), str) else "",
        "ventanas": ventanas,
        "saldo": saldo_obj,
        "extras": extras,
        "ok": True,
        "obsoleto": False,
        "error": None,
    }
    return [medidor]


def leer(config=None, ahora=None, abrir=subprocess.Popen, home=None, tope_s=30) -> list[dict]:
    import threading, queue, glob
    ahora = ahora or datetime.now().astimezone()
    home_path = home or os.path.expanduser("~")
    bin_path = os.path.join(home_path, ".local", "bin")
    env = os.environ.copy()
    env["PATH"] = bin_path + (":" + env.get("PATH", "") if env.get("PATH") else "")
    proceso = None
    respuesta = None
    respuesta_obj = None
    error_msg = None
    try:
        proceso = abrir(
            ["codex", "app-server"],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
            bufsize=1,
            env=env,
        )
        # Enviar initialize, initialized, account/rateLimits/read
        mensajes = [
            json.dumps({"method": "initialize", "id": 0, "params": {"clientInfo": {"name": "starseed_medidor", "title": "StarSeed medidor", "version": "0.1.0"}}}),
            json.dumps({"method": "initialized"}),
            json.dumps({"method": "account/rateLimits/read", "id": 1}),
        ]
        for msg in mensajes:
            try:
                proceso.stdin.write(msg + "\n")
                proceso.stdin.flush()
            except Exception as e:
                error_msg = f"error al escribir en stdin: {e}"
        # Hilo lector con queue.Queue
        q = queue.Queue()
        def leer_hilo():
            try:
                for linea in iter(proceso.stdout.readline, ""):
                    q.put(linea)
                    # Si recibimos una línea con id 1, podemos detener (pero no necesariamente inmediatamente)
                    try:
                        obj = json.loads(linea)
                        if obj.get("id") == 1:
                            q.put(linea)
                            # No salimos inmediatamente; el bucle continúa, pero el bucle principal espera
                    except Exception:
                        pass
                q.put(None)
            except Exception as e:
                q.put(None)
        hilo = threading.Thread(target=leer_hilo)
        hilo.start()
        # Esperar hasta respuesta con id 1 o tope
        inicio = datetime.now()
        respuesta_obj = None
        while True:
            try:
                linea = q.get(timeout=tope_s)
            except queue.Empty:
                error_msg = "timeout al leer respuesta de codex"
                break
            if linea is None:
                break
            linea_str = linea.strip() if isinstance(linea, str) else ""
            if linea_str:
                try:
                    obj = json.loads(linea_str)
                    if obj.get("id") == 1:
                        respuesta_obj = obj.get("result")
                        break
                except Exception:
                    pass
            # Verificar tiempo total
            if (datetime.now() - inicio).total_seconds() > tope_s:
                error_msg = "timeout al leer respuesta de codex"
                break
        hilo.join(timeout=2)
    except Exception as e:
        error_msg = f"error al lanzar o leer codex: {e}"
    finally:
        if proceso is not None:
            try:
                proceso.kill()
            except Exception:
                pass
            try:
                proceso.wait(timeout=2)
            except Exception:
                pass
            if proceso.stdin is not None:
                try:
                    proceso.stdin.close()
                except Exception:
                    pass
            if proceso.stdout is not None:
                try:
                    proceso.stdout.close()
                except Exception:
                    pass
    # Si tenemos respuesta válida, interpretarla
    if respuesta_obj is not None and isinstance(respuesta_obj, dict):
        try:
            return interpretar_rpc(respuesta_obj, ahora=ahora)
        except Exception as e:
            error_msg = f"error al interpretar respuesta: {e}"
    # Si no, respaldo con rollout
    if error_msg is not None:
        # Buscar rollouts
        sesiones_dir = os.path.join(home_path, ".codex", "sessions")
        archivos = []
        if os.path.isdir(sesiones_dir):
            for root, dirs, files in os.walk(sesiones_dir):
                for f in files:
                    if f.startswith("rollout-") and f.endswith(".jsonl"):
                        archivos.append(os.path.join(root, f))
        archivos.sort(key=lambda x: os.path.getmtime(x) if os.path.exists(x) else 0, reverse=True)
        archivos = archivos[:10]
        if archivos:
            try:
                lineas = []
                for ruta in archivos:
                    with open(ruta, "r", encoding="utf-8") as f:
                        for linea in f:
                            lineas.append(linea)
                result = interpretar_rollout(lineas, ahora=ahora)
                if result:
                    return result
            except Exception:
                pass
    # Si tampoco hay respaldo
    return [{
        "id": "codex",
        "nombre": "ChatGPT · Codex",
        "proveedor": "openai",
        "tipo": "plan",
        "plan": None,
        "enlace": "https://chatgpt.com/codex/settings/usage",
        "fuente": "terminal: codex app-server",
        "leido": ahora.isoformat(),
        "ok": False,
        "obsoleto": False,
        "error": error_msg or "sin respuesta de codex y sin respaldo",
        "ventanas": [],
        "saldo": None,
        "extras": {},
    }]

