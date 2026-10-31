# -*- coding: utf-8 -*-
"""Pruebas de Hermes en el nodo (IND1029G y el rescate RTGUI1021K2-d3).

En seco y sin red: la unidad `starseed-hermes.service`, el config SIN claves del A1, el
arranque que abre y PARA el gateway con el arriendo de líder y las órdenes `hermes`.
"""
import contextlib
import io
import importlib.util
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

SERVICIO = os.path.normpath(os.path.join(DIR, "..", "..", "deploy", "oracle", "nodo", "systemd",
                                         "starseed-hermes.service"))
with open(SERVICIO, encoding="utf-8") as _f:
    TEXTO_UNIDAD = _f.read()

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


class Unidad(unittest.TestCase):
    def test_es_del_a1_lleva_arranque_boveda_y_limites(self):
        self.assertIn("[Service]", TEXTO_UNIDAD)
        self.assertIn("User=starseed", TEXTO_UNIDAD); self.assertIn("KillMode=control-group", TEXTO_UNIDAD)
        self.assertIn("EnvironmentFile=-/etc/starseed/direccion.env", TEXTO_UNIDAD)
        self.assertIn("ExecStart=/usr/bin/python3 -u %s" % N.ARRANQUE_HERMES_A1, TEXTO_UNIDAD)
        self.assertIn("# requiere: %s" % N.ARRANQUE_HERMES_A1, TEXTO_UNIDAD)
        self.assertRegex(TEXTO_UNIDAD, r"(?m)^MemoryMax=\d")

    def test_sin_claves_ni_rutas_de_worktree(self):
        self.assertNotIn(("starseed" + "-wt"), TEXTO_UNIDAD)
        self.assertFalse(CLAVES.search(TEXTO_UNIDAD))


class Config(unittest.TestCase):
    def test_freellmapi_auto_contra_el_a1_y_mcp_director_sin_claves(self):
        c = N.config_hermes()
        self.assertIn("default: auto", c); self.assertIn("provider: freellmapi", c)
        self.assertIn("api: %s" % N.URL_FREELLMAPI_A1, c); self.assertIn("key_env: FREELLMAPI_KEY", c)
        self.assertIn("fallback_providers:", c)
        self.assertIn("starseed-director:", c); self.assertIn("mcp_director.py", c)
        self.assertFalse(CLAVES.search(c)); self.assertNotIn(("starseed" + "-wt"), c)


class Regla(unittest.TestCase):
    def test_telegram_solo_escucha_en_el_lider(self):
        self.assertTrue(N.debe_escuchar_telegram(True))
        self.assertFalse(N.debe_escuchar_telegram(False))


class Guion(unittest.TestCase):
    def test_abre_y_para_el_gateway_con_el_arriendo_y_parametrizable(self):
        for raiz in (N.RAIZ_DIRECCION_A1, "/srv/starseed"):
            g = N.guion_hermes(raiz)
            self.assertIn('lider_direccion.renovar().get("soy")', g); self.assertIn('"gateway"', g)
            self.assertIn("ya no soy líder", g); self.assertIn("time.sleep(30)", g)
            self.assertNotIn(("starseed" + "-wt"), g); self.assertFalse(CLAVES.search(g))
            compile(g, "hermes_arranque.py", "exec")
        self.assertIn("RAIZ = '/srv/starseed'", N.guion_hermes("/srv/starseed"))


class Plan(unittest.TestCase):
    def test_instalador_config_arranque_unidad_y_arranque_solo_si_no_esta_vivo(self):
        p = N.plan_hermes(False)
        self.assertEqual(p[0]["que"], "instalar"); self.assertIn("install.sh", p[0]["orden"])
        self.assertIn(N.ARRANQUE_HERMES_A1, repr(p)); self.assertIn("starseed-director", repr(p))
        self.assertIn("enable --now starseed-hermes", p[-1]["orden"])
        viva = N.plan_hermes(True)
        self.assertEqual(viva[-1]["que"], "nada")
        self.assertFalse(any(x["que"] == "arrancar" for x in viva))


class Seco(unittest.TestCase):
    def test_no_toca_la_red(self):
        with mock.patch.object(N, "ssh", side_effect=AssertionError("no hay red en seco")):
            salida = io.StringIO()
            with contextlib.redirect_stdout(salida):
                self.assertEqual(N.main(["oracle_nodo.py", "hermes"]), 0)
        r = json.loads(salida.getvalue())
        self.assertTrue(r["ok"]); self.assertFalse(r["aplicado"])
        self.assertEqual([p["que"] for p in r["pasos"]],
                         ["instalar", "escribir", "escribir", "instalar", "recargar", "arrancar"])


class Aplicar(unittest.TestCase):
    def _correr(self, hay_hermes=True, falla=None, unidad=None):
        ordenes, entradas = [], []

        def falso(orden, entrada=None, timeout=120):
            ordenes.append(orden)
            if entrada is not None: entradas.append(entrada)
            if "command -v hermes" in orden: return (0, "SI\n" if hay_hermes else "NO\n")
            if "install.sh" in orden: return (1, "sin red") if falla else (0, "")
            return (0, "")

        real = getattr(N, "UNIDAD_HERMES")
        with mock.patch.object(N, "ssh", side_effect=falso), \
                mock.patch.object(N, "UNIDAD_HERMES", unidad or real):
            salida = io.StringIO()
            with contextlib.redirect_stdout(salida):
                self.assertEqual(N.main(["oracle_nodo.py", "hermes", "--aplicar"]), 0)
        return json.loads(salida.getvalue()), ordenes, entradas

    def test_lo_instalado_se_usa_y_lo_vivo_no_se_reinicia(self):
        r, ordenes, entradas = self._correr(hay_hermes=True)
        self.assertFalse(any("install.sh" in o for o in ordenes))
        self.assertTrue(any("starseed-director" in e for e in entradas))
        self.assertTrue(all(x["ok"] for x in r["hecho"]))

    def test_sin_hermes_corre_el_instalador_oficial_y_lo_arranca(self):
        r, ordenes, _ = self._correr(hay_hermes=False)
        self.assertIn("install.sh", next(o for o in ordenes if "install.sh" in o))
        self.assertTrue(any("enable --now starseed-hermes" in o for o in ordenes)); self.assertTrue(r["ok"])

    def test_si_falla_el_instalador_no_toca_los_archivos(self):
        r, ordenes, entradas = self._correr(hay_hermes=False, falla="sin red")
        self.assertFalse(r["ok"]); self.assertEqual(entradas, [])
        self.assertFalse(any("daemon-reload" in o or "enable --now" in o for o in ordenes))

    def test_sin_la_unidad_en_el_repo_lo_dice_y_no_toca_la_red(self):
        r, _, _ = self._correr(unidad="/opt/no/starseed-hermes.service")
        self.assertFalse(r["ok"])
        self.assertIn("starseed-hermes", r["motivo"])


if __name__ == "__main__":
    unittest.main()
