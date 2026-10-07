"""Pruebas del servicio launchd y de la línea de estado de StarSeed (MC1007E).

Sin red, sin procesos ajenos y sin tocar el ~/.starseed real: el script corre
con STARSEED_HOME apuntando a una carpeta temporal.
"""

import json
import os
import plistlib
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parent
PLIST = RAIZ / "com.starseed.medidores.plist"
SCRIPT = RAIZ / "statusline-starseed.sh"

JSON_EJEMPLO = json.dumps({
    "model": {"display_name": "Claude Fable 5"},
    "context_window": {"used_percentage": 23.4},
    "cost": {"total_cost_usd": 1.2345},
    "workspace": {"current_dir": "/Users/alex/Documents/starseed-os-main"},
    "rate_limits": {
        "five_hour": {"used_percentage": 23, "resets_at": 1791297000},
        "seven_day": {"used_percentage": 41, "resets_at": 1791609000},
    },
})


class PruebasPlist(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with open(PLIST, "rb") as f:
            cls.plist = plistlib.load(f)

    def test_plist_se_parsea(self):
        self.assertIsInstance(self.plist, dict)

    def test_label_e_intervalo(self):
        self.assertEqual(self.plist["Label"], "com.starseed.medidores")
        self.assertEqual(self.plist["StartInterval"], 600)

    def test_sin_keepalive(self):
        self.assertNotIn("KeepAlive", self.plist)

    def test_path_con_local_bin_primero(self):
        ruta = self.plist["EnvironmentVariables"]["PATH"]
        self.assertTrue(ruta.startswith("/Users/alex/.local/bin:"))

    def test_programa_recoger(self):
        args = self.plist["ProgramArguments"]
        self.assertEqual(args[-1], "recoger")
        self.assertTrue(args[1].endswith("medidores_credito.py"))


class PruebasStatusline(unittest.TestCase):
    def ejecutar(self, stdin_texto, home):
        entorno = dict(os.environ)
        entorno["STARSEED_HOME"] = str(home)
        return subprocess.run(
            ["/bin/zsh", str(SCRIPT)],
            input=stdin_texto.encode(),
            capture_output=True,
            env=entorno,
            timeout=20,
        )

    def test_imprime_linea_y_escribe_numeros(self):
        with tempfile.TemporaryDirectory() as tmp:
            r = self.ejecutar(JSON_EJEMPLO, tmp)
            self.assertEqual(r.returncode, 0, r.stderr)
            linea = r.stdout.decode().strip()
            self.assertEqual(r.stdout.decode().count("\n"), 1)
            self.assertIn("Claude Fable 5", linea)
            self.assertIn("ctx 23%", linea)
            self.assertIn("$1.23", linea)
            self.assertIn("starseed-os-main", linea)
            archivo = Path(tmp) / ".starseed" / "medidores-entrada" / "claude-statusline.json"
            datos = json.loads(archivo.read_text())
            self.assertEqual(datos["five_hour"]["usado_pct"], 23)
            self.assertEqual(datos["seven_day"]["usado_pct"], 41)
            self.assertIn("reinicia", datos["five_hour"])
            self.assertIn("reinicia", datos["seven_day"])
            self.assertIn("t", datos)

    def test_sin_rate_limits_no_escribe(self):
        entrada = json.dumps({
            "model": {"display_name": "Claude Fable 5"},
            "workspace": {"current_dir": "/tmp"},
        })
        with tempfile.TemporaryDirectory() as tmp:
            r = self.ejecutar(entrada, tmp)
            self.assertEqual(r.returncode, 0, r.stderr)
            self.assertIn("Claude Fable 5", r.stdout.decode())
            self.assertFalse((Path(tmp) / ".starseed").exists())

    def test_json_roto_imprime_starseed_y_sale_0(self):
        with tempfile.TemporaryDirectory() as tmp:
            r = self.ejecutar("esto no es json{", tmp)
            self.assertEqual(r.returncode, 0)
            self.assertEqual(r.stdout.decode().strip(), "starseed")


if __name__ == "__main__":
    unittest.main()
