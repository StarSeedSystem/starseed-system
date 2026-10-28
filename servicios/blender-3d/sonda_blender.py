#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Sonda que corre DENTRO de Blender (BLD1025B · `architecture/blender-3d.md` §2 y §3).

Código nuestro y fijo, nunca generado: imprime `STARSEED_SONDA:` + JSON con los dispositivos de
Cycles que existen de verdad, los motores utilizables y si hay FFmpeg. Sin red ni `bpy` fuera de
este archivo; se lanza con `blender -b --factory-startup -P sonda_blender.py`.
"""
import json, bpy
PREFIJO, TIPOS = "STARSEED_SONDA:", ("metal", "cuda", "optix", "hip", "oneapi")
def _declarados(prefs):
    try:
        tipos = prefs.get_device_types(bpy.context) or []
    except Exception:
        return set()
    return {str(t[0] if isinstance(t, (tuple, list)) and t else t).lower() for t in tipos} & set(TIPOS)

def _dispositivos(prefs):
    vistos = {}
    def anotar():
        for d in list(getattr(prefs, "devices", []) or []):
            tipo = str(getattr(d, "type", "") or "").lower()
            nombre = str(getattr(d, "name", "") or "").lower()
            tipo = tipo if tipo in TIPOS else next((t for t in TIPOS if t in nombre), "cpu")
            vistos[(tipo, str(getattr(d, "name", "") or "").strip())] = True
    anotar()
    for tipo in sorted(_declarados(prefs)):
        try:
            prefs.compute_device_type = tipo.upper()
            getattr(prefs, "get_devices", lambda: None)()
        except Exception:
            continue
        anotar()
    return [{"tipo": t, "nombre": n} for (t, n) in sorted(vistos)]

def _motores(gpu):
    try:
        ids = {str(e.identifier).upper() for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items}
    except Exception:
        ids = set()
    motores = ["workbench"] if any("WORKBENCH" in i for i in ids) else []
    if any("CYCLES" in i for i in ids):
        motores += ["cycles-cpu"] + (["cycles-gpu"] if gpu else [])
    if gpu and any("EEVEE" in i for i in ids):
        motores.append("eevee")
    return motores

def main():
    try:
        prefs = bpy.context.preferences.addons["cycles"].preferences
    except (KeyError, AttributeError, TypeError):
        prefs = None
    dispositivos = _dispositivos(prefs) if prefs else []
    gpu = sorted({d["tipo"] for d in dispositivos if d["tipo"] in TIPOS})
    dato = {"gpu": gpu, "dispositivos": dispositivos, "motores": _motores(gpu),
            "ffmpeg": bool(getattr(bpy.app.build_options, "codec_ffmpeg", False))}
    print(PREFIJO + json.dumps(dato, ensure_ascii=False, sort_keys=True))

if __name__ == "__main__":
    main()
