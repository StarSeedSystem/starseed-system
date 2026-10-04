#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas de instalar_director: ruta absoluta de python3 y sin duplicados."""

import importlib.util, os, subprocess, sys, tempfile, unittest
from unittest import mock

# Por archivo y no por nombre: en `unittest discover` otra prueba puede haber puesto delante en
# sys.path el scripts/puente de otra copia del repo, y un import/reload por nombre cargaría ese.
_RUTA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "instalar_director.py")
_ESPEC = importlib.util.spec_from_file_location("instalar_director_en_prueba", _RUTA)
inst = importlib.util.module_from_spec(_ESPEC)
_ESPEC.loader.exec_module(inst)


class TestRutaPython(unittest.TestCase):
    def setUp(self):
        parche = mock.patch.object(inst, "PY", "/x/python3")
        parche.start()
        self.addCleanup(parche.stop)
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)

    def _toml(self, contenido=""):
        ruta = os.path.join(self.tmp.name, "config.toml")
        with open(ruta, "w", encoding="utf-8") as f:
            f.write(contenido)
        return ruta

    def test_bloque_codex_usa_ruta_absoluta(self):
        ruta = self._toml()
        with mock.patch.object(inst, "CODEX_TOML", ruta):
            inst.codex(True)
        texto = open(ruta, encoding="utf-8").read()
        self.assertIn('command = "/x/python3"', texto)
        self.assertNotIn('command = "python3"', texto)

    def test_aplicar_dos_veces_no_duplica(self):
        ruta = self._toml()
        with mock.patch.object(inst, "CODEX_TOML", ruta):
            self.assertEqual(inst.codex(True), "cambiado")
            self.assertEqual(inst.codex(True), "ya")
        texto = open(ruta, encoding="utf-8").read()
        self.assertEqual(texto.count("mcp_servers.%s]" % inst.NOMBRE), 1)

    def test_orden_claude_termina_con_py_y_mcp(self):
        capturadas = []

        def falso_run(orden, **kwargs):
            capturadas.append(orden)
            m = mock.Mock()
            m.returncode, m.stdout, m.stderr = 0, "", ""
            return m

        with mock.patch.object(subprocess, "run", falso_run):
            inst.claude_code(True)
        orden = capturadas[-1]
        self.assertEqual(orden[-3:], ["--", "/x/python3", inst.MCP])

    def test_vista_previa_json_usa_ruta_absoluta(self):
        self.assertIn('"/x/python3"', inst.bloque_json())


if __name__ == "__main__":
    unittest.main()
