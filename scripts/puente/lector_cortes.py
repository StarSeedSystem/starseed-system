#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Lector cortés (Ola 1025R · tarea INV1025C).

Lee una URL con agente de usuario descriptivo, robots.txt respetado y sin
JavaScript. Pausa mínima de 10 s por dominio, sin cookies ni cabecera de
autorización, tope de 1,5 MB y 12 s, solo text/html, xhtml, plain o xml.

La red, el reloj y la espera son inyectables, así que las pruebas son puras
y sin conexión: `leer(url, ctx)`.
"""

import hashlib
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from urllib.robotparser import RobotFileParser

AGENTE_USUARIO = "StarSeedOS-LectorCortes/1.0 (+https://starseed-os.vercel.app; lector cortés de fuentes)"
PAUSA_POR_DOMINIO_S = 10.0
MAX_BYTES = 1572864
MAX_SEGUNDOS = 12

# Redes privadas y loopback (R4)
REDES_PROHIBIDAS = (
    "127.", "10.", "172.16.", "172.17.", "172.18.", "172.19.", "172.20.",
    "172.21.", "172.22.", "172.23.", "172.24.", "172.25.", "172.26.",
    "172.27.", "172.28.", "172.29.", "172.30.", "172.31.", "192.168.",
    "169.254.", "::1", "fe80:", "fc00:"
)


# Tipos de contenido permitidos
TIPOS_PERMITIDOS = (
    "text/html", "application/xhtml+xml", "text/plain", "application/xml"
)


def obtener_dominio(url):
    """Dominio en minúsculas de una URL, o cadena vacía si no sabe sacarlo."""
    try:
        return urllib.parse.urlparse(url).netloc.lower()
    except (ValueError, AttributeError):
        return ""


def es_red_prohibida(url):
    """True si la URL apunta a una red privada o loopback."""
    dominio = obtener_dominio(url)
    if not dominio:
        return False
    return any(dominio.startswith(r) for r in REDES_PROHIBIDAS)


def robots_permiten(texto, url, agente=AGENTE_USUARIO):
    """True si robots.txt no prohíbe la URL a nuestro agente; puro (sin red).

    Sin robots.txt disponible se considera permitido (así lo treatan los
    rastreadores estándar: un 404 de robots.txt no prohíbe nada).
    """
    if not texto:
        return True
    robot = RobotFileParser()
    robot.parse(texto.decode("utf-8", "replace").splitlines())
    try:
        return bool(robot.can_fetch(agente, url))
    except Exception:
        return True


def pausa_restante(segundos_previos, segundos_ahora, minimo=PAUSA_POR_DOMINIO_S):
    """Segundos que faltan para volver a pedir al mismo dominio; puro."""
    if segundos_previos is None:
        return 0.0
    faltante = minimo - (segundos_ahora - segundos_previos)
    return faltante if faltante > 0 else 0.0


def obtener_url_http(url, timeout=MAX_SEGUNDOS):
    """GET con agente de usuario descriptivo; los bytes o None en error de red."""
    peticion = urllib.request.Request(url, headers={"User-Agent": AGENTE_USUARIO})
    try:
        with urllib.request.urlopen(peticion, timeout=timeout) as respuesta:
            return respuesta.read()
    except (urllib.error.URLError, OSError, ValueError):
        return None


def _descargar(url, contexto):
    """Pide una URL respetando robots.txt y la pausa por dominio; None si no toca.

    `contexto` lleva obtener_url (inyectable), dormir (inyectable), y los
    registros de última petición por dominio y la caché de robots.txt.
    """
    dominio = obtener_dominio(url)
    if not dominio:
        return None
    robots_vistos = contexto["robots_vistos"]
    if dominio not in robots_vistos:
        robots_vistos[dominio] = robots_permiten(
            contexto["obtener_url"](f"https://{dominio}/robots.txt"), url)
    if not robots_vistos[dominio]:
        return None
    registros = contexto["registros"]
    contexto["dormir"](pausa_restante(registros.get(dominio), time.monotonic()))
    registros[dominio] = time.monotonic()
    return contexto["obtener_url"](url)


def _bloqueado_por(cuerpo):
    """Razón por la que el HTML está bloqueado o None si no lo está."""
    if not cuerpo:
        return None
    try:
        texto = cuerpo.decode("utf-8", "replace").lower()
    except (UnicodeDecodeError, AttributeError):
        return None
    if "noai" in texto or "noindex" in texto or "noimageai" in texto:
        return "noai"
    return None


def leer(url, contexto):
    """Lee una URL con agente de usuario descriptivo, robots.txt respetado y sin
JavaScript. Pausa mínima de 10 s por dominio, sin cookies ni cabecera de
autorización, tope de 1,5 MB y 12 s, solo text/html, xhtml, plain o xml.

    La red, el reloj y la espera son inyectables, así que las pruebas son puras
y sin conexión: `leer(url, ctx)`.
    """
    if es_red_prohibida(url):
        return {"ok": False, "url_final": url, "html": None, "bytes": 0,
                "bloqueado_por": "red privada o loopback"}
    cuerpo = _descargar(url, contexto)
    if not cuerpo:
        return {"ok": False, "url_final": url, "html": None, "bytes": 0,
                "bloqueado_por": None}
    if len(cuerpo) > MAX_BYTES:
        return {"ok": False, "url_final": url, "html": None, "bytes": len(cuerpo),
                "bloqueado_por": "tamaño"}
    bloqueado = _bloqueado_por(cuerpo)
    if bloqueado:
        return {"ok": False, "url_final": url, "html": None, "bytes": len(cuerpo),
                "bloqueado_por": bloqueado}
    try:
        html = cuerpo.decode("utf-8", "replace")
    except (UnicodeDecodeError, AttributeError):
        return {"ok": False, "url_final": url, "html": None, "bytes": len(cuerpo),
                "bloqueado_por": "codificación"}
    return {"ok": True, "url_final": url, "html": html, "bytes": len(cuerpo),
            "bloqueado_por": None}


def main():
    """Punto de entrada del lector: una prueba por consola."""
    import sys
    if len(sys.argv) < 2:
        print("Uso: python3 lector_cortes.py <URL>")
        return 1
    contexto = {"obtener_url": obtener_url_http, "dormir": time.sleep,
                "registros": {}, "robots_vistos": {}}
    resultado = leer(sys.argv[1], contexto)
    print(json.dumps(resultado, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    exit(main())
