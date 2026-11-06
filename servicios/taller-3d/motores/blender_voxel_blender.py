#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Guion que corre DENTRO de Blender sin ventana (WT1011Bb):

    blender -b --python blender_voxel_blender.py -- '<json: [entrada, salida, caras, textura, destino]>'

Importa el GLB, remalla por vóxeles con un tamaño calculado a partir de las caras
objetivo del plan, comprueba que la malla queda cerrada (las mismas cuentas del
«Check All» del 3D Print Toolbox: bordes abiertos y no-manifold, con bmesh) y, si
el destino lleva textura, rehornea el color desde la malla original (seleccionado
a activo) con un UV nuevo. «Basta de ilusiones»: si la malla no queda cerrada se
dice y se para, nunca se finge el éxito. Funciona en CPU: vale en la A1.
"""
import json
import math
import sys
from typing import Any

try:
    import bpy
    import bmesh
except ImportError:  # fuera de Blender solo se lee el guion; las pruebas inyectan los suyos
    bpy: Any = None  # type: ignore[assignment,redefinition-abstract]
    bmesh: Any = None  # type: ignore[assignment,redefinition-abstract]


def preparar(entrada: str) -> None:
    """Escena limpia y GLB importado."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=entrada)


def malla_unica():
    """Todas las piezas del GLB unidas en una sola (el vóxel cierra el conjunto)."""
    piezas = [ob for ob in bpy.context.scene.objects if ob.type == "MESH"]
    if not piezas:
        raise RuntimeError("la malla de entrada no trae piezas")
    bpy.context.view_layer.objects.active = piezas[0]
    for pieza in piezas:
        pieza.select_set(True)
    if len(piezas) > 1:
        bpy.ops.object.join()
    return bpy.context.view_layer.objects.active


def copiar(pieza):
    copia = pieza.copy()
    copia.data = pieza.data.copy()
    bpy.context.scene.collection.objects.link(copia)
    return copia


def seleccionar(origen, destino) -> None:
    """El original queda seleccionado (fuente del horneado) y el remallado activo."""
    bpy.ops.object.select_all(action="DESELECT")
    origen.select_set(True)
    destino.select_set(True)
    bpy.context.view_layer.objects.active = destino


def tamano_de_voxel(malla, caras: int) -> float:
    """Vóxel al que salen ~«caras» en un sólido razonable (6 caras vistas afuera)."""
    lado = max(malla.dimensions) or 1.0
    v = lado / math.sqrt(max(caras, 6) / 6.0)
    return min(max(v, lado / 512.0), lado / 8.0)


def remallar(malla, caras: int) -> float:
    """Remallado voxel destructivo sobre la copia; devuelve el tamaño usado."""
    tamano = tamano_de_voxel(malla, caras)
    mod = malla.modifiers.new("RemalladoVoxel", "REMESH")
    mod.mode = "VOXEL"
    mod.voxel_size = tamano
    bpy.ops.object.modifier_apply(modifier=mod.name)
    return tamano


def salud(malla) -> dict:
    """Bordes abiertos (aristas de 1 cara) y no-manifold (de 0 o más de 2), con bmesh."""
    bm = bmesh.new()
    bm.from_mesh(malla.data)
    lados = [len(arista.link_faces) for arista in bm.edges]
    bm.free()
    return {"bordes_abiertos": lados.count(1),
            "no_manifold": sum(1 for n in lados if n != 1 and n != 2),
            "caras": len(malla.data.polygons)}


def cerrada(malla) -> bool:
    estado = salud(malla)
    return estado["bordes_abiertos"] == 0 and estado["no_manifold"] == 0


def rehornear(original, remallada, ruta_textura: str) -> None:
    """Color horneado del original (seleccionado a activo) sobre un UV nuevo."""
    seleccionar(original, remallada)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=66.0, island_margin=0.02)
    bpy.ops.object.mode_set(mode="OBJECT")
    escena = bpy.context.scene
    escena.render.engine = "CYCLES"
    escena.cycles.samples = 16
    imagen = bpy.data.images.new("rehorneada", 1024, 1024)
    imagen.filepath_raw = ruta_textura
    for hueco in remallada.material_slots:
        if hueco.material and hueco.material.use_nodes:
            nodos = hueco.material.node_tree.nodes
            texel = nodos.new("ShaderNodeTexImage")
            texel.image = imagen
            texel.active = True
            base = nodos.get("Principled BSDF")
            hueco.material.node_tree.links.new(texel.outputs["Color"], base.inputs["Base Color"])
            break
    seleccionar(original, remallada)
    bpy.ops.object.bake(type="DIFFUSE", use_selected_to_active=True, margin=8)
    imagen.save()


def exportar(remallada, salida: str, destino: str) -> list:
    """GLB siempre; para «impresion» también STL y 3MF si esta versión los exporta."""
    remallada.select_set(True)
    bpy.ops.export_scene.gltf(filepath=salida, export_format="GLB")
    rutas = [salida]
    if destino == "impresion":
        for ext, operador in (("stl", "stl_export"), ("3mf", "3mf_export")):
            llamada: Any = getattr(bpy.ops.wm, operador, None)
            try:
                llamada(filepath=salida[:-4] + "." + ext)
            except (AttributeError, RuntimeError):
                continue  # esta versión de Blender no lo exporta: no se finge la ruta
            rutas.append(salida[:-4] + "." + ext)
    return rutas


def main(argumentos: list) -> None:
    entrada, salida, caras, con_textura, destino = argumentos
    preparar(entrada)
    original = malla_unica()
    remallada = copiar(original)
    seleccionar(original, remallada)
    tamano = remallar(remallada, int(caras))
    if not cerrada(remallada):
        print("MALLA_NO_CERRADA: " + json.dumps(salud(remallada)))
        raise SystemExit(1)
    ruta_textura = salida[:-4] + "-rehorneada.png"
    if con_textura:
        rehornear(original, remallada, ruta_textura)
    bpy.data.objects.remove(original, do_unlink=True)
    rutas = exportar(remallada, salida, destino)
    print(f"INFO: Tamaño de vóxel calculado: {tamano:.5f}")
    print("FICHA: " + json.dumps({"salud": salud(remallada),
                                  "extras": [r for r in rutas if r != salida]}))


if __name__ == "__main__":
    main(json.loads(sys.argv[sys.argv.index("--") + 1]))