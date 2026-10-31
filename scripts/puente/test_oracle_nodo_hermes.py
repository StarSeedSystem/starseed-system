# -*- coding: utf-8 -*-
"""Pruebas de Hermes en el nodo (rescate RTGUI1021K2-d3).

El servicio `starseed-hermes` de la rama no está en main: la dirección del A1 se
lanza con `guion_direccion` y ya tiene sus pruebas en `test_oracle_nodo_direccion.py`.
Lo que sí sigue vivo y no tenía prueba es el registro del MCP `starseed-director`
en el config de Hermes (`instalar_director.hermes`), sin claves ni rutas de worktree.
"""
import importlib.util
import os
import re
import sys
import tempfile
import unittest
from unittest import mock

DIR = os.path.dirname(os.path.abspath(__file__))
if DIR not in sys.path:
    sys.path.insert(0, DIR)
import oracle_nodo as N  # noqa: E402

_RUTA = os.path.join(DIR, "instalar_director.py")
_ESPEC = importlib.util.spec_from_file_location("instalar_director_en_prueba", _RUTA)
inst = importlib.util.module_from_spec(_ESPEC)
_ESPEC.loader.exec_module(inst)

CLAVES = re.compile(r"sk-|ghp_|AIza|BEGIN OPENSSH|xoxb-|Bearer ")


class McpEnHermes(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.yaml = os.path.join(self.tmp.name, "config.yaml")
        with open(self.yaml, "w", encoding="utf-8") as f:
            f.write("model:\n  default: auto\n  provider: freellmapi\nmcp_servers:\n")

    def test_registra_el_director_una_sola_vez_y_sin_claves(self):
        with mock.patch.object(inst, "HERMES_YAML", self.yaml):
            self.assertEqual(inst.hermes(True), "cambiado")
            self.assertEqual(inst.hermes(True), "ya")
        with open(self.yaml, encoding="utf-8") as f:
            texto = f.read()
        self.assertIn("starseed-director:", texto)
        self.assertIn("mcp_director.py", texto)
        self.assertEqual(texto.count("starseed-director:"), 1)
        self.assertIn(inst.MCP, texto)
        self.assertFalse(CLAVES.search(texto))


class ArranqueConArriendo(unittest.TestCase):
    def test_las_piezas_solo_arrancan_si_el_arriendo_es_mio(self):
        guion = N.guion_direccion()
        self.assertIn('lider_direccion.renovar().get("soy")', guion)
        antes, despues = guion.split("if lider:", 1)
        llamada = "\n            arrancar(nombre, guion, args, procesos)"
        self.assertNotIn(llamada, antes)
        self.assertIn("for nombre, guion, args in HIJOS:", despues)
        self.assertIn(llamada, despues)
        self.assertIn("time.sleep(30)", guion)
        compile(guion, "direccion_arranque.py", "exec")


if __name__ == "__main__":
    unittest.main()
