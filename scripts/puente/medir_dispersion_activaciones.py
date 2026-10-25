#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Mide si BitNet b1.58-2B-4T es disperso (usa ReLU²) para evaluar PowerInfer; no se ejecuta.
casi_cero = |x| < 0,01 × media(|x|) en down_proj. Umbrales ajustables: ≥ 0,70 alta; 0,40–0,70
marginal; < 0,40 baja. Pide torch, transformers y ≥ 6,5 GB de RAM libres.
"""
from __future__ import annotations
import argparse, json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Sequence
MODELO_POR_DEFECTO = "microsoft/bitnet-b1.58-2B-4T-bf16"
UMBRAL_RAM_GB, UMBRAL_CASI_CERO = 6.5, 0.01
PROMPTS_ES: List[str] = [
    "Hola, ¿quién eres y qué puedes hacer por mí?", "¿Cuál es la capital de Portugal?",
    "Abre la calculadora y suma 347 más 129.", "Resume en tres frases este texto sobre la marea.",
    "¿Por qué falla este código de TypeScript: const x: number = 'hola'?",
    "Recuérdame llamar a Alex mañana a las nueve.", "Explícame la diferencia entre ReLU y ReLU al cuadrado.",
    "Traduce al inglés: la semilla contiene el bosque.", "Ordena estas tareas por importancia: regar, escribir, descansar.",
    "¿Qué hora es en Tokio si en Madrid son las doce?", "Escribe un correo breve para pedir una reunión el jueves.",
    "Dame tres ideas para ahorrar batería en un portátil.",
]
def ram_libre_gb(texto_meminfo: str) -> float:
    for linea in (texto_meminfo or "").splitlines():
        if linea.startswith("MemAvailable:"):
            try:
                return float(linea.split()[1]) / (1024.0 * 1024.0)
            except (IndexError, ValueError):
                return 0.0
    return 0.0
def resumir(capas: List[Dict]) -> Dict:
    """Resume las capas y dicta el veredicto; lista vacía da «sin datos». Umbrales de trabajo
    ajustables: media_casi_cero ≥ 0,70 alta; 0,40–0,70 marginal; < 0,40 baja."""
    if not capas:
        return {"media_cero_exacto": 0.0, "media_casi_cero": 0.0, "peor_capa": None,
                "mejor_capa": None, "veredicto": "sin datos"}
    media_exacto = sum(float(c["cero_exacto"]) for c in capas) / len(capas)
    media_casi = sum(float(c["casi_cero"]) for c in capas) / len(capas)
    veredicto = ("alta: merece un predictor al estilo PowerInfer" if media_casi >= 0.70 else
                 "marginal: medir velocidad real antes" if media_casi >= 0.40 else "baja: descartar")
    return {"media_cero_exacto": media_exacto, "media_casi_cero": media_casi,
            "peor_capa": dict(min(capas, key=lambda c: float(c["casi_cero"]))),
            "mejor_capa": dict(max(capas, key=lambda c: float(c["casi_cero"]))),
            "veredicto": veredicto}
def _hook_de(acc: Dict, indice: int) -> Callable:
    def _hook(_modulo: Any, args: Any) -> None:
        if not args or not hasattr(args[0], "numel"): return None
        x = args[0].detach().float(); total = int(x.numel())
        if not total: return None
        media = float(x.abs().mean())
        acc["ceros"] += int((x == 0).sum().item())
        acc["casi"] += int((x.abs() < UMBRAL_CASI_CERO * media).sum().item() if media > 0 else total)
        acc["total"] += total
        if indice == 0:
            forma = [int(d) for d in x.shape]
            acc["tokens"] += forma[0] * forma[1] if len(forma) >= 2 else forma[0]
    return _hook
def medir(modelo: str = MODELO_POR_DEFECTO, prompts: Optional[Sequence[str]] = None,
          max_tokens: int = 64) -> Dict:
    """Carga el modelo y mide; torch y transformers se importan aquí dentro."""
    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer
    prompts = list(prompts) if prompts else list(PROMPTS_ES)
    cargado = AutoModelForCausalLM.from_pretrained(
        modelo, torch_dtype=torch.bfloat16, low_cpu_mem_usage=True, trust_remote_code=False)
    cargado.eval(); tok = AutoTokenizer.from_pretrained(modelo, trust_remote_code=False)
    capas_modelo = getattr(getattr(cargado, "model", cargado), "layers", None)
    if not capas_modelo: raise RuntimeError("no encuentro model.model.layers en este modelo")
    accs = [{"capa": i, "ceros": 0, "casi": 0, "total": 0, "tokens": 0} for i in range(len(capas_modelo))]
    manejadores, adaptado = [], False
    for i, capa in enumerate(capas_modelo):
        mlp = getattr(capa, "mlp", None)
        objetivo = getattr(mlp, "down_proj", None) if mlp is not None else None
        if objetivo is None:
            hallados = [m for n, m in capa.named_modules() if n.endswith("down_proj")]
            objetivo, adaptado = (hallados[-1] if hallados else None), True
        if objetivo is None: raise RuntimeError(f"no encuentro down_proj en la capa {i}")
        manejadores.append(objetivo.register_forward_pre_hook(_hook_de(accs[i], i)))
    try:
        with torch.no_grad():
            for prompt in prompts:
                cargado.generate(**tok(prompt, return_tensors="pt"), max_new_tokens=max_tokens, do_sample=False, pad_token_id=tok.eos_token_id)
    finally:
        for manejador in manejadores: manejador.remove()
    capas = [{"capa": a["capa"], "cero_exacto": a["ceros"] / (a["total"] or 1), "casi_cero": a["casi"] / (a["total"] or 1)} for a in accs]
    nota = "hooks sobre la entrada de layer.mlp.down_proj (ReLU² de BitNet)"
    if adaptado: nota += "; down_proj fuera de mlp: buscado por nombre en la capa"
    return {"capas": capas, "tokens": accs[0]["tokens"] if accs else 0, "nota": nota}
def main(argv: Optional[Sequence[str]] = None,
         leer_meminfo: Optional[Callable[[], str]] = None) -> int:
    """Puerta de memoria, medida y escritura del JSON; devuelve el código de salida."""
    parser = argparse.ArgumentParser(description="Dispersión de activaciones de BitNet.")
    parser.add_argument("--modelo", default=MODELO_POR_DEFECTO); parser.add_argument("--salida", default="dispersion-activaciones-bitnet.json")
    parser.add_argument("--prompts", help="archivo con una frase por línea"); parser.add_argument("--forzar", action="store_true")
    args = parser.parse_args(argv)
    info = leer_meminfo() if leer_meminfo else (Path("/proc/meminfo").read_text(encoding="utf-8")
                                                if Path("/proc/meminfo").exists() else "")
    libre = ram_libre_gb(info)
    if libre < UMBRAL_RAM_GB and not args.forzar:
        print(f"Memoria libre {libre:.2f} GB < {UMBRAL_RAM_GB:.2f} GB: no se carga el modelo. "
              "Cierra el enjambre o usa --forzar si sabes que cabe.")
        return 2
    if args.prompts:
        try:
            prompts = [l.strip() for l in Path(args.prompts).read_text(encoding="utf-8").splitlines() if l.strip()]
        except OSError as error:
            print(f"No puedo leer los prompts: {error}"); return 1
    else:
        prompts = list(PROMPTS_ES)
    resultado = medir(args.modelo, prompts); resumen = resumir(resultado["capas"])
    salida = Path(args.salida)
    salida.parent.mkdir(parents=True, exist_ok=True)
    datos = {"modelo": args.modelo, "fecha": datetime.now(timezone.utc).isoformat(),
             "n_prompts": len(prompts), "tokens": resultado["tokens"], "capas": resultado["capas"],
             "resumen": resumen, "nota": resultado["nota"]}
    salida.write_text(json.dumps(datos, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Medida escrita en {salida}: {resumen['veredicto']}")
    return 0
if __name__ == "__main__":
    raise SystemExit(main())
