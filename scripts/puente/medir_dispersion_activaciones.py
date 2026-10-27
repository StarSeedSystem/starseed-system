#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Herramienta de medida de dispersión de activaciones (PowerInfer-style) para BitNet b1.58.
NO ejecuta medición pesada aquí: torch/transformers se importan SOLO dentro de medir().
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime


PROMPTS_ES = [
    "Hola, ¿cómo estás?",
    "¿Qué es un sistema operativo social descentralizado?",
    "Busca archivos relacionados con el módulo de mando",
    "Resume este texto en dos líneas",
    "Revisa el código de esta función y dime posibles mejoras",
    "¿Cuál es la diferencia entre ReLU y ReLU²?",
    "Genera un plan para organizar estas tareas",
    "Dime tres ideas para mejorar la interfaz",
    "¿Cómo funciona la sincronización entre neuronas?",
    "Explica este error y propón una solución",
    "Busca información sobre geometría sagrada",
    "Haz un resumen de las últimas olas del enjambre",
]


def ram_libre_gb(texto_meminfo: str) -> float:
    """Lee MemAvailable (kB) de un texto tipo /proc/meminfo y devuelve GB; 0.0 si no está."""
    if not texto_meminfo:
        return 0.0
    for linea in texto_meminfo.splitlines():
        if linea.strip().startswith("MemAvailable:"):
            partes = linea.split()
            if len(partes) >= 2:
                try:
                    kb = float(partes[1])
                    return kb / (1024.0 * 1000.0)
                except ValueError:
                    pass
            break
    return 0.0


def resumir(capas: list[dict]) -> dict:
    """
    Resume capas con umbrales ajustables.
    media_casi_cero >= 0.70 => "alta: merece un predictor al estilo PowerInfer"
    entre 0.40 y 0.70      => "marginal: medir velocidad real antes"
    < 0.40                 => "baja: descartar"
    lista vacía            => {"veredicto": "sin datos"} sin lanzar excepción
    """
    if not capas:
        return {
            "media_cero_exacto": 0.0,
            "media_casi_cero": 0.0,
            "peor_capa": -1,
            "mejor_capa": -1,
            "veredicto": "sin datos",
        }
    media_cero = sum(c.get("cero_exacto", 0.0) for c in capas) / len(capas)
    media_casi = sum(c.get("casi_cero", 0.0) for c in capas) / len(capas)
    peor = max(capas, key=lambda c: c.get("casi_cero", 0.0))["capa"]
    mejor = min(capas, key=lambda c: c.get("casi_cero", 0.0))["capa"]
    if media_casi >= 0.70:
        veredicto = "alta: merece un predictor al estilo PowerInfer"
    elif media_casi >= 0.40:
        veredicto = "marginal: medir velocidad real antes"
    else:
        veredicto = "baja: descartar"
    return {
        "media_cero_exacto": media_cero,
        "media_casi_cero": media_casi,
        "peor_capa": peor,
        "mejor_capa": mejor,
        "veredicto": veredicto,
    }


