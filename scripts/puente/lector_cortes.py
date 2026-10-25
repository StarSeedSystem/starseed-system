#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Lector cortés de páginas públicas (INV1025C · R4, contrato
architecture/repos-libreria-1025.md).

`leer(url, ctx)` devuelve `{ok, url_final, html, bytes, bloqueado_por}`.
Solo http/https; resuelve el host ANTES de pedir y rechaza loopback,
redes privadas, link-local y 169.254.169.254, también tras cada
redirección (a mano, ≤ 3). Robots.txt por dominio, 10 s entre peticiones
al mismo y agente de usuario del OS, reutilizando `robots_permiten`,
`AGENTE_USUARIO` y `pausa_restante` del vigía de referencias; sin
cookies ni autorización; tope de 1,5 MB y 12 s; solo text/html, xhtml,
plain o xml; `noai`/`noindex`/`noimageai` en `X-Robots-Tag` y en
`<meta name="robots">` se respetan (`bloqueado_por: "noai"`); nunca
ejecuta JavaScript. Red, reloj y espera inyectables (`crear_ctx`).
"""

import ipaddress
import re
import socket
import time
import urllib.error
import urllib.parse
import urllib.request

from vigia_referencias import AGENTE_USUARIO, pausa_restante, robots_permiten

MAX_BYTES = 1_500_000
TOPE_SEGUNDOS = 12.0
MAX_REDIRECCIONES = 3
_TIPOS_OK = ("text/html", "application/xhtml+xml", "text/plain",
             "application/xml", "text/xml")
_REDIRECCIONES = (301, 302, 303, 307, 308)
# Los dos órdenes posibles de <meta name="robots" content="…">.
_META_ROBOTS = (
    re.compile(r"<meta[^>]*\bname\s*=\s*[\"']robots[\"'][^>]*\bcontent"
               r"\s*=\s*[\"']([^\"']+)[\"']", re.IGNORECASE),
    re.compile(r"<meta[^>]*\bcontent\s*=\s*[\"']([^\"']+)[\"'][^>]*\bname"
               r"\s*=\s*[\"']robots[\"']", re.IGNORECASE),
)
_VETOS = frozenset(("noai", "noindex", "noimageai"))


def crear_ctx(pedir=None, dormir=time.sleep, reloj=time.monotonic,
              agente=AGENTE_USUARIO):
    """Contexto inyectable: pedir (red), dormir (espera) y reloj."""
    return {"pedir": pedir or _peticion_http, "dormir": dormir, "reloj": reloj,
            "registros": {}, "robots": {}, "agente": agente}


def host_bloqueado(url):
    """Razón por la que el host no se puede pedir; "" si es legítimo.

    Resuelve el host de verdad: un dominio que apunte a 127.0.0.1,
    10.0.0.1, 192.168.x.x, ::1 o 169.254.169.254 queda fuera (SSRF y el
    metadato de la nube), igual que una URL que no sea http/https.
    """
    partes = urllib.parse.urlsplit(url)
    if (partes.scheme not in ("http", "https") or not partes.netloc
            or partes.username or partes.password):
        return "url"
    host = (partes.hostname or "").lower()
    if not host:
        return "url"
    try:
        direcciones = socket.getaddrinfo(host, None)
    except (socket.gaierror, OSError):
        return "dns"
    for direccion in direcciones:
        ip = ipaddress.ip_address(direccion[4][0])
        if (ip.is_loopback or ip.is_private or ip.is_link_local
                or ip.is_multicast or ip.is_reserved or ip.is_unspecified):
            return "prohibida"
    return ""


def prohibe_ia(cuerpo, cabeceras):
    """True si `X-Robots-Tag` o `<meta name="robots">` trae un veto.

    El OS cita enlazando, nunca copia el texto que el sitio pone fuera
    del alcance de la IA, así que ni noai ni los otros dos pasan.
    """
    muestras = [cabeceras.get("x-robots-tag") or ""]
    for patron in _META_ROBOTS:
        for encontrada in patron.finditer(cuerpo.decode("utf-8", "replace")):
            muestras.append(encontrada.group(1))
    tokens = {t.strip().lower() for muestra in muestras
              for t in muestra.split(",")}
    return bool(tokens & _VETOS)


def _robots_de_dominio(url, ctx):
    """Consulta robots.txt una vez por dominio (404 o sin red = permitido)."""
    dominio = urllib.parse.urlsplit(url).netloc.lower()
    if dominio not in ctx["robots"]:
        parte = urllib.parse.urlsplit(url)
        respuesta = ctx["pedir"](f"{parte.scheme}://{dominio}/robots.txt",
                                 MAX_BYTES, TOPE_SEGUNDOS)
        texto = (respuesta or {}).get("cuerpo") or b""
        bien = (respuesta or {}).get("estado") == 200
        ctx["robots"][dominio] = bool(
            bien and robots_permiten(texto, url, ctx["agente"]))
    return ctx["robots"][dominio]


def _fallo(url, razon):
    """Resultado estándar de una lectura bloqueada (sin contenido)."""
    return {"ok": False, "url_final": url, "html": "", "bytes": 0,
            "bloqueado_por": razon}


def leer(url, ctx):
    """Lee una URL con cortesía y devuelve el resultado del lector.

    Sigue a mano las redirecciones y en cada salto vuelve a validar el
    host, los robots, el tamaño, el tipo y los vetos.
    """
    url_actual = url.strip()
    for _ in range(MAX_REDIRECCIONES + 1):
        razon = host_bloqueado(url_actual)
        if razon:
            return _fallo(url, razon)
        if not _robots_de_dominio(url_actual, ctx):
            return _fallo(url, "robots")
        dominio = urllib.parse.urlsplit(url_actual).netloc.lower()
        ctx["dormir"](pausa_restante(ctx["registros"].get(dominio),
                                     ctx["reloj"]()))
        respuesta = ctx["pedir"](url_actual, MAX_BYTES, TOPE_SEGUNDOS)
        ctx["registros"][dominio] = ctx["reloj"]()
        if respuesta is None:
            return _fallo(url_actual, "red")
        estado = respuesta.get("estado", 0)
        cabeceras = respuesta.get("cabeceras", {})
        if estado in _REDIRECCIONES:
            destino = (cabeceras.get("location") or "").strip()
            if not destino:
                return _fallo(url_actual, "red")
            url_actual = urllib.parse.urljoin(url_actual, destino)
            continue
        if estado != 200:
            return _fallo(url_actual, f"estado-{estado}")
        cuerpo = respuesta.get("cuerpo") or b""
        if len(cuerpo) > MAX_BYTES:
            return _fallo(url_actual, "tope-tamano")
        tipo = (cabeceras.get("content-type") or "").split(";")[0].strip().lower()
        if tipo not in _TIPOS_OK:
            return _fallo(url_actual, "tipo")
        if prohibe_ia(cuerpo, cabeceras):
            return _fallo(url_actual, "noai")
        return {"ok": True, "url_final": url_actual,
                "html": cuerpo.decode("utf-8", "replace"),
                "bytes": len(cuerpo), "bloqueado_por": None}
    return _fallo(url, "demasiadas-redirecciones")


class _SinRedirecciones(urllib.request.HTTPRedirectHandler):
    """Convierte cada redirección en HTTPError para seguirla a mano."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def _cabeceras(originales):
    """Cabeceras de la respuesta como diccionario en minúsculas."""
    return {clave.lower(): valor for clave, valor in (originales or {}).items()}


def _peticion_http(url, tope_bytes, tope_segundos):
    """GET real, sin cookies ni credenciales; redirecciones anuladas.

    Devuelve `{estado, cabeceras, cuerpo}` para que `leer` decida, o
    None si la red falla o se corta por tiempo.
    """
    pedido = urllib.request.Request(url, headers={
        "User-Agent": AGENTE_USUARIO,
        "Accept": "text/html, application/xhtml+xml, text/plain, "
                  "application/xml, */*;q=0.1",
    })
    gestor = urllib.request.build_opener(_SinRedirecciones())
    try:
        with gestor.open(pedido, timeout=tope_segundos) as respuesta:
            return {"estado": respuesta.getcode(),
                    "cabeceras": _cabeceras(respuesta.headers),
                    "cuerpo": respuesta.read(tope_bytes + 1)}
    except urllib.error.HTTPError as error:
        if error.code in _REDIRECCIONES and error.headers:
            return {"estado": error.code, "cabeceras": _cabeceras(error.headers),
                    "cuerpo": b""}
        return {"estado": error.code, "cabeceras": {}, "cuerpo": b""}
    except (urllib.error.URLError, OSError, ValueError, socket.timeout):
        return None
