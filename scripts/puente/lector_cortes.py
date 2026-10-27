#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Lector cortés del OS (INV1025C): una página web leída con respeto.

Solo http/https; resuelve el host y rechaza loopback, redes privadas,
link-local y la API de metadatos 169.254.169.254 — antes de pedir y tras
cada redirección, que se siguen a mano, nunca más de 3. Consulta robots.txt
antes de cada dominio (política del vigía: R4) y deja 10 s entre peticiones
al mismo. Agente de usuario del OS; sin cookies ni cabeceras de sesión.
Tope de 1,5 MB y 12 s por petición; solo text/html, xhtml, plain o xml.
Respeta noai / noindex / noimageai en `X-Robots-Tag` y en
`<meta name="robots">` (`bloqueado_por`). Nunca ejecuta JavaScript.

La red, el reloj y la espera son inyectables: `leer(url, ctx)` recibe el
contexto con «obtener» (peticiones HTTP falsas o reales), «resolver» (DNS),
«dormir», «monotonic» y el estado compartido («registros», «robots_vistos»);
así las pruebas corren puras y sin conexión.
"""

import ipaddress
import re
import socket
import time
import urllib.error
import urllib.parse
import urllib.request
from urllib.robotparser import RobotFileParser

from scripts.puente.vigia_referencias import obtener_dominio, robots_permiten

AGENTE_USUARIO = ("StarSeedOS-LectorCortes/1.0 "
                  "(+https://starseed-os.vercel.app; lector cortes del OS)")
PAUSA_POR_DOMINIO_S = 10.0
MAX_BYTES = 1500 * 1024
MAX_SEGUNDOS = 12.0
MAX_REDIRECCIONES = 3
TIPOS_PERMITIDOS = ("text/html", "application/xhtml+xml", "text/plain",
                    "application/xml", "text/xml")
PROHIBIDAS = ("noai", "noindex", "noimageai")
ESQUEMAS = ("http", "https")
_REGEX_META = re.compile(r"<meta[^>]*name\s*=\s*[\"']robots[\"'][^>]*>", re.I)
_REGEX_CONTENIDO = re.compile(r"content\s*=\s*[\"']([^\"']*)[\"']", re.I)


class SeguirNo(urllib.request.HTTPRedirectHandler):
    """Nunca redirecciones automáticas: leer() las sigue a mano y las audita."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def resolver_host(host):
    """Direcciones IP del host vía el DNS del sistema; [] si no se puede."""
    try:
        return [info[4][0] for info in socket.getaddrinfo(host, None)]
    except (socket.gaierror, OSError, ValueError):
        return []


def host_seguro(host, resolver):
    """True si el host se resuelve y no acaba en loopback, privada, link-local
    ni la API de metadatos de la nube; False en caso contrario."""
    if not host:
        return False
    try:
        ips = [ipaddress.ip_address(ip) for ip in (resolver(host) or [])]
    except ValueError:
        return False
    if not ips:
        return False
    return not any(ip.is_loopback or ip.is_private or ip.is_link_local
                   or str(ip) == "169.254.169.254" for ip in ips)


def obtener_http(url):
    """GET con el agente del OS, sin seguir redirecciones ni cookies."""
    peticion = urllib.request.Request(url, headers={"User-Agent": AGENTE_USUARIO})
    abridor = urllib.request.build_opener(SeguirNo())
    try:
        with abridor.open(peticion, timeout=MAX_SEGUNDOS) as respuesta:
            return {"estado": respuesta.status, "cabeceras": dict(respuesta.headers),
                    "cuerpo": respuesta.read(MAX_BYTES + 1)}
    except urllib.error.HTTPError as error:
        return {"estado": error.code, "cabeceras": dict(error.headers),
                "cuerpo": error.read(MAX_BYTES + 1)}
    except (urllib.error.URLError, OSError, ValueError) as fallo:
        return {"error": str(fallo)}


def bloqueo_de_cabecera(cabeceras):
    """noai / noindex / noimageai si el X-Robots-Tag los declara; None si no."""
    valor = (cabeceras.get("X-Robots-Tag") or "").lower()
    return _palabra_prohibida(valor)


