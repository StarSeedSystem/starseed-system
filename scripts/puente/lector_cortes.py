#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Lector cortés (Ola 1025R · INV1025C): lee URLs públicas respetando cada sitio.

Solo stdlib. Solo http/https; resuelve el host y rechaza loopback, redes privadas y
link-local (la metadatos 169.254.169.254 incluida), también tras cada redirección,
que se sigue a mano (≤ 3). robots.txt antes de cada dominio y 10 s entre peticiones
al mismo dominio; agente de usuario del OS; sin cookies ni autorización; tope de
1,5 MB y 12 s; solo text/html, xhtml, plain o xml; respeta noai/noindex/noimageai
en X-Robots-Tag y en <meta name="robots">; nunca ejecuta JavaScript. La red, el
resolver, el reloj y la espera son inyectables: `leer(url, ctx)`.
"""

import ipaddress
import re
import socket
import time
import urllib.error
import urllib.parse
import urllib.request
from vigia_referencias import (AGENTE_USUARIO, PAUSA_POR_DOMINIO_S,
                               pausa_restante, robots_permiten)

TOPE_BYTES = 1_500_000
TOPE_SEGUNDOS = 12.0
MAX_REDIRECCIONES = 3
_TIPOS_OK = ("text/html", "xhtml", "plain", "xml")
_PROHIBIDAS = ("noai", "noindex", "noimageai")
_RE_META = re.compile(r"<meta\b[^>]*>", re.IGNORECASE)


def crear_contexto(obtener, resolver=socket.getaddrinfo, dormir=time.sleep,
                   reloj=time.monotonic):
    """Contexto con las inyecciones y el estado (robots y pausas por dominio)."""
    return {"obtener": obtener, "resolver": resolver, "dormir": dormir,
            "reloj": reloj, "robots": {}, "registros": {}}


def esquema_rechazado(url):
    """Motivo «esquema» si la URL no es http/https; None si es válida."""
    try:
        esquema = urllib.parse.urlparse(url).scheme.lower()
    except ValueError:
        return "esquema"
    return None if esquema in ("http", "https") else "esquema"


def host_rechazado(host, resolver):
    """«ssrf»/«host» si el host no es público; None si lo es (R4)."""
    if not host:
        return "host"
    try:
        infos = resolver(host, None)
    except (OSError, UnicodeError, ValueError):
        return "host"
    direcciones = set()
    for info in infos:
        try:
            direcciones.add(ipaddress.ip_address(info[-1][0]))
        except (ValueError, IndexError):
            pass
    if not direcciones:
        return "host"
    for ip in direcciones:
        if (ip.is_loopback or ip.is_private or ip.is_link_local
                or str(ip) == "169.254.169.254"):
            return "ssrf"
    return None


def _host_sin_puerto(netloc):
    return urllib.parse.urlparse(f"https://{netloc or ''}").hostname or ""


def _robots_habilita(url, ctx):
    """robots.txt por dominio (una vez); False si prohíbe la URL o el host."""
    partes = urllib.parse.urlparse(url)
    dominio = partes.netloc.lower()
    if dominio not in ctx["robots"]:
        ctx["robots"][dominio] = False
        if not host_rechazado(_host_sin_puerto(dominio), ctx["resolver"]):
            respuesta = ctx["obtener"](f"{partes.scheme}://{dominio}/robots.txt")
            accedido = bool(respuesta) and respuesta.get("status") == 200
            texto = respuesta.get("cuerpo") if accedido else b""
            ctx["robots"][dominio] = robots_permiten(texto, url)
    return ctx["robots"][dominio]


def _directiva_prohibida(texto):
    """Una de noai/noindex/noimageai si aparece; None si no."""
    abajo = (texto or "").lower()
    return next((p for p in _PROHIBIDAS if p in abajo), None)


def _bloqueo_metatags(html):
    """Directiva prohibida en <meta name="robots" content="…">; None si no."""
    for etiqueta in _RE_META.findall(html or ""):
        if not re.search(r"\bname\s*=\s*[\"']robots[\"']", etiqueta, re.IGNORECASE):
            continue
        contenido = re.search(r"\bcontent\s*=\s*[\"']([^\"']*)[\"']", etiqueta,
                              re.IGNORECASE)
        prohibida = _directiva_prohibida(contenido.group(1) if contenido else "")
        if prohibida:
            return prohibida
    return None


class _SinRedir(urllib.request.HTTPRedirectHandler):
    """Prohíbe el redir automático: cada salto se sigue y se revisa a mano."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


