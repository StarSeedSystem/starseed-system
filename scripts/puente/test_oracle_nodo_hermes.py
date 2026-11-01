# -*- coding: utf-8 -*-
"""Pruebas de Hermes en el nodo (IND1029G).

El gateway es el PUENTE (contrato §2): su instalador oficial, la config sin claves
(`freellmapi/auto` contra el FreeLLMAPI del A1 y el MCP `starseed-director`) y la
regla de Telegram (encuesta solo en el líder, porque dos encuestas del mismo bot se
pisan). En seco y sin red: aquí no se instala ni se encuesta nada.
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


class HermesEnElA1(unittest.TestCase):
    def test_config_sin_claves_con_freellmapi_y_el_director(self):
        texto = N.config_hermes()
        self.assertIn("default: auto", texto)
        self.assertIn("provider: freellmapi", texto)
        self.assertIn("base_url: http://127.0.0.1:3001/v1", texto)
        self.assertIn("key_env: FREELLMAPI_KEY", texto)
        self.assertIn("starseed-director:", texto)
        self.assertIn("mcp_director.py", texto)
        self.assertNotIn("starseed-wt", texto)
        self.assertFalse(CLAVES.search(texto))

    def test_el_plan_en_seco_usa_el_instalador_oficial(self):
        texto = " ".join(str(p) for p in N.hermes()["pasos"])
        self.assertIn("hermes-agent.nousresearch.com/install.sh", texto)
        self.assertIn("starseed-hermes", texto)
        self.assertIn("Telegram", texto)
        self.assertFalse(CLAVES.search(texto))

    def test_telegram_en_encuesta_solo_en_el_lider(self):
        otro = {"dueno": "a1-otro", "caduca": 200}
        self.assertFalse(N.telegram_encuesta_es_mia(otro, 100, "mac-1"))
        self.assertTrue(N.telegram_encuesta_es_mia(otro, 100, "a1-otro"))
        self.assertTrue(N.telegram_encuesta_es_mia({"dueno": "a1-otro", "caduca": 50}, 100, "mac-1"))
        self.assertTrue(N.telegram_encuesta_es_mia(None, 100, "mac-1"))

    def test_el_arranque_calla_telegram_si_no_es_lider(self):
        guion = N.guion_hermes()
        self.assertIn("TELEGRAM_BOT_TOKEN", guion)
        self.assertIn("lider_direccion", guion)
        self.assertIn('"gateway", "run"', guion)
        compile(guion, "hermes_arranque.py", "exec")


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
