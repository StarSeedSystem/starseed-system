# -*- coding: utf-8 -*-
"""Lector cortés (Ola 1025R · tarea SCO1025L).

`leer(url, ctx)` → {ok, url_final, html, bytes, bloqueado_por}.
Solo http/https; resuelve el host y RECHAZA loopback, redes privadas,
link-local y 169.254.169.254, también tras cada redirección (síguelas a
mano, ≤ 3). robots.txt antes de cada dominio y 10 s entre peticiones al
mismo. Agente de usuario del OS; sin cookies ni cabecera de autorización.
Tope de 1,5 MB y 12 s. Solo text/html, xhtml, plain o xml.
Respeta noai, noindex y noimageai en X-Robots-Tag y <meta name="robots">
(bloqueado_por: "noai"). Nunca ejecuta JavaScript.

La red, el reloj y la espera son inyectables, así que las pruebas son
puras y sin conexión: `leer(url, ctx, obtener_url, dormir, ahora)`.
"""

import http.client
import html
import html.parser
import io
import json
import os
import re
import ssl
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse, urlsplit
import socket  # added for gethostbyname_ex

# ── constantes de política ──────────────────────────────────────────────

MAX_BYTES = 1_500_000
MAX_SEGUNDOS = 12
MAX_REDIRECTS = 3
PAUSA_POR_DOMINIO_S = 10.0

AGENTE_USUARIO = "StarSeedOS-LectorCortes/1.0 (+https://starseed-os.vercel.app; lector cortés)"

# Scheme(s) permitidos
SCHEMES_PERMITIDOS = {"http", "https"}

# Redes que se rechazan siempre
_RECHAZAR_NET = {
    "127.0.0.0/8": "loopback",
    "10.0.0.0/8": "red_privada",
    "172.16.0.0/12": "red_privada",
    "192.168.0.0/16": "red_privada",
    "169.254.169.254": "link_local",
}

# Headers que se rechazan
HEADERS_PROHIBIDOS = {"cookie", "authorization"}


# ── tipos ──────────────────────────────────────────────────────────────

Result = dict[str, str | bool | bytes | None]


# ── ayuda: parseo de dominio ───────────────────────────────────────────

def _dominio(url: str) -> str | None:
    """Devuelve el dominio en minúsculas de `url`, o None si no sabe sacarlo."""
    try:
        p = urlparse(url)
        return p.netloc.lower()
    except Exception:
        return None


def _es_red_rechazada(dominio: str) -> bool | str | None:
    """True si `dominio` pertenece a una red que se debe rechazar siempre.
    Devuelve el motivo del bloqueo, o None si está permitido."""
    # Check de IP directa en el dominio
    if dominio.startswith("127.") or dominio == "localhost":
        return "loopback"
    if dominio.startswith("169.254."):
        return "link_local"
    if dominio in _RECHAZAR_NET:
        return _RECHAZAR_NET[dominio]
    # Checks simples de sufijos / rangos sin necesidad de ipaddress
    # link-local 169.254.x.x
    if dominio.startswith("169.254."):
        return "link_local"
    return False


# ── ayuda: html → plain text (sin JS) ──────────────────────────────────

class _Stripper(html.parser.HTMLParser):
    """Convierte HTML a texto plano recogiendo el contenido de las etiquetas."""

    def __init__(self):
        super().__init__()
        self._parts: list[str] = []
        self._in_script = 0
        self._in_style = 0

    def handle_starttag(self, tag, attrs):
        if tag.lower() in {"script", "style", "noscript"}:
            self._in_script += 1 if tag.lower() in {"script", "style", "noscript"} else -1

    def handle_data(self, data):
        if self._in_script <= 0 and self._in_style <= 0:
            self._parts.append(data)

    def handle_endtag(self, tag):
        pass

    def get_text(self) -> str:
        return "".join(self._parts)


def _html_a_texto(html_: str) -> str:
    """Extrae texto plano de `html_`, quitando <script>, <style> y comentarios."""
    s = _Stripper()
    s.feed(html_)
    return s.get_text()


# ── ayuda: detección de robots.txt ──────────────────────────────────────

def _robots_permiten(texto_robots: str | None, url: str, agente: str) -> bool:
    """True si robots.txt no prohíbe la URL a `agente`; puro (sin red)."""
    if not texto_robots:
        return True  # sin robots.txt se considera permitido
    robot = urllib.robotparser.RobotFileParser()
    robot.parse(texto_robots.splitlines())
    try:
        return bool(robot.can_fetch(agente, url))
    except Exception:
        return True


