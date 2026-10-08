#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Banco de pruebas de capas Astraura. Mide latencia, tok/s y acierto con juez de Jev.
"""
from __future__ import annotations
import argparse
import json
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Callable, Dict, List

CONFIG_PATH = Path(__file__).parents[2] / "config" / "capas-astraura.json"

TAREAS = [
    {"id": "t1", "tipo": "herramientas"},
    {"id": "t2", "tipo": "extracción"},
    {"id": "t3", "tipo": "resumen"},
    {"id": "t4", "tipo": "razonamiento corto"},
] * 5  # 20 tareas

def cargar_config() -> Dict:
    with CONFIG_PATH.open("r", encoding="utf-8") as f:
        return json.load(f)

def evaluar(modelo: str, tarea: Dict, http_get: Callable[[str, Dict], Dict]) -> Dict:
    inicio = time.perf_counter()
    # Simulación: endpoint compatible OpenAI
    resp = http_get("https://api.example.com/v1/completions", {"model": modelo, "task": tarea["id"]})
    fin = time.perf_counter()
    latencia = fin - inicio
    tokens = resp.get("usage", {}).get("total_tokens", 1)
    tok_s = tokens / latencia if latencia > 0 else 0.0
    acierto = resp.get("score", 0.0)
    return {"latencia": latencia, "tok_s": tok_s, "acierto": acierto, "tokens": tokens}

def decidir_consultar(estado: Dict, juez: Callable[[Dict], float] | None = None) -> float:
    if juez:
        return juez(estado)
    return 0.5

def promover(nuevo: Dict, actual: Dict) -> Dict:
    # Promueve si gana o empata con menos coste
    if nuevo["acierto"] > actual["acierto"]:
        return {"accion": "promover", "nuevo": nuevo, "respaldo": actual, "respaldo_hasta": (datetime.utcnow() + timedelta(days=14)).isoformat()}
    if nuevo["acierto"] == actual["acierto"] and nuevo["latencia"] < actual["latencia"]:
        return {"accion": "promover", "nuevo": nuevo, "respaldo": actual, "respaldo_hasta": (datetime.utcnow() + timedelta(days=14)).isoformat()}
    return {"accion": "mantener", "actual": actual}

def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--modelo-nuevo")
    parser.add_argument("--modelo-actual")
    args = parser.parse_args()
    print("capas_banco listo")

if __name__ == "__main__":
    main()
