#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# fmt: off
"""Lector cortés de páginas públicas (Ola 1025R · INV1025C).

Solo stdlib; red, DNS, reloj y espera son inyectables (`leer(url, ctx)`).
Reutiliza la política R4 de `vigia_referencias` (robots.txt antes de cada
dominio, 10 s entre peticiones, agente del OS, sin cookies ni credenciales),
rechaza loopback, privadas, link-local y 169.254.169.254 tras cada redirección,
sigue redirecciones a mano (≤3), limita a 1,5 MB y 12 s, y respeta `noai`,
`noindex` y `noimageai`. Nunca ejecuta JavaScript.
"""
import ipaddress, re, socket, time, urllib.error, urllib.parse, urllib.request
from vigia_referencias import AGENTE_USUARIO, PAUSA_POR_DOMINIO_S, pausa_restante, robots_permiten
MAX_BYTES, MAX_SEGUNDOS, MAX_REDIRECCIONES = 1536 * 1024, 12.0, 3
TIPOS_PERMITIDOS = {"text/html", "application/xhtml+xml", "text/plain", "application/xml", "text/xml"}
DIRECTIVAS_BLOQUEO = ("noai", "noindex", "noimageai")
ACEPTAR = "text/html,application/xhtml+xml,text/plain,application/xml,text/xml,application/*+xml"
def cabeceras_peticion():
    """Ni cookies ni autorización: solo agente del OS y tipos aceptados (R4)."""
    return {"User-Agent": AGENTE_USUARIO, "Accept": ACEPTAR}
