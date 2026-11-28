#!/usr/bin/env python3
"""Pruebas del skill mcp-brave-search: conexión simulada, rastreo y dependencia."""
import importlib.util
import json
import os
import subprocess
import sys
import unittest
from pathlib import Path

_SKILL = Path(__file__).resolve().parents[1]
_spec = importlib.util.spec_from_file_location(
    "probar_conexion_bajo_prueba", _SKILL / "scripts" / "probar_conexion.py"
)
assert _spec is not None and _spec.loader is not None
probar_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(probar_mod)


class PruebasBrave(unittest.TestCase):
    def test_parte1_expone_las_tres_herramientas(self):
        """La parte 1 (mcp_director.py) ya está en main: las herramientas existen."""
        self.assertTrue(probar_mod.SERVIDOR.is_file(), "falta scripts/puente/mcp_director.py")
        fuente = probar_mod.SERVIDOR.read_text(encoding="utf-8")
        for nombre in probar_mod.HERRAMIENTAS:
            self.assertIn('"%s"' % nombre, fuente)

    def test_simulacion_completa_sin_clave_real(self):
        pasos = probar_mod.probar("StarSeed OS", simular=True)
        self.assertEqual(pasos["initialize"], "starseed-director")
        self.assertEqual(pasos["tools/list"], list(probar_mod.HERRAMIENTAS))
        self.assertTrue(pasos["brave_estado"]["configurada"])
        self.assertEqual(pasos["brave_estado"]["variable"], "BRAVE_API_KEY")
        self.assertIn("Conexión OK", pasos["brave_probar"])
        self.assertEqual(pasos["brave_buscar"]["resultados"], 2)
        self.assertEqual(pasos["brave_buscar"]["primero"]["descripcion"], "OS social")
        self.assertEqual(pasos["consulta_vacia"], "rechazada")

    def test_la_clave_no_aparece_en_la_salida(self):
        pasos = probar_mod.probar(simular=True)
        self.assertNotIn(probar_mod.CLAVE_FALSA, json.dumps(pasos, ensure_ascii=False))

    def test_rastreo_emite_force_add_cuando_esta_ignorada(self):
        """Punto 1: .agent/ ignorado no puede cerrar en silencio «sin_cambios»."""
        datos = probar_mod.estado_rastreo(
            ".", ignorado=lambda _r: True, seguido=lambda _r: False
        )
        self.assertTrue(datos["ignorada"])
        self.assertFalse(datos["ancla_seguida"])
        self.assertEqual(datos["comando"], "git add -f .agent/skills/mcp-brave-search")

    def test_rastreo_calla_si_ya_esta_seguida(self):
        datos = probar_mod.estado_rastreo(
            ".", ignorado=lambda _r: True, seguido=lambda _r: True
        )
        self.assertTrue(datos["ancla_seguida"])
        self.assertIsNone(datos["comando"])

    def test_sin_clave_nombra_las_variables(self):
        entorno = {
            k: v for k, v in os.environ.items()
            if k not in probar_mod.VARIABLES and k != "STARSEED_BRAVE_URL"
        }
        entrada = "\n".join([
            json.dumps({"jsonrpc": "2.0", "id": 1, "method": "initialize",
                        "params": {"protocolVersion": "2025-06-18"}}),
            json.dumps({"jsonrpc": "2.0", "id": 2, "method": "tools/call",
                        "params": {"name": "brave_buscar", "arguments": {"q": "hola"}}}),
        ]) + "\n"
        hecho = subprocess.run([sys.executable, str(probar_mod.SERVIDOR)], input=entrada,
                               capture_output=True, text=True, timeout=30, env=entorno)
        self.assertEqual(hecho.returncode, 0, hecho.stderr)
        salida = json.loads(hecho.stdout.splitlines()[-1])
        self.assertTrue(salida["result"].get("isError"))
        self.assertIn("BRAVE_API_KEY", salida["result"]["content"][0]["text"])


if __name__ == "__main__":
    unittest.main()
