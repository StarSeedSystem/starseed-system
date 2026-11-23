#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas de `opencode-zen_config`: configurar los modelos gratuitos de OpenCode Zen.

El módulo de configuración se llama `opencode-zen_config.py` (con guion, como lo pidió
la cola), así que se carga por ruta con importlib. Se prueba por su interfaz pública:
el bloque que se escribe, la fusión con una configuración existente y el CLI. Nunca se
toca el `~/.config/opencode/opencode.json` real: todo va a directorios temporales.
"""

import contextlib
import importlib.util
import io
import json
import os
import sys
import tempfile
import unittest

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)

ESPEC = importlib.util.spec_from_file_location(
    "opencode_zen_config", os.path.join(AQUI, "opencode-zen_config.py")
)
zen = importlib.util.module_from_spec(ESPEC)
ESPEC.loader.exec_module(zen)

import medios_disponibles as M  # noqa: E402


class TestBloque(unittest.TestCase):
    def test_incluye_los_modelos_gratuitos(self):
        bloque = zen.bloque_zen()
        for modelo in ("glm-5.3-flash-free", "deepseek-v4.1-flash-free",
                       "minimax-m3.1-flash-free", "big-pickle"):
            self.assertIn(modelo, bloque["models"])

    def test_no_escribe_ninguna_clave(self):
        texto = json.dumps(zen.bloque_zen(), ensure_ascii=False)
        self.assertNotIn("apiKey", texto)
        self.assertNotIn("Bearer", texto)

    def test_permite_limitar_los_modelos(self):
        bloque = zen.bloque_zen(["modelo-x"])
        self.assertEqual(list(bloque["models"]), ["modelo-x"])


class TestFusionar(unittest.TestCase):
    def test_anade_el_proveedor_a_una_configuracion_vacia(self):
        nuevo, cambiado = zen.fusionar({})
        self.assertTrue(cambiado)
        self.assertIn("opencode", nuevo["provider"])

    def test_conserva_los_demas_proveedores(self):
        original = {"provider": {"groq": {"options": {"apiKey": "{env:GROQ_API_KEY}"}}}}
        nuevo, _ = zen.fusionar(original)
        self.assertIn("groq", nuevo["provider"])
        self.assertEqual(nuevo["provider"]["groq"]["options"]["apiKey"],
                         "{env:GROQ_API_KEY}")

    def test_no_muta_la_entrada(self):
        original = {"provider": {"groq": {"models": {}}}}
        zen.fusionar(original)
        self.assertNotIn("opencode", original["provider"])

    def test_es_idempotente(self):
        primero, _ = zen.fusionar({})
        segundo, cambiado = zen.fusionar(primero)
        self.assertFalse(cambiado)
        self.assertEqual(primero, segundo)

    def test_conserva_modelos_y_campos_del_bloque_existente(self):
        original = {"provider": {"opencode": {
            "name": "Mi Zen",
            "models": {"modelo-propio": {"name": "Propio"}},
        }}}
        nuevo, cambiado = zen.fusionar(original)
        bloque = nuevo["provider"]["opencode"]
        self.assertTrue(cambiado)
        self.assertIn("modelo-propio", bloque["models"])
        self.assertEqual(bloque["name"], "Mi Zen")

    def test_aguanta_configuraciones_que_no_son_dict(self):
        for basura in (None, [], "texto"):
            nuevo, cambiado = zen.fusionar(basura)
            self.assertTrue(cambiado)
            self.assertIn("opencode", nuevo["provider"])


class TestEstaConfigurado(unittest.TestCase):
    def test_configuracion_vacia_no_lo_esta(self):
        self.assertFalse(zen.esta_configurado({}))

    def test_tras_fusionar_lo_esta(self):
        nuevo, _ = zen.fusionar({})
        self.assertTrue(zen.esta_configurado(nuevo))

    def test_si_falta_un_modelo_no_lo_esta(self):
        nuevo, _ = zen.fusionar({})
        del nuevo["provider"]["opencode"]["models"]["big-pickle"]
        self.assertFalse(zen.esta_configurado(nuevo))


class TestCompatibilidad(unittest.TestCase):
    def test_el_renovador_lo_ve_configurado(self):
        nuevo, _ = zen.fusionar({})
        proveedores = nuevo.get("provider", {})
        # Misma condición que `renovador-pasarelas.py`.
        self.assertTrue("opencode" in proveedores or "zen" in str(nuevo).lower())

    def test_medios_disponibles_lo_marca_listo(self):
        nuevo, _ = zen.fusionar({})
        self.assertEqual(M.clasificar_opencode_zen(nuevo)["estado"], "listo")


class TestCLI(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.ruta = os.path.join(self.tmp.name, "opencode.json")

    def tearDown(self):
        self.tmp.cleanup()

    def _escribir_base(self, config):
        with open(self.ruta, "w", encoding="utf-8") as f:
            json.dump(config, f, ensure_ascii=False)

    def _correr(self, *args):
        salida = io.StringIO()
        with contextlib.redirect_stdout(salida):
            codigo = zen.main(list(args))
        return codigo, salida.getvalue()

    def test_sin_escribir_no_toca_el_archivo(self):
        self._escribir_base({"provider": {"groq": {}}})
        antes = open(self.ruta, encoding="utf-8").read()
        codigo, salida = self._correr("--config", self.ruta)
        self.assertEqual(codigo, 0)
        self.assertIn("cambios: sí", salida)
        self.assertEqual(open(self.ruta, encoding="utf-8").read(), antes)

    def test_escribir_anade_zen_y_deja_copia(self):
        self._escribir_base({"provider": {"groq": {"models": {}}}})
        codigo, _ = self._correr("--config", self.ruta, "--escribir")
        self.assertEqual(codigo, 0)
        self.assertTrue(os.path.exists(self.ruta + ".bak"))
        with open(self.ruta, encoding="utf-8") as f:
            datos = json.load(f)
        self.assertIn("groq", datos["provider"])
        self.assertTrue(zen.esta_configurado(datos))

    def test_escribir_en_ruta_nueva_crea_directorios(self):
        nueva = os.path.join(self.tmp.name, "sub", "dir", "opencode.json")
        codigo, _ = self._correr("--config", nueva, "--escribir")
        self.assertEqual(codigo, 0)
        self.assertTrue(os.path.exists(nueva))

    def test_json_imprime_la_configuracion(self):
        self._escribir_base({})
        codigo, salida = self._correr("--config", self.ruta, "--json")
        self.assertEqual(codigo, 0)
        datos = json.loads(salida)
        self.assertTrue(zen.esta_configurado(datos))

    def test_json_invalido_no_se_pisa(self):
        with open(self.ruta, "w", encoding="utf-8") as f:
            f.write("{roto")
        codigo, _ = self._correr("--config", self.ruta, "--escribir")
        self.assertEqual(codigo, 2)
        self.assertEqual(open(self.ruta, encoding="utf-8").read(), "{roto")


if __name__ == "__main__":
    unittest.main()

