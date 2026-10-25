#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Vigía de modelos y versiones: MetaGenesis (Ola 1016M · VGM1016D).
Contratos: architecture/vigia-modelos.md §2-§6, config/vigia-areas.json.
Delegación a `vigia_modelos_evaluar` y `vigia_modelos_orquesta` (≤ 120 líneas por archivo)."""
from __future__ import annotations
import argparse, sys
from typing import Optional
from scripts.puente.vigia_modelos_evaluar import descubrir, evaluar, VigiaError, LIMITE_FICHAS_DIA
from scripts.puente.vigia_modelos_orquesta import orquestar_pasada, escribir_novedades, escribir_cola

def main(argv: Optional[list] = None) -> int:
    parser = argparse.ArgumentParser(description="Vigía de modelos MetaGenesis")
    parser.add_argument("--seco", action="store_true", help="No escribe colas ni avisa")
    parser.add_argument("--area", type=str, default=None, help="Solo un área")
    args = parser.parse_args(argv)
    try:
        resultado = orquestar_pasada(seco=args.seco, solo_area=args.area)
        print(f"Pasada completada: {resultado['fecha']} · {resultado['novedades']} candidatos · {resultado['mejores']} mejores · archivo: {resultado['archivo_novedades']}")
        return 0
    except VigiaError as e:
        print(f"Error del vigía: {e}", file=sys.stderr)
        return 1
if __name__ == "__main__":
    sys.exit(main())
