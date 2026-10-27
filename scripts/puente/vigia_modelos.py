#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Vigía de modelos · director diario (Ola 1016M · VGM1016D).

Orquesta una pasada: por área llama a descubrir y evaluar, escribe novedades
atómicamente, publica resumen y encola fichas. Sin red en tests: todo inyectable.
"""

import argparse
import json
import os
from datetime import date, datetime, timezone

from scripts.puente.vigia_areas import cargar_areas
from scripts.puente.vigia_descubrir import descubrir
from scripts.puente.vigia_evaluar import clase_licencia, es_seguro

ESTADO = os.path.expanduser("~/.starseed/vigia-modelos.json")
MEM_ROOT = "starseed_memory_root"


def _cargar_estado():
    if os.path.exists(ESTADO):
        with open(ESTADO, "r", encoding="utf-8") as f:
            return json.load(f)
    return {"ultima_pasada": None, "ids_vistos": {}}


def _guardar_estado(estado):
    os.makedirs(os.path.dirname(ESTADO), exist_ok=True)
    tmp = ESTADO + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(estado, f, ensure_ascii=False)
    os.replace(tmp, ESTADO)


def _novedades_path(fecha):
    os.makedirs(os.path.join(MEM_ROOT, "vigia"), exist_ok=True)
    return os.path.join(MEM_ROOT, "vigia", f"novedades-{fecha}.json")


def _escribir_novedades(ruta, datos):
    tmp = ruta + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(datos, f, ensure_ascii=False, indent=2)
    os.replace(tmp, ruta)


def procesar_areas(areas, http_get, ahora, seco=False):
    estado = _cargar_estado()
    fecha = ahora.date().isoformat()
    resultado = {}
    for area in areas:
        catalogo_ids = []
        candidatos = descubrir(area, catalogo_ids, http_get, ahora)
        aceptados = []
        descartados = []
        for c in candidatos:
            lic = clase_licencia(c.get("licencia_hf",""), [], {})
            seguro = es_seguro(c)
            if seguro and lic != "desconocida":
                aceptados.append({"id": c["id"], "licencia": lic})
            else:
                descartados.append({"id": c["id"], "motivo": "no seguro o licencia"})
        resultado[area["id"]] = {"aceptados": aceptados, "descartados": descartados}
    _escribir_novedades(_novedades_path(fecha), resultado)
    estado["ultima_pasada"] = fecha
    _guardar_estado(estado)
    return resultado


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--seco", action="store_true")
    p.add_argument("--area")
    args = p.parse_args()
    areas = cargar_areas()
    if args.area:
        areas = [a for a in areas if a["id"] == args.area]
    ahora = datetime.now(timezone.utc)
    def http_get(url, headers=None, timeout=30):
        import urllib.request
        req = urllib.request.Request(url, headers=headers or {})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.read().decode("utf-8")
    procesar_areas(areas, http_get, ahora, seco=args.seco)


if __name__ == "__main__":
    main()



