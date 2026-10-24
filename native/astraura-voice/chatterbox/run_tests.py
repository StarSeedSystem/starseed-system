#!/usr/bin/env python3
"""
Ejecutor de las pruebas del servicio Chatterbox sin pytest: corre TODAS las funciones `test_*` de
test_servidor.py (las descubre solo, para que ninguna prueba nueva se quede fuera).
Con pytest: `python3 -m pytest -q test_servidor.py`.
"""

import os
import sys
import traceback

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import test_servidor  # noqa: E402


def main() -> int:
    pruebas = [(n, f) for n, f in vars(test_servidor).items() if n.startswith("test_") and callable(f)]
    print(f"Ejecutando {len(pruebas)} pruebas del servicio Chatterbox...")
    pasadas = 0
    for nombre, prueba in pruebas:
        try:
            prueba()
        except Exception:
            print(f"✗ {nombre}")
            traceback.print_exc(limit=3)
        else:
            pasadas += 1
            print(f"✓ {nombre}")
    print(f"\nResultado: {pasadas}/{len(pruebas)} pruebas pasaron")
    return 0 if pasadas == len(pruebas) else 1


if __name__ == "__main__":
    sys.exit(main())
