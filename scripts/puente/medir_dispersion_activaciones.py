#!/usr/bin/env python3
"""Mide la dispersión FFN de BitNet b1.58-2B-4T (ReLU²) para decidir, con datos, si
merece la pena un predictor al estilo PowerInfer. Solo mide: pide ~4,8 GB de descarga y
≥ 6,5 GB de RAM libre, así que no lo ejecutes en la Mac de 8 GB con el enjambre."""
from __future__ import annotations

import argparse, json
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable, Dict, List, Optional

UMBRAL_RAM_GB, MODELO_POR_DEFECTO = 6.5, "microsoft/bitnet-b1.58-2B-4T-bf16"
PROMPTS_ES = [
    "Hola, buenos días, ¿cómo estás?", "¿Cuál es la capital de Portugal?", "Abre la ventana de configuración del sistema.",
    "Resume en dos frases qué es StarSeed OS.", "Recuérdame mañana llamar a mi hermana.", "Busca en la biblioteca un libro sobre geometría sagrada.",
    "Explícame qué es la proporción áurea.", "¿Qué tiempo hace hoy en Barcelona?", "Organiza estas tareas por prioridad: comprar pan, pagar la luz, escribir el informe.",
    "Escribe una función en Python que sume dos números.", "Traduce al inglés: la conciencia es la raíz del sistema.", "Dime tres ideas para una comunidad autosuficiente.",
]
def ram_libre_gb(texto_meminfo: str) -> float:
    """MemAvailable (kB) de /proc/meminfo en GB; 0.0 si falta."""
    for linea in (texto_meminfo or "").splitlines():
        if linea.startswith("MemAvailable:"):
            try:
                return round(int(linea.split()[1]) / (1024 ** 2), 2)
            except (IndexError, ValueError):
                return 0.0
    return 0.0
def resumir(capas: List[Dict]) -> Dict:
    """Resume la dispersión y da veredicto. Umbrales de trabajo, ajustables: casi_cero
    medio ≥ 0,70 alta; 0,40–0,70 marginal (medir velocidad real antes); < 0,40 baja.
    Se usa casi_cero (|x| < 1 % de la media) porque ReLU² deja valores diminutos."""
    if not capas:
        return {"media_cero_exacto": 0.0, "media_casi_cero": 0.0, "peor_capa": None, "mejor_capa": None, "veredicto": "sin datos"}
    media_cero = sum(float(c["cero_exacto"]) for c in capas) / len(capas)
    media_casi = sum(float(c["casi_cero"]) for c in capas) / len(capas)
    peor = min(capas, key=lambda c: float(c["casi_cero"]))
    mejor = max(capas, key=lambda c: float(c["casi_cero"]))
    v = ("alta: merece un predictor al estilo PowerInfer" if media_casi >= 0.70
         else "marginal: medir velocidad real antes" if media_casi >= 0.40 else "baja: descartar")
    return {"media_cero_exacto": media_cero, "media_casi_cero": media_casi,
            "peor_capa": peor["capa"], "mejor_capa": mejor["capa"], "veredicto": v}
def medir(modelo: str, prompts: List[str], max_tokens: int = 64) -> Dict:
    """Carga el modelo y mide sobre la ENTRADA de down_proj de cada capa."""
    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer
    tok = AutoTokenizer.from_pretrained(modelo, trust_remote_code=False)
    red = AutoModelForCausalLM.from_pretrained(modelo, torch_dtype=torch.bfloat16, low_cpu_mem_usage=True, trust_remote_code=False)
    red.eval()
    medidas: List[List[Dict[str, float]]] = [[] for _ in red.model.layers]
    nota, manejadores = "", []
    for indice, capa in enumerate(red.model.layers):
        proyeccion = getattr(getattr(capa, "mlp", None), "down_proj", None)
        nombre = "mlp.down_proj"
        if proyeccion is None:
            for nombre, modulo in capa.named_modules():
                if nombre.endswith("down_proj"):
                    proyeccion = modulo
                    break
        if proyeccion is None:
            nota = "no se encontró down_proj: capa saltada"
            continue
        if nombre != "mlp.down_proj":
            nota = f"hook adaptado al nombre real del módulo: {nombre}"
        def hook(_modulo, entrada, i=indice):
            x = entrada[0].detach().float()
            total = x.numel()
            if total:
                media = float(x.abs().mean())
                cero = float((x == 0).sum()) / total
                casi = float((x.abs() < 0.01 * media).sum()) / total if media else 1.0
                medidas[i].append({"cero_exacto": cero, "casi_cero": casi})

        manejadores.append(proyeccion.register_forward_pre_hook(hook))
    tokens = 0
    try:
        with torch.no_grad():
            for frase in prompts:
                entrada = tok(frase, return_tensors="pt")
                salida = red.generate(**entrada, max_new_tokens=max_tokens, do_sample=False)
                tokens += int(salida.shape[-1] - entrada["input_ids"].shape[-1])
    finally:
        for manejador in manejadores:
            manejador.remove()
    filas = [{"capa": i, "cero_exacto": sum(p["cero_exacto"] for p in pasos) / len(pasos),
              "casi_cero": sum(p["casi_cero"] for p in pasos) / len(pasos)}
             for i, pasos in enumerate(medidas) if pasos]
    return {"capas": filas, "tokens": tokens, "nota": nota}

def main(argv: Optional[List[str]] = None,
         leer_meminfo: Optional[Callable[[], str]] = None) -> int:
    """Puerta de RAM, medida y escritura del JSON de resultados."""
    p = argparse.ArgumentParser(description="Dispersión de activaciones de BitNet.")
    p.add_argument("--modelo", default=MODELO_POR_DEFECTO); p.add_argument("--salida", default="")
    p.add_argument("--prompts", default=""); p.add_argument("--forzar", action="store_true")
    args = p.parse_args(argv)
    try:
        libre = ram_libre_gb((leer_meminfo or (lambda: Path("/proc/meminfo").read_text(encoding="utf-8")))())
    except OSError:
        libre = 0.0
    if libre < UMBRAL_RAM_GB and not args.forzar:
        print(f"RAM libre {libre} GB < {UMBRAL_RAM_GB} GB: no se carga {args.modelo}. "
              "Libérala o usa --forzar en un medio que lo aguante.")
        return 2
    prompts = PROMPTS_ES
    if args.prompts:
        prompts = [l.strip() for l in Path(args.prompts).read_text(encoding="utf-8").splitlines()
                   if l.strip()]
    r = medir(args.modelo, prompts)
    informe = {"modelo": args.modelo, "fecha": datetime.now(timezone.utc).isoformat(), "n_prompts": len(prompts),
               "tokens": r["tokens"], "capas": r["capas"], "resumen": resumir(r["capas"]), "nota": r.get("nota", "")}
    texto = json.dumps(informe, ensure_ascii=False, indent=2)
    if args.salida:
        Path(args.salida).write_text(texto + "\n", encoding="utf-8")
        print(f"Escrito {args.salida}: {informe['resumen']['veredicto']}")
    else:
        print(texto)
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
