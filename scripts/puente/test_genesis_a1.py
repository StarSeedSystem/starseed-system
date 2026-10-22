#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas del despliegue de Genesis en el A1 (COL1012Md-d3 · 2026-10-22).

POR QUÉ este archivo: el contrato §6 («Genesis entero en el A1») manda que Genesis
viva sin la Mac: servido por Caddy con sesión y sobre la build que el guardián acaba
de dar por verde. Los dos archivos que lo sostienen —la unidad `starseed-genesis.service`
y el bloque `genesis.{$STARSEED_HOST}` del `Caddyfile.nodo`— se editan a mano, así que
estas pruebas los vigilan para que nadie los afloje sin querer.

QUÉ VIGILAN (contrato §6, parte 3 de 3):
  · El modo local NO se activa: `STARSEED_LOCAL` deja pasar cualquier petición sin
    sesión, y aquí cada petición exige sesión de Supabase y ser miembro de MetaGenesis.
  · La unidad lleva `STARSEED_MANDO=1` (enciende la consola) y `STARSEED_PUBLICO=1`
    (detrás de un proxy todo llega del bucle local: sin eso, «viene de localhost» no
    prueba nada).
  · La unidad escucha SOLO en 127.0.0.1:9002; Caddy es lo único que la alcanza desde
    internet, y le pasa la IP real de quien llama (`X-Real-IP`), que nadie puede falsear.
  · Caddy NO quita la cabecera `Cookie`: sin ella no hay sesión y Genesis respondería
    401 a todo el mundo (la ruta de la puerta de datos sí la borra; aquí, no).
  · La unidad conserva `DynamicUser=yes` (identidad efímera propia, sin grupo en común
    con el usuario del enjambre) y NO da `ReadWritePaths` sobre `/opt/starseed/genesis`:
    el código que se sirve es de root y de solo lectura; lo único escribible es su
    caché, en `CacheDirectory`.
  · Ni IPs públicas ni nombres de máquina reales ni URLs en los dos archivos.

