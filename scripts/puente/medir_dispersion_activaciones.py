#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Mide la dispersión de activaciones de BitNet b1.58 para decidir si PowerInfer tiene sentido.

No se ejecuta al importar: torch y transformers entran dentro de medir(). Umbrales ajustables:
casi_cero >= 0.70 alta, 0.40-0.70 marginal, < 0.40 baja. Se mide la ENTRADA de layer.mlp.down_proj,
que vale cero justo donde la activación ReLU² vale cero.
"""
from __future__ import annotations

import argparse
import json
from collections.abc import Callable
from datetime import datetime, timezone
from pathlib import Path

MODELO_POR_DEFECTO = "microsoft/bitnet-b1.58-2B-4T-bf16"
RAM_MINIMA_GB, UMBRAL_CASI_CERO, UMBRAL_ALTA, UMBRAL_MARGINAL = 6.5, 0.01, 0.70, 0.40

PROMPTS_ES = [
    "Hola, ¿cómo estás hoy?", "¿Cuál es la capital de Francia?", "Abre la herramienta de notas.",
    "Resume en dos frases el texto anterior.", "Revisa este código y dime si hay un error.",
    "¿Qué hora es en Madrid?", "Explícame qué es la geometría sagrada.", "Llama a Alex.",
    "Ordena estas tareas de la más urgente a la menos.", "¿Cuánto es 17 por 23?",
    "Busca en la memoria lo que hablamos ayer.", "Escribe un correo para confirmar.",
]

def ram_libre_gb(texto_meminfo: str) -> float:
    """Devuelve MemAvailable en GB (1 GiB = 1024² kB); 0.0 si no aparece."""
    for linea in (texto_meminfo or "").splitlines():
        if linea.startswith("MemAvailable:"):
            partes = linea.split()
            if len(partes) >= 2 and partes[1].isdigit():
                return int(partes[1]) / (1024 * 1024)
    return 0.0

def resumir(capas: list[dict]) -> dict:
    """Resume la dispersión. peor_capa = la menos dispersa; mejor_capa = la más."""
    if not capas:
        return {"media_cero_exacto": 0.0, "media_casi_cero": 0.0, "peor_capa": None,
                "mejor_capa": None, "veredicto": "sin datos"}
    casi = [float(c.get("casi_cero", 0.0)) for c in capas]
    media = sum(casi) / len(casi)
    veredicto = ("alta: merece un predictor al estilo PowerInfer" if media >= UMBRAL_ALTA
                 else "marginal: medir velocidad real antes" if media >= UMBRAL_MARGINAL
                 else "baja: descartar")
    mejor = max(range(len(casi)), key=lambda i: casi[i])
    peor = min(range(len(casi)), key=lambda i: casi[i])
    exacta = sum(float(c.get("cero_exacto", 0.0)) for c in capas) / len(capas)
    return {"media_cero_exacto": exacta, "media_casi_cero": media,
            "peor_capa": capas[peor].get("capa", peor),
            "mejor_capa": capas[mejor].get("capa", mejor), "veredicto": veredicto}

def _crear_gancho(indice: int, acumuladores: list[dict]) -> Callable:
    def gancho(_modulo, entradas) -> None:
        x = entradas[0].detach().float()
        absolutos = x.abs()
        cuenta = acumuladores[indice]
        cuenta["cero_exacto"] += int((x == 0).sum().item())
        cuenta["casi_cero"] += int((absolutos < UMBRAL_CASI_CERO * absolutos.mean()).sum().item())
        cuenta["total"] += int(x.numel())
    return gancho

def medir(modelo: str, prompts: list[str], max_tokens: int = 64) -> dict:
    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer
    tokenizador = AutoTokenizer.from_pretrained(modelo)
    red = AutoModelForCausalLM.from_pretrained(modelo, torch_dtype=torch.bfloat16,
                                               low_cpu_mem_usage=True, trust_remote_code=False)
    capas = list(red.model.layers)
    acumuladores = [{"cero_exacto": 0, "casi_cero": 0, "total": 0} for _ in capas]
    asas, notas = [], []
    for indice, capa in enumerate(capas):
        down = getattr(capa.mlp, "down_proj", None)
        if down is None:
            lineales = [m for m in capa.mlp.modules() if type(m).__name__ == "Linear"]
            down = lineales[-1] if lineales else None
        if down is None:
            notas.append(f"capa {indice} sin down_proj")
            continue
        asas.append(down.register_forward_pre_hook(_crear_gancho(indice, acumuladores)))
    tokens = 0
    with torch.inference_mode():
        for prompt in prompts:
            entradas = tokenizador(prompt, return_tensors="pt", truncation=True,
                                   max_length=max_tokens)
            tokens += int(entradas["input_ids"].shape[-1])
            red(**entradas)
    [asa.remove() for asa in asas]
    capas_medidas = [{"capa": i, "cero_exacto": c["cero_exacto"] / c["total"] if c["total"] else 0.0,
                      "casi_cero": c["casi_cero"] / c["total"] if c["total"] else 0.0}
                     for i, c in enumerate(acumuladores)]
    nota = "medido sobre la entrada de mlp.down_proj" + ("; " + "; ".join(notas) if notas else "")
    return {"capas": capas_medidas, "tokens": tokens, "nota": nota}

def main(argv: list[str] | None = None, leer_meminfo: Callable[[], str] | None = None) -> int:
    analizador = argparse.ArgumentParser(description="Mide la dispersión de BitNet b1.58.")
    analizador.add_argument("--modelo", default=MODELO_POR_DEFECTO)
    analizador.add_argument("--salida", default="dispersion-bitnet.json")
    analizador.add_argument("--prompts")
    analizador.add_argument("--forzar", action="store_true")
    args = analizador.parse_args(argv)
    libre = ram_libre_gb(leer_meminfo() if leer_meminfo else Path("/proc/meminfo").read_text(encoding="utf-8"))
    if libre < RAM_MINIMA_GB and not args.forzar:
        print(f"RAM libre {libre:.2f} GB < {RAM_MINIMA_GB} GB; no se carga el modelo (usa --forzar).")
        return 2
    prompts = list(PROMPTS_ES)
    if args.prompts:
        prompts = [linea.strip() for linea in Path(args.prompts).read_text(encoding="utf-8").splitlines() if linea.strip()]
    medicion = medir(args.modelo, prompts)
    resumen = resumir(medicion["capas"])
    informe = {"modelo": args.modelo, "fecha": datetime.now(timezone.utc).isoformat(), "n_prompts": len(prompts),
               "tokens": medicion["tokens"], "capas": medicion["capas"], "resumen": resumen, "nota": medicion["nota"]}
    with open(args.salida, "w", encoding="utf-8") as archivo:
        json.dump(informe, archivo, ensure_ascii=False, indent=2)
    print(f"{resumen['veredicto']} · casi_cero medio {resumen['media_casi_cero']:.3f} · {args.salida}")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
