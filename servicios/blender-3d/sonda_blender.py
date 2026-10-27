#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Sonda FIJA que se ejecuta DENTRO de Blender (BLD1025B). No se genera ni se edita desde fuera.

Imprime una sola línea `STARSEED_SONDA:{...}` con los dispositivos de Cycles que existen de
verdad, si Blender trae FFmpeg, los motores usables y si hay GPU. Sin red y sin tocar archivos.
EEVEE solo se anuncia con GPU: sin ella tarda 35–59 s y da EGL_BAD_MATCH (contrato §1.4).
"""
import json


def _texto(x):
    return str(x[0] if isinstance(x, (list, tuple)) and x else x).strip()


def _motores(gpu):
    import bpy
    try:
        ids = [i.identifier for i in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items]
    except Exception:
        ids = []
    m = []
    if not ids or "BLENDER_WORKBENCH" in ids:
        m.append("workbench")
    if not ids or "CYCLES" in ids:
        m.append("cycles-cpu")
        if gpu:
            m.append("cycles-gpu")
    if gpu and (not ids or any(i.startswith("BLENDER_EEVEE") for i in ids)):
        m.append("eevee")
    return m


def main():
    import bpy
    tipos, dispositivos, gpu = [], [], False
    try:
        prefs = bpy.context.preferences.addons["cycles"].preferences
        try:
            prefs.get_devices()
        except Exception:
            pass
        tipos = [_texto(t) for t in prefs.get_device_types(bpy.context) or []]
        dispositivos = [_texto(getattr(d, "type", "")) for d in getattr(prefs, "devices", []) or []]
        gpu = any(d.upper() not in ("", "CPU", "NONE") for d in dispositivos)
    except Exception:
        gpu = False
    datos = {"tipos": tipos, "dispositivos": dispositivos,
             "ffmpeg": bool(getattr(bpy.app.build_options, "codec_ffmpeg", False)),
             "motores": _motores(gpu), "gpu": gpu}
    print("STARSEED_SONDA:" + json.dumps(datos))


if __name__ == "__main__":
    main()
