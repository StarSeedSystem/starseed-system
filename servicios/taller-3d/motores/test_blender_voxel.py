#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas del motor blender-voxel (WT1011Bb) — sin Blender ni red ni GPU: el guion
se prueba con bmesh simulado y la orquestación con subprocess simulado.
Ejecutar: python3 motores/test_blender_voxel.py -v   (desde servicios/taller-3d)"""
import importlib
import io
import json
import os
import subprocess
import sys
import unittest
from contextlib import redirect_stdout
from unittest import mock

sys.path.insert(0, os.path.dirname(__file__))

import blender_voxel  # noqa: E402
import blender_voxel_blender  # noqa: E402

RUTA_GUION = os.path.join(os.path.dirname(os.path.abspath(__file__)), "blender_voxel_blender.py")
FELIZ = ("INFO: Tamaño de vóxel calculado: 0.10000\n"
         'FICHA: {"salud": {"bordes_abiertos": 0, "no_manifold": 0, "caras": 12}, "extras": []}\n')
CON_EXTRAS = ('FICHA: {"salud": {"bordes_abiertos": 0, "no_manifold": 0, "caras": 12},'
              ' "extras": ["entrada-remallada.stl", "entrada-remallada.3mf"]}\n')


def _salida(codigo=0, stdout="", stderr=""):
    return mock.MagicMock(returncode=codigo, stdout=stdout, stderr=stderr)


class DisponibleTest(unittest.TestCase):
    @mock.patch("subprocess.run")
    def test_disponible_true(self, run):
        """Blender está instalado y contesta una versión real."""
        run.return_value = _salida(0, "Blender 4.2.0\n")
        self.assertTrue(blender_voxel.disponible())

    @mock.patch("subprocess.run")
    def test_disponible_false_sin_binario(self, run):
        """No hay Blender en la neurona."""
        run.side_effect = FileNotFoundError()
        self.assertFalse(blender_voxel.disponible())

    @mock.patch("subprocess.run")
    def test_disponible_false_por_versión_lenta(self, run):
        """Blender instalado pero que no contesta a tiempo tampoco vale."""
        run.side_effect = subprocess.TimeoutExpired(["blender", "--version"], 10)
        self.assertFalse(blender_voxel.disponible())

    @mock.patch("subprocess.run")
    def test_disponible_false_con_version_que_no_es_de_blender(self, run):
        """El binario contesta pero no dice una versión de Blender."""
        run.return_value = _salida(0, "nada que ver\n")
        self.assertFalse(blender_voxel.disponible())


class OrquestacionTest(unittest.TestCase):
    def blender_falso(self, codigo=0, stdout="", stderr="", agota=False, sale=True, **opciones):
        """Un Blender simulado; devuelve (ficha, órdenes) para apuntar cómo se le llamó."""
        ordenes = []

        def responder(orden, **_):
            ordenes.append(list(orden))
            if orden[1:2] == ["--version"]:
                return _salida(0, "Blender 4.2.0\n")
            if agota:
                raise subprocess.TimeoutExpired(orden, 300)
            return _salida(codigo, stdout, stderr)

        with mock.patch("subprocess.run", side_effect=responder), \
                mock.patch("os.path.exists", return_value=sale):
            ficha = blender_voxel.remallar_voxel("entrada.glb", 600, opciones)
        return ficha, ordenes

    @staticmethod
    def orden_del_guion(ordenes):
        return next(o for o in ordenes if o[1:2] == ["-b"])

    def test_remallado_exitoso(self):
        """El feliz: Blender remalla, cuenta el vóxel y deja el GLB de salida."""
        ficha, _ = self.blender_falso(stdout=FELIZ)
        self.assertTrue(ficha["ok"])
        self.assertEqual(ficha["glb"], "entrada-remallada.glb")
        self.assertEqual(ficha["procedencia"], "blender-voxel")
        self.assertIsNone(ficha["fallo"])
        self.assertEqual(ficha["salud"], {"bordes_abiertos": 0, "no_manifold": 0, "caras": 12})
        self.assertEqual(ficha["extras"], [])
        self.assertGreaterEqual(ficha["segundos"], 0)
        self.assertGreaterEqual(ficha["pico_memoria_gb"], 0)

    def test_orden_del_guion_con_las_caras_del_plan(self):
        """Blender corre sin ventana el guion del repo con [entrada, salida, caras, textura, destino]."""
        _, ordenes = self.blender_falso(stdout=FELIZ)
        orden = self.orden_del_guion(ordenes)
        self.assertEqual(orden[:4], ["blender", "-b", "--python", RUTA_GUION])
        self.assertEqual(orden[4], "--")
        self.assertEqual(json.loads(orden[5]), ["entrada.glb", "entrada-remallada.glb", 600, False, ""])

    def test_impresion_pide_extras_y_nunca_textura(self):
        """«impresion» pide STL y 3MF al guion, e ignora la textura (§11.1: sale sin texturas)."""
        ficha, ordenes = self.blender_falso(stdout=FELIZ + CON_EXTRAS, textura=True, destino="impresion")
        self.assertEqual(json.loads(self.orden_del_guion(ordenes)[5])[3:5], [False, "impresion"])
        self.assertEqual(ficha["extras"], ["entrada-remallada.stl", "entrada-remallada.3mf"])

    def test_otro_destino_lleva_textura_si_se_pide(self):
        """Con un destino que sí la lleva, la textura llega al guion tal cual."""
        _, ordenes = self.blender_falso(stdout=FELIZ, textura=True, destino="avatar")
        self.assertEqual(json.loads(self.orden_del_guion(ordenes)[5])[3:5], [True, "avatar"])

    def test_remallado_error_de_blender(self):
        """Blender contesta con error: la ficha dice qué y el pico queda a cero."""
        ficha, _ = self.blender_falso(codigo=1, stderr="Error: something went wrong")
        self.assertFalse(ficha["ok"])
        self.assertIsNone(ficha["glb"])
        self.assertEqual(ficha["procedencia"], "blender-voxel")
        self.assertIn("Blender falló", ficha["fallo"])
        self.assertGreaterEqual(ficha["segundos"], 0)
        self.assertEqual(ficha["pico_memoria_gb"], 0)

    def test_remallado_timeout(self):
        """Blender no contesta a tiempo: timeout y sin malla de salida."""
        ficha, _ = self.blender_falso(agota=True)
        self.assertFalse(ficha["ok"])
        self.assertIsNone(ficha["glb"])
        self.assertEqual(ficha["procedencia"], "blender-voxel")
        self.assertEqual(ficha["fallo"], "Timeout ejecutando Blender")
        self.assertGreaterEqual(ficha["segundos"], 0)
        self.assertEqual(ficha["pico_memoria_gb"], 0)

    def test_remallado_sin_malla_de_salida(self):
        """Blender canta éxito pero no deja el GLB: la ficha cuenta el fallo."""
        ficha, _ = self.blender_falso(stdout=FELIZ, sale=False)
        self.assertFalse(ficha["ok"])
        self.assertIsNone(ficha["glb"])
        self.assertIsNotNone(ficha["fallo"])

    def test_remallado_con_guion_que_no_reporta_nada(self):
        """Blender sale 0 pero sin los contadores del guion: no se finge el éxito."""
        ficha, _ = self.blender_falso(stdout="")
        self.assertFalse(ficha["ok"])
        self.assertIn("no reportó", ficha["fallo"])

    def test_remallado_con_malla_abierta(self):
        """El guion dice que la malla no quedó cerrada: fallo, con su salud."""
        ficha, _ = self.blender_falso(
            stdout='MALLA_NO_CERRADA: {"bordes_abiertos": 2, "no_manifold": 0, "caras": 11}\n')
        self.assertFalse(ficha["ok"])
        self.assertIn("no quedó cerrada", ficha["fallo"])
        self.assertIn("bordes_abiertos", ficha["fallo"])


class GuionTest(unittest.TestCase):
    """El guion que corre DENTRO de Blender, con bpy y bmesh simulados."""

    def setUp(self):
        self.bpy = mock.MagicMock()
        self.bmesh = mock.MagicMock()
        self.modulo = self.cargar()

    def cargar(self):
        with mock.patch.dict(sys.modules, {"bpy": self.bpy, "bmesh": self.bmesh}, clear=False):
            return importlib.reload(blender_voxel_blender)

    def malla_falsa(self, dimensiones=(2, 2, 1), lados=(2, 2, 2, 2), caras=12):
        malla = mock.MagicMock()
        malla.dimensions = dimensiones
        malla.data.polygons = [mock.MagicMock()] * caras
        aristas = [mock.MagicMock(link_faces=list(range(n))) for n in lados]
        self.bmesh.new.return_value.from_mesh.return_value = None
        self.bmesh.new.return_value.edges = aristas
        self.bmesh.new.return_value.free.return_value = None
        return malla

    def test_tamano_de_voxel_de_las_caras_objetivo(self):
        """600 caras objetivo en 2 de lado: vóxel 2/√100 = 0,2."""
        self.assertAlmostEqual(self.modulo.tamano_de_voxel(self.malla_falsa(), 600), 0.2)

    def test_tamano_de_voxel_con_toques(self):
        """No menos de lado/512 por abajo ni más de lado/8 por arriba."""
        self.assertAlmostEqual(self.modulo.tamano_de_voxel(self.malla_falsa((2, 2, 1)), 6), 0.25)
        self.assertAlmostEqual(self.modulo.tamano_de_voxel(self.malla_falsa(), 2_000_000), 2 / 512)

    def test_salud_cuenta_bordes_abiertos_y_no_manifold(self):
        """2·2 caras, 1 de borde abierto, 3 y 0 no-manifold; «Check All» del 3D Print Toolbox."""
        self.assertEqual(self.modulo.salud(self.malla_falsa(lados=(2, 2, 1, 3, 0))),
                         {"bordes_abiertos": 1, "no_manifold": 2, "caras": 12})

    def test_malla_abierta_no_es_cerrada(self):
        self.assertFalse(self.modulo.cerrada(self.malla_falsa(lados=(2, 1, 2))))

    def test_rehornear_va_de_seleccionado_a_activo(self):
        """El color se hornea del original (fuente seleccionada) al remallado (activo)."""
        original, remallada = mock.MagicMock(), mock.MagicMock()
        # Original con material válido (use_nodes=True)
        mat_original = mock.MagicMock()
        mat_original.use_nodes = True
        original.material_slots = [mock.MagicMock()]
        original.material_slots[0].material = mat_original
        # Remallada con material que recibirá la textura horneada
        remallada.material_slots = [mock.MagicMock()]
        remallada.material_slots[0].material = mock.MagicMock()
        remallada.material_slots[0].material.use_nodes = True
        remallada.material_slots[0].material.node_tree = mock.MagicMock()
        remallada.material_slots[0].material.node_tree.nodes = mock.MagicMock()
        remallada.material_slots[0].material.node_tree.nodes.new = mock.MagicMock()
        remallada.material_slots[0].material.node_tree.nodes.get = mock.MagicMock(return_value=mock.MagicMock())
        remallada.material_slots[0].material.node_tree.links = mock.MagicMock()
        remallada.material_slots[0].material.node_tree.links.new = mock.MagicMock()

        self.modulo.rehornear(original, remallada, "/tmp/r.png")
        self.assertEqual(self.bpy.data.images.new.call_args, mock.call("rehorneada", 1024, 1024))
        _, kwargs = self.bpy.ops.object.bake.call_args
        self.assertEqual(kwargs, {"type": "DIFFUSE", "use_selected_to_active": True, "margin": 8})

    def test_exportar_impresion_pide_stl_y_3mf(self):
        """GLB siempre; para «impresion» también STL y 3MF cuando la versión los exporta."""
        self.bpy.ops.wm.stl_export = mock.MagicMock()
        setattr(self.bpy.ops.wm, "3mf_export", mock.MagicMock())
        rutas = self.modulo.exportar(mock.MagicMock(), "/tmp/m.glb", "impresion")
        self.assertEqual(rutas, ["/tmp/m.glb", "/tmp/m.stl", "/tmp/m.3mf"])

    def test_exportar_sin_exportador_de_3mf_no_se_finge(self):
        """Si esta versión de Blender no exporta 3MF, se amarea sin fingir la ruta."""
        self.bpy.ops.wm.stl_export = mock.MagicMock()
        setattr(self.bpy.ops.wm, "3mf_export", mock.MagicMock(side_effect=AttributeError("no hay")))
        rutas = self.modulo.exportar(mock.MagicMock(), "/tmp/m.glb", "impresion")
        self.assertEqual(rutas, ["/tmp/m.glb", "/tmp/m.stl"])

    def test_rehornear_falla_si_original_sin_materiales(self):
        """rehornear debe detectar si el original no tiene materiales válidos y fallar explícitamente."""
        original, remallada = mock.MagicMock(), mock.MagicMock()
        original.material_slots = []  # sin materiales
        remallada.material_slots = [mock.MagicMock()]
        remallada.material_slots[0].material = mock.MagicMock()
        remallada.material_slots[0].material.use_nodes = True
        remallada.material_slots[0].material.node_tree = mock.MagicMock()
        remallada.material_slots[0].material.node_tree.nodes = mock.MagicMock()
        remallada.material_slots[0].material.node_tree.nodes.new = mock.MagicMock()
        remallada.material_slots[0].material.node_tree.nodes.get = mock.MagicMock(return_value=mock.MagicMock())
        remallada.material_slots[0].material.node_tree.links = mock.MagicMock()
        remallada.material_slots[0].material.node_tree.links.new = mock.MagicMock()

        with self.assertRaises(RuntimeError) as cm:
            self.modulo.rehornear(original, remallada, "/tmp/r.png")
        self.assertIn("material", str(cm.exception).lower())

    def test_rehornear_falla_si_original_con_material_sin_nodos(self):
        """rehornear debe detectar si el material del original no usa nodos."""
        original, remallada = mock.MagicMock(), mock.MagicMock()
        mat_original = mock.MagicMock()
        mat_original.use_nodes = False  # material sin nodos
        original.material_slots = [mock.MagicMock()]
        original.material_slots[0].material = mat_original
        remallada.material_slots = [mock.MagicMock()]
        remallada.material_slots[0].material = mock.MagicMock()
        remallada.material_slots[0].material.use_nodes = True
        remallada.material_slots[0].material.node_tree = mock.MagicMock()
        remallada.material_slots[0].material.node_tree.nodes = mock.MagicMock()
        remallada.material_slots[0].material.node_tree.nodes.new = mock.MagicMock()
        remallada.material_slots[0].material.node_tree.nodes.get = mock.MagicMock(return_value=mock.MagicMock())
        remallada.material_slots[0].material.node_tree.links = mock.MagicMock()
        remallada.material_slots[0].material.node_tree.links.new = mock.MagicMock()

        with self.assertRaises(RuntimeError) as cm:
            self.modulo.rehornear(original, remallada, "/tmp/r.png")
        self.assertIn("material", str(cm.exception).lower())


if __name__ == "__main__":
    unittest.main(verbosity=2)