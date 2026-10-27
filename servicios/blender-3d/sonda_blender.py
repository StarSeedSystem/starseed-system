#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Sonda que corre DENTRO de Blender (BLD1025B): imprime «STARSEED_SONDA:» + JSON.

La lanza deteccion.py con `blender -b --factory-startup --python-exit-code 3 -P sonda_blender.py`.
No usa la red, no escribe archivos y no modifica la escena.
"""
import json

import bpy


def _dispositivos():
    try:
        prefs = bpy.context.preferences.addons["cycles"].preferences
        prefs.get_devices()
        tipos = [t[0] if isinstance(t, (list, tuple)) else str(t) for t in prefs.get_device_types(bpy.context)]
        aparatos = [{"tipo": str(getattr(d, "type", "")), "nombre": str(getattr(d, "name", ""))} for d in prefs.devices]
        return tipos, aparatos
    except Exception:
        return [], []


def _motores():
    try:
        return [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items]
    except Exception:
        return []


def main():
    tipos, aparatos = _dispositivos()
    gpu = []
    for d in aparatos:
        t = d["tipo"].lower()
        if t and t != "cpu" and t not in gpu:
            gpu.append(t)
    datos = {"v": 1, "tipos": tipos, "dispositivos": aparatos, "gpu": gpu, "gpu_utilizable": bool(gpu),
             "ffmpeg": bool(getattr(bpy.app.build_options, "codec_ffmpeg", False)), "motores": _motores()}
    print("STARSEED_SONDA:" + json.dumps(datos, ensure_ascii=False))


if __name__ == "__main__":
    main()
