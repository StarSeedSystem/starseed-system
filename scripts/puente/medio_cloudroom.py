#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Sonda del medio Cloudroom para MetaGenesis (ola 1024C). Sin claves ni red propia.
Localiza `room-cli` (~/.local/bin/room-cli o CLOUDROOM_CLI) y lee, con tope de 15 s,
`status --json`, `cloud status --json` y, si existe, `thread count --json`. Las salidas se
interpretan en funciones puras y se devuelven con la forma de `medios_disponibles.py`."""
from __future__ import annotations

import json
import os
import subprocess

ESTADOS = ("listo", "usable", "requiere_alex", "no_disponible")
CUPO_GRATIS = 100
CAPACIDAD = "100 agentes en la nube cada 30 días (plan gratis) · locales gratis e ilimitados"


def medio(estado: str, capacidad: str, detalle: str, siguiente: str = "") -> dict:
    assert estado in ESTADOS
    return {"id": "cloudroom", "nombre": "Cloudroom", "estado": estado, "capacidad": capacidad,
            "detalle": detalle, "siguiente_paso": siguiente}


def localizar(env: dict, casa: str = "/") -> str | None:
    """CLOUDROOM_CLI manda; si no, ~/.local/bin/room-cli; si no existe, None."""
    ruta = str(env.get("CLOUDROOM_CLI") or "").strip()
    candidata = os.path.join(casa, ".local", "bin", "room-cli")
    return ruta or (candidata if os.path.exists(candidata) else None)


def _datos(valor):
    """JSON (texto, dict o lista) → dict/lista; envuelve `data` y descarta lo inválido."""
    if isinstance(valor, str):
        try:
            valor = json.loads(valor)
        except ValueError:
            return {}
    if isinstance(valor, dict) and isinstance(valor.get("data"), (dict, list)):
        return valor["data"]
    return valor if isinstance(valor, (dict, list)) else {}


def _numero(datos: dict, claves: tuple[str, ...]) -> int | None:
    for clave in claves:
        n = datos.get(clave)
        if isinstance(n, (int, float)) and not isinstance(n, bool) and n >= 0:
            return int(n)
    return None


def _hilos(valor) -> int | None:
    datos = _datos(valor)
    return len(datos) if isinstance(datos, list) else _numero(
        datos, ("count", "total", "threads", "open", "abiertos"))


def interpretar(estado_txt, nube_txt, hilos_txt, nota: str = "") -> dict:
    """PURA: salidas JSON simuladas → medio. `nota` explica por qué falta la CLI."""
    estado = _datos(estado_txt)
    if not isinstance(estado, dict) or not estado:
        return medio("no_disponible", CAPACIDAD,
                     nota or "sin respuesta de `room-cli status`: app cerrada o servidor local sin arrancar",
                     "instalar y abrir Cloudroom (macOS Apple Silicon o Linux x64)")
    nube = _datos(nube_txt)
    if not isinstance(nube, dict) or not nube or nube.get("loggedIn") is False or nube.get("connected") is False:
        return medio("requiere_alex", CAPACIDAD,
                     nota or "sin iniciar sesión en Cloudroom: `cloud status` no devolvió cuenta",
                     "iniciar sesión en cloudroom.dev desde la app (lo hace la persona)")
    cuenta = nube.get("account") or nube.get("email") or nube.get("user")
    if isinstance(cuenta, dict):
        cuenta = cuenta.get("name") or cuenta.get("email") or cuenta.get("id")
    uso = nube.get("planUsage") or nube.get("plan_usage") or estado.get("planUsage") or {}
    uso = uso if isinstance(uso, dict) else {}
    usado = _numero(uso, ("agentsUsed", "agents_used", "cloudAgentsUsed", "cloud_agents_used", "used"))
    total = _numero(uso, ("agentsTotal", "agents_total", "cloudAgentsTotal", "cloud_agents_total", "total", "limit"))
    plan_obj = nube.get("plan") or estado.get("plan")
    plan = plan_obj.get("name", plan_obj.get("label")) if isinstance(plan_obj, dict) else plan_obj
    total = CUPO_GRATIS if total is None and not plan else total
    capacidad = CAPACIDAD
    if usado is not None and total: capacidad += " · %d/%d usados en el ciclo" % (usado, total)
    capacidad += " · plan %s" % plan if plan and str(plan).strip().lower() not in ("free", "gratis") else ""
    hilos = _hilos(hilos_txt)
    servidor = estado.get("server") if isinstance(estado.get("server"), dict) else {}
    puerto = estado.get("port") or estado.get("puerto") or servidor.get("port")
    detalle = "cuenta %s" % (cuenta or "conectada")
    if puerto: detalle += " · servidor local %s" % puerto
    detalle += " · %d hilo(s) abierto(s)" % hilos if hilos is not None else " · hilos sin dato"
    if total and usado is not None and usado >= total:
        return medio("requiere_alex", capacidad, "cupo agotado: " + detalle,
                     "esperar el reinicio del ciclo de 30 días o usar otro medio")
    return medio("listo" if hilos else "usable", capacidad, detalle,
                 "" if hilos else "lanzar un hilo: room-cli thread spawn …")


def _correr(orden: list[str], timeout: int = 15) -> tuple[int, str]:
    try:
        p = subprocess.run(orden, capture_output=True, text=True, timeout=timeout)
        return p.returncode, (p.stdout or "").strip()
    except (OSError, subprocess.TimeoutExpired):
        return 1, ""


def sondear(env: dict | None = None, casa: str | None = None, correr=None) -> dict:
    """Sonda real (o con `correr` inyectado en pruebas); nunca lanza excepción."""
    env = os.environ if env is None else env
    casa = os.path.expanduser("~") if casa is None else casa
    correr = correr or _correr
    ruta = localizar(env, casa)
    if not ruta:
        return interpretar("", "", "", "app sin instalar: no hay ~/.local/bin/room-cli ni CLOUDROOM_CLI")
    rc_estado, estado = correr([ruta, "status", "--json"], 15)
    rc_nube, nube = correr([ruta, "cloud", "status", "--json"], 15)
    rc_hilos, hilos = correr([ruta, "thread", "count", "--json"], 15)
    if rc_estado != 0:
        return interpretar("", "", "", "app sin abrir: `room-cli status` no responde (¿Cloudroom cerrado?)")
    nube = nube if rc_nube == 0 else ""
    hilos = hilos if rc_hilos == 0 else ""
    return interpretar(estado, nube, hilos)

