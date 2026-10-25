#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Sonda que corre DENTRO de Blender (BLD1025B). Contrato: architecture/blender-3d.md §3.3.

No genera código ni toca la red: solo lee lo que este Blender puede hacer e imprime UNA línea
STARSEED_SONDA: + JSON para que la lea `deteccion.py`. Es código nuestro y fijo.
"""
import json

def _preferencias():
    try:
        import bpy
        return bpy.context.preferences.addons["cycles"].preferences
    except Exception:
        return None

def _tipos(prefs):
    if prefs is None:
        return []
    try:
        import bpy
        crudos = prefs.get_device_types(bpy.context)
    except Exception:
        return []
    tipos = []
    for t in crudos or []:
        valor = t[0] if isinstance(t, (tuple, list)) and t else t
        if isinstance(valor, str):
            tipos.append(valor)
    return tipos

def _dispositivos(prefs):
    if prefs is None:
        return []
    try:
        return [str(d.type) for d in prefs.devices if str(d.type).upper() != "CPU"]
    except Exception:
        return []

def _motores():
    try:
        import bpy
        props = bpy.types.RenderSettings.bl_rna.properties["engine"]
        return [str(i.identifier) for i in props.enum_items]
    except Exception:
        return []

def main():
    prefs = _preferencias()
    dispositivos = _dispositivos(prefs)
    try:
        import bpy
        ffmpeg = bool(bpy.app.build_options.codec_ffmpeg)
    except Exception:
        ffmpeg = False
    datos = {"tipos": _tipos(prefs), "dispositivos": dispositivos, "ffmpeg": ffmpeg,
             "motores": _motores(), "gpu": bool(dispositivos)}
    print("STARSEED_SONDA:" + json.dumps(datos, ensure_ascii=False, separators=(",", ":")))

main()
