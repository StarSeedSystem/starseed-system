# -*- coding: utf-8 -*-
"""Pruebas para entorno.leer_clave (SIN1116A).

Pruebas TDD: escribe primero una prueba que falle y luego solo el código
justo para pasarla. Una costura, una prueba y una implementación mínima
por ciclo.
"""
import os
import sys
import tempfile
import unittest
from pathlib import Path

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
if DIRECTORIO not in sys.path:
    sys.path.insert(0, DIRECTORIO)

import entorno as E


class TestLeerClave(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.raiz = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def _escribir_env(self, nombre, contenido):
        """Escribe un archivo .env con el contenido dado."""
        ruta = self.raiz / nombre
        ruta.parent.mkdir(parents=True, exist_ok=True)
        ruta.write_text(contenido, encoding="utf-8")
        return ruta

    def test_nombre_sin_igual_no_devuelve_valor(self):
        ruta = self._escribir_env(".env", "FREELLMAPI_KEY\nexport OTHER=value\n")
        self.assertEqual(E._leer_clave_desde_archivo("FREELLMAPI_KEY", str(ruta)), None)

    def test_linea_vacia_saltea(self):
        ruta = self._escribir_env(".env", "\n\nFREELLMAPI_KEY=test\n")
        self.assertEqual(E._leer_clave_desde_archivo("FREELLMAPI_KEY", str(ruta)), "test")

    def test_linea_comentario_salta(self):
        ruta = self._escribir_env(".env", "# FREELLMAPI_KEY=comentado\nFREELLMAPI_KEY=test\n")
        self.assertEqual(E._leer_clave_desde_archivo("FREELLMAPI_KEY", str(ruta)), "test")

    def test_export_si_sin_comillas(self):
        ruta = self._escribir_env(".env", "export FREELLMAPI_KEY=test-value\n")
        self.assertEqual(E._leer_clave_desde_archivo("FREELLMAPI_KEY", str(ruta)), "test-value")

    def test_sin_export_con_comillas_simples(self):
        ruta = self._escribir_env(".env", "FREELLMAPI_KEY='test-value'\n")
        self.assertEqual(E._leer_clave_desde_archivo("FREELLMAPI_KEY", str(ruta)), "test-value")

    def test_sin_export_con_comillas_dobles(self):
        ruta = self._escribir_env(".env", 'FREELLMAPI_KEY="test-value"\n')
        self.assertEqual(E._leer_clave_desde_archivo("FREELLMAPI_KEY", str(ruta)), "test-value")

    def test_export_con_comillas_dobles(self):
        ruta = self._escribir_env(".env", 'export FREELLMAPI_KEY="test-value"\n')
        self.assertEqual(E._leer_clave_desde_archivo("FREELLMAPI_KEY", str(ruta)), "test-value")

    def test_export_con_comillas_simples(self):
        ruta = self._escribir_env(".env", "export FREELLMAPI_KEY='test-value'\n")
        self.assertEqual(E._leer_clave_desde_archivo("FREELLMAPI_KEY", str(ruta)), "test-value")

    def test_valor_con_espacios_y_comillas(self):
        ruta = self._escribir_env(".env", 'FREELLMAPI_KEY="  valor con espacios  "\n')
        self.assertEqual(E._leer_clave_desde_archivo("FREELLMAPI_KEY", str(ruta)), "  valor con espacios  ")

    def test_valor_vacio_despues_del_igual(self):
        ruta = self._escribir_env(".env", "FREELLMAPI_KEY=\n")
        self.assertEqual(E._leer_clave_desde_archivo("FREELLMAPI_KEY", str(ruta)), None)

    def test_valor_solo_comillas_vacio(self):
        ruta = self._escribir_env(".env", 'FREELLMAPI_KEY=""\n')
        self.assertEqual(E._leer_clave_desde_archivo("FREELLMAPI_KEY", str(ruta)), None)

    def test_primer_archivo_prioridad(self):
        """Primero busca en ~/.starseed/env, luego en ~/.hermes/.env."""
        ruta1 = self.raiz / "archivo1.env"
        ruta2 = self.raiz / "archivo2.env"
        ruta1.write_text("KEY=primero\n", encoding="utf-8")
        ruta2.write_text("KEY=segundo\n", encoding="utf-8")

        r = E._leer_clave_multifuente("KEY", [str(ruta1), str(ruta2)])
        self.assertEqual(r, "primero")

    def test_nombre_cambia_mayusculas_minusculas(self):
        ruta = self._escribir_env(".env", "free_llmapi_key=test\n")
        self.assertIsNone(E._leer_clave_desde_archivo("FREELLMAPI_KEY", str(ruta)))

    def test_ambos_archivos_funciona(self):
        """Verifica que leer_clave busca en ambos archivos."""
        ruta1 = self.raiz / "env1"
        ruta2 = self.raiz / "env2"
        ruta1.write_text("KEY1=valor1\n", encoding="utf-8")
        ruta2.write_text("KEY2=valor2\n", encoding="utf-8")

        self.assertEqual(E._leer_clave_multifuente("KEY1", [str(ruta1), str(ruta2)]), "valor1")
        self.assertEqual(E._leer_clave_multifuente("KEY2", [str(ruta1), str(ruta2)]), "valor2")
        self.assertIsNone(E._leer_clave_multifuente("KEY3", [str(ruta1), str(ruta2)]))


class TestLeerClaveDesdeArchivo(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.raiz = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def _escribir(self, contenido):
        ruta = self.raiz / ".env"
        ruta.write_text(contenido, encoding="utf-8")
        return str(ruta)

    def test_archivo_inexistente_devuelve_none(self):
        ruta = str(self.raiz / "noexiste.env")
        self.assertIsNone(E._leer_clave_desde_archivo("ANY_KEY", ruta))

    def test_caracteres_especiales_se_preservan(self):
        ruta = self._escribir('FREELLMAPI_KEY=sk-test_key-123\n')
        self.assertEqual(E._leer_clave_desde_archivo("FREELLMAPI_KEY", ruta), "sk-test_key-123")


class TestLeerClaveMultifuente(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.raiz = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def _escribir(self, ruta, contenido):
        (self.raiz / ruta).write_text(contenido, encoding="utf-8")

    def test_segundo_archivo_contiene_clave(self):
        self._escribir("env1", "KEY=valor1\n")
        self._escribir("env2", "FREELLMAPI_KEY=valor2\n")
        ruta1 = str(self.raiz / "env1")
        ruta2 = str(self.raiz / "env2")
        self.assertEqual(E._leer_clave_multifuente("FREELLMAPI_KEY", [ruta1, ruta2]), "valor2")

    def test_ambos_archivos_vacios(self):
        self._escribir("env1", "# empty\n")
        self._escribir("env2", "\n")
        ruta1 = str(self.raiz / "env1")
        ruta2 = str(self.raiz / "env2")
        self.assertIsNone(E._leer_clave_multifuente("ANY_KEY", [ruta1, ruta2]))


if __name__ == "__main__":
    unittest.main()