class _SinRedirecciones(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None
_OPENER = urllib.request.build_opener(_SinRedirecciones)
def _abrir_urllib(url, segundos, maximo):
    peticion = urllib.request.Request(url, headers=cabeceras_peticion())
    try:
        with _OPENER.open(peticion, timeout=segundos) as respuesta:
            return respuesta.status, dict(respuesta.headers.items()), respuesta.read(maximo + 1)
    except urllib.error.HTTPError as error:
        return error.code, dict(error.headers.items()) if error.headers else {}, error.read(maximo + 1)
def _resolver(host): return sorted({fila[4][0] for fila in socket.getaddrinfo(host, None)})
def _contexto(ctx):
    ctx = ctx or {}; base = {"abrir": _abrir_urllib, "dormir": time.sleep, "reloj": time.monotonic,
            "resolver": _resolver, "registros": {}, "robots": {}}
    if "obtener_url" in ctx and "abrir" not in ctx:
        pedir = ctx["obtener_url"]
        def abrir(url, segundos, maximo):
            cuerpo = pedir(url)
            if cuerpo is None: raise OSError("sin red")
            return 200, {"content-type": "text/html"}, cuerpo[:maximo + 1]
        base["abrir"] = abrir
    if "robots_vistos" in ctx: base["robots"] = ctx["robots_vistos"]
    return {**base, **ctx}
def _fallo(url, motivo): return {"ok": False, "url_final": url, "html": "", "bytes": 0, "bloqueado_por": motivo}
def _ip_prohibida(texto):
    try: direccion = ipaddress.ip_address(str(texto))
    except ValueError: return True
    if direccion.version == 6 and direccion.ipv4_mapped: direccion = direccion.ipv4_mapped
    return any((direccion.is_private, direccion.is_loopback, direccion.is_link_local,
                direccion.is_reserved, direccion.is_multicast, direccion.is_unspecified))
def _validar(url, ctx):
    try: partes = urllib.parse.urlsplit(url)
    except ValueError: return "", "url"
    if partes.scheme not in ("http", "https") or not partes.hostname or "@" in partes.netloc:
        return "", "esquema"
    netloc = partes.netloc.lower()
    try: direcciones = list(ctx["resolver"](partes.hostname))
    except Exception: return netloc, "dns"
    return (netloc, "red-privada") if not direcciones or any(_ip_prohibida(ip) for ip in direcciones) else (netloc, None)
def _robots(netloc, esquema, url, ctx):
    if netloc not in ctx["robots"]:
        texto = b""
        try:
            estado, _cabeceras, cuerpo = ctx["abrir"](f"{esquema}://{netloc}/robots.txt", 5.0, MAX_BYTES)
            texto = cuerpo if 200 <= estado < 300 else b""
        except Exception: texto = b""
        ctx["robots"][netloc] = texto
    texto = ctx["robots"][netloc]; return texto if isinstance(texto, bool) else robots_permiten(texto.encode("utf-8") if isinstance(texto, str) else texto, url)
def _esperar(netloc, ctx):
    ctx["dormir"](pausa_restante(ctx["registros"].get(netloc), ctx["reloj"](), PAUSA_POR_DOMINIO_S))
    ctx["registros"][netloc] = ctx["reloj"]()
def _tipo_permitido(cabeceras):
    tipo = str(cabeceras.get("content-type", "")).split(";", 1)[0].strip().lower()
    return tipo in TIPOS_PERMITIDOS or tipo.endswith("+xml")
def _directivas(cabeceras, html):
    vistas, valores = set(), cabeceras.get("x-robots-tag", "")
    if isinstance(valores, (list, tuple)): valores = " ".join(str(v) for v in valores)
    vistas.update(p for p in re.split(r"[,\s:]+", str(valores).lower()) if p)
    for etiqueta in re.findall(r"(?is)<meta\b[^>]*>", html):
        if not re.search(r"""name\s*=\s*["']?robots""", etiqueta, re.I): continue
        contenido = re.search(r"""content\s*=\s*(["'])(.*?)\1""", etiqueta, re.I | re.S)
        if contenido: valor = contenido.group(2)
        else:
            suelto = re.search(r"""content\s*=\s*([^\s>]+)""", etiqueta, re.I)
            valor = suelto.group(1) if suelto else ""
        vistas.update(p for p in re.split(r"[,\s:]+", valor.lower()) if p)
    return vistas
def _bloqueo(cabeceras, html):
    vistas = _directivas(cabeceras, html)
    return next((d for d in DIRECTIVAS_BLOQUEO if d in vistas), None)
def leer(url, ctx=None):
    ctx = _contexto(ctx)
    actual = str(url or "").strip()
    inicio = ctx["reloj"]()
    for salto in range(MAX_REDIRECCIONES + 1):
        netloc, motivo = _validar(actual, ctx)
        if motivo: return _fallo(actual, motivo)
        partes = urllib.parse.urlsplit(actual)
        if not _robots(netloc, partes.scheme, actual, ctx): return _fallo(actual, "robots")
        _esperar(netloc, ctx)
        restante = MAX_SEGUNDOS - (ctx["reloj"]() - inicio)
        if restante <= 0: return _fallo(actual, "tiempo")
        try: estado, cabeceras, cuerpo = ctx["abrir"](actual, restante, MAX_BYTES)
        except Exception: return _fallo(actual, "red")
        if ctx["reloj"]() - inicio > MAX_SEGUNDOS: return _fallo(actual, "tiempo")
        cabeceras = {str(k).lower(): v for k, v in (cabeceras or {}).items()}
        destino = str(cabeceras.get("location", "")).strip()
        if estado in (301, 302, 303, 307, 308) and destino:
            if salto >= MAX_REDIRECCIONES: return _fallo(actual, "redirecciones")
            actual = urllib.parse.urljoin(actual, destino); continue
        if estado < 200 or estado >= 300: return _fallo(actual, "http")
        if len(cuerpo) > MAX_BYTES: return _fallo(actual, "tamano")
        if not _tipo_permitido(cabeceras): return _fallo(actual, "tipo")
        html = cuerpo.decode("utf-8", "replace")
        bloqueo = _bloqueo(cabeceras, html)
        if bloqueo: return _fallo(actual, bloqueo)
        return {"ok": True, "url_final": actual, "html": html, "bytes": len(cuerpo), "bloqueado_por": None}
    return _fallo(actual, "redirecciones")