_OPENER = urllib.request.build_opener(_SinRedir())


def obtener_http(url, timeout=TOPE_SEGUNDOS):
    """GET del OS: solo el agente de usuario, sin cookies ni claves; None en error."""
    peticion = urllib.request.Request(url, headers={"User-Agent": AGENTE_USUARIO})
    try:
        respuesta = _OPENER.open(peticion, timeout=timeout)
        cuerpo = respuesta.read(TOPE_BYTES + 1)
    except urllib.error.HTTPError as error:
        cuerpo = error.read(TOPE_BYTES + 1) if error.fp else b""
        return {"status": error.code, "cabeceras": dict(error.headers or {}),
                "cuerpo": cuerpo}
    except (urllib.error.URLError, OSError, ValueError):
        return None
    return {"status": respuesta.status, "cabeceras": dict(respuesta.headers),
            "cuerpo": cuerpo}


def _destino_seguro(base, destino, ctx):
    """Location resuelto si es http/https con host público; None si no."""
    destino = urllib.parse.urljoin(base, (destino or "").strip())
    if esquema_rechazado(destino):
        return None
    netloc = urllib.parse.urlparse(destino).netloc.lower()
    if host_rechazado(_host_sin_puerto(netloc), ctx["resolver"]):
        return None
    return destino


def _fallo(url_final, motivo):
    return {"ok": False, "url_final": url_final, "html": None, "bytes": 0,
            "bloqueado_por": motivo}


def leer(url, ctx=None):
    """Lee una URL con cortesía: {ok, url_final, html, bytes, bloqueado_por}."""
    ctx = ctx or crear_contexto(obtener_http)
    actual = url
    saltos = 0
    while True:
        netloc = urllib.parse.urlparse(actual).netloc.lower()
        motivo = (esquema_rechazado(actual)
                  or host_rechazado(_host_sin_puerto(netloc), ctx["resolver"]))
        if motivo:
            return _fallo(actual, motivo)
        if not _robots_habilita(actual, ctx):
            return _fallo(actual, "robots")
        ctx["dormir"](pausa_restante(ctx["registros"].get(netloc), ctx["reloj"]()))
        ctx["registros"][netloc] = ctx["reloj"]()
        respuesta = ctx["obtener"](actual)
        if respuesta is None:
            return _fallo(actual, "red")
        prohibida = _directiva_prohibida(respuesta["cabeceras"].get("X-Robots-Tag", ""))
        if prohibida:
            return _fallo(actual, prohibida)
        if 300 <= respuesta["status"] < 400:
            saltos += 1
            destino = _destino_seguro(actual, respuesta["cabeceras"].get("Location"), ctx)
            if destino and saltos <= MAX_REDIRECCIONES:
                actual = destino
                continue
            return _fallo(actual, "redireccion")
        if respuesta["status"] != 200:
            return _fallo(actual, f"http-{respuesta['status']}")
        tipo = (respuesta["cabeceras"].get("Content-Type") or "").lower()
        if not any(aceptado in tipo for aceptado in _TIPOS_OK):
            return _fallo(actual, "contenido")
        cuerpo = respuesta["cuerpo"] or b""
        if len(cuerpo) > TOPE_BYTES:
            return _fallo(actual, "tamano")
        html = cuerpo.decode("utf-8", "replace")
        prohibida = _directiva_prohibida(_bloqueo_metatags(html))
        if prohibida:
            return _fallo(actual, prohibida)
        return {"ok": True, "url_final": actual, "html": html, "bytes": len(cuerpo),
                "bloqueado_por": None}
