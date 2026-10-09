"""Enrutador de puentes de producción §10."""
from __future__ import annotations
import json, os, tempfile
from datetime import datetime
from typing import Any, Dict, List, Optional

STATE_PATH = os.path.expanduser("~/.starseed/produccion/puentes.json")

BRIDGES = [
    {"id": "bandeja", "tipo": "propio", "capacidades": ["avisos"], "env": []},
    {"id": "chat_director", "tipo": "propio", "capacidades": ["avisos"], "env": []},
    {"id": "n8n_hf", "tipo": "externo", "capacidades": ["redes","drive"], "env": ["N8N_HF_URL"], "cupo": 1000},
    {"id": "n8n_cloud", "tipo": "externo", "capacidades": ["redes","drive"], "env": ["N8N_CLOUD_URL"], "cupo": 1000},
]

def activos(entorno: Dict[str,str]) -> List[Dict[str,Any]]:
    res=[]
    for b in BRIDGES:
        if b["tipo"]=="propio":
            res.append(b); continue
        if all(entorno.get(v) for v in b["env"]):
            res.append(b)
    return res

def _cargar():
    if not os.path.exists(STATE_PATH):
        return {}
    with open(STATE_PATH,"r",encoding="utf-8") as f:
        return json.load(f)

def _guardar(estado: Dict[str,Any]):
    d=os.path.dirname(STATE_PATH)
    os.makedirs(d, exist_ok=True)
    tmp=tempfile.NamedTemporaryFile("w",delete=False,dir=d,encoding="utf-8")
    json.dump(estado,tmp,separators=(",",":"))
    tmp.flush(); os.fsync(tmp.fileno()); tmp.close()
    os.replace(tmp.name,STATE_PATH)

def _mes_key(d: datetime) -> str:
    return f"{d.year}-{d.month:02d}"

def _estado_puente(estado, bid):
    return estado.setdefault(bid, {"usos_mes":0,"mes":"","latencia_media":None,"peso":0.5,"fallos_seguidos":0,"ultimo_ok":None,"ultimo_fallo":None})

def actualizar_estado(bid: str, exito: bool, latencia: Optional[float], ahora: datetime):
    estado=_cargar()
    e=_estado_puente(estado,bid)
    mes=_mes_key(ahora)
    if e["mes"]!=mes:
        e["usos_mes"]=0; e["fallos_seguidos"]=0; e["mes"]=mes
    if exito:
        e["usos_mes"]+=1
        e["fallos_seguidos"]=0
        e["ultimo_ok"]=ahora.isoformat()
        if latencia is not None:
            if e["latencia_media"] is None:
                e["latencia_media"]=latencia
            else:
                e["latencia_media"]=e["latencia_media"]*0.8+latencia*0.2
        e["peso"]=min(1.0,max(0.05,e["peso"]+0.1))
    else:
        e["fallos_seguidos"]+=1
        e["ultimo_fallo"]=ahora.isoformat()
        e["peso"]=max(0.05,e["peso"]-0.15)
    _guardar(estado)

def activar_puente(nombre: str, activo: bool):
    estado = _cargar()
    if nombre not in estado:
        estado[nombre] = {}
    estado[nombre]["activo"] = activo
    estado[nombre]["actualizado"] = datetime.utcnow().isoformat()
    _guardar(estado)
    return {"ok": True, "nombre": nombre, "activo": activo}

def obtener_puentes_estado():
    return _cargar()


def _cupo_libre(puente, estado):
    cupo=puente.get("cupo")
    if not cupo: return True
    e=estado.get(puente["id"],{})
    usos=e.get("usos_mes",0)
    return usos < cupo*0.9

def _sort_key(puente, estado):
    e=estado.get(puente["id"],{})
    salud=1 if e.get("fallos_seguidos",0)==0 else 0
    lat=e.get("latencia_media") or 1e9
    peso=e.get("peso",0.5)
    return (-salud, lat, -peso)

def enrutar(evento: str, capacidad: str, datos: Any, entorno: Optional[Dict[str,str]]=None, enviar=None, ahora: Optional[datetime]=None):
    # (2026-10-09, dirección) El valor por defecto era un dict MUTABLE y mal formado
    # ({"args": {"env": {}}}): compartido entre llamadas y sin ninguna variable real, así que
    # sin `entorno` nunca se activaba un puente externo. Sin `entorno`, el del proceso.
    entorno = dict(os.environ) if entorno is None else entorno
    ahora=ahora or datetime.utcnow()
    estado=_cargar()
    candidatos=[b for b in activos(entorno) if capacidad in b["capacidades"]]
    if evento=="avisos":
        candidatos=[b for b in candidatos if b["tipo"]=="propio"]
    candidatos=[b for b in candidatos if _cupo_libre(b,estado)]
    candidatos.sort(key=lambda b: _sort_key(b,estado))
    for b in candidatos:
        ok,lat=False,None
        if enviar:
            ok,lat=enviar(b,datos)
        actualizar_estado(b["id"],ok,lat,ahora)
        if ok:
            return {"puente":b["id"],"ok":True}
    return {"puente":None,"ok":False,"motivo":"sin puentes"}


def activar_puente(nombre: str, activo: bool):
    estado = _cargar()
    if nombre not in estado:
        estado[nombre] = {}
    estado[nombre]["activo"] = activo
    estado[nombre]["actualizado"] = datetime.utcnow().isoformat()
    _guardar(estado)
    return {"ok": True, "nombre": nombre, "activo": activo}


def obtener_puentes_estado():
    return _cargar()
