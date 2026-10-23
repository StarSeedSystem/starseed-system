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


def ciclo(seco=False, json=False, ahora=None, capacidad=None, lanzador_diario=None, lanzador_profundo=None, existe_ruta=None):
    """Ciclo principal (§5). Devuelve dict con el resultado."""
    if ahora is None:
        ahora = datetime.now()
    ajustes = _leer_ajustes()
    if capacidad is None:
        capacidad = {}
    # 1. Toca imaginar (medido con horario y capacidad)
    toca, motivo_toca = AL.toca_ejecutar(ahora, ajustes.get("horario", {}), capacidad)
    # Lanzadores inyectados (por defecto los reales, en pruebas se inyectan)
    diario = lanzador_diario or (lambda: subprocess.run(["bash", os.path.expanduser("~/.hermes/scripts/starseed-dream.sh")], capture_output=True))
    profundo = lanzador_profundo or (lambda: subprocess.run([sys.executable, "scripts/puente/suenos.py", "lanzar"], capture_output=True))
    lanzado_diario = False
    lanzado_profundo = False
    # 2. Recoge propuestas (4 fuentes, con lo ya encargado como filtro)
    propuestas = []
    # 3. Utilidad, importancia, destino (puro con AD)
    resultado = {
        "ahora": ahora.isoformat(),
        "toca_ejecutar": toca,
        "motivo_toca": motivo_toca,
        "lanzado_diario": lanzado_diario,
        "lanzado_profundo": lanzado_profundo,
        "propuestas_recogidas": len(propuestas),
        "autodesarrolladas": 0,
        "esperando_aprobacion": 0,
        "preguntas": 0,
        "archivo_propuestas": PROPUESTA_DIR + "/propuestas.json",
    }
    return resultado
