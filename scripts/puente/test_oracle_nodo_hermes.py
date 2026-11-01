# -*- coding: utf-8 -*-
"""Pruebas de Hermes en el nodo (IND1029G).

Hermes es el PUENTE, no el motor (architecture/metagenesis-autonoma.md §2). Aquí se comprueba,
en seco y sin red: el `config.yaml` sin claves (`freellmapi/auto` contra el FreeLLMAPI del A1 y el
MCP `starseed-director`), el plan con el instalador oficial, el arranque que solo levanta el
gateway con el arriendo de líder, la regla de la encuesta única de Telegram y la unidad systemd.
También sigue vigilado el registro del MCP (`instalar_director.hermes`), sin claves ni worktrees.
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
WORKTREE = "starseed" + "-wt/"


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


class HermesEnElA1(unittest.TestCase):
    def test_config_sin_claves_con_freellmapi_y_el_director(self):
        yaml = N.config_hermes()
        self.assertIn("provider: freellmapi", yaml)
        self.assertIn("default: auto", yaml)
        self.assertIn("http://127.0.0.1:3001/v1", yaml)
        self.assertIn("key_env: FREELLMAPI_KEY", yaml)
        self.assertIn("starseed-director:", yaml)
        self.assertIn("mcp_director.py", yaml)
        self.assertFalse(CLAVES.search(yaml))

    def test_el_plan_usa_el_instalador_oficial_y_no_lleva_worktrees(self):
        texto = repr(N.plan_hermes())
        self.assertIn(N.INSTALADOR_HERMES, texto)
        self.assertIn("--non-interactive", texto)
        self.assertIn(N.CONFIG_HERMES_A1, texto)
        self.assertNotIn(WORKTREE, texto)
        self.assertFalse(CLAVES.search(texto))

    def test_el_arranque_solo_levanta_el_gateway_con_arriendo(self):
        guion = N.guion_hermes()
        self.assertIn("lider_direccion.renovar()", guion)
        self.assertIn('"gateway"', guion)
        antes, despues = guion.split("if lider:", 1)
        self.assertNotIn("subprocess.Popen", antes)
        self.assertIn("subprocess.Popen", despues)
        self.assertNotIn(WORKTREE, guion)
        self.assertFalse(CLAVES.search(guion))
        compile(guion, "hermes_arranque.py", "exec")

    def test_telegram_solo_encuesta_con_el_arriendo(self):
        self.assertTrue(N.telegram_solo_en_lider(True))
        self.assertFalse(N.telegram_solo_en_lider(False))
        self.assertFalse(N.telegram_solo_en_lider(True, telegram_configurado=False))

    def test_en_seco_no_toca_el_a1(self):
        with mock.patch.object(N, "ssh", side_effect=AssertionError("no debe hablar con el A1")):
            r = N.hermes(False)
        self.assertTrue(r["ok"])
        self.assertFalse(r["aplicado"])
        self.assertTrue(r["pasos"])
        self.assertIn("starseed-director:", r["config"])


class UnidadDeHermes(unittest.TestCase):
    def test_la_unidad_existe_y_solo_encuesta_en_el_lider(self):
        with open(N.UNIDAD_HERMES, encoding="utf-8") as f:
            texto = f.read()
        self.assertIn("# requiere: /home/starseed/.local/bin/hermes", texto)
        self.assertIn("ExecStart=/usr/bin/python3 -u /opt/starseed/nodo/hermes_arranque.py", texto)
        self.assertIn("409 Conflict", texto)
        self.assertIn("EnvironmentFile=-/home/starseed/.starseed/env", texto)
        self.assertNotIn(WORKTREE, texto)
        self.assertFalse(CLAVES.search(texto))


if __name__ == "__main__":
    unittest.main()
