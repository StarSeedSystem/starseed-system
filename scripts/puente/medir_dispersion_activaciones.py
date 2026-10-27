#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Mide la dispersión de activaciones de BitNet b1.58-2B-4T para PowerInfer.
No se ejecuta en la Mac de 8 GB (torch, ~4,8 GB de descarga, 6,5 GB de RAM
libre). Mide la entrada de `down_proj` de cada capa, cero donde ReLU² es cero.
Umbrales: casi_cero medio >= 0,70 alta; 0,40-0,70 marginal; < 0,40 baja.
"""
import argparse, json
from datetime import datetime
from pathlib import Path
from typing import Callable, Dict, List, Optional
MODELO_POR_DEFECTO = "microsoft/bitnet-b1.58-2B-4T-bf16"
RAM_MINIMA_GB = 6.5
UMBRAL_ALTO = 0.70
UMBRAL_MARGINAL = 0.40
PROMPTS_ES = [
    "Hola, ¿quién eres?", "¿Cuál es la capital de Francia?", "Abre la carpeta de descargas y dime qué hay.", "Resume en tres frases el texto anterior.",
    "Busca en el código dónde se define el cliente de Supabase.", "¿Qué tiempo hará mañana en Madrid?", "Recuérdame llamar a Ana a las seis.", "Explícame qué es la geometría sagrada.",
    "Crea una nota con la lista de la compra.", "¿Cuántos kilómetros hay de aquí a la luna?", "Escribe un correo breve pidiendo una reunión.", "Ordena los archivos por fecha y borra los duplicados.",
]

def ram_libre_gb(texto_meminfo: str) -> float:
    """GB disponibles según MemAvailable (kB); 0.0 si no aparece."""
    for linea in (texto_meminfo or "").splitlines():
        if linea.startswith("MemAvailable:"):
            try:
                return float(linea.split()[1]) / (1024.0 * 1024.0)
            except (IndexError, ValueError):
                return 0.0
    return 0.0

def resumir(capas: List[Dict]) -> Dict:
    """Resume la dispersión; `peor_capa` y `mejor_capa` son números de capa."""
    if not capas:
        return {"media_cero_exacto": 0.0, "media_casi_cero": 0.0, "peor_capa": None,
                "mejor_capa": None, "veredicto": "sin datos"}
    cero = sum(float(c.get("cero_exacto", 0.0)) for c in capas) / len(capas)
    casi = sum(float(c.get("casi_cero", 0.0)) for c in capas) / len(capas)
    veredicto = ("alta: merece un predictor al estilo PowerInfer" if casi >= UMBRAL_ALTO
                 else "marginal: medir velocidad real antes" if casi >= UMBRAL_MARGINAL
                 else "baja: descartar")
    peor = min(capas, key=lambda c: float(c.get("casi_cero", 0.0))).get("capa")
    mejor = max(capas, key=lambda c: float(c.get("casi_cero", 0.0))).get("capa")
    return {"media_cero_exacto": cero, "media_casi_cero": casi, "peor_capa": peor,
            "mejor_capa": mejor, "veredicto": veredicto}

def medir(modelo: str, prompts: List[str], max_tokens: int = 64) -> Dict:
    """Carga el modelo y mide la entrada de cada `down_proj`. torch y
    transformers se importan aquí para poder probar el módulo sin ellos."""
    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer
    tok = AutoTokenizer.from_pretrained(modelo)
    tok.pad_token = tok.pad_token or tok.eos_token
    cargado = AutoModelForCausalLM.from_pretrained(
        modelo, torch_dtype=torch.bfloat16, low_cpu_mem_usage=True, trust_remote_code=False).eval()
    capas = getattr(getattr(cargado, "model", None), "layers", None)
    if not capas:
        raise RuntimeError("no se encontró model.model.layers")
    acumulado = [{"cero": 0.0, "casi": 0.0, "pasos": 0} for _ in capas]
    notas, hooks = [], []
    for indice, capa in enumerate(capas):
        mlp = getattr(capa, "mlp", None) or getattr(capa, "feed_forward", None)
        nombre = next((n for n in ("down_proj", "wo", "c_proj", "dense_4h_to_h") if mlp is not None and hasattr(mlp, n)), None)
        proy = getattr(mlp, nombre) if nombre else None
        if proy is None:
            notas.append(f"capa {indice}: sin proyección de salida")
            continue
        if nombre != "down_proj" or not hasattr(capa, "mlp"):
            notas.append(f"capa {indice}: se mide {nombre}")
        def _hook(_mod, entradas, idx=indice):
            x = entradas[0].detach().float()
            total = max(x.numel(), 1)
            cero = (x == 0).sum().item() / total
            media = x.abs().mean().item()
            casi = cero if media == 0 else (x.abs() < 0.01 * media).sum().item() / total
            datos = acumulado[idx]
            datos["cero"] += cero
            datos["casi"] += casi
            datos["pasos"] += 1
        hooks.append(proy.register_forward_pre_hook(_hook))
    tokens = 0
    try:
        with torch.inference_mode():
            for texto in prompts:
                entradas = tok(texto, return_tensors="pt")
                salida = cargado.generate(**entradas, max_new_tokens=max_tokens, pad_token_id=tok.pad_token_id)
                tokens += int(salida.shape[1] - entradas["input_ids"].shape[1])
    finally:
        for hook in hooks:
            hook.remove()
    resultado = [{"capa": i, "cero_exacto": d["cero"] / (d["pasos"] or 1),
                  "casi_cero": d["casi"] / (d["pasos"] or 1)} for i, d in enumerate(acumulado)]
    return {"capas": resultado, "tokens": tokens, "nota": "; ".join(notas)}

def main(argv: Optional[List[str]] = None, leer_meminfo: Optional[Callable[[], str]] = None) -> int:
    """Mide y escribe el JSON. `leer_meminfo` se inyecta en las pruebas."""
    parser = argparse.ArgumentParser(description="Mide la dispersión de activaciones de BitNet.")
    for nombre, defecto in (("--modelo", MODELO_POR_DEFECTO), ("--salida", "dispersion-bitnet.json")):
        parser.add_argument(nombre, default=defecto)
    parser.add_argument("--prompts", help="archivo con una frase por línea")
    parser.add_argument("--forzar", action="store_true")
    args = parser.parse_args(argv)
    leer = leer_meminfo or (lambda: Path("/proc/meminfo").read_text(encoding="utf-8")
                            if Path("/proc/meminfo").exists() else "")
    libre = ram_libre_gb(leer())
    if libre < RAM_MINIMA_GB and not args.forzar:
        print(f"RAM libre {libre:.2f} GB < {RAM_MINIMA_GB} GB: no se carga el modelo; usa --forzar.")
        return 2
    prompts = PROMPTS_ES
    if args.prompts:
        prompts = [l.strip() for l in Path(args.prompts).read_text(encoding="utf-8").splitlines() if l.strip()]
    resultado = medir(args.modelo, prompts)
    informe = {"modelo": args.modelo, "fecha": datetime.now().isoformat(timespec="seconds"),
               "n_prompts": len(prompts), "tokens": resultado["tokens"], "capas": resultado["capas"],
               "resumen": resumir(resultado["capas"]), "nota": resultado["nota"]}
    Path(args.salida).write_text(json.dumps(informe, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Escrito {args.salida}: {informe['resumen']['veredicto']}")
    return 0
if __name__ == "__main__":
    raise SystemExit(main())