def medir(modelo, prompts, max_tokens=64):
    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer

    nota = []
    try:
        try:
            import transformers.models.bitnet.modeling_bitnet as _bitnet_mod  # noqa
            nota.append("usando transformers.models.bitnet.modeling_bitnet")
        except Exception as e:
            nota.append(f"bitnet_mod_no_disponible:{e}")
    except Exception:
        pass

    tokenizer = AutoTokenizer.from_pretrained(modelo, trust_remote_code=False)
    model = AutoModelForCausalLM.from_pretrained(
        modelo,
        torch_dtype=torch.bfloat16,
        low_cpu_mem_usage=True,
        trust_remote_code=False,
    )
    model.eval()

    capas_res = []
    hooks = []

    def make_hook(idx):
        def hook_fn(module, input):
            try:
                x = input[0]
                with torch.no_grad():
                    xflat = x.detach()
                    xflat = xflat.reshape(-1)
                    if xflat.numel() == 0:
                        return
                    cero_exacto = (xflat == 0).float().mean().item()
                    absx = xflat.abs()
                    media_abs = absx.mean().item()
                    if media_abs == 0:
                        casi_cero = 1.0
                    else:
                        umbral = 0.01 * media_abs
                        casi_cero = (absx < umbral).float().mean().item()
                    capas_res.append({"capa": idx, "cero_exacto": cero_exacto, "casi_cero": casi_cero})
            except Exception as e:
                nota.append(f"hook_err_capa{idx}:{e}")

        return hook_fn

    try:
        layers = model.model.layers
        for i, layer in enumerate(layers):
            if hasattr(layer, "mlp") and hasattr(layer.mlp, "down_proj"):
                h = layer.mlp.down_proj.register_forward_pre_hook(make_hook(i))
                hooks.append(h)
            else:
                nota.append(f"capa{i}:mlp.down_proj_no_encontrado")
    except Exception as e:
        nota.append(f"acceso_layers_error:{e}")

    try:
        tokens_total = 0
        for p in prompts:
            try:
                inputs = tokenizer(p, return_tensors="pt")
                with torch.no_grad():
                    _ = model.generate(**inputs, max_new_tokens=max_tokens)
                tokens_total += int(inputs["input_ids"].shape[1]) + max_tokens
            except Exception as e:
                nota.append(f"gen_err:{e}")
    finally:
        for h in hooks:
            try:
                h.remove()
            except Exception:
                pass

    return {"capas": capas_res, "tokens": tokens_total, "nota": "; ".join(nota) if nota else ""}


def main(argv=None, leer_meminfo=None):
    parser = argparse.ArgumentParser()
    parser.add_argument("--modelo", default="microsoft/bitnet-b1.58-2B-4T-bf16")
    parser.add_argument("--salida", required=False)
    parser.add_argument("--prompts", required=False)
    parser.add_argument("--forzar", action="store_true")
    args = parser.parse_args(argv)

    if leer_meminfo is not None:
        if callable(leer_meminfo):
            txt_mem = leer_meminfo()
        else:
            txt_mem = str(leer_meminfo)
    else:
        try:
            with open("/proc/meminfo", "r", encoding="utf-8") as f:
                txt_mem = f.read()
        except Exception:
            txt_mem = ""

    ram_libre = ram_libre_gb(txt_mem)
    if ram_libre < 6.5 and not args.forzar:
        print(
            f"RAM libre insuficiente: {ram_libre:.2f} GB < 6.5 GB. Usa --forzar para saltar esta comprobación.",
            file=sys.stderr,
        )
        return 2

    prompts = list(PROMPTS_ES)
    if args.prompts:
        try:
            with open(args.prompts, "r", encoding="utf-8") as f:
                ps = []
                for line in f:
                    line = line.strip()
                    if line and not line.startswith("#"):
                        ps.append(line)
                if ps:
                    prompts = ps
        except Exception as e:
            print(f"Error leyendo prompts: {e}", file=sys.stderr)

    res_med = medir(args.modelo, prompts, max_tokens=64)
    capas = res_med.get("capas", [])
    resumen = resumir(capas)
    salida = {
        "modelo": args.modelo,
        "fecha": datetime.utcnow().isoformat() + "Z",
        "n_prompts": len(prompts),
        "tokens": res_med.get("tokens", 0),
        "capas": capas,
        "resumen": resumen,
        "nota": res_med.get("nota", ""),
    }

    if args.salida:
        try:
            os.makedirs(os.path.dirname(os.path.abspath(args.salida)) or ".", exist_ok=True)
            with open(args.salida, "w", encoding="utf-8") as f:
                json.dump(salida, f, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f"Error escribiendo salida: {e}", file=sys.stderr)
            return 1
    else:
        print(json.dumps(salida, ensure_ascii=False))

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
