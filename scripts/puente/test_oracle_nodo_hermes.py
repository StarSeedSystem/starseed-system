# -*- coding: utf-8 -*-
"""Pruebas de Hermes en el nodo (IND1029G y el rescate RTGUI1021K2-d3).

Cubre el gateway del A1 (`starseed-hermes`): config sin claves con `freellmapi/auto` y el
MCP `starseed-director`, el arranque que solo enciende la encuesta de Telegram con el
arriendo de líder, la unidad systemd y el plan de `oracle_nodo hermes`, todo en seco.
También el registro del MCP `starseed-director` en `instalar_director.hermes`.
"""
import contextlib
import importlib.util
import io
import json
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


SERVICIO_HERMES = os.path.normpath(os.path.join(
    DIR, "..", "..", "deploy", "oracle", "nodo", "systemd", "starseed-hermes.service"))
with open(SERVICIO_HERMES, encoding="utf-8") as _f:
    UNIDAD = _f.read()


class ConfigHermes(unittest.TestCase):
    def test_modelo_freellmapi_local_y_mcp_director_sin_claves(self):
        c = N.config_hermes()
        self.assertIn("default: auto", c)
        self.assertIn("provider: freellmapi", c)
        self.assertIn(N.HERMES_FREELMAPI, c)
        self.assertIn("starseed-director:", c)
        self.assertIn("mcp_director.py", c)
        self.assertIn("key_env: FREELLMAPI_API_KEY", c)
        self.assertIn("telegram:", c)
        self.assertFalse(CLAVES.search(c))
        self.assertNotIn(("starseed" + "-wt"), c)


class GatewaySoloEnElLider(unittest.TestCase):
    def test_enciende_y_apaga_segun_el_arriendo(self):
        g = N.guion_hermes()
        self.assertIn('lider_direccion.renovar().get("soy")', g)
        self.assertIn('"gateway", "run"', g)
        self.assertIn("proceso.terminate()", g)
        self.assertIn("time.sleep(30)", g)
        self.assertFalse(CLAVES.search(g))
        self.assertNotIn(("starseed" + "-wt"), g)
        compile(g, "hermes_arranque.py", "exec")

    def test_raiz_parametrizable(self):
        self.assertIn("RAIZ, proceso = '/srv/starseed', None", N.guion_hermes("/srv/starseed"))


class UnidadHermes(unittest.TestCase):
    def test_corre_como_starseed_con_boveda_y_limite(self):
        self.assertIn("User=starseed", UNIDAD)
        self.assertIn("ExecStart=/usr/bin/python3 -u %s" % N.ARRANQUE_HERMES_A1, UNIDAD)
        self.assertIn("# requiere: %s" % N.ARRANQUE_HERMES_A1, UNIDAD)
        self.assertIn("# requiere: %s" % N.HERMES_BIN, UNIDAD)
        self.assertIn("EnvironmentFile=-/etc/starseed/hermes.env", UNIDAD)
        self.assertIn("HERMES_HOME=/home/starseed/.hermes", UNIDAD)
        self.assertRegex(UNIDAD, r"(?m)^MemoryMax=\d")
        self.assertFalse(CLAVES.search(UNIDAD))
        self.assertNotIn(("starseed" + "-wt"), UNIDAD)


class PlanHermes(unittest.TestCase):
    def test_instala_solo_si_falta_y_no_reinicia_si_esta_vivo(self):
        pasos = N.plan_hermes(False, False)
        self.assertEqual(pasos[0]["que"], "instalar")
        self.assertIn(N.HERMES_INSTALADOR, pasos[0]["orden"])
        self.assertEqual(N.plan_hermes(True, False)[0]["que"], "escribir")
        self.assertEqual(N.plan_hermes(True, True)[-1]["que"], "nada")

    def test_en_seco_no_toca_la_red(self):
        with mock.patch.object(N, "ssh", side_effect=AssertionError("no hay red en seco")):
            salida = io.StringIO()
            with contextlib.redirect_stdout(salida):
                self.assertEqual(N.main(["oracle_nodo.py", "hermes"]), 0)
        r = json.loads(salida.getvalue())
        self.assertTrue(r["ok"])
        self.assertFalse(r["aplicado"])
        self.assertGreaterEqual(len(r["pasos"]), 4)


class AplicarHermes(unittest.TestCase):
    def test_instalador_como_starseed_config_sin_claves_y_arranque(self):
        ordenes = []

        def falso(orden, entrada=None, timeout=120):
            ordenes.append(orden)
            if "test -x" in orden:
                return (1, "no")
            if "is-active" in orden:
                return (0, "inactive")
            return (0, "")

        with mock.patch.object(N, "ssh", side_effect=falso):
            salida = io.StringIO()
            with contextlib.redirect_stdout(salida):
                self.assertEqual(N.main(["oracle_nodo.py", "hermes", "--aplicar"]), 0)
        r = json.loads(salida.getvalue())
        self.assertTrue(r["ok"])
        self.assertFalse(r["instalado_antes"])
        self.assertTrue(any("sudo -u starseed" in o and N.HERMES_INSTALADOR in o for o in ordenes))
        self.assertTrue(any("enable --now starseed-hermes" in o for o in ordenes))
        self.assertFalse(any(CLAVES.search(o) for o in ordenes))


if __name__ == "__main__":
    unittest.main()
