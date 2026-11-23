#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""opencode-zen_config · declara los modelos gratuitos de OpenCode Zen en opencode.json.

CAP1119: el medio «opencode-zen» salía «usable» con «configurar proveedor zen»; este
script añade los modelos gratuitos sin tocar lo demás. Nunca escribe claves (Zen usa
`opencode auth login`) ni añade los de pago. Se aplica con `--escribir`; sin él informa.
"""

import argparse
import copy
import json
import os

PROVEEDOR = "opencode"
NOMBRE_PROVEEDOR = "OpenCode Zen (gratis)"
RUTA_POR_DEFECTO = "~/.config/opencode/opencode.json"
MODELOS_ZEN_GRATIS = (
    ("glm-5.3-flash-free", "GLM 5.3 Flash (gratis)"),
    ("deepseek-v4.1-flash-free", "DeepSeek V4.1 Flash (gratis)"),
    ("minimax-m3.1-flash-free", "MiniMax M3.1 Flash (gratis)"),
    ("big-pickle", "Big Pickle (gratis)"),
)

def configurar(cfg):
    """(PURA) (config nueva, cambiado): añade Zen y sus gratuitos sin borrar lo ajeno."""
    nuevo = copy.deepcopy(cfg) if isinstance(cfg, dict) else {}
    antes = json.dumps(nuevo, sort_keys=True, ensure_ascii=False)
    provs = nuevo.get("provider")
    if not isinstance(provs, dict):
        provs = {}
    bloque = provs.get(PROVEEDOR)
    if not isinstance(bloque, dict):
        bloque = {}
    bloque.setdefault("name", NOMBRE_PROVEEDOR)
    modelos = bloque.get("models")
    if not isinstance(modelos, dict):
        modelos = {}
    for mid, nombre in MODELOS_ZEN_GRATIS:
        modelos.setdefault(mid, {"name": nombre})
    bloque["models"] = modelos
    provs[PROVEEDOR] = bloque
    nuevo["provider"] = provs
    return nuevo, antes != json.dumps(nuevo, sort_keys=True, ensure_ascii=False)

def modelos_faltantes(cfg):
    """(PURA) Ids gratuitos de Zen que aún no están declarados."""
    provs = cfg.get("provider") if isinstance(cfg, dict) else None
    bloque = provs.get(PROVEEDOR) if isinstance(provs, dict) else None
    tiene = bloque.get("models") if isinstance(bloque, dict) else None
    tiene = tiene if isinstance(tiene, dict) else {}
    return [mid for mid, _ in MODELOS_ZEN_GRATIS if mid not in tiene]

def esta_configurado(cfg):
    """(PURA) ¿Están ya todos los gratuitos de Zen declarados?"""
    return not modelos_faltantes(cfg)
def resumen(cfg):
    """(PURA) Estado legible: proveedor, modelos, faltantes y si está listo."""
    faltan = modelos_faltantes(cfg)
    return {"proveedor": PROVEEDOR, "listo": not faltan,
            "modelos": [mid for mid, _ in MODELOS_ZEN_GRATIS], "faltantes": faltan}

def leer_config(ruta):
    """Lee el JSON: ausente → {}, roto o no-dict → None (no se sobrescribe)."""
    try:
        with open(os.path.expanduser(ruta), encoding="utf-8") as f:
            cfg = json.load(f)
        return cfg if isinstance(cfg, dict) else None
    except (OSError, ValueError):
        return None if os.path.exists(os.path.expanduser(ruta)) else {}

def escribir_config(ruta, cfg):
    """Guarda de forma atómica (tmp + replace) y devuelve la ruta."""
    destino = os.path.expanduser(ruta)
    carpeta = os.path.dirname(destino)
    if carpeta:
        os.makedirs(carpeta, exist_ok=True)
    tmp = destino + ".tmp-opencode-zen"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(cfg, f, ensure_ascii=False, indent=2)
        f.write("\n")
    os.replace(tmp, destino)
    return destino

def _imprimir(datos):
    """Informe para una persona: qué hay, qué falta y cómo se comprueba."""
    print("OpenCode Zen · %s" % datos["ruta"])
    if datos["listo"]:
        print("  listo: los %d modelos gratuitos están declarados." % len(datos["modelos"]))
    else:
        print("  falta declarar: %s" % ", ".join(datos["faltantes"]))
    if datos["cambiado"]:
        print("  cambio %s" % ("guardado" if datos["escrito"] else "sin guardar (--escribir)"))
    print("  comprobar con: opencode run --model %s/%s \"di ok\""
          % (PROVEEDOR, datos["modelos"][0]))

def main(argv=None):
    """CLI: informa por defecto; con --escribir aplica. 0 = listo, 1 = falta, 2 = roto."""
    ap = argparse.ArgumentParser(description="Declara los modelos gratuitos de OpenCode Zen.")
    ap.add_argument("--ruta", default=RUTA_POR_DEFECTO)
    ap.add_argument("--escribir", action="store_true", help="guarda el cambio")
    ap.add_argument("--json", action="store_true", help="salida en JSON")
    args = ap.parse_args(argv)
    cfg = leer_config(args.ruta)
    if cfg is None:
        print("No puedo leer %s: no es un JSON válido. No lo sobrescribo." % args.ruta)
        return 2
    nuevo, cambiado = configurar(cfg)
    escrito = bool(cambiado and args.escribir)
    if escrito:
        escribir_config(args.ruta, nuevo)
    datos = resumen(nuevo if escrito else cfg)
    datos.update({"ruta": args.ruta, "cambiado": cambiado, "escrito": escrito})
    if args.json:
        print(json.dumps(datos, ensure_ascii=False, indent=2))
    else:
        _imprimir(datos)
    return 0 if datos["listo"] else 1
if __name__ == "__main__":
    raise SystemExit(main())
