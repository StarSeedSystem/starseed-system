#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""opencode-zen_config · deja los modelos gratuitos de OpenCode Zen listos para el enjambre.

Por qué existe (CAP1119). OpenCode Zen ofrece modelos de coste cero, pero opencode no los
usa si su `opencode.json` no los declara: el enjambre se queda sin ese carril y nadie ve el
motivo. `medios_disponibles` y `renovador-pasarelas` ya saben detectarlo; faltaba el guion
que lo ESCRIBE. Esto es ese guion.

El proveedor `opencode` es el integrado de opencode: la sesión (`opencode auth login` o
`OPENCODE_API_KEY` en el entorno) es la que autentica. Por eso este módulo **no escribe
ninguna clave**: solo nombres de modelos. Si mañana hiciera falta una, iría como la sintaxis
literal `{env:VARIABLE}`, jamás su valor.

Uso:
    python3 scripts/puente/opencode-zen_config.py                 # enseña qué haría
    python3 scripts/puente/opencode-zen_config.py --escribir      # lo aplica (con copia .bak)
    python3 scripts/puente/opencode-zen_config.py --json          # imprime la configuración

Funciones puras (probadas en `test_opencode_zen_config.py`): `bloque_zen`, `fusionar` y
`esta_configurado`. Quien llama lee y escribe el archivo.
"""

import argparse
import copy
import json
import os
import shutil
import sys

PROVEEDOR = "opencode"
NOMBRE = "OpenCode Zen"
RUTA_POR_DEFECTO = "~/.config/opencode/opencode.json"

# Los gratuitos que usa la casa (memory/orquestacion-economica.md). La lista rota: si
# OpenCode retira uno, `esta_configurado` lo dirá y bastará actualizar aquí.
MODELOS_GRATIS = (
    "glm-5.3-flash-free",
    "deepseek-v4.1-flash-free",
    "minimax-m3.1-flash-free",
    "big-pickle",
)


def modelos_gratis():
    """Ids de los modelos gratuitos que hay que declarar."""
    return list(MODELOS_GRATIS)


def bloque_zen(modelos=None):
    """Bloque `provider.opencode` con los modelos gratuitos, sin ninguna clave."""
    ids = list(MODELOS_GRATIS if modelos is None else modelos)
    return {
        "name": NOMBRE,
        "models": {modelo: {"name": modelo} for modelo in ids},
    }


def _copia(config):
    """Copia profunda del dict recibido, o `{}` si no sirve como configuración."""
    if not isinstance(config, dict):
        return {}
    return copy.deepcopy(config)


def fusionar(config, modelos=None):
    """Devuelve (configuración nueva, cambió) con el proveedor Zen añadido.

    No borra nada: conserva otros proveedores, campos y modelos ya declarados. La entrada
    no se muta. Es idempotente: aplicarla dos veces no cambia nada la segunda vez.
    """
    original = _copia(config)
    nuevo = copy.deepcopy(original)
    proveedores = nuevo.get("provider")
    if not isinstance(proveedores, dict):
        proveedores = {}
        nuevo["provider"] = proveedores
    bloque = proveedores.get(PROVEEDOR)
    if not isinstance(bloque, dict):
        bloque = {}
        proveedores[PROVEEDOR] = bloque
    if not isinstance(bloque.get("models"), dict):
        bloque["models"] = {}
    ids = list(MODELOS_GRATIS if modelos is None else modelos)
    for modelo in ids:
        entrada = bloque["models"].get(modelo)
        if not isinstance(entrada, dict):
            bloque["models"][modelo] = {"name": modelo}
    return nuevo, nuevo != original


def esta_configurado(config, modelos=None):
    """¿Están declarados todos los modelos gratuitos bajo `provider.opencode`?"""
    if not isinstance(config, dict):
        return False
    bloque = (config.get("provider") or {}).get(PROVEEDOR)
    if not isinstance(bloque, dict) or not isinstance(bloque.get("models"), dict):
        return False
    ids = list(MODELOS_GRATIS if modelos is None else modelos)
    return all(modelo in bloque["models"] for modelo in ids)


def leer_config(ruta):
    """Lee la configuración de opencode. Si no existe, devuelve `{}`.

    Si existe pero no es JSON válido, lanza `ValueError`: mejor no pisar a ciegas un
    archivo roto (podría tener el resto de proveedores del enjambre).
    """
    if not os.path.exists(ruta):
        return {}
    with open(ruta, encoding="utf-8") as f:
        datos = json.load(f)
    if not isinstance(datos, dict):
        raise ValueError("la configuración no es un objeto JSON: %s" % ruta)
    return datos


def escribir_config(ruta, config):
    """Escribe la configuración dejando una copia `.bak` de la anterior, si la había.

    La escritura es atómica (temporal + `os.replace`) para que un corte no deje el
    `opencode.json` a medias y el enjambre sin proveedores.
    """
    carpeta = os.path.dirname(ruta) or "."
    os.makedirs(carpeta, exist_ok=True)
    if os.path.exists(ruta):
        shutil.copy2(ruta, ruta + ".bak")
    temporal = ruta + ".tmp"
    with open(temporal, "w", encoding="utf-8") as f:
        json.dump(config, f, ensure_ascii=False, indent=2)
        f.write("\n")
    os.replace(temporal, ruta)


def main(argv=None):
    parser = argparse.ArgumentParser(
        description="Declara los modelos gratuitos de OpenCode Zen en opencode.json."
    )
    parser.add_argument("--config", default=RUTA_POR_DEFECTO,
                        help="ruta de opencode.json (por defecto ~/.config/opencode/opencode.json)")
    parser.add_argument("--escribir", action="store_true",
                        help="aplica los cambios (hace copia .bak)")
    parser.add_argument("--json", action="store_true",
                        help="imprime la configuración resultante como JSON")
    args = parser.parse_args(argv)
    ruta = os.path.expanduser(args.config)
    try:
        config = leer_config(ruta)
    except (OSError, ValueError) as e:
        print("error: %s" % e, file=sys.stderr)
        return 2
    nuevo, cambiado = fusionar(config)
    if args.json:
        print(json.dumps(nuevo, ensure_ascii=False, indent=2))
    else:
        estado = "configurado" if esta_configurado(nuevo) else "incompleto"
        print("OpenCode Zen: %s" % estado)
        print("cambios: %s" % ("sí" if cambiado else "no"))
        print("archivo: %s" % ruta)
        if cambiado and not args.escribir:
            print("para aplicarlo: python3 scripts/puente/opencode-zen_config.py --escribir")
    if args.escribir:
        try:
            escribir_config(ruta, nuevo)
        except OSError as e:
            print("error: %s" % e, file=sys.stderr)
            return 2
        if not args.json:
            print("escrito: %s" % ruta)
    return 0


if __name__ == "__main__":
    sys.exit(main())
