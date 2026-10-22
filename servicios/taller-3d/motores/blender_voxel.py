#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Motor blender-voxel (WT1011B) · cierre de mallas en CPU, igual en la A1.

Blender sin ventana (-b) abre la malla GLB, la remalla por vóxeles (watertight) y la
vuelve a exportar; el remallado pierde las UV, así que con textura se vuelve a hornear
(§11.1 de architecture/astraura-avatares-3d.md). Quien llama comprueba `disponible()`.
"""
import json
import os
import re
import resource
import subprocess
import sys
import tempfile
import time
from typing import Any, Dict

COMANDO = "blender"
ESPERA_SEGUNDOS = 300
PROCEDENCIA = "blender-voxel"

# Guion que corre DENTRO de Blender con los parámetros incrustados (blender -b -P guion.py)
_GUION = """
import bpy, json
from mathutils import Vector
entrada, salida, num_voxeles, con_textura = json.loads(r'''##PARAMETROS##''')
num_voxeles = max(64, min(4096, int(num_voxeles)))

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=entrada)
piezas = [ob for ob in bpy.context.scene.objects if ob.type == "MESH"]
if not piezas: raise SyntaxError("la malla de entrada no trae piezas")
bpy.context.view_layer.objects.active = piezas[0]
for pieza in piezas: pieza.select_set(True)
bpy.ops.object.join()
malla = bpy.context.view_layer.objects.active
esquinas = [malla.matrix_world @ Vector(c) for c in malla.bound_box]
lado = [max(e[i] for e in esquinas) - min(e[i] for e in esquinas) for i in range(3)]
volumen = max(lado[0] * lado[1] * lado[2], 1e-6)
tamano_voxel = max((volumen / num_voxeles) ** (1.0 / 3.0), 1e-4)
print(f"INFO: Volumen estimado: {volumen:.2f}, Tamaño de vóxel calculado: {tamano_voxel:.4f}")
remallador = malla.modifiers.new("RemalladoVoxel", "REMESH")
remallador.mode = "VOXEL"; remallador.voxel_size = tamano_voxel
bpy.ops.object.modifier_apply(modifier=remallador.name)

if con_textura:
    bpy.ops.object.mode_set(mode="EDIT"); bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=66.0, island_margin=0.02)
    bpy.ops.object.mode_set(mode="OBJECT")
    escena = bpy.context.scene; escena.render.engine = "CYCLES"; escena.cycles.samples = 16
    imagen = bpy.data.images.new("rehorneada", 1024, 1024)
    for hueco in malla.material_slots:
        material = hueco.material
        if material and material.use_nodes:
            texel = material.node_tree.nodes.new("ShaderNodeTexImage")
            texel.image = imagen; texel.active = True
            base = material.node_tree.nodes.get("Principled BSDF")
            material.node_tree.links.new(texel.outputs["Color"], base.inputs["Base Color"])
            break
    bpy.ops.object.bake(type="DIFFUSE"); imagen.save()

bpy.ops.export_scene.gltf(filepath=salida, export_format="GLB")
print("SUCCESS: Remallado por vóxeles completado")
"""


def disponible() -> bool:
    """¿Hay Blender en esta neurona? Una llamada, sin descargar nada."""
    try:
        r = subprocess.run([COMANDO, "--version"], capture_output=True, text=True, timeout=10)
        return r.returncode == 0
    except (OSError, subprocess.TimeoutExpired):
        return False


def _pico_hijos() -> float:
    """Pico de RAM de los procesos hijos medido hasta ahora, en GB."""
    pico = resource.getrusage(resource.RUSAGE_CHILDREN).ru_maxrss
    return round(pico / (1024 ** 3 if sys.platform == "darwin" else 1024 ** 2), 2)


def remallar_voxel(entrada: str, num_voxeles: int, opciones: Dict[str, Any]) -> Dict[str, Any]:
    """Cierra la malla por vóxeles con Blender sin ventana y devuelve la ficha.

    `opciones` acepta {"textura": bool} (rehornear tras el remallado); el resto de
    claves (por ejemplo "destino") las guarda su plan, no aquí. El guion va en un
    archivo temporal y Blender lo corre en -b con los parámetros incrustados.
    """
    ficha = {"ok": False, "glb": None, "procedencia": PROCEDENCIA, "fallo": None,
             "segundos": 0.0, "pico_memoria_gb": 0}
    salida = os.path.splitext(entrada)[0] + "-remallada.glb"
    cuerpo = _GUION.replace("##PARAMETROS##", json.dumps([entrada, salida, num_voxeles,
                                                          bool(opciones.get("textura", False))]))
    with tempfile.NamedTemporaryFile("w", suffix=".py", delete=False) as guion:
        guion.write(cuerpo)
        ruta_guion = guion.name
    comienzo = time.monotonic()
    try:
        r = subprocess.run([COMANDO, "-b", "-P", ruta_guion], capture_output=True,
                           text=True, timeout=ESPERA_SEGUNDOS)
    except subprocess.TimeoutExpired:
        ficha["fallo"] = "Timeout ejecutando Blender"
        ficha["segundos"] = round(time.monotonic() - comienzo, 2)
        return ficha
    except OSError as error:
        ficha["fallo"] = f"Blender falló: {error}"
        return ficha
    ficha["segundos"] = round(time.monotonic() - comienzo, 2)
    if r.returncode != 0:
        ficha["fallo"] = f"Blender falló (código {r.returncode}): {(r.stderr or r.stdout)[-400:]}"
        return ficha
    if not re.search(r"Tamaño de vóxel calculado:", r.stdout):
        ficha["fallo"] = "Blender no remalló: el guion no reportó el tamaño de vóxel"
        return ficha
    if not os.path.exists(salida):
        ficha["fallo"] = f"Blender no dejó la malla cerrada en {salida}"
        return ficha
    ficha.update(ok=True, glb=salida, pico_memoria_gb=_pico_hijos())
    return ficha
