#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Mide la dispersión de activaciones de la FFN ReLU² (BitNet); herramienta, no se ejecuta.
`torch`/`transformers` entran dentro de `medir()`. Umbrales de trabajo (ajustables):
casi_cero medio >= 0,70 alta; 0,40-0,70 marginal; < 0,40 baja. Se mide la ENTRADA de
`layer.mlp.down_proj`, que vale cero justo donde la activación ReLU² vale cero.
"""
from __future__ import annotations

import argparse
import json
from datetime import datetime
from pathlib import Path
from typing import Callable, Dict, List, Optional

MODELO_POR_DEFECTO = "microsoft/bitnet-b1.58-2B-4T-bf16"
MIN_RAM_GB = 6.5
UMBRAL_ALTA = 0.70
UMBRAL_MARGINAL = 0.40

PROMPTS_ES = [
    "Hola, ¿quién eres y qué puedes hacer por mí hoy?", "¿Cuál es la capital de Portugal y cuántos habitantes tiene?",
    "Abre la herramienta de notas y apunta la idea que te dicto.", "Resume en tres frases lo que hemos hablado esta mañana.",
    "Revisa este error de TypeScript y dime la causa probable.", "Explícame la diferencia entre un enjambre y un orquestador.",
    "Busca en la biblioteca los paquetes de diseño instalados.", "Escríbeme un correo breve para pedir una reunión el jueves.",
    "¿Qué es la proporción áurea y cómo se usa en una interfaz?", "Ordena estas tareas por coste y por impacto esperado.",
    "Traduce al inglés la frase que acabo de decir.", "Dame dos opciones de menú con lo que hay en la nevera.",
]
def ram_libre_gb(texto_meminfo: str) -> float:
    """Devuelve GB de MemAvailable de un texto tipo /proc/meminfo; 0.0 si no está."""
    for linea in texto_meminfo.splitlines():
        if linea.startswith("MemAvailable:"):
            try:
                return float(linea.split()[1]) / (1024.0 * 1024.0)
            except (IndexError, ValueError):
                return 0.0
    return 0.0
def resumir(capas: List[Dict]) -> Dict:
    """Resume la dispersión por capa. `peor_capa`/`mejor_capa` son las fichas extremas."""
    if not capas:
        return {"media_cero_exacto": 0.0, "media_casi_cero": 0.0,
                "peor_capa": None, "mejor_capa": None, "veredicto": "sin datos"}
    n = len(capas)
    media_casi = sum(c["casi_cero"] for c in capas) / n
    veredicto = ("alta: merece un predictor al estilo PowerInfer" if media_casi >= UMBRAL_ALTA
                 else "marginal: medir velocidad real antes" if media_casi >= UMBRAL_MARGINAL
                 else "baja: descartar")
    return {"media_cero_exacto": sum(c["cero_exacto"] for c in capas) / n,
            "media_casi_cero": media_casi, "veredicto": veredicto,
            "peor_capa": dict(min(capas, key=lambda c: c["casi_cero"])),
            "mejor_capa": dict(max(capas, key=lambda c: c["casi_cero"]))}
def medir(modelo: str, prompts: List[str], max_tokens: int = 64) -> Dict:
    """Carga el modelo y mide ceros en la entrada de cada down_proj. Solo aquí entra torch."""
    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer
    nota = ""
    try:
        from transformers.models.bitnet import modeling_bitnet
        if not hasattr(modeling_bitnet, "BitNetMLP"):
            nota = "modeling_bitnet sin BitNetMLP; hook genérico sobre mlp.down_proj"
    except Exception:
        nota = "no se pudo inspeccionar modeling_bitnet; hook genérico sobre mlp.down_proj"
    tok = AutoTokenizer.from_pretrained(modelo, trust_remote_code=False)
    net = AutoModelForCausalLM.from_pretrained(
        modelo, torch_dtype=torch.bfloat16, low_cpu_mem_usage=True, trust_remote_code=False).eval()
    acumulado = [{"cero": 0.0, "casi": 0.0, "pasos": 0} for _ in net.model.layers]
    ganchos = []
    for indice, capa in enumerate(net.model.layers):
        modulo = getattr(getattr(capa, "mlp", None), "down_proj", None)
        if modulo is None:
            nota += f"; capa {indice} sin mlp.down_proj"
            continue
        def medir_paso(_mod, entrada, i=indice):
            x = entrada[0].detach().float()
            media = x.abs().mean()
            a = acumulado[i]
            a["cero"] += float((x == 0).float().mean())
            a["casi"] += float((x.abs() < 0.01 * media).float().mean()) if media > 0 else 1.0
            a["pasos"] += 1
        ganchos.append(modulo.register_forward_pre_hook(medir_paso))
    tokens = 0
    with torch.no_grad():
        for prompt in prompts:
            entradas = tok(prompt, return_tensors="pt").to(net.device)
            salida = net.generate(**entradas, max_new_tokens=max_tokens, do_sample=False)
            tokens += int(salida.shape[-1] - entradas["input_ids"].shape[-1])
    for gancho in ganchos: gancho.remove()
    capas = [{"capa": i, "cero_exacto": a["cero"] / max(a["pasos"], 1),
              "casi_cero": a["casi"] / max(a["pasos"], 1)} for i, a in enumerate(acumulado)]
    return {"capas": capas, "tokens": tokens, "nota": nota or "hook sobre mlp.down_proj"}
def main(argv: Optional[List[str]] = None,
         leer_meminfo: Optional[Callable[[], str]] = None) -> int:
    """Mide la dispersión y escribe el JSON. Devuelve 2 si falta RAM y no hay --forzar."""
    parser = argparse.ArgumentParser(description="Dispersión de activaciones ReLU² (BitNet)")
    parser.add_argument("--modelo", default=MODELO_POR_DEFECTO)
    parser.add_argument("--salida")
    parser.add_argument("--prompts")
    parser.add_argument("--forzar", action="store_true")
    args = parser.parse_args(argv)
    lector = leer_meminfo or (lambda: Path("/proc/meminfo").read_text(encoding="utf-8"))
    libre = ram_libre_gb(lector())
    if libre < MIN_RAM_GB and not args.forzar:
        print(f"RAM libre {libre:.2f} GB < {MIN_RAM_GB} GB; usa --forzar en un medio capaz")
        return 2
    prompts = PROMPTS_ES
    if args.prompts:
        texto = Path(args.prompts).read_text(encoding="utf-8")
        prompts = [linea.strip() for linea in texto.splitlines() if linea.strip()]
    datos = medir(args.modelo, prompts)
    informe = {"modelo": args.modelo, "fecha": datetime.now().isoformat(timespec="seconds"),
               "n_prompts": len(prompts), "tokens": datos["tokens"], "capas": datos["capas"],
               "resumen": resumir(datos["capas"]), "nota": datos["nota"]}
    texto_json = json.dumps(informe, ensure_ascii=False, indent=2)
    if args.salida:
        Path(args.salida).write_text(texto_json + "\n", encoding="utf-8")
    else:
        print(texto_json)
    return 0
if __name__ == "__main__":
    raise SystemExit(main())
