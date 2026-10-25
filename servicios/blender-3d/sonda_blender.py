#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Sonda de Blender (BLD1025B). Se ejecuta DENTRO de Blender con -P e imprime UNA línea JSON.

No sale a la red, no lee archivos del usuario y no modifica la escena. Es código nuestro y fijo.
"""
import json

MARCA = "STARSEED_SONDA:"


def _texto(item):
    if isinstance(item, (list, tuple)) and item:
        return str(item[0])
    return str(item)


def main():
    datos = {"tipos": [], "dispositivos": [], "ffmpeg": False, "motores": [], "gpu": False}
    try:
        import bpy
        datos["ffmpeg"] = bool(bpy.app.build_options.codec_ffmpeg)
        try:
            datos["motores"] = [i.identifier for i in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items]
        except Exception:
            datos["motores"] = []
        try:
            prefs = bpy.context.preferences.addons["cycles"].preferences
            datos["tipos"] = [_texto(t) for t in prefs.get_device_types(bpy.context)]
            try:
                prefs.get_devices()
            except Exception:
                pass
            datos["dispositivos"] = [str(getattr(d, "type", "")).upper() for d in (getattr(prefs, "devices", None) or [])]
            datos["gpu"] = any(d not in ("", "CPU", "NONE") for d in datos["dispositivos"])
        except Exception:
            pass
    except Exception:
        pass
    print(MARCA + json.dumps(datos, ensure_ascii=False))


main()
