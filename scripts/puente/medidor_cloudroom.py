#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Adaptador de créditos de Cloudroom; la lectura se hace con su CLI, sin claves."""
from __future__ import annotations

import json
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
    maquina = hilo.get("machine", hilo.get("machineType", hilo.get("machine_type")))
    if isinstance(maquina, dict):
        maquina = maquina.get("type", maquina.get("name"))
    # (CRM1024H) `room-cli thread list` marca la nube con "executionTarget": "cloud" (machine viene null).
    return (hilo.get("cloud") is True or str(maquina or "").lower() == "cloud"
            or str(hilo.get("executionTarget") or "").lower() == "cloud")
def _fecha(valor):
    # (CRM1024H) createdAt llega en milisegundos desde la época; también se aceptan segundos.
    if isinstance(valor, (int, float)) and not isinstance(valor, bool) and valor > 0:
        try:
            return datetime.fromtimestamp(valor / 1000 if valor > 1e11 else valor, timezone.utc)
        except (OverflowError, OSError, ValueError):
            return None
    if not isinstance(valor, str):
        return None
    try:
        f = datetime.fromisoformat(valor.replace("Z", "+00:00"))
        return f if f.tzinfo else f.replace(tzinfo=timezone.utc)
    except ValueError:
        return None

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
    nube = [h for h in hilos if _en_nube(h) and
            (_fecha(h.get("createdAt", h.get("created_at", h.get("created")))) or
             _fecha(h.get("startedAt", h.get("started_at")))) and
            (_fecha(h.get("createdAt", h.get("created_at", h.get("created")))) or
             _fecha(h.get("startedAt", h.get("started_at")))) >= ciclo]
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
    agentes = []
    vistos = set()
    # (CRM1024H) Los agentes y sus modelos disponibles en la nube salen de `cloud status` → harnesses.
    for h in estado.get("harnesses") or []:
        if isinstance(h, dict) and h.get("id"):
            modelos = [m.get("model") for m in (h.get("models") or []) if isinstance(m, dict) and m.get("model")]
            vistos.add((str(h["id"]), str(h.get("model") or "sin modelo")))
            agentes.append({"harness": str(h["id"]), "modelo": str(h.get("model") or "sin modelo"), "modelos": modelos})
    for hilo in nube:
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

def ruta_cli(entorno=None, existe=None, buscar=None):
    """(CRM1024H) La CLI: CLOUDROOM_CLI, ~/.local/bin/room-cli (launchd no la tiene en el PATH) o el PATH."""
    import os
    entorno = os.environ if entorno is None else entorno
    existe = existe or os.path.exists
    buscar = buscar or shutil.which
    for candidata in (entorno.get("CLOUDROOM_CLI"), os.path.expanduser("~/.local/bin/room-cli")):
        if candidata and existe(candidata):
            return candidata
    return buscar("room-cli")

def disponible():
    return ruta_cli() is not None

def _correr(orden):
    try:
        r = subprocess.run(orden, capture_output=True, text=True, timeout=15, check=False)
        return r.stdout if r.returncode == 0 else ""
    except (OSError, subprocess.TimeoutExpired):
        return ""

def leer_medidor(cfg, ahora):
    if not disponible():
        return interpretar({}, {}, {}, ahora)
    cli = ruta_cli()
    return interpretar(_correr([cli, "cloud", "status", "--json"]),
                       _correr([cli, "thread", "count", "--json"]),
                       # (CRM1024H) los archivados y ocultos también gastaron cupo del ciclo
                       _correr([cli, "thread", "list", "--json", "--include-archived", "--include-hidden"]), ahora)
