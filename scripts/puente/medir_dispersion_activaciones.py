#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Mide la dispersión de la FFN de un modelo para decidir si encaja PowerInfer.
No se ejecuta en la Mac del enjambre: necesita torch, transformers, ~4,8 GB de
descarga y ≥ 6,5 GB de RAM libre. Veredicto (ajustable): casi_cero medio ≥ 0,70
alta; 0,40–0,70 marginal; < 0,40 baja. Mide dispersión, no velocidad.
"""
from __future__ import annotations

import argparse, json
from datetime import datetime, timezone

MODELO_POR_DEFECTO = "microsoft/bitnet-b1.58-2B-4T-bf16"
RAM_MINIMA_GB = 6.5; UMBRAL_CASI_CERO = 0.01
PROMPTS_ES = [
    "Hola, ¿quién eres y qué puedes hacer por mí?", "¿Cuál es la capital de Islandia?",
    "Abre el panel de conexiones y dime qué nodos están en línea.", "Resume en tres frases el estado del enjambre esta mañana.",
    "Busca en el código dónde se registra una tarea en la cola.", "Explícame la diferencia entre una neurona y un medio.",
    "Recuérdame mañana a las nueve revisar la puerta de integración.", "¿Qué es la geometría sagrada y para qué la usa StarSeed?",
    "Escribe un correo breve avisando de que la ola terminó en verde.", "¿Por qué la RAM de la Mac se queda sin memoria con tres agentes?",
    "Traduce al inglés el mensaje de bienvenida del OS.", "Dame una lista de cinco comprobaciones antes de publicar.",
]

def ram_libre_gb(texto_meminfo: str) -> float:
    """GB de MemAvailable de un texto tipo /proc/meminfo; 0.0 si falta."""
    for linea in (texto_meminfo or "").splitlines():
        if linea.startswith("MemAvailable:"):
            try:
                return float(linea.split()[1]) / (1024.0 * 1024.0)
            except (IndexError, ValueError):
                return 0.0
    return 0.0

def resumir(capas: list[dict]) -> dict:
    """Resume capas y emite veredicto (umbrales de trabajo, ajustables)."""
    if not capas:
        return {"media_cero_exacto": 0.0, "media_casi_cero": 0.0, "peor_capa": None, "mejor_capa": None, "veredicto": "sin datos"}
    cero = sum(c.get("cero_exacto", 0.0) for c in capas) / len(capas)
    casi = sum(c.get("casi_cero", 0.0) for c in capas) / len(capas)
    peor, mejor = min(capas, key=lambda c: c.get("casi_cero", 0.0)), max(capas, key=lambda c: c.get("casi_cero", 0.0))
    veredicto = ("alta: merece un predictor al estilo PowerInfer" if casi >= 0.70 else "marginal: medir velocidad real antes" if casi >= 0.40 else "baja: descartar")
    return {"media_cero_exacto": cero, "media_casi_cero": casi, "peor_capa": peor.get("capa"),
            "mejor_capa": mejor.get("capa"), "veredicto": veredicto}

def _contar(x) -> tuple:
    if x is None:
        return 0, 0, 0
    x, total = x.detach().float(), int(x.numel())
    ceros = int((x == 0).sum().item()) if total else 0
    media = float(x.abs().mean().item()) if total else 0.0
    casi = total if media <= 0.0 else int((x.abs() < UMBRAL_CASI_CERO * media).sum().item())
    return ceros, casi, total

def medir(modelo: str, prompts: list[str], max_tokens: int = 64) -> dict:
    """Carga el modelo y mide la entrada de down_proj de cada capa de la FFN."""
    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer
    tok = AutoTokenizer.from_pretrained(modelo, trust_remote_code=False)
    red = AutoModelForCausalLM.from_pretrained(
        modelo, torch_dtype=torch.bfloat16, low_cpu_mem_usage=True, trust_remote_code=False).eval()
    capas_mod = getattr(getattr(red, "model", None), "layers", None)
    if capas_mod is None:
        raise RuntimeError("No encuentro model.layers; revisa la clase.")
    nota, acumulado, ganchos = "", {}, []
    for i, capa in enumerate(capas_mod):
        cont = getattr(capa, "mlp", None) or getattr(capa, "feed_forward", None)
        nombre = next((n for n in ("down_proj", "fc2", "dense_4h_to_h") if getattr(cont, n, None) is not None), "")
        down = getattr(cont, nombre, None)
        if down is None:
            nota += f" capa {i}: FFN no encontrada"; continue
        if nombre != "down_proj" or not hasattr(capa, "mlp"):
            nota += f" capa {i}: FFN {nombre}"
        acumulado[i] = [0, 0, 0]
        def _gancho(_m, args, idx=i):
            x = args[0] if args else None
            if isinstance(x, (tuple, list)): x = x[0] if x else None
            c, q, t = _contar(x)
            acumulado[idx] = [acumulado[idx][0] + c, acumulado[idx][1] + q, acumulado[idx][2] + t]
        ganchos.append(down.register_forward_pre_hook(_gancho))
    tokens = 0
    with torch.no_grad():
        for prompt in prompts:
            salida = red.generate(**tok(prompt, return_tensors="pt"),
                                  max_new_tokens=max_tokens, do_sample=False)
            tokens += int(salida.shape[-1])
    for gancho in ganchos: gancho.remove()
    capas = [{"capa": i, "cero_exacto": c / t, "casi_cero": q / t}
             for i, (c, q, t) in sorted(acumulado.items()) if t]
    return {"capas": capas, "tokens": tokens, "nota": nota.strip()}

def main(argv=None, leer_meminfo=None) -> int:
    """Comprueba RAM, mide y escribe el JSON de resultados."""
    parser = argparse.ArgumentParser(description="Mide la dispersión de la FFN.")
    parser.add_argument("--modelo", default=MODELO_POR_DEFECTO)
    parser.add_argument("--salida", default="dispersion-activaciones.json")
    parser.add_argument("--prompts", help="archivo .txt con una frase por línea")
    parser.add_argument("--forzar", action="store_true")
    args = parser.parse_args(argv)
    try: texto = leer_meminfo() if leer_meminfo else open("/proc/meminfo", encoding="utf-8").read()
    except OSError: texto = ""
    libre = ram_libre_gb(texto)
    if libre < RAM_MINIMA_GB and not args.forzar:
        print(f"RAM libre insuficiente: {libre:.2f} GB < {RAM_MINIMA_GB} GB. Cierra el enjambre o usa --forzar.")
        return 2
    if args.prompts:
        with open(args.prompts, "r", encoding="utf-8") as archivo:
            prompts = [linea.strip() for linea in archivo if linea.strip()]
    else:
        prompts = list(PROMPTS_ES)
    resultado = medir(args.modelo, prompts)
    resumen = resumir(resultado["capas"])
    datos = {"modelo": args.modelo, "fecha": datetime.now(timezone.utc).isoformat(),
             "n_prompts": len(prompts), "tokens": resultado.get("tokens", 0),
             "capas": resultado["capas"], "resumen": resumen, "nota": resultado.get("nota", "")}
    with open(args.salida, "w", encoding="utf-8") as archivo:
        json.dump(datos, archivo, ensure_ascii=False, indent=2)
    print(json.dumps(resumen, ensure_ascii=False))
    return 0

if __name__ == "__main__": raise SystemExit(main())
