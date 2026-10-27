#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Vigía de modelos y versiones: director diario (Ola 1016M · VGM1016D)."""

import argparse
import json
import os
import tempfile
from datetime import datetime, timezone

from vigia_areas import cargar_areas
from vigia_descubrir import descubrir
from vigia_evaluar import clase_licencia, es_seguro, puntuar

RAIZ_REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MEM_ROOT = os.path.join(RAIZ_REPO, "starseed_memory_root")
VIGIA_DIR = os.path.join(MEM_ROOT, "vigia")
STATE_PATH = os.path.expanduser("~/.starseed/vigia-modelos.json")

def _ahora_utc():
    return datetime.now(timezone.utc)

def _cargar_estado():
    if os.path.isfile(STATE_PATH):
        try:
            with open(STATE_PATH, encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {}
    return {}

def _guardar_estado(estado):
    os.makedirs(os.path.dirname(STATE_PATH), exist_ok=True)
    tmp = STATE_PATH + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(estado, f, ensure_ascii=False)
    os.replace(tmp, STATE_PATH)

def _escribir_atomico(ruta, datos):
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    tmp = ruta + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(datos, f, ensure_ascii=False, indent=2)
    os.replace(tmp, ruta)

def evaluar_candidato(candidato, area, licencias_conocidas):
    lic = clase_licencia(candidato.get("licencia_hf", ""), [], licencias_conocidas)
    seguro = es_seguro(candidato, [])
    punt, motivo = puntuar({}, {})
    return {"id": candidato.get("id"), "licencia_clase": lic, "seguro": seguro, "puntuacion": punt, "motivo": motivo}

def pasar_vigia(areas, catalogo_ids_por_area, http_get, ahora=None, seco=False, area_filtro=None):
    if ahora is None:
        ahora = _ahora_utc()
    novedades = {}
    for area in areas:
        if area_filtro and area["id"] != area_filtro:
            continue
        catalogo_ids = catalogo_ids_por_area.get(area["id"], [])
        candidatos = descubrir(area, catalogo_ids, http_get, ahora)
        aceptados = []
        descartados = []
        for c in candidatos:
            ev = evaluar_candidato(c, area, area.get("licencias_conocidas", {}))
            if ev["seguro"] and ev["licencia_clase"] != "desconocida":
                aceptados.append(ev)
            else:
                descartados.append(ev)
        novedades[area["id"]] = {"aceptados": aceptados, "descartados": descartados}
    return novedades

def _resumen(novedades):
    total = sum(len(v["aceptados"]) for v in novedades.values())
    return f"vigia-modelos: {total} candidatos aceptados en {len(novedades)} áreas"

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--seco", action="store_true")
    parser.add_argument("--area")
    args = parser.parse_args()
    areas = cargar_areas()
    import urllib.request
    def http_get(url, headers=None, timeout=30):
        req = urllib.request.Request(url, headers=headers or {})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.read().decode("utf-8")
    catalogo_ids = {}
    novedades = pasar_vigia(areas, catalogo_ids, http_get, seco=args.seco, area_filtro=args.area)
    fecha = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    ruta = os.path.join(VIGIA_DIR, f"novedades-{fecha}.json")
    if not args.seco:
        _escribir_atomico(ruta, {"fecha": fecha, "novedades": novedades})
        _guardar_estado({"ultima_pasada": fecha})
    print(_resumen(novedades))

if __name__ == "__main__":
    main()
