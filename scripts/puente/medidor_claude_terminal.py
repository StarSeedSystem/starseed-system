#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Adaptador Claude por terminal (CLA1126A).

- Usa CLAUDE_CODE_OAUTH_TOKEN de ~/.starseed/env si existe (token de larga duración).
- Respeta el cerrojo flock: no se ejecuta si otro `claude` automático está corriendo.
- Como mucho una ejecución cada 30 minutos (persiste timestamp en ~/.starseed/medidor-claude-ultimo.json).
- Si sale "Not logged in", envía UN solo aviso al canal Principal (vía Telegram) y no reintenta en bucle.
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import time
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import motores_director

# CLA1126A: cerrojo y token para uso automático de claude
try:
    from claude_cerrojo import (
        esta_ocupado,
        leer_entorno_claude_token,
        detectar_no_logueado,
        avisar_no_logueado,
    )
except ImportError:
    def esta_ocupado(*a, **k):
        return False
    def leer_entorno_claude_token(*a, **k):
        return None
    def detectar_no_logueado(salida):
        return False
    def avisar_no_logueado(*a, **k):
        pass

_LINE_RE = re.compile(r"Current (?P<ventana>.+?): (?P<pct>\d+)% used · resets (?P<mes>\w+) (?P<dia>\d+) at (?P<hora>\d{1,2}(?::\d{2})?(?:am|pm)) \((?P<zona>[^)]+)\)")
# SUP1113B (13-11): con la ventana de 5 h sin empezar, la línea de la sesión puede llegar sin «· resets …».
_SESION_SIN_REINICIO_RE = re.compile(r"^Current session: (?P<pct>\d+)% used\s*$")
_MONTHS = {"jan":1,"feb":2,"mar":3,"apr":4,"may":5,"jun":6,"jul":7,"aug":8,"sep":9,"oct":10,"nov":11,"dec":12}

# Intervalo mínimo entre ejecuciones del medidor (30 minutos = 1800 segundos).
INTERVALO_MINIMO_S = 1800
# Archivo donde se persiste el timestamp de la última ejecución exitosa.
ULTIMO_EJECUCION_RUTA = Path.home() / ".starseed" / "medidor-claude-ultimo.json"


def _parse_hour(s:str)->tuple[int,int]:
    s=s.strip().lower()
    suf="am" if s.endswith("am") else "pm"
    core=s[:-2]
    if ":" in core:
        h_str,m_str=core.split(":")
        h,m=int(h_str),int(m_str)
    else:
        h,m=int(core),0
    if suf=="am":
        if h==12:h=0
    else:
        if h!=12:h+=12
    return h,m


def _año_para(año:int,mes:int,dia:int,h:int,mnt:int,zona:ZoneInfo,ahora:datetime)->int:
    fecha=datetime(año,mes,dia,h,mnt,tzinfo=zona)
    diff=(ahora.astimezone(zona)-fecha).days
    if diff>200:return año+1
    if diff<-200:return año-1
    return año


def interpretar(texto:str,ahora:datetime)->dict:
    ventanas=[];lineas=0;plan_ok="using your subscription" in texto.lower()
    for linea in texto.splitlines():
        m=_LINE_RE.search(linea)
        if not m:
            ms=_SESION_SIN_REINICIO_RE.search(linea.strip())
            if ms:ventanas.append({"id":"sesion","etiqueta":"Sesión (5 h)","usado_pct":int(ms.group("pct")),"reinicia":None})
            elif linea.strip().startswith("Current"):lineas+=1
            continue
        vd=m.group("ventana").strip();pct=int(m.group("pct"))
        mes=_MONTHS.get(m.group("mes").lower()[:3]);dia=int(m.group("dia"))
        if not mes:lineas+=1;continue
        try:zona=ZoneInfo(m.group("zona"))
        except Exception:lineas+=1;continue
        h,mnt=_parse_hour(m.group("hora"))
        año=_año_para(ahora.year,mes,dia,h,mnt,zona,ahora)
        fecha_local=datetime(año,mes,dia,h,mnt,tzinfo=zona)
        if "session" in vd.lower():
            vid,etiq="sesion","Sesión (5 h)"
        elif "week (all models)" in vd.lower():
            vid,etiq="semana","Semana (todos los modelos)"
        elif "week (" in vd.lower():
            modelo=vd.split("week (")[-1].rstrip(")").strip()
            vid,etiq=f"semana-{modelo.lower()}",f"Semana ({modelo})"
        else:lineas+=1;continue
        ventanas.append({"id":vid,"etiqueta":etiq,"usado_pct":pct,"reinicia":fecha_local.isoformat()})
    extras={"lineas_sin_entender":lineas} if lineas else {}
    base={"id":"claude","proveedor":"anthropic","nombre":"Claude · plan","tipo":"plan","enlace":"https://claude.ai/settings/usage","fuente":"terminal: claude -p /usage","leido":ahora.isoformat(),"saldo":None,"extras":extras,"ventanas":[]}
    if not plan_ok and not ventanas:
        bajo=texto.lower()
        if "total cost:" in bajo and "current" not in bajo:
            # DIR1111N (2026-11-11): `claude -p /usage` sin sesión iniciada (o sin plan) solo cuenta la sesión
            # (coste, duración, tokens a 0): no trae los límites. Decirlo así evita buscar el fallo en otro sitio.
            base.update({"ok":False,"obsoleto":False,"plan":None,
                         "error":"claude -p /usage solo da el coste de la sesión, no los límites: sin sesión iniciada en esta cuenta (claude auth status)"})
            return base
    if not plan_ok:
        base.update({"ok":False,"obsoleto":False,"error":"claude no está usando la suscripción","plan":None})
        return base
    if not ventanas:
        base.update({"ok":False,"obsoleto":False,"error":"sin datos de uso","plan":"suscripción"})
        return base
    base.update({"ok":True,"obsoleto":False,"error":None,"plan":"suscripción","ventanas":ventanas})
    return base


