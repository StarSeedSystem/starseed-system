#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas del despliegue de Genesis en el A1 (COL1012Md-d3 · parte 3 de 3).

POR QUÉ existen: el A1 sirve la sala de control (Genesis) sin la Mac, detrás de Caddy y con
sesión. Son dos archivos: la unidad `starseed-genesis.service` (que la levanta) y el bloque
`genesis.{$STARSEED_HOST}` de `Caddyfile.nodo` (que la publica). Aquí se vigila, EN EL TEXTO de
esos dos archivos, lo que el contrato (§6 de architecture/colmena-relevo-contenedores.md) da por
bueno: sin modo local, con la IP real de quien llama en X-Real-IP, escuchando solo en el bucle
local, con identidad propia y código de solo lectura, y sin IPs, hosts ni claves en el repo.
"""
from __future__ import annotations

import os
import re
import unittest

RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
UNIDAD = os.path.join(RAIZ, "deploy", "oracle", "nodo", "systemd", "starseed-genesis.service")
CADDY = os.path.join(RAIZ, "deploy", "oracle", "nodo", "Caddyfile.nodo")
PUERTO = "9002"
BUCLE = "127.0.0.1"


def leer(ruta):
    """El texto del archivo tal cual: se vigila el archivo, no una versión ideal de él."""
    with open(ruta, "r", encoding="utf-8") as f:
        return f.read()


def configuracion(texto):
    """Lo que de verdad se aplica: sin comentarios ni líneas vacías."""
    return "\n".join(l.strip() for l in texto.splitlines()
                     if l.strip() and not l.strip().startswith("#"))


class GenesisEnA1(unittest.TestCase):
    """Lo que el contrato §6 exige de los dos archivos del despliegue."""

    maxDiff = None

    def setUp(self):
        self.unidad = leer(UNIDAD)
        self.caddy = leer(CADDY)
        self.unidad_cfg = configuracion(self.unidad)
        self.caddy_cfg = configuracion(self.caddy)

    def test_la_configuracion_ignora_comentarios_y_lineas_vacias(self):
        """Lo que se vigila es lo que se aplica: un comentario no enciende ni apaga nada."""
        texto = "# genesis.example.com 203.0.113.9\nExecStart=x\n\n  # una nota\n"
        self.assertEqual(configuracion(texto), "ExecStart=x")

    def test_sin_modo_local_en_los_dos_archivos(self):
        """STARSEED_LOCAL deja pasar CUALQUIER petición sin sesión: ni en la unidad ni en Caddy."""
        for nombre, texto in (("la unidad", self.unidad), ("el Caddyfile", self.caddy)):
            self.assertNotIn("STARSEED_LOCAL", texto, f"{nombre} habla del modo local")

    def test_el_mando_esta_encendido_y_el_modo_publico_tambien(self):
        """Sin STARSEED_MANDO, /api/mando/* responde 404; detrás de un proxy, STARSEED_PUBLICO=1
        anula la confianza en «viene de localhost» y cada petición pide sesión."""
        self.assertIn("STARSEED_MANDO=1", self.unidad_cfg)
        self.assertIn("STARSEED_PUBLICO=1", self.unidad_cfg)

    def test_la_unidad_escucha_solo_en_el_bucle_local(self):
        """Lo único que la alcanza desde fuera es Caddy; si escucha en 0.0.0.0, entra cualquiera."""
        arranques = [l for l in self.unidad_cfg.splitlines() if l.startswith("ExecStart=")]
        self.assertEqual(len(arranques), 1, self.unidad_cfg)
        self.assertIn(f"-p {PUERTO}", arranques[0])
        self.assertIn(f"-H {BUCLE}", arranques[0])
        for prohibido in ("0.0.0.0", "-H ::", "-H localhost", "[::1]"):
            self.assertNotIn(prohibido, arranques[0], f"la unidad escucha fuera del bucle: {arranques[0]}")

    def test_caddy_apunta_al_bucle_local_y_al_puerto_de_genesis(self):
        """Cada destino es el bucle local, y el de Genesis, el puerto 9002."""
        destinos = [l for l in self.caddy_cfg.splitlines() if l.startswith("reverse_proxy")]
        self.assertTrue(destinos, "el Caddyfile no proxifica nada")
        for destino in destinos:
            self.assertIn(BUCLE, destino, f"destino fuera del bucle local: {destino}")
        self.assertIn(f"reverse_proxy {BUCLE}:{PUERTO}", self.caddy_cfg)
        self.assertIn("genesis.{$STARSEED_HOST}", self.caddy)

    def test_caddy_manda_la_ip_real_de_quien_llama(self):
        """X-Real-IP sin `+`: con `+` Caddy añadiría la del cliente y podría falsearse."""
        self.assertIn("header_up X-Real-IP {remote_host}", self.caddy_cfg)
        self.assertNotIn("+X-Real-IP", self.caddy, "la IP real no puede ser la que traiga el cliente")

    def test_caddy_no_borra_la_cookie_de_sesion(self):
        """La puerta de datos borra `Cookie`; aquí eso dejaría a Genesis sin sesión (401 a todos)."""
        self.assertNotRegex(self.caddy_cfg, r"header_up\s+-\s*Cookie")

    def test_no_publica_rutas_que_se_apoyan_en_no_estar_en_la_mac(self):
        """Solo se publica lo que la sala necesita: ni binarios con URL del cliente, ni gasto de
        créditos, ni el daemon de voz, ni un buzón abierto. Los comentarios no cuentan."""
        for ruta in ("/api/agent-reach", "/api/astraura/decidir",
                     "/api/voz-local/", "/api/telegram/send"):
            self.assertNotIn(ruta, self.caddy_cfg, f"ruta no apta para internet: {ruta}")

    def test_nada_de_ips_ni_hosts_ni_claves_reales(self):
        """Al repo solo llega el bucle local; ni una URL, ni una IP, ni un host, ni una clave."""
        for nombre, texto in (("la unidad", self.unidad), ("el Caddyfile", self.caddy)):
            for ip in re.findall(r"\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b", texto):
                self.assertTrue(ip.startswith("127."), f"{nombre}: IP real en el repositorio: {ip}")
            self.assertNotIn("http://", texto)
            self.assertNotIn("https://", texto)
            self.assertNotIn("0.0.0.0", texto)
            self.assertNotRegex(texto, r"\[[0-9a-fA-F]{2,}:", f"{nombre}: IPv6 literal")
            self.assertNotIn("SUPABASE_SERVICE_ROLE", texto)
            self.assertNotRegex(texto, r"eyJ[A-Za-z0-9_-]{10,}", f"{nombre}: token en el repo")
            self.assertNotRegex(texto, r"\bsk-[A-Za-z0-9]{16,}", f"{nombre}: clave en el repo")
        # El nombre público sale de /etc/starseed/host: al repo no llega ningún host real.
        etiquetas = re.findall(r"^(\S+)\s*\{\s*$", self.caddy, re.MULTILINE)
        self.assertTrue(etiquetas)
        for etiqueta in etiquetas:
            self.assertIn("{$STARSEED_HOST}", etiqueta, f"sitio con host real: {etiqueta}")

    def test_la_unidad_esta_endurecida(self):
        """Identidad propia, código de solo lectura, caché aparte y memoria acotada (12 GB)."""
        self.assertIn("DynamicUser=yes", self.unidad_cfg)
        self.assertNotIn("User=starseed", self.unidad_cfg)  # el enjambre corre como ese usuario
        self.assertNotIn("Group=starseed", self.unidad_cfg)
        self.assertIn("ProtectSystem=strict", self.unidad_cfg)
        self.assertIn("CacheDirectory=starseed-genesis", self.unidad_cfg)
        for linea in self.unidad_cfg.splitlines():
            if linea.startswith("ReadWritePaths="):
                self.assertNotIn("/opt/starseed/genesis", linea, "el código servido no se escribe")
        self.assertIn("MemoryMax=3G", self.unidad_cfg)
        self.assertIn("NODE_OPTIONS=--max-old-space-size=2048", self.unidad_cfg)
        # `next start` sale con código 0 al recibir SIGTERM: con on-failure no se relanzaría.
        self.assertIn("Restart=always", self.unidad_cfg)
        self.assertIn("RestartSec=10", self.unidad_cfg)

    def test_lo_que_se_sirve_viene_de_un_directorio_de_servicio(self):
        """/opt/starseed/genesis (root, solo lectura), nunca el árbol del guardián en un home."""
        self.assertIn("WorkingDirectory=/opt/starseed/genesis", self.unidad_cfg)
        self.assertNotIn("/home/", self.unidad_cfg)
        exige = [l for l in self.unidad.splitlines() if l.strip().startswith("# requiere:")]
        self.assertTrue(exige, "la unidad no declara qué necesita antes de instalarse")
        self.assertTrue(any(".next/BUILD_ID" in l for l in exige), exige)
        self.assertTrue(any("/usr/local/bin/node" in l for l in exige), exige)

    def test_el_arranque_usa_el_node_del_sistema_y_el_codigo_de_opt(self):
        """ExecStart no puede colarse a un `next` de un home: se sirve lo instalado en /opt."""
        arranques = [l for l in self.unidad_cfg.splitlines() if l.startswith("ExecStart=")]
        self.assertEqual(len(arranques), 1, self.unidad_cfg)
        self.assertIn("/opt/starseed/genesis", arranques[0])
        self.assertNotIn(".local/bin/next", arranques[0])


    def test_el_bloque_de_bitnet_no_lleva_claves_en_el_caddyfile(self):
        """La clave de BitNet vive en /etc/starseed/bitnet.key (la exige llama-server): el bloque
        `bitnet.{$STARSEED_HOST}` de Caddy solo proxifica y nunca lleva la clave ni su bandera."""
        bloque = re.search(r"^bitnet\.\{\$STARSEED_HOST\}\s*\{.*?^\}", self.caddy_cfg + "\n",
                           re.MULTILINE | re.DOTALL)
        self.assertIsNotNone(bloque, "el Caddyfile no tiene el bloque bitnet.{$STARSEED_HOST}")
        for prohibido in ("--api-key", "Bearer", "Authorization", "bitnet.key"):
            self.assertNotIn(prohibido, bloque.group(0), f"clave en el bloque de BitNet: {prohibido}")


if __name__ == "__main__":
    unittest.main()
