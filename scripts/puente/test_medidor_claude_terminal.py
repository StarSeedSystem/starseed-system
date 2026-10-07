# -*- coding: utf-8 -*-
"""Pruebas adaptador Claude por terminal.

unittest con la salida real de §2.1 y casos límite.
"""

import os
import sys
import subprocess
import unittest
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import medidor_claude_terminal as M

REAL = """You are currently using your subscription to power your Claude Code usage

Current session: 23% used · resets Oct 6 at 6:10pm (America/Mexico_City)
Current week (all models): 41% used · resets Oct 10 at 4am (America/Mexico_City)
Current week (Fable): 0% used · resets Oct 10 at 4am (America/Mexico_City)

What's contributing to your limits usage?
Approximate, based on local sessions on this machine — does not include other devices or claude.ai. Behaviors are independent characteristics, not a breakdown.

Last 24h · 51 requests · 7 sessions
  92% of your usage was at >150k context
"""

class TestInterpretar(unittest.TestCase):
    def test_tres_ventanas_plan_suscripcion(self):
        ahora = datetime(2026, 10, 6, 18, 5, tzinfo=ZoneInfo("America/Mexico_City"))
        r = M.interpretar(REAL, ahora)
        self.assertTrue(r["ok"])
        self.assertEqual(r["plan"], "suscripción")
        self.assertEqual(len(r["ventanas"]), 3)
        ids = {v["id"] for v in r["ventanas"]}
        self.assertEqual(ids, {"sesion", "semana", "semana-fable"})
        ses = next(v for v in r["ventanas"] if v["id"] == "sesion")
        self.assertEqual(ses["usado_pct"], 23)
        self.assertEqual(ses["etiqueta"], "Sesión (5 h)")
        self.assertEqual(ses["reinicia"], "2026-10-06T18:10:00-06:00")
        sem = next(v for v in r["ventanas"] if v["id"] == "semana")
        self.assertEqual(sem["usado_pct"], 41)
        self.assertEqual(sem["reinicia"], "2026-10-10T04:00:00-06:00")
        fable = next(v for v in r["ventanas"] if v["id"] == "semana-fable")
        self.assertEqual(fable["usado_pct"], 0)

    def test_12am_y_12pm(self):
        texto = """You are currently using your subscription to power your Claude Code usage
Current session: 10% used · resets Oct 6 at 12am (America/Mexico_City)
Current week (all models): 20% used · resets Oct 6 at 12pm (America/Mexico_City)
"""
        ahora = datetime(2026, 10, 6, 10, tzinfo=ZoneInfo("America/Mexico_City"))
        r = M.interpretar(texto, ahora)
        self.assertTrue(r["ok"])
        ses = next(v for v in r["ventanas"] if v["id"] == "sesion")
        self.assertEqual(ses["reinicia"], "2026-10-06T00:00:00-06:00")
        sem = next(v for v in r["ventanas"] if v["id"] == "semana")
        self.assertEqual(sem["reinicia"], "2026-10-06T12:00:00-06:00")

    def test_cambio_año_200_dias(self):
        texto = """You are currently using your subscription to power your Claude Code usage
Current week (all models): 30% used · resets Jan 2 at 4am (America/Mexico_City)
"""
        ahora = datetime(2026, 12, 30, 12, tzinfo=ZoneInfo("America/Mexico_City"))
        r = M.interpretar(texto, ahora)
        self.assertTrue(r["ok"])
        v = r["ventanas"][0]
        self.assertEqual(v["reinicia"], "2027-01-02T04:00:00-06:00")

    def test_sin_suscripcion(self):
        texto = "Current session: 23% used · resets Oct 6 at 6:10pm (America/Mexico_City)"
        ahora = datetime.now(timezone.utc)
        r = M.interpretar(texto, ahora)
        self.assertFalse(r["ok"])
        self.assertEqual(r["error"], "claude no está usando la suscripción")

    def test_sin_datos(self):
        texto = "You are currently using your subscription to power your Claude Code usage\n"
        ahora = datetime.now(timezone.utc)
        r = M.interpretar(texto, ahora)
        self.assertFalse(r["ok"])
        self.assertEqual(r["error"], "sin datos de uso")

    def test_lineas_sin_entender(self):
        texto = """You are currently using your subscription to power your Claude Code usage
Current session: 23% used · resets Oct 6 at 6:10pm (America/Mexico_City)
Current what: 99% used · resets Oct 6 at 6:10pm (America/Mexico_City)
"""
        ahora = datetime(2026, 10, 6, 18, 5, tzinfo=ZoneInfo("America/Mexico_City"))
        r = M.interpretar(texto, ahora)
        self.assertTrue(r["ok"])
        self.assertEqual(r["extras"].get("lineas_sin_entender"), 1)

