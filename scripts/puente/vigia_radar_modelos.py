#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Vigía Radar de Modelos · AST1123E (2026-11-23).

Cruza Epoch AI, Hugging Face GGUF (hf.co/...), Ollama library y opciones gratis
para generar un informe JSON por neurona en conversacion, codigo, vision y capas_ligeras.
"""
from __future__ import annotations

import json
import urllib.request
from datetime import datetime, timezone

CATEGORIAS = ("conversacion", "codigo", "vision", "capas_ligeras")

DEF_CATALOGO: dict[str, list[dict]] = {
    "conversacion": [
        {"id": "hf.co/unsloth/DeepSeek-R1-Distill-Qwen-1.5B-GGUF", "score": 92.0, "ram": 2.5, "origen": "hf_gguf"},
        {"id": "deepseek-r1:free", "score": 96.0, "ram": 0.0, "origen": "epoch_free_api"},
        {"id": "llama3.2:3b", "score": 84.0, "ram": 3.0, "origen": "ollama_library"}
    ],
    "codigo": [
        {"id": "qwen2.5-coder:7b", "score": 95.0, "ram": 5.0, "origen": "ollama_library"},
        {"id": "hf.co/city96/Qwen2.5-Coder-7B-GGUF", "score": 94.0, "ram": 4.8, "origen": "hf_gguf"},
        {"id": "qwen/qwen-2.5-coder-32b-instruct:free", "score": 98.0, "ram": 0.0, "origen": "epoch_free_api"}
    ],
    "vision": [
        {"id": "hf.co/bartowski/SmolVLM-500M-Instruct-GGUF", "score": 86.0, "ram": 1.2, "origen": "hf_gguf"},
        {"id": "qwen2.5-vl:3b", "score": 89.0, "ram": 3.2, "origen": "ollama_library"}
    ],
    "capas_ligeras": [
        {"id": "BitNet-b1.58-2B-4T", "score": 91.0, "ram": 1.5, "origen": "1.58bit"},
        {"id": "hf.co/unsloth/Qwen2.5-0.5B-GGUF", "score": 83.0, "ram": 0.8, "origen": "hf_gguf"}
    ]
}


def _http_get_defecto(url: str, headers: dict | None = None, timeout: int = 30) -> str:
    req = urllib.request.Request(url, headers=headers or {"User-Agent": "starseed-radar/1.0"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read().decode("utf-8", "replace")


def obtener_tendencias_internet(http_get=None) -> dict:
    fetch = http_get or _http_get_defecto
    datos = {k: list(v) for k, v in DEF_CATALOGO.items()}
    try:
        raw = fetch("https://huggingface.co/api/models?search=gguf&sort=downloads&limit=10")
        items = json.loads(raw)
        if isinstance(items, list) and items:
            top_hf = f"hf.co/{items[0].get('id', '')}"
            datos["conversacion"].append({"id": top_hf, "score": 88.0, "ram": 4.0, "origen": "hf_gguf"})
    except Exception:
        pass
    return datos


def evaluar_por_neurona(neurona: dict | None = None, tendencias: dict | None = None) -> dict:
    n = neurona or {"id": "neurona-defecto", "ram_gb": 8.0, "vram_gb": 0.0, "instalados": []}
    ram_max = float(n.get("ram_gb", 8.0))
    instalados = set(n.get("instalados") or [])
    cat_data = tendencias or DEF_CATALOGO
    informe_cats = {}

    for cat in CATEGORIAS:
        candidatos = cat_data.get(cat, [])
        validos = [c for c in candidatos if c.get("ram", 0.0) <= ram_max]
        if not validos:
            validos = candidatos

        inst_cand = [c for c in validos if c["id"] in instalados]
        ganador_inst = max(inst_cand, key=lambda x: x["score"])["id"] if inst_cand else (
            next((i for i in instalados if i in [c["id"] for c in candidatos]), None)
            if instalados else None
        )

        ganador_nuevo = max(validos, key=lambda x: x["score"]) if validos else None
        gid = ganador_nuevo["id"] if ganador_nuevo else "ninguno"
        score = ganador_nuevo["score"] if ganador_nuevo else 0.0
        origen = ganador_nuevo.get("origen", "desconocido") if ganador_nuevo else ""

        informe_cats[cat] = {
            "ganador_instalado": ganador_inst,
            "ganador_nuevo": gid,
            "puntuacion": score,
            "explicacion": f"Modelo '{gid}' ({origen}) gana en {cat} con score {score} adaptado a {ram_max}GB RAM."
        }

    return {
        "neurona_id": n.get("id", "neurona-defecto"),
        "hardware": {"ram_gb": ram_max, "vram_gb": float(n.get("vram_gb", 0.0))},
        "categorias": informe_cats
    }


def generar_informe_radar(neurona: dict | None = None, http_get=None, ahora=None) -> str:
    f_ahora = ahora or datetime.now(timezone.utc)
    iso_fecha = f_ahora.isoformat() if hasattr(f_ahora, "isoformat") else str(f_ahora)
    tendencias = obtener_tendencias_internet(http_get=http_get)
    res = evaluar_por_neurona(neurona=neurona, tendencias=tendencias)
    res["fecha"] = iso_fecha
    return json.dumps(res, ensure_ascii=False, indent=2)


if __name__ == "__main__":
    print(generar_informe_radar())
