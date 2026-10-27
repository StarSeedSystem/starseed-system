#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Lector cortés (INV1025C · Ola 1025R): GET de una página pública, sin sigilo ni telemetría (R4).

Reutiliza la política del vigía de referencias (robots.txt antes de cada dominio, 10 s de
pausa entre peticiones al mismo dominio vía `robots_permiten` y `pausa_restante`) y añade
lo de esta tarea: solo http/https; resuelve el host y RECHAZA loopback, redes privadas,
link-local y 169.254.169.254 —también tras cada redirección, que se sigue a mano, ≤ 3;
agente de usuario del OS; sin cookies ni cabecera de autorización; tope de 1,5 MB y 12 s;
solo text/html, xhtml, plain o xml; respeta noai/noindex/noimageai en X-Robots-Tag y en
<meta name="robots"> (bloqueado_por); nunca ejecuta JavaScript. Devuelve
{ok, url_final, html, bytes, bloqueado_por}.

La red, el reloj, la espera y el DNS son inyectables: ctx["peticion"](url, timeout) →
dict|None (con status, cabeceras minúsculas y cuerpo), ctx["reloj"] (monotónico),
ctx["dormir"] (segundos), ctx["resolver"](host) → ips, y las hitas ctx["registros"] y
ctx["robots_vistos"] sobreviven entre llamadas al meterle un ctx reutilizado.
"""

import ipaddress
import re
import socket
import time
import urllib.error
import urllib.parse
import urllib.request

from vigia_referencias import PAUSA_POR_DOMINIO_S, pausa_restante, robots_permiten

AGENTE = "StarSeedOS-LectorCortes/1.0 (+https://starseed-os.vercel.app; lector cortés del OS)"
ACEPTAR = "text/html, application/xhtml+xml, text/plain, text/xml, application/xml"
TIPOS_ADMITIDOS = ("text/html", "application/xhtml+xml", "text/plain", "text/xml", "application/xml")
DIRECTIVAS_RECHAZADAS = ("noai", "noimageai", "noindex")
TOPE_BYTES = 1_500_000
TOPE_SEGUNDOS = 12.0
MAX_SALTOS = 3  # redirecciones que se siguen a mano, como mucho


def crear_ctx(peticion=None, dormir=time.sleep, reloj=time.monotonic, resolver=None):
    """Contexto inyectable: red (peticion(url, timeout)), espera, reloj, DNS e hitas."""
    return {"peticion": peticion or _peticion_http, "dormir": dormir, "reloj": reloj,
            "resolver": resolver or _resolver_host, "registros": {}, "robots_vistos": {}}


def _ip_prohibida(ip):
    """True si la IP no es global: loopback, red privada, link-local (con 169.254.169.254),
    documentación, reservada o multicast; una IPv4 camuflada en IPv6 se destapa primero."""
    try:
        direccion = ipaddress.ip_address(ip)
    except ValueError:
        return True
    if direccion.version == 6 and direccion.ipv4_mapped:
        direccion = direccion.ipv4_mapped
    return not direccion.is_global


def _resolver_host(dominio):
    """IPs que el DNS del sistema da del host; [] si no resuelve (la conexión morirá igual)."""
    try:
        pares = socket.getaddrinfo(dominio, None)
    except (OSError, UnicodeError):
        return []
    salidas = []
    for par in pares:
        ip = par[4][0]
        if ip not in salidas:
            salidas.append(ip)
    return salidas


def _dominio_url(url):
    """netloc en minúsculas (host:puerto) de una URL, o cadena vacía si no lo sabe dar."""
    return (urllib.parse.urlparse(url).netloc or "").lower()


def _esquema_permitido(url):
    """Solo http o https; cualquier otro esquema (ftp, file, data…) se rechaza de entrada."""
    return urllib.parse.urlparse(url).scheme.lower() in ("http", "https")


def _razon_ssrf(url, ctx):
    """«ssrf» si el host cae en loopback, red privada, link-local o metadatos; None si pasa."""
    host = urllib.parse.urlparse(url).hostname
    for ip in ctx["resolver"](host or ""):
        if _ip_prohibida(ip):
            return "ssrf"
    return None


def _razon_robots(url, ctx):
    """«robots» si el dominio lo prohíbe; None si permite. robots.txt se consulta una vez
    por dominio; su 404/500 o error de red no prohíbe nada (vigía de referencias)."""
    dominio = _dominio_url(url)
    if not dominio:
        return "robots"
    vistos = ctx["robots_vistos"]
    if dominio not in vistos:
        respuesta = ctx["peticion"]("https://%s/robots.txt" % dominio, TOPE_SEGUNDOS)
        cuerpo = respuesta.get("cuerpo") if isinstance(respuesta, dict) else None
        vistos[dominio] = robots_permiten(cuerpo, url, AGENTE)
    return None if vistos[dominio] else "robots"


def _pedir(url, ctx, limite):
    """Cortesía y petición: si el dominio se pidió hace poco, se espera (10 s y contando),
    se registra la hora y se pide. None si el reloj se acabó o la red no contesta."""
    dominio = _dominio_url(url)
    ctx["dormir"](pausa_restante(ctx["registros"].get(dominio), ctx["reloj"]()))
    ctx["registros"][dominio] = ctx["reloj"]()
    quedan = limite - ctx["reloj"]()
    return ctx["peticion"](url, quedan) if quedan > 0 else None


class _SinSaltos(urllib.request.HTTPRedirectHandler):
    """Opener sin redirecciones: el lector las sigue a mano para revalorar cada salto."""

    def redirect_request(self, *_a, **_k):
        return None


def _limpiar(cabeceras):
    """Cabeceras como dict de claves minúsculas (pasa también la HTTPMessage de urllib)."""
    try:
        return {str(clave).lower(): valor for clave, valor in dict(cabeceras).items()}
    except (TypeError, ValueError):
        return {}


def _peticion_http(url, timeout):
    """GET real con el agente del OS, sin cookies ni autorización y SIN seguir redirecciones.
    Devuelve {status, cabeceras, cuerpo} o None si la red falla; los bytes ya entran capados
    (tope + 1) y las redirecciones 3xx llegan como HTTPError con su Location a la vista."""
    pedido = urllib.request.Request(url, headers={"User-Agent": AGENTE, "Accept": ACEPTAR})
    abridor = urllib.request.build_opener(_SinSaltos())
    try:
        with abridor.open(pedido, timeout=timeout) as respuesta:
            return {"status": int(respuesta.status), "cabeceras": _limpiar(respuesta.headers),
                    "cuerpo": respuesta.read(TOPE_BYTES + 1)}
    except urllib.error.HTTPError as error:
        return {"status": int(error.code), "cabeceras": _limpiar(error.headers),
                "cuerpo": error.read(TOPE_BYTES + 1)}
    except (urllib.error.URLError, OSError, ValueError, TypeError):
        return None


def _tipo_permitido(tipo):
    """True solo si el Content-Type es html, xhtml, plain o xml; sin cabecera se admite como
    texto y los parámetros «;charset=…» no la invalidan."""
    base = ((tipo or "") or "text/plain").split(";", 1)[0].strip().lower()
    return base in TIPOS_ADMITIDOS or base.endswith("+xml")


def _directivas(texto):
    """Directivas prohibidas citadas en un texto; a una «agente: noindex» la aplicamos
    igual (conservador: se descarta cualquier lectura que el sitio prohíba)."""
    directivas = set()
    for parte in (texto or "").lower().replace(";", ",").split(","):
        directivas.update(t for t in re.split(r"[\s:]+", parte.strip()) if t in DIRECTIVAS_RECHAZADAS)
    return directivas


_PATRON_META = re.compile(r"<meta\b[^>]*>", re.IGNORECASE)
_META_ROBOTS = re.compile(r"\bname\s*=\s*[\"']robots[\"']", re.IGNORECASE)
_META_CONTENIDO = re.compile(r"\bcontent\s*=\s*[\"']([^\"']*)[\"']", re.IGNORECASE)
_PATRON_CHARSET = re.compile(r"charset=([^\s;]+)", re.IGNORECASE)


def _directivas_meta(html):
    """Directivas prohibidas en <meta name="robots" content="…"> del HTML descargado."""
    directivas = set()
    for etiqueta in _PATRON_META.findall(html or ""):
        if _META_ROBOTS.search(etiqueta):
            dicho = _META_CONTENIDO.search(etiqueta)
            contenido = dicho.group(1) if dicho is not None else ""
            directivas.update(_directivas(contenido))
    return directivas


def _eleccion(directivas):
    """El motivo legible del bloqueo: noai antes que noimageai antes que noindex."""
    for nombre in DIRECTIVAS_RECHAZADAS:
        if nombre in directivas:
            return nombre
    return None


def _decodificar(cuerpo, tipo):
    """El cuerpo como texto con el charset del Content-Type si lo hay; si no, utf-8 suave."""
    dicho = _PATRON_CHARSET.search(tipo or "")
    charset = dicho.group(1).strip("\"'") if dicho is not None else "utf-8"
    try:
        return cuerpo.decode(charset, "replace")
    except (LookupError, ValueError):
        return cuerpo.decode("utf-8", "replace")


def _salta_a(respuesta):
    """URL destino si la respuesta es redirección (301/302/303/307/308) con Location; None si no."""
    if respuesta["status"] not in (301, 302, 303, 307, 308):
        return None
    destino = (respuesta["cabeceras"].get("location") or "").strip()
    return destino or None


def leer(url, ctx):
    """Lectura cortés de una página pública → {ok, url_final, html, bytes, bloqueado_por}.

    Por salto (la primera página y hasta 3 redirecciones seguidas a mano): solo http/https,
    host no prohibido, robots.txt del dominio y pausa de cortesía antes de pedir; después
    estado HTTP, tipo de contenido, tope de tamaño, noai/noindex/noimageai (cabecera y
    <meta>), tope de reloj de 12 s y decodificación con el charset declarado.
    """
    salida = {"ok": False, "url_final": url, "html": "", "bytes": 0, "bloqueado_por": None}
    limite = ctx["reloj"]() + TOPE_SEGUNDOS
    actual = url
    saltos = 0
    while True:
        bloqueo = ((None if _esquema_permitido(actual) else "esquema")
                   or _razon_ssrf(actual, ctx) or _razon_robots(actual, ctx))
        if bloqueo:
            salida.update(url_final=actual, bloqueado_por=bloqueo)
            return salida
        respuesta = _pedir(actual, ctx, limite)
        if respuesta is None:
            salida.update(url_final=actual, bloqueado_por="red")
            return salida
        salida["url_final"] = actual
        destino = _salta_a(respuesta)
        if destino:
            if saltos >= MAX_SALTOS:
                salida["bloqueado_por"] = "redirecciones"
                return salida
            saltos += 1
            actual = urllib.parse.urljoin(actual, destino)
            continue
        tipo = respuesta["cabeceras"].get("content-type") or ""
        cabecera = _directivas(respuesta["cabeceras"].get("x-robots-tag") or "")
        cuerpo = respuesta["cuerpo"] or b""
        if not 200 <= respuesta["status"] < 300:
            motivo = "estado"
        elif not _tipo_permitido(tipo):
            motivo = "tipo"
        elif len(cuerpo) > TOPE_BYTES:
            motivo = "tamano"
        elif cabecera:
            motivo = _eleccion(cabecera)
        elif ctx["reloj"]() > limite:
            motivo = "tiempo"
        else:
            texto = _decodificar(cuerpo, tipo)
            meta = _directivas_meta(texto)
            if meta:
                salida.update(url_final=actual, bloqueado_por=_eleccion(meta))
                return salida
            salida.update(ok=True, html=texto, bytes=len(cuerpo), url_final=actual)
            return salida
        salida["bloqueado_por"] = motivo
        return salida
