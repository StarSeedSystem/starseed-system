#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas de Genesis en el A1 (COL1012Md-d3 · 2026-10-22).

Vigila la unidad `starseed-genesis.service` y el bloque `genesis.{$STARSEED_HOST}`
de `Caddyfile.nodo`: nunca `STARSEED_LOCAL=1`, siempre `X-Real-IP`, escucha solo
en 127.0.0.1 y ningún IP/host real en el código. Es la alarma barata; la prueba de
comportamiento está en `src/lib/mando/__tests__/guardian-caddy-a1.test.ts`.
"""
import os
import re
import unittest

RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SERVICIO = os.path.join(RAIZ, "deploy", "oracle", "nodo", "systemd", "starseed-genesis.service")
CADDY = os.path.join(RAIZ, "deploy", "oracle", "nodo", "Caddyfile.nodo")

# Una IPv4 suelta, sin capturar versiones ni shas.
PATRON_IPV4 = re.compile(r"(?<![\w.])(\d{1,3}(?:\.\d{1,3}){3})(?![\w.])")
# Dominios habituales; `{$STARSEED_HOST}` no encaja porque lleva llaves.
PATRON_HOST = re.compile(
    r"(?<![\w${-])[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|net|org|io|app|dev|cloud|es)(?![\w-])", re.IGNORECASE
)


def leer(ruta):
    with open(ruta, "r", encoding="utf-8") as archivo:
        return archivo.read()


def lineas_activas(texto):
    """Solo directivas, sin comentarios: ahí sí pueden ir dominios de ejemplo."""
    return [linea for linea in texto.splitlines() if not linea.lstrip().startswith("#")]


def ips_fuera_del_bucle(texto):
    """IPv4 de las directivas que no son del bucle local (127.0.0.0/8)."""
    return [ip for l in lineas_activas(texto)
            for ip in PATRON_IPV4.findall(l) if not ip.startswith("127.")]


def hosts_reales(texto):
    """Dominios escritos a mano en vez de la variable del host."""
    return [h for l in lineas_activas(texto) for h in PATRON_HOST.findall(l)]


class Ayudantes(unittest.TestCase):
    def test_los_comentarios_no_cuentan_y_los_patrones_detectan(self):
        self.assertEqual(lineas_activas("# genesis.example.com 203.0.113.9\nExecStart=x"), ["ExecStart=x"])
        self.assertEqual(ips_fuera_del_bucle("bind 0.0.0.0:9002"), ["0.0.0.0"])
        self.assertEqual(ips_fuera_del_bucle("bind 127.0.0.1:9002"), [])
        self.assertEqual(hosts_reales("genesis.example.com {"), ["genesis.example.com"])
        self.assertEqual(hosts_reales("genesis.{$STARSEED_HOST} {"), [])

class BaseGenesis(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.servicio = leer(SERVICIO)
        cls.caddy = leer(CADDY)

    def test_sin_ips_ni_hosts_reales(self):
        for texto in (self.servicio, self.caddy):
            self.assertEqual(ips_fuera_del_bucle(texto), [])
            self.assertEqual(hosts_reales(texto), [])

class ServicioGenesis(BaseGenesis):
    def test_sirve_desde_opt_solo_en_el_bucle_local_y_sin_modo_local(self):
        # `STARSEED_LOCAL=1` dejaría pasar CUALQUIER petición sin sesión.
        self.assertNotIn("STARSEED_LOCAL", self.servicio)
        self.assertIn("STARSEED_MANDO=1", self.servicio)
        # Sin `STARSEED_PUBLICO=1`, Caddy parecería «local» y no exigiría sesión.
        self.assertIn("STARSEED_PUBLICO=1", self.servicio)
        execstart = next((l for l in lineas_activas(self.servicio) if l.startswith("ExecStart=")), "")
        self.assertIn("-p 9002", execstart)
        self.assertIn("-H 127.0.0.1", execstart)
        self.assertIn("/opt/starseed/genesis", execstart)
        self.assertNotIn(".local/bin/next", execstart)
        self.assertNotIn("0.0.0.0", execstart)

    def test_es_ajeno_al_enjambre_es_de_solo_lectura_y_acotado(self):
        # `starseed-medio` corre como `starseed` con shell: no debe ser su usuario.
        self.assertIn("DynamicUser=yes", self.servicio)
        self.assertNotRegex(self.servicio, r"(?m)^User=starseed$")
        for linea in lineas_activas(self.servicio):
            if linea.startswith("ReadWritePaths="):
                self.assertNotIn("/opt/starseed/genesis", linea)
        self.assertIn("NODE_OPTIONS=--max-old-space-size=2048", self.servicio)
        self.assertIn("MemoryMax=3G", self.servicio)
        # `on-failure` en el contrato, `always` tras la revisión: ambos reinician.
        self.assertRegex(self.servicio, r"(?m)^Restart=(always|on-failure)$")
        self.assertRegex(self.servicio, r"(?m)^RestartSec=\d+$")

class CaddyGenesis(BaseGenesis):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        # El bloque externo cierra con `}` a principio de línea; los internos van con
        # tabulación, así que el no codicioso se detiene en el correcto.
        encontrado = re.search(
            r"^genesis\.\{\$STARSEED_HOST\}\s*\{(.*?)^\}", cls.caddy, re.MULTILINE | re.DOTALL
        )
        assert encontrado is not None, "falta el bloque genesis.{$STARSEED_HOST}"
        cls.bloque = encontrado.group(1)

    def test_proxifica_el_bucle_local_y_manda_la_ip_real(self):
        self.assertNotIn("STARSEED_LOCAL", self.caddy)
        self.assertIn("reverse_proxy 127.0.0.1:9002", self.bloque)
        # `{remote_host}` SOBRESCRIBE (sin `+`) la X-Real-IP del cliente.
        self.assertIn("header_up X-Real-IP {remote_host}", self.bloque)
        # Copiar el borrado de `Cookie` de la puerta de datos rompería la sesión.
        self.assertNotRegex(self.bloque, r"header_up\s+-\s*Cookie")

    def test_no_publica_rutas_que_se_apoyan_en_no_estar_en_la_mac(self):
        activas = "\n".join(lineas_activas(self.caddy))
        for ruta in ("/api/agent-reach", "/api/astraura/decidir", "/api/voz-local/", "/api/telegram/send"):
            self.assertNotIn(ruta, activas)


if __name__ == "__main__":
    unittest.main()