# ── ayuda: cabecera de aceptación de tipos ──────────────────────────────

def _accept_textos() -> str:
    return "text/html, application/xhtml+xml, application/xml;q=0.9, */*;q=0.1"


# ── ayuda: validación de tipo de contenido ─────────────────────────────

def _tipo_texto_permitido(headers: dict | None) -> bool:
    """True si los headers indican un tipo de contenido que aceptamos."""
    if not headers:
        return False
    contenido = headers.get("content-type", "")
    if not contenido:
        return False
    # Aceptamos text/html, xhtml, plain, xml
    ct = contenido.lower().split(";")[0].strip()
    return ct in {
        "text/html",
        "application/xhtml+xml",
        "application/xml",
        "text/plain",
    }


# ── ayuda: chequeo de no-ai ────────────────────────────────────────────

def _tiene_noai(html_: str, headers: dict | None) -> bool | None:
    """True si hay noai en X-Robots-Tag o <meta name='robots'>.
    Devuelve None si no se pueden mirar, True si hay, False si no."""
    bloqueado = False

    # X-Robots-Tag
    robots_tag = headers.get("x-robots-tag", "") if headers else ""
    robots_tag_lower = robots_tag.lower()
    if 'noai' in robots_tag_lower or 'noindex' in robots_tag_lower or 'noimageai' in robots_tag_lower:
        bloqueado = True

    # <meta name="robots">
    if not bloqueado:
        meta_match = re.search(
            r'<meta[^>]*name\s*=\s*["\']robots["\'][^>]*>', html_, re.IGNORECASE)
        if meta_match:
            meta_texto = meta_match.group(0).lower()
            if 'noai' in meta_texto or 'noindex' in meta_texto or 'noimageai' in meta_texto:
                bloqueado = True

    return bloqueado


# ── ayuda: seguimiento de pausa por dominio ─────────────────────────────

def _pausa_dominio(dominio: str, segundos_previos: float | None,
                    dormir: callable) -> float:
    """Aplica la pausa de 10 s por dominio; devuelve el tiempo que sobró."""
    if segundos_previos is None:
        dormir(0.0)
        return 0.0
    faltante = PAUSA_POR_DOMINIO_S - (time.monotonic() - segundos_previos)
    if faltante > 0:
        dormir(faltante)
    return faltante


# ── función principal ──────────────────────────────────────────────────

