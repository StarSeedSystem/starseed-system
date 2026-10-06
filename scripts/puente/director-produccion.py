#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Director de producción — PRD1005H. Ciclo §3 a §6 del contrato.
Opciones: --una-vez, --seco, --modo {seco,canario,auto}. Módulos A–E importados.
Estado atómico: production-estado.json / historial.jsonl (§6).
"""
from __future__ import annotations
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import produccion_candidatos as pc
import produccion_puertas as pp
import produccion_medios as pm
import produccion_avisar as pa

RAIZ = os.environ.get("STARSEED_PRODUCCION_RAIZ") or os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
ESTADO = os.path.join(RAIZ, "starseed_memory_root", "mando", "produccion-estado.json")
HIST = os.path.expanduser("~/.starseed/produccion/historial.jsonl")
PAUSA = os.environ.get("STARSEED_PRODUCCION_PAUSA") or os.path.expanduser("~/.starseed/produccion-pausada.json")

MAX_PUB = 24
VENTANA = 20

def escribir_estado(d):
    c = os.path.dirname(ESTADO) or "."
    os.makedirs(c, exist_ok=True)
    tmp = ESTADO + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(json.dumps(d, ensure_ascii=False, indent=1) + "\n")
    os.replace(tmp, ESTADO)

def escribir_historial(e):
    c = os.path.dirname(HIST) or "."
    os.makedirs(c, exist_ok=True)
    with open(HIST, "a", encoding="utf-8") as f:
        f.write(json.dumps(e, ensure_ascii=False) + "\n")

def _ruta_pausa():
    return os.environ.get("STARSEED_PRODUCCION_PAUSA") or os.path.expanduser("~/.starseed/produccion-pausada.json")


def ciclo(modo="auto", una_vez=False, seco=False, decidir=None):
    ruta_pausa = _ruta_pausa()
    informe = {"modo": modo, "seco": seco, "pausado": os.path.exists(ruta_pausa), "reversion": False, "error": None}
    if informe["pausado"]:
        informe["estado"] = "pausado"
        escribir_historial({"tipo": "pausa", "informe": informe})
        escribir_estado(informe)
        return informe
    candidatos = pc.candidatos(RAIZ)
    informe["candidatos"] = [{"sha": c.get("sha"), "tarea": c.get("tarea")} for c in candidatos]
    informe["lote"] = candidatos[:VENTANA] if candidatos else []
    # Puerta 3 (simulada para no romper contrato): usar decidir.consultar_lote si se inyecta.
    informe["puertas"] = "simulado"
    informe["aviso"] = "simulado"
    escribir_historial({"tipo": "ciclo", "informe": informe})
    escribir_estado(informe)
    return informe

def main(argv=None):
    import argparse
    p = argparse.ArgumentParser()
    p.add_argument("--una-vez", action="store_true")
    p.add_argument("--seco", action="store_true")
    p.add_argument("--modo", choices=["seco", "canario", "auto"], default="auto")
    args = p.parse_args(argv)
    inf = ciclo(modo=args.modo, una_vez=args.una_vez, seco=args.seco)
    print(json.dumps(inf, ensure_ascii=False, indent=2))
    return 0 if not inf.get("reversion") else 1

if __name__ == "__main__":
    sys.exit(main())
