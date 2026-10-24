#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Adaptador de créditos de Cloudroom; la lectura se hace con su CLI, sin claves."""
from __future__ import annotations

import json
import os
import shutil
import subprocess
from datetime import datetime, timedelta, timezone
CADA_MIN = 20
CUPO_GRATIS = 100

def _objeto(valor):
    if isinstance(valor, (dict, list)):
        return valor
    if isinstance(valor, str):
        try:
            dato = json.loads(valor)
            return dato if isinstance(dato, (dict, list)) else {}
        except ValueError:
            return {}
    return {}
def _datos(valor):
    d = _objeto(valor)
    return d.get("data", d) if isinstance(d, dict) else d
def _numero(d, claves):
    for clave in claves:
        n = d.get(clave)
        if isinstance(n, (int, float)) and not isinstance(n, bool) and n >= 0:
            return n
    return None
def _en_nube(hilo):
    # room-cli marca la nube con executionTarget="cloud"; machine/machineId/hostId vienen null.
    objetivo = hilo.get("executionTarget", hilo.get("execution_target", hilo.get("target")))
    if isinstance(objetivo, dict):
        objetivo = objetivo.get("name", objetivo.get("type"))
    if str(objetivo or "").strip().lower() == "cloud":
        return True
    maquina = hilo.get("machine", hilo.get("machineType", hilo.get("machine_type")))
    if isinstance(maquina, dict):
        maquina = maquina.get("type", maquina.get("name"))
    return hilo.get("cloud") is True or str(maquina or "").strip().lower() == "cloud"
def _fecha(valor):
    # createdAt llega en milisegundos (número o cadena numérica); también se acepta ISO.
    if isinstance(valor, (int, float)) and not isinstance(valor, bool):
        segundos = float(valor) / 1000.0 if float(valor) > 1e11 else float(valor)
        try:
            return datetime.fromtimestamp(segundos, tz=timezone.utc)
        except (OverflowError, OSError, ValueError):
            return None
    if not isinstance(valor, str):
        return None
    if valor.strip().isdigit():
        return _fecha(int(valor.strip()))
    try:
        f = datetime.fromisoformat(valor.replace("Z", "+00:00"))
        return f if f.tzinfo else f.replace(tzinfo=timezone.utc)
    except ValueError:
        return None
def _creado(hilo):
    return _fecha(hilo.get("createdAt", hilo.get("created_at", hilo.get("created")))) or \
        _fecha(hilo.get("startedAt", hilo.get("started_at")))
def _modelos_harness(harness):
    nombres = []
    modelos = harness.get("models")
    for m in modelos if isinstance(modelos, list) else []:
        nombre = m.get("model", m.get("id", m.get("name"))) if isinstance(m, dict) else m
        if nombre and str(nombre) not in nombres:
            nombres.append(str(nombre))
    base = harness.get("model")
    if base and str(base) not in nombres:
        nombres.insert(0, str(base))
    return nombres
def _agentes_harness(estado):
    """Harnesses de la nube (cloud status) con sus modelos disponibles, no los hilos."""
    harnesses = estado.get("harnesses")
    agentes = []
    for h in harnesses if isinstance(harnesses, list) else []:
        if not isinstance(h, dict) or not (h.get("id") or h.get("name")):
            continue
        agentes.append({"harness": str(h.get("id") or h.get("name")),
                        "proveedor": h.get("provider"), "modelo": h.get("model"),
                        "modelos": _modelos_harness(h)})
    return agentes