def _leer_ultimo_timestamp() -> float:
    """Lee el timestamp de la última ejecución exitosa."""
    try:
        with open(ULTIMO_EJECUCION_RUTA, encoding="utf-8") as f:
            datos = json.load(f)
            return float(datos.get("timestamp", 0))
    except (OSError, ValueError, TypeError):
        return 0.0


def _guardar_ultimo_timestamp(ts: float) -> None:
    """Guarda el timestamp de la última ejecución exitosa."""
    try:
        ULTIMO_EJECUCION_RUTA.parent.mkdir(parents=True, exist_ok=True)
        with open(ULTIMO_EJECUCION_RUTA, "w", encoding="utf-8") as f:
            json.dump({"timestamp": ts}, f)
    except OSError:
        pass


def _debe_ejecutarse(ahora_ts: float = None) -> bool:
    """True si ha pasado el intervalo mínimo desde la última ejecución."""
    ahora_ts = ahora_ts or time.time()
    ultimo = _leer_ultimo_timestamp()
    return (ahora_ts - ultimo) >= INTERVALO_MINIMO_S


def leer(
    config=None,
    ahora=None,
    ejecutar=subprocess.run,
    entorno=None,
    home=None,
    canal_decir=None,
    tarea_id=None,
) -> dict:
    """Lee el uso de Claude Code.

    Args:
        config: No usado (compatibilidad).
        ahora: datetime para tests.
        ejecutar: Callable para ejecutar el comando (inyectable para tests).
        entorno: Dict de variables de entorno (inyectable para tests).
        home: Directorio home (inyectable para tests).
        canal_decir: Callable para enviar aviso al canal Principal (inyectable).
        tarea_id: ID de la tarea para el aviso.

    Returns:
        Dict con el resultado del medidor.
    """
    ahora_dt = ahora or datetime.now().astimezone()
    ahora_ts = time.time()
    home_path = home or os.path.expanduser("~")

    # 1. Intervalo mínimo: no ejecutar si no han pasado 30 min desde la última vez.
    if not _debe_ejecutarse(ahora_ts):
        return _medidor_error(ahora_dt, "intervalo mínimo no cumplido (30 min)")

    # 2. Cerrojo: no ejecutar si otro claude automático está corriendo.
    if esta_ocupado():
        return _medidor_error(ahora_dt, "otro claude automático en ejecución (cerrojo ocupado)")

    # 3. Preparar entorno: quitar claves API + añadir CLAUDE_CODE_OAUTH_TOKEN si existe.
    entrada_dir = os.path.join(home_path, ".starseed", "medidores-entrada")
    os.makedirs(entrada_dir, exist_ok=True)
    env_base = dict(entorno or os.environ)
    env = motores_director.entorno_sin_claves_api(env_base)
    # Añadir token de larga duración si existe.
    token = leer_entorno_claude_token()
    if token:
        env["CLAUDE_CODE_OAUTH_TOKEN"] = token
    bin_path = os.path.join(home_path, ".local", "bin")
    env["PATH"] = bin_path + (":" + env.get("PATH", "") if env.get("PATH") else "")

    # 4. Ejecutar claude -p /usage.
    try:
        r = ejecutar(
            ["claude", "-p", "/usage"],
            stdin=subprocess.DEVNULL,
            capture_output=True,
            text=True,
            timeout=60,
            cwd=entrada_dir,
            env=env,
        )
    except FileNotFoundError:
        return _medidor_error(ahora_dt, "claude no encontrado")
    except subprocess.TimeoutExpired:
        return _medidor_error(ahora_dt, "timeout al leer claude")
    except Exception:
        return _medidor_error(ahora_dt, "error al ejecutar claude")

    if r.returncode != 0:
        return _medidor_error(ahora_dt, "claude devolvió error")

    salida = r.stdout or ""

    # 5. Detectar "Not logged in" y enviar aviso único.
    if detectar_no_logueado(salida):
        if canal_decir:
            avisar_no_logueado(canal_decir, tarea_id)
        return _medidor_error(ahora_dt, "claude no está logueado: ejecute 'claude auth login' o 'claude setup-token' en la Mac")

    # 6. Interpretar y guardar timestamp de éxito.
    resultado = interpretar(salida, ahora_dt)
    _guardar_ultimo_timestamp(ahora_ts)
    return resultado


def _medidor_error(ahora:datetime, msg:str)->dict:
    return {"id":"claude","proveedor":"anthropic","nombre":"Claude · plan","tipo":"plan","enlace":"https://claude.ai/settings/usage","fuente":"terminal: claude -p /usage","leido":ahora.isoformat(),"ok":False,"obsoleto":False,"error":msg,"saldo":None,"extras":{},"plan":None,"ventanas":[]}


# ── Funciones puras para tests ──────────────────────────────────────────────

def reset_ultimo_timestamp_para_tests() -> None:
    """Borra el archivo de timestamp (solo para tests)."""
    try:
        ULTIMO_EJECUCION_RUTA.unlink()
    except OSError:
        pass


def _debe_ejecutarse_puro(ultimo_ts: float, ahora_ts: float, intervalo: int = INTERVALO_MINIMO_S) -> bool:
    """Versión pura de _debe_ejecutarse para tests."""
    return (ahora_ts - ultimo_ts) >= intervalo