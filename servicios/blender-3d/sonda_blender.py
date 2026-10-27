#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Sonda fija que corre DENTRO de Blender (BLD1025B). Sin red y sin tocar archivos.

Imprime una sola línea «STARSEED_SONDA:{json}» que lee servicios/blender-3d/deteccion.py.
"""
import json
import sys

TIPOS = {"CUDA": "cuda", "OPTIX": "optix", "HIP": "hip", "ONEAPI": "oneapi", "METAL": "metal"}


def _tipo(valor):
    """Identificador de un enum de Blender (get_device_types devuelve tuplas de enum_items)."""
    if isinstance(valor, (tuple, list)):
        valor = valor[0]
    return str(getattr(valor, "identifier", valor)).upper()


def principal():
    import bpy

    prefs = bpy.context.preferences.addons["cycles"].preferences
    try:
        prefs.get_devices(bpy.context)
    except (AttributeError, TypeError):
        try:
            prefs.get_devices()
        except (AttributeError, TypeError):
            pass
    tipos = [_tipo(t) for t in prefs.get_device_types(bpy.context)]
    dispositivos = [{"tipo": str(d.type).upper(), "uso": bool(getattr(d, "use", False))} for d in prefs.devices]
    gpu = sorted({TIPOS[d["tipo"]] for d in dispositivos if d["tipo"] in TIPOS})
    if not gpu and sys.platform == "darwin" and "METAL" in tipos:
        gpu = ["metal"]
    motores = ["workbench", "cycles-cpu"]
    if gpu:
        motores += ["cycles-gpu", "eevee"]
    ffmpeg = bool(getattr(bpy.app.build_options, "codec_ffmpeg", False))
    return {"tipos": tipos, "dispositivos": len(dispositivos), "gpu": gpu, "motores": motores,
            "ffmpeg": ffmpeg, "version": ".".join(str(n) for n in bpy.app.version), "hash": bpy.app.build_hash}


def main():
    try:
        datos = principal()
    except Exception as e:  # noqa: BLE001 - la sonda nunca debe tumbar Blender con una traza
        datos = {"error": type(e).__name__}
    sys.stdout.write("STARSEED_SONDA:" + json.dumps(datos, ensure_ascii=False) + "\n")
    sys.stdout.flush()


if __name__ == "__main__":
    main()