class TestLeer(unittest.TestCase):
    def test_entorno_sin_clave_api(self):
        llamadas = {}
        def fake_ejecutar(cmd, stdin, capture_output, text, timeout, cwd, env):
            llamadas.update({"cmd": cmd, "stdin": stdin, "timeout": timeout, "cwd": cwd, "env": env})
            class R: returncode = 0; stdout = REAL
            return R()
        entorno = {"PATH": "/usr/bin", "ANTHROPIC_API_KEY": "XXX", "HOME": "/tmp"}
        home = "/tmp"
        r = M.leer(ahora=datetime(2026,10,6,18,5,tzinfo=ZoneInfo("America/Mexico_City")), ejecutar=fake_ejecutar, entorno=entorno, home=home)
        self.assertTrue(r["ok"])
        self.assertEqual(llamadas["cmd"], ["claude", "-p", "/usage"])
        self.assertIs(llamadas["stdin"], M.subprocess.DEVNULL)
        self.assertEqual(llamadas["timeout"], 60)
        self.assertTrue(llamadas["cwd"].endswith("medidores-entrada"))
        self.assertNotIn("ANTHROPIC_API_KEY", llamadas["env"])
        self.assertTrue(llamadas["env"]["PATH"].startswith(os.path.join(home, ".local", "bin")))

    def test_leer_exito_con_suscripcion(self):
        texto_salida = (
            "You are currently using your subscription to power your Claude Code usage\n"
            "\n"
            "Current session: 23% used · resets Oct 6 at 6:10pm (America/Mexico_City)\n"
            "Current week (all models): 41% used · resets Oct 10 at 4am (America/Mexico_City)\n"
            "Current week (Fable): 0% used · resets Oct 10 at 4am (America/Mexico_City)\n"
            "\n"
            "What's contributing to your limits usage?\n"
            "..."
        )

        def ejecutar_mock(orden, *, stdin, capture_output, text, timeout, cwd, env):
            class Proc:
                stdout = texto_salida
                returncode = 0
            return Proc()

        ahora = datetime(2026, 10, 6, 18, 5)
        medidor = M.leer(ahora=ahora, ejecutar=ejecutar_mock, entorno={})
        self.assertEqual(medidor["id"], "claude")
        self.assertEqual(medidor["proveedor"], "anthropic")
        self.assertEqual(medidor["nombre"], "Claude · plan")
        self.assertEqual(medidor["tipo"], "plan")
        self.assertEqual(medidor["plan"], "suscripción")
        self.assertTrue(medidor["ok"])
        self.assertIsNone(medidor["error"])
        self.assertEqual(medidor["leido"], "2026-10-06T18:05:00")
        self.assertEqual(medidor["enlace"], "https://claude.ai/settings/usage")

    def test_leer_ahora_param(self):
        def ejecutar_mock(orden, *, stdin, capture_output, text, timeout, cwd, env):
            class Proc:
                stdout = "using your subscription\n"
                returncode = 0
            return Proc()

        ahora = datetime(2026, 12, 30, 10, 30)
        medidor = M.leer(ahora=ahora, ejecutar=ejecutar_mock, entorno={})
        self.assertEqual(medidor["leido"], "2026-12-30T10:30:00")

    def test_timeout(self):
        def fake_timeout(*a, **kw):
            raise subprocess.TimeoutExpired(cmd="claude", timeout=60)
        r = M.leer(ahora=datetime.now(timezone.utc), ejecutar=fake_timeout, home="/tmp")
        self.assertFalse(r["ok"])
        self.assertIn("timeout", r["error"].lower())

    def test_file_not_found(self):
        def fake_fn(*a, **kw):
            raise FileNotFoundError()
        r = M.leer(ahora=datetime.now(timezone.utc), ejecutar=fake_fn, home="/tmp")
        self.assertFalse(r["ok"])
        self.assertIn("no encontrado", r["error"])

    def test_codigo_no_cero(self):
        def fake_err(*a, **kw):
            class R: returncode = 1; stdout = ""
            return R()
        r = M.leer(ahora=datetime.now(timezone.utc), ejecutar=fake_err, home="/tmp")
        self.assertFalse(r["ok"])
        self.assertIn("error", r["error"].lower())

if __name__ == "__main__":
    unittest.main()
