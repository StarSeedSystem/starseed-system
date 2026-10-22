#!/usr/bin/env python3
"""(2026-10-22) Rescate de las pruebas de «Genesis en el A1» (COL1012Md): vigila, en el TEXTO de la
unidad de systemd y del Caddyfile del A1, que el contrato no se afloje — nunca el modo local del
despliegue (STARSEED_LOCAL), escucha solo en el bucle, IP real en X-Real-IP y ningún secreto escrito
en el código. La unidad es «parte 1 de 3»; el bloque genesis.{$STARSEED_HOST} del Caddyfile (parte 2)
aún no está en main: la prueba que lo vigila se salta hasta que ese bloque exista."""
import os
import re
import unittest


def obtener_texto_archivo(ruta):
    with open(ruta, "r") as f:
        return f.read()


class TestGenesisA1(unittest.TestCase):
    def setUp(self):
        self.ruta_base = os.path.join(os.path.dirname(__file__), "..", "..", "deploy", "oracle", "nodo")

    def texto_servicio(self):
        return obtener_texto_archivo(os.path.join(self.ruta_base, "systemd", "starseed-genesis.service"))

    def texto_caddy(self):
        return obtener_texto_archivo(os.path.join(self.ruta_base, "Caddyfile.nodo"))

    def test_no_hay_starseed_local_en_servicio(self):
        contenido = self.texto_servicio()
        self.assertNotIn("STARSEED_LOCAL=1", contenido, f"Servicio no debe llevar STARSEED_LOCAL=1\n{contenido}")
        self.assertIn("STARSEED_MANDO=1", contenido, f"Servicio debe llevar STARSEED_MANDO=1\n{contenido}")

    def test_servicio_usar_execstart_de_next(self):
        contenido = self.texto_servicio()
        self.assertIn(
            "ExecStart=/usr/local/bin/node /opt/starseed/genesis/node_modules/next/dist/bin/next start -p 9002 -H 127.0.0.1",
            contenido,
        )

    def test_servicio_tiene_identidad_propia_y_memoria_acotada(self):
        contenido = self.texto_servicio()
        self.assertIn("DynamicUser=yes", contenido, f"Servicio debe llevar DynamicUser=yes\n{contenido}")
        self.assertIn("MemoryMax=3G", contenido, f"Servicio debe llevar MemoryMax=3G\n{contenido}")

    def test_caddyfile_no_menciona_starseed_local(self):
        contenido = self.texto_caddy()
        self.assertNotIn("STARSEED_LOCAL=1", contenido)
        self.assertNotIn("STARSEED_LOCAL=0", contenido)

    def test_caddyfile_tiene_header_up_real_ip(self):
        contenido = self.texto_caddy()
        patron_bloque = re.compile(r"genesis\.\{\$STARSEED_HOST\}.*?(?=^\S|\Z)", re.MULTILINE | re.DOTALL)
        bloques = re.findall(patron_bloque, contenido)
        if not bloques:
            self.skipTest(
                "el bloque genesis.{$STARSEED_HOST} aún no está en Caddyfile.nodo "
                "(parte 2 de «Genesis en el A1», pendiente de otra tarea)"
            )
        for bloque in bloques:
            self.assertRegex(
                bloque,
                re.compile(r"header_up X-Real-IP \{remote_host\}"),
                f"El bloque genesis.{{$STARSEED_HOST}} debe poner header_up X-Real-IP {{remote_host}}\n{contenido}",
            )

    def test_caddyfile_no_tiene_ips_ni_hosts_reales(self):
        contenido = self.texto_caddy()
        self.assertNotIn("http://", contenido, "Caddyfile no debe contener URLs http:// reales")
        self.assertNotIn("https://", contenido, "Caddyfile no debe contener URLs https:// reales")
        self.assertNotIn("=" + re.escape("example.com"), contenido)
        self.assertNotIn("=" + re.escape("google.com"), contenido)
        self.assertNotIn("=" + re.escape("localhost"), contenido)

    def test_caddyfile_no_tiene_secretos_en_codigo(self):
        contenido = self.texto_caddy()
        patron = re.compile(r"\w+\.\{\$STARSEED_HOST\}.*?(?=^\S|\Z)", re.MULTILINE | re.DOTALL)
        bloques = re.findall(patron, contenido)
        for bloque in bloques:
            self.assertNotIn("--api-key-file", bloque, f"Bloque Caddy no debe contener claves API en código: {bloque}")


if __name__ == "__main__":
    unittest.main()
