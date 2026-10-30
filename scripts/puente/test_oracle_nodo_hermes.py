# -*- coding: utf-8 -*-
"""Pruebas de `hermes` (IND1029G): gateway y Telegram en el A1, solo en el líder, en seco."""
import contextlib
import io
import json
import os
import re
import sys
import unittest
from unittest import mock

DIR = os.path.dirname(os.path.abspath(__file__))
if DIR not in sys.path:
    sys.path.insert(0, DIR)
import oracle_nodo as N  # noqa: E402

SERVICIO = os.path.normpath(os.path.join(DIR, "..", "..", "deploy", "oracle", "nodo", "systemd",
                                         "starseed-hermes.service"))
with open(SERVICIO, encoding="utf-8") as _f:
    TEXTO = _f.read()
CLAVES = re.compile(r"sk-|ghp_|AIza|BEGIN OPENSSH|xoxb-|Bearer |\d{8,}:[A-Za-z0-9_-]{30,}")


class Unidad(unittest.TestCase):
    def test_es_del_a1_y_solo_arranca_su_guion(self):
        self.assertIn("[Service]", TEXTO)
        self.assertIn("User=starseed", TEXTO)
        self.assertIn("EnvironmentFile=-/etc/starseed/direccion.env", TEXTO)
        self.assertIn("ExecStart=/usr/bin/python3 -u %s" % N.ARRANQUE_HERMES_A1, TEXTO)
        self.assertIn("# requiere: %s" % N.ARRANQUE_HERMES_A1, TEXTO)
        self.assertIn("StateDirectory=starseed-hermes", TEXTO)
        self.assertRegex(TEXTO, r"(?m)^MemoryMax=\d")

    def test_sin_rutas_de_worktree_ni_claves(self):
        self.assertNotIn(("starseed" + "-wt"), TEXTO)
        self.assertFalse(CLAVES.search(TEXTO))


class Config(unittest.TestCase):
    def test_modelo_local_y_mcp_sin_claves(self):
        c = N.config_hermes()
        self.assertIn("provider: freellmapi", c)
        self.assertIn("api: http://127.0.0.1:3001/v1", c)
        self.assertIn("key_env: FREELLMAPI_KEY", c)
        self.assertIn("default: auto", c)
        self.assertIn("starseed-director", c)
        self.assertIn("mcp_director.py", c)
        self.assertFalse(CLAVES.search(c))
        self.assertNotIn(("starseed" + "-wt"), c)


class Regla(unittest.TestCase):
    def test_telegram_solo_escucha_en_el_lider(self):
        self.assertTrue(N.debe_escuchar_telegram(True))
        self.assertFalse(N.debe_escuchar_telegram(False))


class Guion(unittest.TestCase):
    def test_arranca_y_para_el_gateway_con_el_arriendo(self):
        g = N.guion_hermes()
        self.assertIn('lider_direccion.renovar().get("soy")', g)
        self.assertIn('"gateway"', g)
        self.assertIn("ya no soy líder", g)
        self.assertIn("time.sleep(30)", g)
        self.assertNotIn(("starseed" + "-wt"), g)
        self.assertFalse(CLAVES.search(g))
        compile(g, "hermes_arranque.py", "exec")

    def test_raiz_parametrizable(self):
        self.assertIn("RAIZ = '/srv/starseed'", N.guion_hermes("/srv/starseed"))


class Plan(unittest.TestCase):
    def test_instala_solo_si_no_esta_vivo(self):
        p = N.plan_hermes(False)
        self.assertEqual(p[0]["que"], "instalar")
        self.assertIn("install.sh", p[0]["orden"])
        self.assertIn("starseed-director", repr(p))
        self.assertIn("enable --now starseed-hermes", p[-1]["orden"])
        viva = N.plan_hermes(True)
        self.assertEqual(viva[-1]["que"], "nada")
        self.assertFalse(any(p["que"] == "arrancar" for p in viva))


class Seco(unittest.TestCase):
    def test_no_toca_la_red(self):
        with mock.patch.object(N, "ssh", side_effect=AssertionError("no hay red en seco")):
            salida = io.StringIO()
            with contextlib.redirect_stdout(salida):
                self.assertEqual(N.main(["oracle_nodo.py", "hermes"]), 0)
        r = json.loads(salida.getvalue())
        self.assertTrue(r["ok"])
        self.assertFalse(r["aplicado"])


class Aplicar(unittest.TestCase):
    def _correr(self, activo="active\n", hay_hermes=True, falla_instalador=False):
        ordenes, entradas = [], []

        def falso(orden, entrada=None, timeout=120):
            ordenes.append(orden)
            if entrada is not None:
                entradas.append(entrada)
            if "is-active" in orden:
                return (0, activo)
            if "install.sh" in orden:
                return (1, "sin red") if falla_instalador else (0, "")
            if "command -v hermes" in orden:
                return (0, "SI\n" if hay_hermes else "NO\n")
            return (0, "")

        with mock.patch.object(N, "ssh", side_effect=falso):
            salida = io.StringIO()
            with contextlib.redirect_stdout(salida):
                self.assertEqual(N.main(["oracle_nodo.py", "hermes", "--aplicar"]), 0)
        return json.loads(salida.getvalue()), ordenes, entradas

    def test_si_ya_esta_vivo_no_lo_arranca_ni_reinstala(self):
        r, ordenes, entradas = self._correr()
        self.assertTrue(r["activo_antes"])
        self.assertFalse(any("install.sh" in o for o in ordenes))
        self.assertFalse(any("enable --now" in o for o in ordenes))
        self.assertTrue(any("starseed-director" in e for e in entradas))
        self.assertTrue(all(h["ok"] for h in r["hecho"]))

    def test_sin_hermes_lo_instala_y_arranca(self):
        r, ordenes, _ = self._correr("inactive\n", hay_hermes=False)
        self.assertTrue(any("install.sh" in o for o in ordenes))
        self.assertTrue(any("enable --now starseed-hermes" in o for o in ordenes))
        self.assertTrue(r["ok"])

    def test_si_falla_el_instalador_no_toca_los_archivos(self):
        r, ordenes, entradas = self._correr("inactive\n", hay_hermes=False, falla_instalador=True)
        self.assertFalse(r["ok"])
        self.assertEqual(entradas, [])
        self.assertFalse(any("daemon-reload" in o or "enable --now" in o for o in ordenes))


if __name__ == "__main__":
    unittest.main()
