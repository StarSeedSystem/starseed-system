"""Pruebas de la línea de estado StarSeed y del plist del servicio.

Sin red, sin procesos persistidos y sin tocar el ~/.starseed real:
STARSEED_HOME se inyecta en una carpeta temporal.
"""

import json
import os
import plistlib
import shutil
import subprocess
import sys
import tempfile
import unittest

RAIZ = os.path.dirname(os.path.abspath(__file__))
PLIST = os.path.join(RAIZ, "com.starseed.medidores.plist")
SCRIPT = os.path.join(RAIZ, "statusline-starseed.sh")

JSON_EJEMPLO = {
    "model": {"id": "claude-opus-4-1", "display_name": "Opus 4.1"},
    "context_window": {"used_percentage": 42.4},
    "cost": {"total_cost_usd": 1.234},
    "workspace": {"current_dir": "/Users/alex/Documents/starseed-os-main"},
    "rate_limits": {
        "five_hour": {"used_percentage": 61, "resets_at": 1900000000},
        "seven_day": {"used_percentage": 12, "resets_at": 1900500000},
    },
}


# En la Mac es zsh; en contenedores sin zsh el heredoc corre igual con bash.
SHELL = shutil.which("zsh") or shutil.which("bash") or "zsh"


def corre_linea(entrada, hogar):
    entorno = dict(os.environ, STARSEED_HOME=hogar)
    return subprocess.run(
        [SHELL, SCRIPT], input=entrada, capture_output=True, text=True,
        env=entorno, timeout=30)


class PruebasPlist(unittest.TestCase):
    def test_plist_valido(self):
        with open(PLIST, "rb") as f:
            p = plistlib.load(f)
        self.assertEqual(p["Label"], "com.starseed.medidores")
        self.assertEqual(p["StartInterval"], 600)
        self.assertNotIn("KeepAlive", p)
        self.assertTrue(p["RunAtLoad"])
        self.assertEqual(p["Nice"], 10)
        args = p["ProgramArguments"]
        self.assertEqual(len(args), 3)
        self.assertTrue(args[1].endswith("medidores_credito.py"))
        self.assertEqual(args[2], "recoger")
        ruta = p["EnvironmentVariables"]["PATH"]
        self.assertTrue(ruta.startswith("/Users/alex/.local/bin:"))
        self.assertIn("/opt/homebrew/bin", ruta)
        self.assertEqual(p["StandardOutPath"], "/tmp/starseed-medidores.log")


class PruebasStatusline(unittest.TestCase):
    def test_linea_y_escritura(self):
        with tempfile.TemporaryDirectory() as tmp:
            r = corre_linea(json.dumps(JSON_EJEMPLO), tmp)
            self.assertEqual(r.returncode, 0, r.stderr)
            lineas = [x for x in r.stdout.splitlines() if x.strip()]
            self.assertEqual(len(lineas), 1)
            self.assertIn("Opus 4.1", lineas[0])
            self.assertIn("ctx 42%", lineas[0])
            self.assertIn("$1.23", lineas[0])
            self.assertIn("starseed-os-main", lineas[0])
            ruta = os.path.join(
                tmp, ".starseed", "medidores-entrada", "claude-statusline.json")
            with open(ruta) as f:
                doc = json.load(f)
            self.assertIn("t", doc)
            self.assertEqual(doc["five_hour"]["usado_pct"], 61)
            self.assertEqual(doc["seven_day"]["usado_pct"], 12)
            self.assertIn("reinicia", doc["five_hour"])

    def test_sin_rate_limits_no_escribe(self):
        with tempfile.TemporaryDirectory() as tmp:
            d = {k: v for k, v in JSON_EJEMPLO.items() if k != "rate_limits"}
            r = corre_linea(json.dumps(d), tmp)
            self.assertEqual(r.returncode, 0, r.stderr)
            self.assertIn("Opus 4.1", r.stdout)
            ruta = os.path.join(
                tmp, ".starseed", "medidores-entrada", "claude-statusline.json")
            self.assertFalse(os.path.exists(ruta))

    def test_json_roto_dice_starseed(self):
        with tempfile.TemporaryDirectory() as tmp:
            r = corre_linea("{ esto no es json", tmp)
            self.assertEqual(r.returncode, 0)
            self.assertEqual(r.stdout.strip(), "starseed")
            self.assertEqual(r.stderr, "")


if __name__ == "__main__":
    unittest.main()
