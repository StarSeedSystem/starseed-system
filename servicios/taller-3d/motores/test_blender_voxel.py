#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas del motor blender-voxel (WT1011B) — sin Blender ni mallas de verdad: todo simulado.

Rescatado de la rama nube WT1011B y adaptado al motor de hoy; los casos cubren el
contrato de la ficha (ok/glb/procedencia/fallo/segundos/pico_memoria_gb).
Ejecutar: python3 motores/test_blender_voxel.py -v   (desde servicios/taller-3d)
"""
import os
import subprocess
import sys
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(__file__))

import blender_voxel

RUTA_GUION = "/tmp/test_script.py"


def _run_falso(codigo: int = 0, stdout: str = "", stderr: str = ""):
    """La salida simulada de una llamada a Blender."""
    return mock.MagicMock(returncode=codigo, stdout=stdout, stderr=stderr)


class DisponibleTest(unittest.TestCase):
    @mock.patch("subprocess.run")
    def test_disponible_true(self, run):
        """Blender está instalado: --version contesta con código 0."""
        run.return_value.returncode = 0
        run.return_value.stdout = "Blender 4.2.0\n"
        self.assertTrue(blender_voxel.disponible())

    @mock.patch("subprocess.run")
    def test_disponible_false(self, run):
        """No hay Blender en la neurona."""
        run.side_effect = FileNotFoundError()
        self.assertFalse(blender_voxel.disponible())

    @mock.patch("subprocess.run")
    def test_disponible_false_por_versión_lenta(self, run):
        """Blender instalado pero que no contesta a tiempo tampoco vale."""
        run.side_effect = subprocess.TimeoutExpired(["blender", "--version"], 10)
        self.assertFalse(blender_voxel.disponible())


class RemalladoTest(unittest.TestCase):
    STDOUT_FELIZ = (
        "INFO: Volumen estimado: 1.0, Tamaño de vóxel calculado: 0.1\n"
        "SUCCESS: Remallado por vóxeles completado"
    )

    def remallar_con(self, stdout: str = "", codigo: int = 0, agota: bool = False,
                     sale: bool = True, stderr: str = ""):
        """Remalla con un Blender simulado que distingue las llamadas
        por su orden completo: `blender --version`, y `blender -b` sobre el guion."""
        def responder(imagen_com, **_):
            if imagen_com[0:2] == ["blender", "--version"]:
                return _run_falso(0, "Blender 4.2.0\n")
            if imagen_com[0:2] == ["blender", "-b"] and imagen_com[-1] == RUTA_GUION:
                if agota:
                    raise subprocess.TimeoutExpired(imagen_com, 300)
                return _run_falso(codigo, stdout, stderr)
            return _run_falso(0, "")

        guion = mock.MagicMock()
        guion.name = RUTA_GUION
        guion.__enter__.return_value = guion
        with mock.patch("tempfile.NamedTemporaryFile", return_value=guion), \
                mock.patch("subprocess.run", side_effect=responder), \
                mock.patch("os.path.exists", return_value=sale):
            return blender_voxel.remallar_voxel("entrada.glb", 1000, {"textura": False})

    def test_remallado_exitoso(self):
        """El feliz: Blender remalla, cuenta el vóxel y deja el GLB de salida."""
        ficha = self.remallar_con(self.STDOUT_FELIZ)
        self.assertTrue(ficha["ok"])
        self.assertIsNotNone(ficha["glb"])
        self.assertEqual(ficha["glb"], "entrada-remallada.glb")
        self.assertEqual(ficha["procedencia"], "blender-voxel")
        self.assertIsNone(ficha["fallo"])
        self.assertGreaterEqual(ficha["segundos"], 0)
        self.assertGreaterEqual(ficha["pico_memoria_gb"], 0)

    def test_remallado_error_de_blender(self):
        """Blender contesta con error: la ficha dice qué y el pico queda a cero."""
        ficha = self.remallar_con(codigo=1, stderr="Error: something went wrong")
        self.assertFalse(ficha["ok"])
        self.assertIsNone(ficha["glb"])
        self.assertEqual(ficha["procedencia"], "blender-voxel")
        self.assertIn("Blender falló", ficha["fallo"])
        self.assertGreaterEqual(ficha["segundos"], 0)
        self.assertEqual(ficha["pico_memoria_gb"], 0)

    def test_remallado_timeout(self):
        """Blender no contesta a tiempo: timeout y sin malla de salida."""
        ficha = self.remallar_con(agota=True)
        self.assertFalse(ficha["ok"])
        self.assertIsNone(ficha["glb"])
        self.assertEqual(ficha["procedencia"], "blender-voxel")
        self.assertEqual(ficha["fallo"], "Timeout ejecutando Blender")
        self.assertGreaterEqual(ficha["segundos"], 0)
        self.assertEqual(ficha["pico_memoria_gb"], 0)

    def test_remallado_sin_malla_de_salida(self):
        """Blender canta éxito pero no deja el GLB: la ficha cuenta el fallo."""
        ficha = self.remallar_con(self.STDOUT_FELIZ, sale=False)
        self.assertFalse(ficha["ok"])
        self.assertIsNone(ficha["glb"])
        self.assertIsNotNone(ficha["fallo"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