def interpretar(estado, cuenta_hilos, lista_hilos, ahora):
    """PURA: salidas JSON simuladas → medidor; el ciclo es una ventana de 30 días."""
    estado = _datos(estado)
    estado = estado if isinstance(estado, dict) else {}
    cuenta_hilos = _datos(cuenta_hilos)
    cuenta_hilos = cuenta_hilos if isinstance(cuenta_hilos, dict) else {}
    lista_hilos = _datos(lista_hilos)
    hilos = lista_hilos if isinstance(lista_hilos, list) else lista_hilos.get("threads", []) if isinstance(lista_hilos, dict) else []
    hilos = [h for h in hilos if isinstance(h, dict)] if isinstance(hilos, list) else []
    ciclo = ahora.astimezone(timezone.utc) - timedelta(days=30)
    nube = [h for h in hilos if _en_nube(h) and _creado(h) and _creado(h) >= ciclo]
    uso = estado.get("planUsage") or estado.get("plan_usage") or {}
    uso = uso if isinstance(uso, dict) else {}
    plan_obj = estado.get("plan")
    plan = plan_obj.get("name", plan_obj.get("label")) if isinstance(plan_obj, dict) else plan_obj
    gratis = not plan or str(plan).strip().lower() in ("free", "gratis")
    usado = _numero(uso, ("agentsUsed", "agents_used", "cloudAgentsUsed", "cloud_agents_used", "used"))
    total = _numero(uso, ("agentsTotal", "agents_total", "cloudAgentsTotal", "cloud_agents_total", "total", "limit"))
    fuente = "API Cloudroom"
    if usado is None:
        usado = len(nube)
    if total is None and gratis and estado:
        total = CUPO_GRATIS
        fuente = "cupo publicado en cloudroom.dev/pricing, sin dato de la API"
    if not estado:
        total = None
    ventanas = []
    if total and usado is not None:
        ventanas.append({"id": "cloudroom_30d", "etiqueta": "Agentes en la nube (30 días): %g/%g" % (usado, total),
                         "usado_pct": round(min(100, usado / total * 100), 1), "reinicia": None,
                         "usado": usado, "total": total})
    ventanas.append({"id": "local", "etiqueta": "Agentes locales: sin límite", "usado_pct": 0, "reinicia": None})
    plan_texto = str(plan or ("gratis" if estado else "sin lectura"))
    total_hilos = _numero(cuenta_hilos, ("count", "total", "threads"))
    agentes = _agentes_harness(estado)
    vistos = set()
    for hilo in ([] if agentes else nube):
        harness = hilo.get("harness", hilo.get("provider", hilo.get("agent")))
        modelo = hilo.get("model", hilo.get("modelId", hilo.get("model_id")))
        if isinstance(harness, dict):
            harness = harness.get("name", harness.get("id"))
        if isinstance(modelo, dict):
            modelo = modelo.get("name", modelo.get("id"))
        clave = (str(harness or "desconocido"), str(modelo or "sin modelo"))
        if clave not in vistos:
            vistos.add(clave)
            agentes.append({"harness": clave[0], "modelo": clave[1]})
    return {"id": "cloudroom", "proveedor": "cloudroom", "nombre": "Cloudroom", "tipo": "plan",
            "plan": plan_texto, "ventanas": ventanas, "saldo": None,
            "extras": {"cuenta": bool(estado.get("account") or estado.get("connected")),
                       "agentes": agentes, "agentes_nube_ciclo": len(nube), "hilos_total": total_hilos},
            "fuente": fuente, "leido": ahora.astimezone().isoformat(), "ok": bool(estado),
            "error": None if estado else "Cloudroom no devolvió el estado del plan"}

def _ruta_cli():
    """La MISMA ruta para disponible() y _correr(): launchd no trae ~/.local/bin en el PATH."""
    declarada = os.environ.get("CLOUDROOM_CLI")
    if declarada:
        return os.path.expanduser(declarada)
    encontrada = shutil.which("room-cli")
    if encontrada:
        return encontrada
    ruta = os.path.expanduser("~/.local/bin/room-cli")
    return ruta if os.path.exists(ruta) else None

def disponible():
    return _ruta_cli() is not None

def _correr(orden):
    cli = _ruta_cli()
    if not cli:
        return ""
    try:
        r = subprocess.run([cli] + list(orden[1:]), capture_output=True, text=True,
                           timeout=15, check=False)
        return r.stdout if r.returncode == 0 else ""
    except (OSError, subprocess.TimeoutExpired):
        return ""

def leer_medidor(cfg, ahora):
    if not disponible():
        return interpretar({}, {}, {}, ahora)
    return interpretar(_correr(["room-cli", "cloud", "status", "--json"]),
                       _correr(["room-cli", "thread", "count", "--json"]),
                       _correr(["room-cli", "thread", "list", "--json",
                                "--include-archived", "--include-hidden"]), ahora)
