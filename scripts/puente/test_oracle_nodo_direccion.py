# -*- coding: utf-8 -*-
"""Pruebas de `direccion` (IND1029D): plan, unidad y arranque del A1, en seco y sin red."""
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

SERVICIO = os.path.normpath(os.path.join(DIR, "..", "..", "deploy", "oracle", "nodo", "systemd", "starseed-direccion.service"))
with open(SERVICIO, encoding="utf-8") as _f:
    TEXTO = _f.read()
PIEZAS = ("orquestador", "autocuracion", "autopublicacion", "cartero")

class Unidad(unittest.TestCase):
    def test_es_del_a1_requiere_lo_que_lanza_y_limita_memoria(self):
        self.assertIn("[Service]", TEXTO)
        self.assertIn("User=starseed", TEXTO)
        self.assertIn("EnvironmentFile=-/etc/starseed/direccion.env", TEXTO)
        self.assertIn("ExecStart=/usr/bin/python3 -u %s" % N.ARRANQUE_DIRECCION_A1, TEXTO)
        for pieza in N.piezas_direccion():
            self.assertIn("# requiere: %s" % pieza[1], TEXTO)
        self.assertIn("# requiere: %s" % N.ARRANQUE_DIRECCION_A1, TEXTO)
        self.assertRegex(TEXTO, r"(?m)^MemoryMax=\d")
        self.assertIn("KillMode=control-group", TEXTO)

    def test_sin_rutas_de_worktree_ni_claves(self):
        self.assertNotIn(("starseed" + "-wt"), TEXTO)
        self.assertFalse(re.search(r"sk-|ghp_|AIza|BEGIN OPENSSH|xoxb-|Bearer ", TEXTO))

class Piezas(unittest.TestCase):
    def test_las_cuatro_piezas_del_reparto_de_la_mac(self):
        piezas = N.piezas_direccion()
        self.assertEqual(tuple(p[0] for p in piezas), PIEZAS)
        for nombre, ruta, args, marca in piezas:
            self.assertTrue(ruta.startswith(N.RAIZ_DIRECCION_A1))
            self.assertTrue(ruta.endswith("/scripts/puente/" + marca))
            self.assertEqual(args, ("--bucle",) if nombre == "autopublicacion" else ())
        self.assertNotIn(("starseed" + "-wt"), repr(piezas))

class Guion(unittest.TestCase):
    def test_lleva_piezas_arriendo_y_no_duplica(self):
        guion = N.guion_direccion()
        for pieza in N.piezas_direccion():
            self.assertIn(pieza[3], guion)
        self.assertIn('lider_direccion.renovar().get("soy")', guion)
        self.assertIn('["--bucle"]', guion)
        self.assertIn("/proc/%s/cmdline", guion)
        self.assertNotIn(("starseed" + "-wt"), guion)
        compile(guion, "direccion_arranque.py", "exec")

    def test_raiz_parametrizable_y_sin_claves(self):
        guion = N.guion_direccion("/srv/starseed")
        self.assertIn("RAIZ = '/srv/starseed'", guion)
        self.assertFalse(re.search(r"sk-|ghp_|AIza|BEGIN OPENSSH|xoxb-|Bearer ", guion))

class Plan(unittest.TestCase):
    def test_arranca_solo_si_no_hay_unidad_viva(self):
        pasos = N.plan_direccion(False)
        self.assertEqual([p["que"] for p in pasos], ["escribir", "instalar", "recargar", "arrancar"])
        self.assertIn("enable --now starseed-direccion", pasos[-1]["orden"])
        viva = N.plan_direccion(True)
        self.assertEqual(viva[-1]["que"], "nada")
        self.assertFalse(any(p["que"] == "arrancar" for p in viva))

class Seco(unittest.TestCase):
    def test_no_toca_la_red(self):
        with mock.patch.object(N, "ssh", side_effect=AssertionError("no hay red en seco")):
            salida = io.StringIO()
            with contextlib.redirect_stdout(salida):
                self.assertEqual(N.main(["oracle_nodo.py", "direccion"]), 0)
        r = json.loads(salida.getvalue())
        self.assertTrue(r["ok"])
        self.assertFalse(r["aplicado"])
        self.assertEqual(len(r["pasos"]), 4)

class Aplicar(unittest.TestCase):
    def _correr(self, activo, falla=None):
        ordenes = []

        def falso(orden, entrada=None, timeout=120):
            ordenes.append(orden)
            if "is-active" in orden:
                return (0, activo)
            if falla and entrada is not None:
                return (1, falla)
            return (0, "")

        with mock.patch.object(N, "ssh", side_effect=falso):
            salida = io.StringIO()
            with contextlib.redirect_stdout(salida):
                self.assertEqual(N.main(["oracle_nodo.py", "direccion", "--aplicar"]), 0)
        return json.loads(salida.getvalue()), ordenes

    def test_si_ya_esta_vivo_no_lo_arranca(self):
        r, ordenes = self._correr("active\n")
        self.assertTrue(r["activo_antes"])
        self.assertIn("nota", r)
        self.assertTrue(any("daemon-reload" in o for o in ordenes))
        self.assertFalse(any("enable --now" in o for o in ordenes))
        self.assertTrue(all(h["ok"] for h in r["hecho"]))

    def test_si_no_esta_vivo_lo_arranca(self):
        r, ordenes = self._correr("inactive\n")
        self.assertFalse(r["activo_antes"])
        self.assertTrue(any("enable --now starseed-direccion" in o for o in ordenes))
        self.assertTrue(r["ok"])

    def test_si_falla_la_subida_no_toca_systemd(self):
        r, ordenes = self._correr("inactive\n", falla="sin sudo")
        self.assertFalse(r["ok"])
        self.assertFalse(any("daemon-reload" in o or "enable --now" in o for o in ordenes))
        self.assertFalse(r["hecho"][0]["ok"])
