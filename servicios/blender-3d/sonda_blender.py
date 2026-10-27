# -*- coding: utf-8 -*-
"""Sonda que corre DENTRO de Blender (BLD1025B). Código nuestro y FIJO: nunca se genera.

Se lanza con `blender -b --factory-startup --python-exit-code 3 -P sonda_blender.py`.
Imprime UNA línea «STARSEED_SONDA: <json>» con dispositivos de Cycles, motores disponibles
y si hay FFmpeg. Sin red, sin leer disco. EEVEE solo cuenta como motor si hay GPU
(contrato architecture/blender-3d.md §1.4).
"""
import json

import bpy

try:
    prefs = bpy.context.preferences.addons["cycles"].preferences
    tipos = list(prefs.get_device_types(bpy.context))
    dispositivos = [{"nombre": str(d.name), "tipo": str(d.type)} for d in prefs.devices]
except (KeyError, AttributeError, TypeError):
    tipos, dispositivos = [], []

try:
    items = [e.identifier for e in bpy.context.scene.render.bl_rna.properties["engine"].enum_items]
except (AttributeError, KeyError):
    items = []

gpu = sorted({d["tipo"].lower() for d in dispositivos if d["tipo"] != "CPU"})
motores = ["workbench", "cycles-cpu"]
if gpu:
    motores.append("cycles-gpu")
    if any(i.startswith("BLENDER_EEVEE") for i in items):
        motores.append("eevee")
ffmpeg = bool(getattr(bpy.app.build_options, "codec_ffmpeg", False))
print("STARSEED_SONDA:" + json.dumps(
    {"tipos": tipos, "dispositivos": dispositivos, "gpu": gpu, "motores": motores, "ffmpeg": ffmpeg},
    ensure_ascii=False))
