#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Mide si la FFN ReLU² de BitNet b1.58-2B-4T es dispersa como para PowerInfer.
No se ejecuta aquí: pide torch, ~4,8 GB de pesos y ≥ 6,5 GB de RAM libre.
Umbrales ajustables: casi_cero medio ≥ 0,70 alta; 0,40–0,70 marginal;
< 0,40 baja. «Casi cero» es |x| < 0,01 · media(|x|) de la capa en el paso.
"""
import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
MODELO_POR_DEFECTO = "microsoft/bitnet-b1.58-2B-4T-bf16"
RAM_MINIMA_GB = 6.5
FRACCION_CASI_CERO = 0.01

PROMPTS_ES = [
    "Hola, ¿cómo estás hoy?", "¿Cuál es la capital de Francia?", "Abre la aplicación de notas y crea una lista.",
    "Resume este texto en tres frases.", "¿Qué es un sólido platónico?", "Explícame la diferencia entre latencia y rendimiento.",
    "Busca en el código dónde se define el cliente de Supabase.", "Recuérdame llamar a Alex mañana a las diez.",
    "Escribe una función que sume dos números.", "¿Qué tiempo hará en Madrid el sábado?", "Traduce al inglés: la semilla contiene el bosque.",
    "Dame tres ideas para una publicación de la red.",
]

def ram_libre_gb(texto_meminfo: str) -> float:
    """Devuelve GB libres según MemAvailable (kB) o 0.0 si no está."""
    for linea in (texto_meminfo or "").splitlines():
        if linea.startswith("MemAvailable:"):
            partes = linea.split()
            return float(partes[1]) / 1048576.0 if len(partes) > 1 else 0.0
    return 0.0

def resumir(capas: list[dict]) -> dict:
    """Resume la dispersión por capa y emite el veredicto de trabajo."""
    if not capas:
        return {"media_cero_exacto": 0.0, "media_casi_cero": 0.0,
                "peor_capa": None, "mejor_capa": None, "veredicto": "sin datos"}
    media_cero = sum(c["cero_exacto"] for c in capas) / len(capas)
    media_casi = sum(c["casi_cero"] for c in capas) / len(capas)
    peor = min(capas, key=lambda c: c["casi_cero"])["capa"]
    mejor = max(capas, key=lambda c: c["casi_cero"])["capa"]
    veredicto = ("alta: merece un predictor al estilo PowerInfer" if media_casi >= 0.70
                 else "marginal: medir velocidad real antes" if media_casi >= 0.40
                 else "baja: descartar")
    return {"media_cero_exacto": media_cero, "media_casi_cero": media_casi,
            "peor_capa": peor, "mejor_capa": mejor, "veredicto": veredicto}

def medir(modelo: str, prompts: list[str], max_tokens: int = 64) -> dict:
    """Carga el modelo y mide ceros en la ENTRADA de down_proj por capa."""
    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer
    tok = AutoTokenizer.from_pretrained(modelo, trust_remote_code=False)
    net = AutoModelForCausalLM.from_pretrained(
        modelo, torch_dtype=torch.bfloat16, low_cpu_mem_usage=True,
        trust_remote_code=False)
    net.eval()
    capas = list(net.model.layers)
    acc = [{"capa": i, "elem": 0, "cero": 0, "casi": 0} for i in range(len(capas))]
    ganchos, nombres, nota = [], set(), ""
    for i, capa in enumerate(capas):
        mlp = capa.mlp
        nombre = next((n for n in ("down_proj", "c_proj", "proj")
                       if getattr(mlp, n, None) is not None), None)
        if nombre is None:
            nota = "sin down_proj: revisar modeling_bitnet del transformers instalado"
            continue
        nombres.add(nombre)
        def gancho(_mod, entrada, idx=i):
            x = entrada[0].detach().float()
            absx, media = x.abs(), x.abs().mean()
            acc[idx]["elem"] += x.numel()
            acc[idx]["cero"] += int((x == 0).sum())
            acc[idx]["casi"] += int((absx < FRACCION_CASI_CERO * media).sum())

        ganchos.append(getattr(mlp, nombre).register_forward_pre_hook(gancho))
    if nombres - {"down_proj"} and not nota:
        nota = "hook adaptado; módulo FFN: " + ", ".join(sorted(nombres))
    tokens = 0
    with torch.no_grad():
        for prompt in prompts:
            entrada = tok(prompt, return_tensors="pt")
            salida = net.generate(**entrada, max_new_tokens=max_tokens, do_sample=False)
            tokens += int(salida.shape[-1])
    for g in ganchos: g.remove()
    filas = [{"capa": a["capa"], "cero_exacto": a["cero"] / a["elem"], "casi_cero": a["casi"] / a["elem"]}
             for a in acc if a["elem"]]
    return {"tokens": tokens, "capas": filas, "nota": nota}

def main(argv=None, leer_meminfo=None) -> int:
    """CLI: comprueba RAM, mide y escribe el JSON; 2 si falta RAM sin --forzar."""
    parser = argparse.ArgumentParser(description="Dispersión de activaciones FFN")
    parser.add_argument("--modelo", default=MODELO_POR_DEFECTO)
    parser.add_argument("--salida", default="")
    parser.add_argument("--prompts", default="")
    parser.add_argument("--forzar", action="store_true")
    args = parser.parse_args(argv)
    leer = leer_meminfo or (lambda: Path("/proc/meminfo").read_text(encoding="utf-8") if Path("/proc/meminfo").exists() else "")
    libre = ram_libre_gb(leer())
    if libre < RAM_MINIMA_GB and not args.forzar:
        print(f"RAM libre {libre:.2f} GB < {RAM_MINIMA_GB} GB; usa --forzar.")
        return 2
    if args.prompts:
        texto = Path(args.prompts).read_text(encoding="utf-8")
        prompts = [linea.strip() for linea in texto.splitlines() if linea.strip()]
    else:
        prompts = list(PROMPTS_ES)
    resultado = medir(args.modelo, prompts)
    datos = {"modelo": args.modelo, "fecha": datetime.now(timezone.utc).isoformat(),
             "n_prompts": len(prompts), "tokens": resultado["tokens"],
             "capas": resultado["capas"], "resumen": resumir(resultado["capas"]),
             "nota": resultado["nota"]}
    texto_json = json.dumps(datos, ensure_ascii=False, indent=2)
    if args.salida:
        Path(args.salida).write_text(texto_json + "\n", encoding="utf-8")
        print(f"Escrito {args.salida}")
    else:
        print(texto_json)
    return 0
if __name__ == "__main__":
    main()