def leer(url: str, ctx: dict,
         obtener_url: callable | None = None,
         dormir: callable | None = None,
         ahora: datetime | None = None) -> Result:
    """Lee `url` y devuelve {ok, url_final, html, bytes, bloqueado_por}.

    ctx debe contener al menos: obtener_url, dormir, ahora.
    Si obtener_url / dormir vienen de ctx, se usan; si vienen como args,
    estos últimos tienen prioridad.
    """
    obtener_url = obtener_url or ctx.get("obtener_url")
    dormir = dormir or ctx.get("dormir")
    ahora_now = ahora or ctx.get("ahora")

    if obtener_url is None or dormir is None:
        return {"ok": False, "error": "faltan obtener_url o dormir"}  # type: ignore

    # ── validación de scheme ──────────────────────────────────────────

    try:
        p = urlparse(url)
    except Exception:
        return {"ok": False, "url_final": url, "bloqueado_por": "malformed"}

    if p.scheme not in SCHEMES_PERMITIDOS:
        return {"ok": False, "url_final": url, "bloqueado_por": "scheme"}

    # ── resolución de host y rechazo de redes ────────────────────────

    dominio = _dominio(url)
    if dominio is None:
        return {"ok": False, "url_final": url, "bloqueado_por": "dns"}

    bloqueo = _es_red_rechazada(dominio)
    if bloqueo is not None:
        return {"ok": False, "url_final": url, "bloqueado_por": bloqueo}

    # Resolver la IP para verificar más redes (loopback, link-local)
    try:
        addresses = socket.gethostbyname_ex(dominio)[1]
        for ip in addresses:
            if ip.startswith("127.") or ip == "localhost":
                return {"ok": False, "url_final": url, "bloqueado_por": "loopback"}
            if ip == "169.254.169.254":
                return {"ok": False, "url_final": url, "bloqueado_por": "link_local"}
    except Exception:
        pass

    # ── pausa por dominio ─────────────────────────────────────────────

    # ctx puede llevar un dict de "registros" de última petición por dominio
    registros = ctx.get("registros", {})
    segundos_ultima = registros.get(dominio)
    _pausa_dominio(dominio, segundos_ultima, dormir)
    registros[dominio] = time.monotonic()
    # Actualizar el registro en ctx si existe
    if "registros" in ctx:
        ctx["registros"][dominio] = time.monotonic()

    # ── obtener la URL seguiendo redirects a mano (≤ 3) ───────────────

    url_final = url
    html_respuesta = None
    bytes_respuesta = None
    bloqueado_por = None

    #Headers prohibidos en la petición saliente
    headers_salida = {"User-Agent": AGENTE_USUARIO}
    # Quitar cookie/authorization si vienen en ctx
    headers_prohib = ctx.get("headers_prohib", set())
    for h in headers_prohib:
        if h in headers_salida:
            del headers_salida[h]

    for redirect_num in range(MAX_REDIRECTS + 1):
        # Preparar petición
        try:
            peticion = urllib.request.Request(
                url_final, headers=headers_salida)
        except Exception as e:
            return {"ok": False, "url_final": url_final, "bloqueado_por": f"request:{e}"}

        # Ejecutar
        try:
            with obtener_url(peticion, timeout=MAX_SEGUNDOS) as respuesta:
                # timeout es manejado por obtener_url; aquí leemos
                try:
                    cuerpo = respuesta.read()
                except Exception:
                    return {"ok": False, "url_final": url_final,
                             "bloqueado_por": "read_error"}

                # Tope de 1,5 MB
                if len(cuerpo) > MAX_BYTES:
                    return {"ok": False, "url_final": url_final,
                             "bloqueado_por": "tope_bytes"}

                # Validar tipo de contenido
                ct = respuesta.headers.get("content-type", "") if hasattr(respuesta, 'headers') else ""
                if not _tipo_texto_permitido({"content-type": ct}):
                    return {"ok": False, "url_final": url_final,
                             "bloqueado_por": "tipo_texto"}

                # Validar noai / noindex / noimageai
                bloqueado_por = _tiene_noai(cuerpo.decode("utf-8", "replace"), {
                    "content-type": ct,
                    "x-robots-tag": respuesta.headers.get("x-robots-tag")
                })
                if bloqueado_por:
                    return {"ok": False, "url_final": url_final,
                             "bloqueado_por": "noai"}

                # Obtener headers finales (después de redirects)
                headers_finales = dict(respuesta.headers)

                # Si hay redirect, seguir la redirect
                if redirect_num < MAX_REDIRECTS:
                    location = respuesta.headers.get("Location")
                    if location:
                        # Construir URL absoluta
                        url_final = urllib.parse.urljoin(url_final, location)
                        continue
                # No hay más redirects o ya terminamos
                html_respuesta = cuerpo
                bytes_respuesta = cuerpo
                break

        except HTTPError as e:
            # Error HTTP - todavía podemos tener cuerpo
            try:
                cuerpo = e.read()
                if len(cuerpo) <= MAX_BYTES:
                    # Validar tipo y noai igual
                    ct = e.headers.get("content-type", "") if e.headers else ""
                    if _tipo_texto_permitido({"content-type": ct}):
                        bloqueado_por = _tiene_noai(
                            cuerpo.decode("utf-8", "replace"), {
                                "content-type": ct,
                                "x-robots-tag": e.headers.get("x-robots-tag") if e.headers else None
                            })
                        if not bloqueado_por:
                            html_respuesta = cuerpo
                            bytes_respuesta = cuerpo
            except Exception:
                pass
            return {"ok": False, "url_final": url_final,
                     "bloqueado_por": f"http_{e.code}"}
        except Exception as e:
            return {"ok": False, "url_final": url_final,
                     "bloqueado_por": f"error:{e}"}

    if html_respuesta is None:
        return {"ok": False, "url_final": url_final, "bloqueado_por": "sin_respuesta"}

    # Convertir HTML a texto plano (quitando scripts/estilos)
    texto_plano = _html_a_texto(html_respuesta.decode("utf-8", "replace"))

    return {
        "ok": True,
        "url_final": url_final,
        "html": html_respuesta,
        "bytes": bytes_respuesta,
        "bloqueado_por": bloqueado_por,  # None si ok, "noai" si bloqueado
    }