def _palabra_prohibida(valor):
    for prohibida in PROHIBIDAS:
        if re.search(rf"\b{prohibida}\b", valor):
            return prohibida
    return None


def bloqueo_de_meta(html):
    """Igual que bloqueo_de_cabecera, pero leyendo <meta name="robots">."""
    for etiqueta in _REGEX_META.findall(html or ""):
        contenido = _REGEX_CONTENIDO.search(etiqueta)
        bloqueo = _palabra_prohibida(contenido.group(1).lower() if contenido else "")
        if bloqueo:
            return bloqueo
    return None


def _bloqueado(por, url=None):
    return {"ok": False, "url_final": url or "", "html": "", "bytes": 0,
            "bloqueado_por": por}


def _contexto():
    """Contexto real: obtener/resolver/dormir/monotonic + estado por dominio."""
    return {"obtener": obtener_http, "resolver": resolver_host,
            "dormir": time.sleep, "monotonic": time.monotonic,
            "registros": {}, "robots_vistos": {}}


def _pedir_robots(dominio, url, c):
    """Robots.txt del dominio (leído por la misma puerta) y si permiten url."""
    respuesta = c["obtener"](f"https://{dominio}/robots.txt")
    texto = respuesta.get("cuerpo") if respuesta.get("estado") in (200, None) else None
    return robots_permiten(texto, url, AGENTE_USUARIO)


def _tipo_permitido(cabeceras):
    tipo = (cabeceras.get("Content-Type") or "").split(";")[0].strip().lower()
    return any(tipo.startswith(permitido) for permitido in TIPOS_PERMITIDOS)


def _pausar_y_pedir(dominio, url, c):
    """Respeta la pausa de 10 s por dominio y devuelve la respuesta del GET."""
    previa = c["registros"].get(dominio)
    if previa is None:
        esperar = 0.0  # primera visita al dominio: sin pausa
    else:
        esperar = max(0.0, PAUSA_POR_DOMINIO_S - (c["monotonic"]() - previa))
    c["dormir"](esperar)
    c["registros"][dominio] = c["monotonic"]()
    return c["obtener"](url)


def leer(url, ctx=None):
    """Lee una página con la política de R4; devuelve «{ok, url_final, html,
    bytes, bloqueado_por}». Las redirecciones se auditan una por una."""
    c = ctx or _contexto()
    destino = url
    for numero in range(MAX_REDIRECCIONES + 1):
        partes = urllib.parse.urlparse(destino)
        dominio = obtener_dominio(destino)
        host = partes.hostname or ""
        if partes.scheme.lower() not in ESQUEMAS:
            return _bloqueado("esquema", destino)
        if not host_seguro(host, c["resolver"]):
            return _bloqueado("ssrf", destino)
        if dominio not in c["robots_vistos"]:
            c["robots_vistos"][dominio] = _pedir_robots(dominio, destino, c)
        if not c["robots_vistos"].get(dominio, False):
            return _bloqueado("robots", destino)
        respuesta = _pausar_y_pedir(dominio, destino, c)
        estado = respuesta.get("estado")
        if respuesta.get("error") or estado is None:
            return _bloqueado("red", destino)
        if estado in (301, 302, 303, 307, 308) and numero < MAX_REDIRECCIONES:
            ubicacion = (respuesta.get("cabeceras") or {}).get("Location") or ""
            if ubicacion.strip():
                destino = urllib.parse.urljoin(destino, ubicacion)
                continue
        if estado >= 400:
            return _bloqueado(f"http{estado}", destino)
        cabeceras = respuesta.get("cabeceras") or {}
        if not _tipo_permitido(cabeceras):
            return _bloqueado("tipo", destino)
        cuerpo = respuesta.get("cuerpo") or b""
        if len(cuerpo) > MAX_BYTES:
            return _bloqueado("tamaño", destino)
        bloqueo = bloqueo_de_cabecera(cabeceras) or bloqueo_de_meta(
            cuerpo.decode("utf-8", "replace"))
        if bloqueo:
            return _bloqueado(bloqueo, destino)
        return {"ok": True, "url_final": destino, "html": cuerpo.decode("utf-8", "replace"),
                "bytes": len(cuerpo), "bloqueado_por": None}
    return _bloqueado("redireccion", destino)
