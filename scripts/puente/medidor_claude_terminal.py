#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Adaptador Claude por terminal."""

from __future__ import annotations

import os
import re
import subprocess
from datetime import datetime
from zoneinfo import ZoneInfo

import motores_director

_LINE_RE = re.compile(r"Current (?P<ventana>.+?): (?P<pct>\d+)% used · resets (?P<mes>\w+) (?P<dia>\d+) at (?P<hora>\d{1,2}(?::\d{2})?(?:am|pm)) \((?P<zona>[^)]+)\)")
_MONTHS = {"jan":1,"feb":2,"mar":3,"apr":4,"may":5,"jun":6,"jul":7,"aug":8,"sep":9,"oct":10,"nov":11,"dec":12}

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
            if linea.strip().startswith("Current"):lineas+=1
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
    if not plan_ok:
        base.update({"ok":False,"obsoleto":False,"error":"claude no está usando la suscripción","plan":None})
        return base
    if not ventanas:
        base.update({"ok":False,"obsoleto":False,"error":"sin datos de uso","plan":"suscripción"})
        return base
    base.update({"ok":True,"obsoleto":False,"error":None,"plan":"suscripción","ventanas":ventanas})
    return base

def leer(config=None,ahora=None,ejecutar=subprocess.run,entorno=None,home=None)->dict:
    ahora=ahora or datetime.now().astimezone()
    home=home or os.path.expanduser("~")
    entrada_dir=os.path.join(home,".starseed","medidores-entrada")
    os.makedirs(entrada_dir,exist_ok=True)
    env=motores_director.entorno_sin_claves_api(dict(entorno or os.environ))
    bin_path=os.path.join(home,".local","bin")
    env["PATH"]=bin_path+(":"+env.get("PATH","") if env.get("PATH") else "")
    try:
        r=ejecutar(["claude","-p","/usage"],stdin=subprocess.DEVNULL,capture_output=True,text=True,timeout=60,cwd=entrada_dir,env=env)
    except FileNotFoundError:return _medidor_error(ahora,"claude no encontrado")
    except subprocess.TimeoutExpired:return _medidor_error(ahora,"timeout al leer claude")
    except Exception:return _medidor_error(ahora,"error al ejecutar claude")
    if r.returncode!=0:return _medidor_error(ahora,"claude devolvió error")
    return interpretar(r.stdout or "",ahora)

def _medidor_error(ahora:datetime,msg:str)->dict:
    return {"id":"claude","proveedor":"anthropic","nombre":"Claude · plan","tipo":"plan","enlace":"https://claude.ai/settings/usage","fuente":"terminal: claude -p /usage","leido":ahora.isoformat(),"ok":False,"obsoleto":False,"error":msg,"saldo":None,"extras":{},"plan":None,"ventanas":[]}