CÓMO SE EJECUTA: `python3 -m unittest scripts/puente/test_genesis_a1.py` (o pytest).
"""
import os
import re
import unittest

RUTA_SERVICIO = "deploy/oracle/nodo/systemd/starseed-genesis.service"
RUTA_CADDY = "deploy/oracle/nodo/Caddyfile.nodo"
SITIO_GENESIS = "genesis.{$STARSEED_HOST}"

# El bucle local no es la IP de ninguna máquina: es lo único que puede aparecer.
LOOPBACK = "127.0.0.1"
PATRON_IP = re.compile(r"\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b")
# Dominios que delatan una máquina o un servicio real (sslip.io sale solo en un comentario).
PATRON_HOST = re.compile(
    r"\b[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.(?:com|net|org|io|dev|app|cloud|ai|es|local)\b"
)


def leer(ruta_base, ruta_relativa):
    """Texto de un archivo del repo."""
    with open(os.path.join(ruta_base, ruta_relativa), "r", encoding="utf-8") as f:
        return f.read()


def directivas(texto):
    """Solo las líneas que hacen algo: un comentario no manda sobre systemd ni sobre Caddy."""
    return "\n".join(
        linea
        for linea in texto.splitlines()
        if linea.strip() and not linea.strip().startswith("#")
    )


def bloque_caddy(texto, sitio):
    """El cuerpo de un bloque del Caddyfile, contando llaves (dentro hay anidados)."""
    inicio = texto.find(sitio + " {")
    if inicio < 0:
        return ""
    # Se cuenta desde la llave que ABRE el bloque: el nombre del sitio trae las suyas
    # (el marcador `{$STARSEED_HOST}`) y esas no cuentan.
    desde = inicio + len(sitio)
    nivel = 0
    for i in range(desde, len(texto)):
        if texto[i] == "{":
            nivel += 1
        elif texto[i] == "}":
            nivel -= 1
            if nivel == 0:
                return texto[desde + 1:i]
    return ""


class TestGenesisA1(unittest.TestCase):
    """La sala de control del A1: con sesión, solo en el bucle local y sin IPs reales."""

    maxDiff = None

    def setUp(self):
        # La raíz del repo que contiene este archivo: vale en el A1, en la Mac y en cualquier worktree.
        self.ruta_base = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        self.servicio = leer(self.ruta_base, RUTA_SERVICIO)
        self.caddy = leer(self.ruta_base, RUTA_CADDY)
        self.bloque_genesis = bloque_caddy(self.caddy, SITIO_GENESIS)

    def test_el_modo_local_no_se_activa_en_la_unidad(self):
        """`STARSEED_LOCAL` deja pasar cualquier petición sin sesión: en el A1, nunca."""
        self.assertNotIn(
            "STARSEED_LOCAL",
            self.servicio,
            "La unidad no debe activar el modo local (ni en su entorno ni en sus comentarios)\n" + self.servicio,
        )

    def test_el_modo_local_no_se_activa_en_el_caddyfile(self):
        self.assertNotIn(
            "STARSEED_LOCAL",
            self.caddy,
            "El Caddyfile no debe activar el modo local\n" + self.caddy,
        )

    def test_la_unidad_enciende_la_consola_y_el_modo_publico(self):
        """`STARSEED_MANDO=1` enciende la consola; `STARSEED_PUBLICO=1` anula el «viene de localhost»."""
        lineas = directivas(self.servicio)
        self.assertIn("STARSEED_MANDO=1", lineas, "Falta STARSEED_MANDO=1 en la unidad")
        self.assertIn(
            "STARSEED_PUBLICO=1",
            lineas,
            "Falta STARSEED_PUBLICO=1: detrás de Caddy todo llega del bucle local",
        )

    def test_la_unidad_escucha_solo_en_el_bucle_local(self):
        """`next start` con `-H 127.0.0.1`: a Genesis solo llega Caddy."""
        lineas = directivas(self.servicio)
        self.assertRegex(
            lineas,
            r"ExecStart=.*next start -p 9002 -H " + re.escape(LOOPBACK),
            "La unidad debe servir en " + LOOPBACK + ":9002 y en ningún otro sitio",
        )
        self.assertNotIn("-H 0.0.0.0", lineas, "La unidad no puede escuchar en todas las interfaces")

    def test_la_unidad_trabaja_en_el_directorio_de_servicio(self):
        """El código se sirve desde /opt/starseed/genesis, no desde el árbol del guardián."""
        self.assertIn(
            "WorkingDirectory=/opt/starseed/genesis",
            directivas(self.servicio),
            "La unidad debe trabajar en el directorio de servicio",
        )

    def test_caddy_publica_genesis_en_el_bucle_local(self):
        """El bloque de `genesis.<host>` es el único que alcanza el puerto de Genesis."""
        self.assertTrue(
            self.bloque_genesis,
            "El Caddyfile necesita un bloque " + SITIO_GENESIS + " { ... }",
        )
        self.assertIn(
            "reverse_proxy " + LOOPBACK + ":9002",
            self.bloque_genesis,
            "El bloque de Genesis debe apuntar a " + LOOPBACK + ":9002",
        )

    def test_caddy_manda_la_ip_real_de_quien_llama(self):
        """`X-Real-IP` con `{remote_host}`: es la IP real y nadie la puede falsear."""
        self.assertIn(
            "header_up X-Real-IP {remote_host}",
            self.bloque_genesis,
            "Falta `header_up X-Real-IP {remote_host}` en el bloque de Genesis",
        )

    def test_caddy_no_quita_la_cookie_de_sesion(self):
        """La puerta de datos sí la borra; aquí eso dejaría a Genesis sin sesión (401)."""
        for cabecera in ("header_up -Cookie", "header_down -Set-Cookie", "header_up -Host"):
            self.assertNotIn(
                cabecera,
                self.bloque_genesis,
                "El bloque de Genesis no debe quitar " + cabecera + ": rompe la sesión",
            )

    def test_la_unidad_tiene_identidad_propia(self):
        """`DynamicUser=yes`: el enjambre (usuario starseed) no puede tocar el código que se sirve."""
        lineas = directivas(self.servicio)
        self.assertIn("DynamicUser=yes", lineas, "Falta DynamicUser=yes en la unidad")
        self.assertNotRegex(lineas, r"(?m)^User=", "Genesis no debe correr como un usuario con nombre")
        self.assertNotRegex(lineas, r"(?m)^Group=", "Genesis no debe compartir grupo con el enjambre")

    def test_la_unidad_no_escribe_en_el_codigo_que_sirve(self):
        """`/opt/starseed/genesis` es de root y de solo lectura; lo único escribible es la caché."""
        lineas = directivas(self.servicio)
        self.assertNotIn(
            "ReadWritePaths",
            lineas,
            "La unidad no debe declarar ReadWritePaths: el código que se sirve es de solo lectura",
        )
        self.assertIn(
            "CacheDirectory=starseed-genesis",
            lineas,
            "La caché de Next debe vivir en su propio CacheDirectory",
        )
        self.assertIn("ProtectSystem=strict", lineas, "Falta ProtectSystem=strict")

    def test_la_unidad_tiene_techo_de_memoria(self):
        """El A1 tiene 12 GB y el guardián llega a ~5 GB: Genesis no puede comerse el nodo."""
        lineas = directivas(self.servicio)
        self.assertIn("MemoryMax=3G", lineas, "Falta el techo de memoria de Genesis")
        self.assertIn(
            "NODE_OPTIONS=--max-old-space-size=2048",
            lineas,
            "Falta el tope del montón de Node",
        )

    def test_la_unidad_reinicia_aunque_next_start_salga_limpio(self):
        """`next start` sale con código 0 al recibir un SIGTERM que no viene de `systemctl`."""
        self.assertIn(
            "Restart=always",
            directivas(self.servicio),
            "Con Restart=on-failure una salida limpia dejaría Genesis caído",
        )

    def test_ni_ips_publicas_ni_hosts_reales_en_la_unidad(self):
        """En el repo no cabe ninguna dirección real: el A1 se arma con variables y rutas."""
        ips = [ip for ip in PATRON_IP.findall(self.servicio) if ip != LOOPBACK]
        self.assertEqual([], ips, "La unidad no puede traer IPs reales: " + ", ".join(ips))
        self.assertNotIn("://", self.servicio, "La unidad no puede traer URLs")
        hosts = PATRON_HOST.findall(directivas(self.servicio))
        self.assertEqual([], hosts, "La unidad no puede traer nombres de máquina: " + ", ".join(hosts))

    def test_ni_ips_publicas_ni_hosts_reales_en_el_caddyfile(self):
        """El host público lo pone `preparar-a1.sh` al desplegar; en el repo no hay ninguno."""
        ips = [ip for ip in PATRON_IP.findall(self.caddy) if ip != LOOPBACK]
        self.assertEqual([], ips, "El Caddyfile no puede traer IPs reales: " + ", ".join(ips))
        self.assertNotIn("://", self.caddy, "El Caddyfile no puede traer URLs")
        hosts = PATRON_HOST.findall(directivas(self.caddy))
        self.assertEqual([], hosts, "El Caddyfile no puede traer nombres de máquina: " + ", ".join(hosts))
        self.assertIn(
            SITIO_GENESIS + " {",
            self.caddy,
            "El host de Genesis tiene que ser el marcador " + SITIO_GENESIS,
        )


if __name__ == "__main__":
    unittest.main()
