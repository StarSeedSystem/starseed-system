#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Mide la dispersión de la FFN de BitNet b1.58-2B-4T (ReLU²) para decidir si
merece un predictor al estilo PowerInfer. torch y transformers se cargan dentro
de medir(). Para >= 6,5 GB de RAM libre, nunca la Mac de 8 GB con el enjambre."""

from __future__ import annotations
import argparse, json, os
from datetime import datetime

MODELO = "microsoft/bitnet-b1.58-2B-4T-bf16"
RAM_MINIMA_GB = 6.5
UMBRAL_CASI_CERO = 0.01

PROMPTS_ES = [
    "Hola, ¿quién eres y qué puedes hacer por mí?", "¿Cuál es la capital de España?",
    "Abre la ventana de conexiones y muéstrame la red.", "Resume en dos frases qué es StarSeed OS.",
    "¿Qué hora es en Tokio ahora mismo?", "Busca en mi biblioteca los paquetes de diseño.",
    "Explícame qué es una neurona en este sistema.", "Revisa este código y dime si tiene un error.",
    "Guarda una nota con la idea que acabo de decir.", "¿Qué diferencia hay entre local y nube?",
    "Hazme una lista de tres tareas para hoy.", "Desconecta el micrófono hasta que te lo pida.",
]

def ram_libre_gb(texto_meminfo: str) -> float:
    """MemAvailable en GB (GiB) desde un texto tipo /proc/meminfo; 0.0 si falta."""
    for linea in texto_meminfo.splitlines():
        if linea.startswith("MemAvailable:") and len(linea.split()) > 1: return int(linea.split()[1]) / (1024.0 * 1024.0)
    return 0.0

def resumir(capas: list[dict]) -> dict:
    """Umbrales ajustables sobre la media de casi_cero: >=0.70 alta, 0.40-0.70
    marginal, <0.40 baja; sin capas, «sin datos». peor/mejor son índices de capa."""
    if not capas:
        return {"media_cero_exacto": 0.0, "media_casi_cero": 0.0, "peor_capa": None, "mejor_capa": None, "veredicto": "sin datos"}
    n = len(capas); media_cero = sum(float(c["cero_exacto"]) for c in capas) / n; media_casi = sum(float(c["casi_cero"]) for c in capas) / n
    peor = min(capas, key=lambda c: float(c["casi_cero"]))
    mejor = max(capas, key=lambda c: float(c["casi_cero"]))
    veredicto = ("alta: merece un predictor al estilo PowerInfer" if media_casi >= 0.70
                 else "marginal: medir velocidad real antes" if media_casi >= 0.40
                 else "baja: descartar")
    return {"media_cero_exacto": media_cero, "media_casi_cero": media_casi, "peor_capa": int(peor["capa"]), "mejor_capa": int(mejor["capa"]), "veredicto": veredicto}

def _capas_del_modelo(modelo: object) -> tuple[list, str]:
    for ruta in ("model.layers", "model.model.layers", "model.decoder.layers", "transformer.h"):
        actual = modelo
        for parte in ruta.split("."): actual = getattr(actual, parte, None)
        if actual is not None and hasattr(actual, "__len__"):
            return list(actual), ruta
    return [], ""

def _meminfo() -> str:
    try:
        with open("/proc/meminfo", "r", encoding="utf-8") as f: return f.read()
    except OSError: return ""

def medir(modelo: str, prompts: list[str], max_tokens: int = 64) -> dict:
    """La entrada de down_proj es la salida de ReLU²: vale cero donde la neurona
    está apagada. El hook solo lee el tensor, nunca escribe en el grafo."""
    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer
    tok = AutoTokenizer.from_pretrained(modelo, trust_remote_code=False)
    cargado = AutoModelForCausalLM.from_pretrained(modelo, torch_dtype=torch.bfloat16,
                                                   low_cpu_mem_usage=True, trust_remote_code=False)
    cargado.eval()
    capas, ruta = _capas_del_modelo(cargado)
    if not capas: raise RuntimeError("No se encontraron capas para enganchar down_proj")
    acumulado = [{"total": 0, "ceros": 0, "casi": 0} for _ in capas]
    ganchos, adaptado = [], False
    for i, capa in enumerate(capas):
        mlp = getattr(capa, "mlp", None)
        down = getattr(mlp, "down_proj", None)
        if down is None and mlp is not None:
            down = next((m for n, m in mlp.named_children() if "down" in n), None); adaptado = True
        if down is None: continue
        acc = acumulado[i]
        def gancho(_modulo, entradas, acc=acc):
            x = entradas[0].detach().float()
            valores, media = x.abs(), x.abs().mean()
            acc["total"] += x.numel()
            acc["ceros"] += int((x == 0).sum().item())
            acc["casi"] += x.numel() if float(media) == 0 else int((valores < media * UMBRAL_CASI_CERO).sum().item())
        ganchos.append(down.register_forward_pre_hook(gancho))
    if not ganchos: raise RuntimeError("Ninguna capa expone mlp.down_proj; revisa el modelo")
    tokens = 0
    try:
        with torch.no_grad():
            for texto in prompts:
                tokens += int(cargado.generate(**tok(texto, return_tensors="pt"), max_new_tokens=max_tokens,
                                               do_sample=False, pad_token_id=tok.pad_token_id).shape[1])
    finally:
        for g in ganchos:
            g.remove()
    detalle = [{"capa": i, "cero_exacto": a["ceros"] / a["total"], "casi_cero": a["casi"] / a["total"]}
               for i, a in enumerate(acumulado) if a["total"]]
    nota = f"Hook sobre la entrada de down_proj en {ruta} ({len(ganchos)} ganchos){'; hook adaptado' if adaptado else ''}."
    return {"capas": detalle, "tokens": tokens, "nota": nota, "resumen": resumir(detalle)}

def main(argv: list[str] | None = None, leer_meminfo=None) -> int:
    """Sin RAM suficiente devuelve 2 sin importar torch ni descargar nada."""
    p = argparse.ArgumentParser(description="Mide la dispersión de la FFN de BitNet.")
    p.add_argument("--modelo", default=MODELO); p.add_argument("--salida", default="dispersion-activaciones.json")
    p.add_argument("--prompts"); p.add_argument("--forzar", action="store_true")
    args = p.parse_args(argv)
    libre = ram_libre_gb((leer_meminfo or _meminfo)())
    if libre < RAM_MINIMA_GB and not args.forzar:
        print(f"RAM libre insuficiente: {libre:.2f} GB < {RAM_MINIMA_GB:.1f} GB; usa --forzar.")
        return 2
    prompts = list(PROMPTS_ES)
    if args.prompts:
        with open(args.prompts, encoding="utf-8") as f: prompts = [l.strip() for l in f if l.strip()]
    if not prompts: print("No hay prompts que medir."); return 2
    r = medir(args.modelo, prompts)
    datos = {"modelo": args.modelo, "fecha": datetime.now().isoformat(timespec="seconds"), "n_prompts": len(prompts),
             "tokens": r["tokens"], "capas": r["capas"], "resumen": r["resumen"], "nota": r["nota"]}
    with open(args.salida, "w", encoding="utf-8") as f: json.dump(datos, f, ensure_ascii=False, indent=2)
    print(f"Escrito {os.path.abspath(args.salida)}: {r['resumen']['veredicto']}")
    return 0

if __name__ == "__main__": raise SystemExit(main())
