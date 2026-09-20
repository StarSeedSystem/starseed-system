#!/usr/bin/env python3
"""Ejecuta una orden con el TURNO de la máquina (el mismo que usan tsc/vitest del
enjambre y publicar.py), para que `next build` no se pelee por la RAM con los agentes.

    python3 scripts/puente/con-turno.py -- bash scripts/starseed-ligero.sh construir
"""
import os
import subprocess
import sys

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
if DIRECTORIO not in sys.path:
    sys.path.insert(0, DIRECTORIO)
import turno_pesado as TP  # noqa: E402


def main() -> int:
    args = sys.argv[1:]
    if args and args[0] == "--":
        args = args[1:]
    if not args:
        print(__doc__)
        return 2

    def avisar(segundos):
        print("esperando turno de máquina (%d s): el enjambre está compilando…" % segundos, flush=True)

    with TP.turno(avisar=avisar):
        return subprocess.call(args)


if __name__ == "__main__":
    sys.exit(main())
