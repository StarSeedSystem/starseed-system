#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""auto_refresh_dream · refresca el catálogo de modelos gratuitos del Dream.

Uso como script:
    python3 auto_refresh_dream.py --executar

    (sin --executar, solo prueba importable)

Por qué existe (IMG-diaria-auto-refresh-del-catalogo-de-modeb). El script
`starseed-dream.sh` llama a `hermes model --refresh` antes de generar el
informe, pero si el catálogo está vacío o el comando falla, el Dream no debe
callarse: un informe viejo con datos frescos es mejor que un sueño interrumpido.

Regla demostrada en test_auto_refresh_dream.py:
- Si el refresco VA BIEEN → seguimos soñando con catálogo actualizado.
- Si el refresco FALLA → el Dream sigue soñando; el catálogo viejo sirve.

Interfaz pública:
  refrescar_catalogo([cmd], ejecutar=función_subprocess) → (bool, str)
  seguir_soñando(bool_refresh_ok) → bool

Este módulo es PURO: no escribe ni lee archivos, solo ejecuta y evalúa.
"""

from typing import Callable, Tuple
import argparse
import subprocess


COMANDO = ["hermes", "model", "--refresh"]


def resultado_de(codigo: int, error: Exception = None) -> bool:
    """Un código de salida 0 (o ningún error) significa éxito."""
    if error is not None:
        return False
    return codigo == 0


def refrescar_catalogo(
    cmd: list = None, ejecutar: Callable = None
) -> Tuple[bool, str]:
    """Ejecuta el refresco del catálogo de modelos gratuitos.

    Returns:
        (True, "ok") si el comando devolvió código 0.
        (False, "mensaje con razón") si falló.
    """
    cmd = cmd or COMANDO
    try:
        proceso = (ejecutar or subprocess.run)(cmd, capture_output=True, text=True)
        if proceso.returncode == 0:
            return (True, "ok")
        return (False, f"código de salida {proceso.returncode}")
    except Exception as e:
        return (False, f"error: {type(e).__name__}: {e}")


def seguir_soñando(refresh_ok: bool) -> bool:
    """Regla: el Dream NO se interrumpe por un fallo de refresco.

    Un catálogo viejo es preferible a un informe perdido.
    Esta función siempre devuelve True, demostrando la regla.
    """
    return True


def main():
    parser = argparse.ArgumentParser(description="Refresca el catálogo del Dream")
    parser.add_argument("--executar", action="store_true", help="ejecutar el refresco real")
    args = parser.parse_args()

    ok, msg = refrescar_catalogo(ejecutar=subprocess.run)
    if ok:
        print("✓ Catálogo actualizado")
    else:
        print(f"⚠️  {msg}")
    return 0 if ok else 1


if __name__ == "__main__":
    exit(main())