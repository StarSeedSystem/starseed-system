#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Medidor de dispersión de activaciones de BitNet b1.58-2B-4T (ReLU²) al estilo PowerInfer.
NO se ejecuta solo: carga el modelo (≈ 4,8 GB) y pide RAM de sobra; nunca en la Mac de 8 GB
con el enjambre encendido. torch y transformers se importan SOLO dentro de medir(); el resto
del módulo es biblioteca estándar. Se mide la ENTRADA de mlp.down_proj de cada capa, valga cero
justo donde la activación ReLU² vale cero. Umbrales del veredicto (de trabajo, ajustables):
media_casi_cero ≥ 0.70 → «alta: merece un predictor al estilo PowerInfer»; de 0.40 a 0.70 →
«marginal: medir velocidad real antes»; < 0.40 → «baja: descartar»; lista vacía → «sin datos».
"""
import argparse, json, sys
from datetime import datetime
from pathlib import Path
MODELO_DEFECTO = "microsoft/bitnet-b1.58-2B-4T-bf16"
RAM_MINIMA_GB = 6.5      # por debajo, main devuelve 2 sin cargar el modelo
MAX_TOKENS = 64          # tokens nuevos por frase
UMBRAL_CASI_CERO = 0.01  # casi cero: |x| < esto por media(|x|) de la capa y ese paso
# Frases del uso real de Astraura: saludo, factual, orden con herramienta, resumen y código.
# --prompts (una por línea) las sustituye.
PROMPTS_ES: list[str] = [
    "Hola, ¿cómo estás hoy?", "¿Cuál es la capital de Perú?",
    "Enciende la luz de la sala y sube la música.", "Resume este texto en tres frases.",
    "¿Qué hace la función pandas.DataFrame.merge?", "¿Qué es la espiral áurea?",
    "Guárdame un recordatorio para mañana a las nueve.", "¿Qué tiempo hará mañana en Madrid?",
    "Escribe un saludo breve para el grupo.", "¿Cómo se pronuncia «efímero»?",
    "Dame tres ideas para una reunión corta.", "Traduce «buenos días» al inglés.",
]

def ram_libre_gb(texto_meminfo: str) -> float:
    """Lee «MemAvailable» (kB) de un texto tipo /proc/meminfo y lo devuelve en GB; 0.0 si no está."""
    for linea in texto_meminfo.splitlines():
        partes = linea.split()
        if len(partes) == 3 and partes[0] == "MemAvailable:" and partes[2] == "kB" and partes[1].isdigit():
            return int(partes[1]) / (1024 * 1024)
    return 0.0

def resumir(capas: list[dict]) -> dict:
    """Medias, peor y mejor capa, y veredicto con los umbrales del docstring del módulo."""
    if not capas:
        return {"media_cero_exacto": 0.0, "media_casi_cero": 0.0,
                "peor_capa": None, "mejor_capa": None, "veredicto": "sin datos"}
    media_casi = sum(f.get("casi_cero", 0.0) for f in capas) / len(capas)
    veredicto = ("alta: merece un predictor al estilo PowerInfer" if media_casi >= 0.70 else
                 "marginal: medir velocidad real antes" if media_casi >= 0.40 else "baja: descartar")
    return {"media_cero_exacto": sum(f.get("cero_exacto", 0.0) for f in capas) / len(capas),
            "media_casi_cero": media_casi, "veredicto": veredicto,
            "peor_capa": min(capas, key=lambda f: f.get("casi_cero", 0.0)).get("capa"),
            "mejor_capa": max(capas, key=lambda f: f.get("casi_cero", 0.0)).get("capa")}

def medir(modelo: str, prompts: list[str], max_tokens: int = MAX_TOKENS) -> dict:
    """Carga el modelo en BF16 (nunca trust_remote_code=True), genera y mide por capa."""
    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer

    red = AutoModelForCausalLM.from_pretrained(modelo, torch_dtype=torch.bfloat16,
                                               low_cpu_mem_usage=True, trust_remote_code=False)
    red.eval(); total = len(red.model.layers)
    notas = [f"capas_detectadas={total}; gancho: ENTRADA de mlp.down_proj (cero del ReLU²)"]
    registro: dict = {}; ganchos: list = []
    for indice, capa in enumerate(red.model.layers):
        registro[indice] = []
        modulo = getattr(capa.mlp, "down_proj", None)
        if modulo is None:  # si el transformers instalado renombró down_proj, se busca por nombre
            for nombre, hijo in capa.mlp.named_modules():
                if "down" in nombre.lower():
                    modulo = hijo
                    break
            notas.append(f"capa {indice}: down_proj buscado por nombre en mlp")
        if modulo is None:
            notas.append(f"capa {indice}: sin módulo down_*; no medida")
            continue
        def gancho(_m, entradas, _s, n=indice):
            x = entradas[0].detach().to(torch.float32)
            limite = UMBRAL_CASI_CERO * x.abs().mean()
            registro[n].append(((x == 0).float().mean().item(),
                                (x.abs() < limite).float().mean().item()))
        ganchos.append(modulo.register_forward_pre_hook(gancho))
    tokenizador = AutoTokenizer.from_pretrained(modelo)
    try:
        with torch.no_grad():
            for frase in prompts:
                red.generate(**tokenizador(frase, return_tensors="pt"), max_new_tokens=max_tokens,
                             do_sample=False, pad_token_id=tokenizador.eos_token_id or 0)
    finally:
        for g in ganchos:
            g.remove()
    capas = [{"capa": i, "cero_exacto": sum(a for a, _ in r) / len(r),
              "casi_cero": sum(b for _, b in r) / len(r)}
             for i in range(total) if (r := registro.get(i))]
    return {"capas": capas, "nota": " · ".join(notas)}

def main(argv=None, leer_meminfo=None) -> int:
    """CLI: --modelo, --salida, --prompts, --forzar. Con RAM insuficiente devuelve 2 sin cargar nada."""
    parser = argparse.ArgumentParser(description="Mide la dispersión de activaciones de una FFN ReLU².")
    parser.add_argument("--modelo", default=MODELO_DEFECTO, help="Id de HF del modelo a medir")
    parser.add_argument("--salida", required=True, help="Ruta del JSON con el resultado")
    parser.add_argument("--prompts", help="Fichero con una frase por línea; sustituye PROMPTS_ES")
    parser.add_argument("--forzar", action="store_true", help="Ignorar el mínimo de RAM libre")
    args = parser.parse_args(argv)
    texto = leer_meminfo() if leer_meminfo else Path("/proc/meminfo").read_text(encoding="utf-8", errors="replace")
    ram_gb = ram_libre_gb(texto)
    if ram_gb < RAM_MINIMA_GB and not args.forzar:
        print(f"RAM libre {ram_gb:.2f} GB < {RAM_MINIMA_GB} GB necesarios (modelo ≈ 4,8 GB); nada cargado. Usa --forzar.")
        return 2
    frases = ([t.strip() for t in Path(args.prompts).read_text(encoding="utf-8").splitlines() if t.strip()]
              if args.prompts else PROMPTS_ES)
    if not frases:
        print("Sin frases: ni PROMPTS_ES ni --prompts dieron texto.")
        return 2
    medido = medir(args.modelo, frases)
    datos = {"modelo": args.modelo, "fecha": datetime.now().isoformat(timespec="seconds"),
             "n_prompts": len(frases), "tokens": len(frases) * MAX_TOKENS,
             "capas": medido["capas"], "resumen": resumir(medido["capas"]), "nota": medido["nota"]}
    Path(args.salida).write_text(json.dumps(datos, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Escrito {args.salida}: {datos['resumen']['veredicto']}")
    return 0

if __name__ == "__main__":
    sys.exit(main())
