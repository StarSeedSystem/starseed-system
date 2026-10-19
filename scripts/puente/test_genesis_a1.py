#!/usr/bin/env python3
"""Pruebas de la configuración de Genesis en el A1 (OPO1011)."""
import os
import re
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

def obtener_texto_archivo(ruta):
    """Devuelve el contenido del archivo en `ruta`."""
    with open(ruta, "r", encoding="utf-8") as f:
        return f.read()


class TestGenesisA1(unittest.TestCase):
    """Pruebas de los archivos de despliegue de Genesis en el A1."""

    def setUp(self):
        # La ruta base es el directorio del repositorio.
        self.ruta_base = os.path.join(os.path.dirname(__file__), "..", "..")
        self.ruta_base = os.path.abspath(self.ruta_base)

    def test_caddyfile_no_menciona_starseed_local(self):
        ruta_caddy = os.path.join(self.ruta_base, "deploy", "oracle", "nodo", "Caddyfile.nodo")
        contenido = obtener_texto_archivo(ruta_caddy)
        self.assertNotIn("STARSEED_LOCAL=1", contenido, f"Caddyfile no debe contener STARSEED_LOCAL=1\n{contenido}")
        self.assertNotIn("STARSEED_LOCAL=0", contenido, f"Caddyfile no debe contener STARSEED_LOCAL=0\n{contenido}")

    def test_caddyfile_no_tiene_ips_ni_hosts_reales(self):
        ruta_caddy = os.path.join(self.ruta_base, "deploy", "oracle", "nodo", "Caddyfile.nodo")
        contenido = obtener_texto_archivo(ruta_caddy)
        self.assertNotIn("http://", contenido, "Caddyfile no debe contener URLs http:// reales")
        self.assertNotIn("https://", contenido, "Caddyfile no debe contener URLs https:// reales")
        self.assertNotIn("=" + re.escape("example.com"), contenido)
        self.assertNotIn("=" + re.escape("google.com"), contenido)
        self.assertNotIn("=" + re.escape("localhost"), contenido)

    def test_caddyfile_no_tiene_secretos_en_codigo(self):
        ruta_caddy = os.path.join(self.ruta_base, "deploy", "oracle", "nodo", "Caddyfile.nodo")
        contenido = obtener_texto_archivo(ruta_caddy)
        patron = re.compile(r"bitnet\.\{\$STARSEED_HOST\}.*?(?=^\S|\Z)", re.MULTILINE | re.DOTALL)
        bloques = re.findall(patron, contenido)
        for bloque in bloques:
            self.assertNotIn("--api-key-file", bloque, f"Bloque Caddy no debe contener claves API en código: {bloque}")


if __name__ == "__main__":
    unittest.main()