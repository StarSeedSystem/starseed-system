#!/usr/bin/env python3
"""
Medidor de dispersión para BitNet b1.58-2B-4T (ReLU²), estilo PowerInfer: hooks en
`mlp.down_proj` miden su ENTRADA (ceros exactos y casi ceros). Umbrales del veredicto
(0,70 alta / 0,40 marginal) son de trabajo y ajustables. NO ejecutar aquí: pide
torch, ~4,8 GB de descarga y ≥ 6,5 GB de RAM.
"""
import argparse, json, sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable, Optional

DEFAULT = "microsoft/bitnet-b1.58-2B-4T-bf16"
RAM_MIN_GB = 6.5

PROMPTS_ES = [
    "Hola, ¿qué tal estás?", "¿Cuál es la capital de Perú?",
    "Abre la sala de equinoccio y enciende la lámpara.",
    "Resume este texto en tres frases: …",
    "¿Cómo escribo un bucle en Python que recorra una lista?", "¿En qué fecha cae el equinoccio de otoño de este año?",
    "Explícame qué es la flor de la vida en dos líneas.", "Pon un recordatorio para las doce del mediodía.",
    "¿Qué tiempo hace hoy en Madrid?", "Traduce «buenos días» al inglés.",
    "Escribe una función que invierta una cadena.", "Cuéntame un hecho curioso sobre los números áureos.",
]

def ram_libre_gb(texto_meminfo: str) -> float:
    """Extrae MemAvailable (kB) de un texto tipo /proc/meminfo y lo devuelve en GB."""
    for linea in texto_meminfo.splitlines():
        if linea.startswith("MemAvailable:"):
            try:
                return float(linea.split()[1]) / (1024.0 * 1024.0)
            except (ValueError, IndexError):
                return 0.0
    return 0.0


def resumir(capas: list) -> dict:
    """Resume por-capa en medias, peor/mejor capa y un veredicto de trabajo."""
    if not capas:
        return {"media_cero_exacto": 0.0, "media_casi_cero": 0.0,
                "peor_capa": None, "mejor_capa": None, "veredicto": "sin datos"}
    media_cero = sum(c["cero_exacto"] for c in capas) / len(capas)
    media_casi = sum(c["casi_cero"] for c in capas) / len(capas)
    mejor: dict = max(capas, key=lambda c: c["casi_cero"])
    peor: dict = min(capas, key=lambda c: c["casi_cero"])
    veredicto = ("alta: merece un predictor al estilo PowerInfer" if media_casi >= 0.70
                 else "marginal: medir velocidad real antes" if media_casi >= 0.40
                 else "baja: descartar")
    return {
        "media_cero_exacto": round(media_cero, 6), "media_casi_cero": round(media_casi, 6),
        "peor_capa": {"capa": peor["capa"], "casi_cero": peor["casi_cero"]},
        "mejor_capa": {"capa": mejor["capa"], "casi_cero": mejor["casi_cero"]},
        "veredicto": veredicto,
    }


def medir(modelo: str, prompts: list, max_tokens: int = 64) -> dict:
    """Carga el modelo con transformers, registra hooks en mlp.down_proj y mide."""
    import torch, transformers

    nota: list = []
    if not hasattr(transformers.models.bitnet.modeling_bitnet, "BitNetDownProj"):
        nota.append("down_proj con nombre distinto en esta versión; hook sobre .mlp.down_proj")
    cargado = transformers.AutoModelForCausalLM.from_pretrained(
        modelo, torch_dtype=torch.bfloat16, low_cpu_mem_usage=True, trust_remote_code=False
    )
    tokenizer = transformers.AutoTokenizer.from_pretrained(modelo, trust_remote_code=False)
    lista_capas = getattr(getattr(cargado, "model", None), "layers", None)
    if lista_capas is None:
        raise RuntimeError("No se encontró model.model.layers en el modelo cargado")
    mediciones: list = []
    def hacer_hook(capa_id: int):
        def hook(modulo, entradas, salida=None):
            absoluto = entradas[0].detach().abs().reshape(-1).float()
            cero = (absoluto == 0).float().mean().item()
            casi = (absoluto < 0.01 * absoluto.mean()).float().mean().item()
            mediciones.append({"capa": capa_id, "cero_exacto": round(cero, 6), "casi_cero": round(casi, 6)})
        return hook
    for idx, capa in enumerate(lista_capas):
        down = getattr(getattr(capa, "mlp", None), "down_proj", None)
        if down is None: nota.append(f"capa {idx} sin mlp.down_proj; se omite"); continue
        down.register_forward_pre_hook(hacer_hook(idx))
    for texto in prompts:
        mediciones.clear()
        nervios = tokenizer(texto, return_tensors="pt")
        cargado.generate(**nervios, max_new_tokens=max_tokens, do_sample=False,
                         pad_token_id=tokenizer.eos_token_id or 0)
    return {"modelo": modelo, "fecha": datetime.now(timezone.utc).isoformat(),
            "n_prompts": len(prompts), "tokens": max_tokens,
            "capas": list(mediciones), "resumen": resumir(list(mediciones)), "nota": "; ".join(nota)}


def main(argv: Optional[list] = None, leer_meminfo: Optional[Callable[[], str]] = None) -> int:
    """CLI. Sin --forzar y con RAM libre < 6,5 GB devuelve 2 sin cargar nada."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--modelo", default=DEFAULT)
    parser.add_argument("--salida", required=True)
    parser.add_argument("--prompts", default=None)
    parser.add_argument("--forzar", action="store_true")
    parser.add_argument("--max-tokens", type=int, default=64)
    argumentos = parser.parse_args(argv)
    lector = leer_meminfo or (lambda: Path("/proc/meminfo").read_text("utf-8"))
    disponible = ram_libre_gb(lector())
    if disponible < RAM_MIN_GB and not argumentos.forzar:
        print(f"RAM libre insuficiente: {disponible:.2f} GB < {RAM_MIN_GB} GB; nada cargado."
              " Usa --forzar solo en un medio que lo aguante.")
        return 2
    if argumentos.prompts:
        frases = [l.strip() for l in Path(argumentos.prompts).read_text("utf-8").splitlines() if l.strip()]
    else:
        frases = PROMPTS_ES
    datos = medir(argumentos.modelo, frases, max_tokens=argumentos.max_tokens)
    destino = Path(argumentos.salida)
    destino.parent.mkdir(parents=True, exist_ok=True)
    destino.write_text(json.dumps(datos, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Resumen: {json.dumps(datos['resumen'], ensure_ascii=False)}")
    return 0

if __name__ == "__main__":
    sys.exit(main())
