#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Director de autodesarrollo: imagina, decide y asigna (IMN1021D, §5).
Contratos: architecture/imaginacion-autodesarrollo.md §5; puro sin red ni disco donde se pueda,
reloj y lanzadores por parámetro, escritura atómica con tmp + os.replace, cerrojo propio en
~/.starseed/cerrojos/autodesarrollo.lock."""
from __future__ import annotations
import json, os, subprocess, sys, tempfile, time
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Módulos puros del proyecto
import autodesarrollo_logica as AL
import autodesarrollo_decidir as AD
import autodesarrollo_fuentes as AF

AJUSTES_PATH = os.path.expanduser("~/.starseed/autodesarrollo.json")
ENCARGADO_PATH = os.path.expanduser("~/.starseed/dream-encargado.json")
PROPUESTA_DIR = "starseed_memory_root/imaginacion"
COLA_DIR = "olas"
LOCK_FILE = os.path.expanduser("~/.starseed/cerrojos/autodesarrollo.lock")


def _leer_ajustes(ruta=AJUSTES_PATH) -> dict:
    try:
        with open(ruta, "r", encoding="utf-8") as f:
            d = json.load(f)
        return AL.validar_ajustes(d)
    except Exception:
        return AL.validar_ajustes({})


def _recolectar_propuestas(fecha_str, ya_encargadas=(), datos_diaria=None, datos_profunda=None, datos_astraura=None, datos_directores=None):
    ya = set(str(k) for k in (ya_encargadas or ()) if str(k))
    fuera = []
    # Fuente diaria (texto md del informe)
    md = datos_diaria if datos_diaria is not None else ""
    fuera.extend(AF.de_diaria(md, fecha_str, tuple(ya)))
    # Fuente profunda (consolidado json)
    prof = datos_profunda if datos_profunda is not None else {}
    fuera.extend(AF.de_profunda(prof, fecha_str, tuple(ya)))
    # Fuente astraura (status dict del backend)
    ast = datos_astraura if datos_astraura is not None else {}
    fuera.extend(AF.de_astraura(ast, fecha_str, tuple(ya)))
    # Fuente directores (revisor dict)
    dir_ = datos_directores if datos_directores is not None else {}
    fuera.extend(AF.de_directores(dir_, fecha_str, tuple(ya)))
    # Eliminar duplicados por id
    vistas = set(); unicas = []
    for p in fuera:
        pid = p.get("id", "")
        if pid and pid not in vistas:
            vistas.add(pid); unicas.append(p)
    return unicas

def _escribir_atomo(ruta, d):
    os.makedirs(os.path.dirname(ruta) or ".", exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(ruta) or ".", prefix=".tmp_")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(d, f, ensure_ascii=False); f.write("\n")
        os.replace(tmp, ruta)
    except Exception:
        try: os.unlink(tmp)
        except: pass
        raise

def ciclo(seco=False, json=False, ahora=None, capacidad=None, lanzador_diario=None, lanzador_profundo=None, existe_ruta=None, datos_diaria=None, datos_profunda=None, datos_astraura=None, datos_directores=None):
    """Ciclo principal (§5). Devuelve dict con el resultado."""
    if ahora is None:
        ahora = datetime.now()
    ajustes = _leer_ajustes()
    if capacidad is None:
        capacidad = {}
    # 1. Toca imaginar (medido con horario y capacidad)
    toca, motivo_toca = AL.toca_ejecutar(ahora, ajustes.get("horario", {}), capacidad)
    # Lanzadores (reales o inyectados por pruebas)
    lanzado_diario = lanzado_profundo = False
    if toca:
        if lanzador_diario:
            lanzador_diario(); lanzado_diario = True
        if lanzador_profundo and ajustes.get("profunda", {}).get("cada_dias", 7) > 0:
            lanzador_profundo(); lanzado_profundo = True
    fecha_str = ahora.strftime("%Y%m%d")
    # 2. Propuestas de las 4 fuentes
    propuestas = _recolectar_propuestas(fecha_str, ya_encargadas=(), datos_diaria=datos_diaria, datos_profunda=datos_profunda, datos_astraura=datos_astraura, datos_directores=datos_directores)
    # 3. Utilidad, importancia, destino (puro con AD)
    if existe_ruta is None:
        def _existe_local(r): return os.path.isfile(r) if r.startswith("/") else os.path.isfile(os.path.join(os.path.dirname(__file__), "..", "..", r))
        existe_ruta = _existe_local
    elegidas = []; para_aprobacion = []; preguntas = []
    for p in propuestas:
        valor, motivo = AD.utilidad(p, existe_ruta); p["utilidad"] = round(valor, 4); p["motivo_utilidad"] = motivo
        p["importancia"] = AD.importancia(p)
        d = AD.destino(p, ajustes.get("automatico", True), existe_ruta)
        p["destino"] = d["destino"]; p["aprobacion_diff"] = d.get("aprobacion_diff", False); p["motivo_destino"] = d.get("motivo", "")
        if d["destino"] == "autodesarrollo": elegidas.append(p)
        elif d["destino"] == "esperando-aprobacion": para_aprobacion.append(p)
        elif d["destino"] == "pregunta": preguntas.append(p)
    max_rango = ajustes.get("rango", {}).get("max", 10)
    elegidas = sorted([p for p in elegidas if p.get("utilidad", 0) >= AD.UMBRAL_UTIL], key=lambda p: (-p.get("utilidad", 0), p.get("id", "")))[:max_rango]
    # 4. Escritura atómica
    archivo_prop = os.path.join(PROPUESTA_DIR, "propuestas.json")
    if not seco:
        contenido_prop = {"fecha": fecha_str, "ahora": ahora.isoformat(), "toca_ejecutar": toca, "motivo_toca": motivo_toca, "propuestas": propuestas, "elegidas": elegidas, "esperando_aprobacion": para_aprobacion, "preguntas": preguntas}
        _escribir_atomo(archivo_prop, contenido_prop)
        if elegidas:
            sufijo = ahora.strftime("%Y%m%d-%H%M")
            archivo_cola = os.path.join(COLA_DIR, f"cola-imaginacion-{fecha_str}-{sufijo}.json")
            contenido_cola = {"id_cola": f"cola-imaginacion-{fecha_str}-{sufijo}", "fecha": fecha_str, "creado": ahora.isoformat(), "tareas": [{"id": p.get("id", ""), "titulo": p.get("titulo", ""), "archivo": p.get("archivos", [""])[0] if p.get("archivos") else "", "prompt_inicio": "Comprueba si sigue haciendo falta; si ya está hecho, responde NO APLICA", "aprobacion": p.get("aprobacion_diff", False)} for p in elegidas]}
            _escribir_atomo(archivo_cola, contenido_cola)
    sufijo_cola = ahora.strftime("%Y%m%d-%H%M")
    colas_creadas = [os.path.join(COLA_DIR, f"cola-imaginacion-{fecha_str}-{sufijo_cola}.json")] if not seco and elegidas else []
    # 5. Resultado
    return {"ahora": ahora.isoformat(), "toca_ejecutar": toca, "motivo_toca": motivo_toca, "lanzado_diario": lanzado_diario, "lanzado_profundo": lanzado_profundo, "propuestas_recogidas": len(propuestas), "autodesarrolladas": len(elegidas), "esperando_aprobacion": len(para_aprobacion), "preguntas": len(preguntas), "archivo_propuestas": archivo_prop, "colas_creadas": colas_creadas, "rango_aplicado": {"min": ajustes.get("rango", {}).get("min", 0), "max": ajustes.get("rango", {}).get("max", 10), "elegidas": len(elegidas)}}
