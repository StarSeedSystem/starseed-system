#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas de setup de Genesis en el A1 (COL1012M · 2026-10-16).

El A1 ejecuta Genesis usando `starseed-genesis.service` y Caddy detrás del mismo host
HTTPS que el A1 (contenido en `deploy/oracle/nodo/Caddyfile.nodo`).

Contrato §6 del enjambre: Genesis en el A1 sin la Mac.
- Nunca ejecuta una build roja, solo la verde del guardián.
- Lleva STARSEED_MANDO=1 y NUNCA STARSEED_LOCAL=1.
- Caddy publica Genesis en genesis.{$STARSEED_HOST}, con X-Real-IP.
- Escucha solo en 127.0.0.1:9002.
- Nada imprime IP ni host real en código o registros.
"""
import os
import re
import unittest


def obtener_texto_archivo(ruta):
    with open(ruta, "r", encoding="utf-8") as f:
        return f.read()


class TestGenesisA1(unittest.TestCase):
    maxDiff = None

    def setUp(self):
        # Raíz del repo que contiene este test: vale en el A1, en la Mac y en cualquier worktree.
        self.ruta_base = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

    def test_no_hay_starseed_local_en_servicio(self):
        ruta_servicio = os.path.join(self.ruta_base, "deploy/oracle/nodo/systemd/starseed-genesis.service")
        contenido = obtener_texto_archivo(ruta_servicio)
        self.assertNotIn("STARSEED_LOCAL=1", contenido, f"Servicio no debe llevar STARSEED_LOCAL=1\n{contenido}")
        self.assertIn("STARSEED_MANDO=1", contenido, f"Servicio debe llevar STARSEED_MANDO=1\n{contenido}")

    def test_servicio_usar_execstart_de_next(self):
        ruta_servicio = os.path.join(self.ruta_base, "deploy/oracle/nodo/systemd/starseed-genesis.service")
        contenido = obtener_texto_archivo(ruta_servicio)
        self.assertIn("ExecStart=/home/starseed/.local/bin/next start -p 9002 -H 127.0.0.1", contenido)

    def test_servicio_tiene_los_max_memory_y_user_correcto(self):
        ruta_servicio = os.path.join(self.ruta_base, "deploy/oracle/nodo/systemd/starseed-genesis.service")
        contenido = obtener_texto_archivo(ruta_servicio)
        self.assertIn("User=starseed", contenido)
        self.assertIn("MemoryMax=3G", contenido)

    def test_caddyfile_no_menciona_starseed_local(self):
        ruta_caddy = os.path.join(self.ruta_base, "deploy/oracle/nodo/Caddyfile.nodo")
        contenido = obtener_texto_archivo(ruta_caddy)
        self.assertNotIn("STARSEED_LOCAL=1", contenido)
        self.assertNotIn("STARSEED_LOCAL=0", contenido)

    def test_caddyfile_tiene_header_up_real_ip(self):
        ruta_caddy = os.path.join(self.ruta_base, "deploy/oracle/nodo/Caddyfile.nodo")
        contenido = obtener_texto_archivo(ruta_caddy)
        patron = re.compile(r"genesis\.\{\$STARSEED_HOST\}.*?header_up X-Real-IP \{remote_host\}", re.DOTALL)
        self.assertRegex(contenido, patron, f"genesis.{{$STARSEED_HOST}} debe tener header_up X-Real-IP {{\\remote_host}}\n{contenido}")

    def test_caddyfile_no_tiene_ips_ni_hosts_reales(self):
        ruta_caddy = os.path.join(self.ruta_base, "deploy/oracle/nodo/Caddyfile.nodo")
        contenido = obtener_texto_archivo(ruta_caddy)
        self.assertNotIn("http://", contenido, "Caddyfile no debe contener URLs http:// reales")
        self.assertNotIn("https://", contenido, "Caddyfile no debe contener URLs https:// reales")
        self.assertNotIn("=" + re.escape("example.com"), contenido)
        self.assertNotIn("=" + re.escape("google.com"), contenido)
        self.assertNotIn("=" + re.escape("localhost"), contenido)

    def test_caddyfile_no_tiene_secretos_en_codigo(self):
        ruta_caddy = os.path.join(self.ruta_base, "deploy/oracle/nodo/Caddyfile.nodo")
        contenido = obtener_texto_archivo(ruta_caddy)
        patron = re.compile(r"bitnet\.\{\$STARSEED_HOST\}.*?(?=^\S|\Z)", re.MULTILINE | re.DOTALL)
        bloques = re.findall(patron, contenido)
        for bloque in bloques:
            self.assertNotIn("--api-key-file", bloque, f"Bloque Caddy no debe contener claves API en código: {bloque}")


if __name__ == "__main__":
    unittest.main()
