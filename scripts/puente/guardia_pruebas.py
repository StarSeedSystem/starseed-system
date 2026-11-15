#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Guardia de red para pruebas: nada sale de localhost (SIN1114).

`activar()` —o `instalar_sesion()` desde conftest— pone `STARSEED_PRUEBAS=1` y sustituye
`urllib.request.urlopen`, `HTTPSConnection.connect` y `socket.create_connection` por versiones que
lanzan `ErrorRedEnPruebas` fuera de localhost. `desactivar()` restaura lo que hubiera debajo (la
guardia de sesión sigue viva) y solo quita la variable si la puso esta activación.
"""
import atexit
import http.client
import os
import socket
import urllib.request
from urllib.parse import urlparse

_ESQUEMAS_RED = ("http", "https", "ftp", "ftps", "ws", "wss")
_LOCALES = ("localhost", "127.0.0.1", "::1", "[::1]", "0.0.0.0")
_estado = {"activa": False, "originales": None, "pruebas_previas": None}
_sesion = {}


class ErrorRedEnPruebas(RuntimeError):
    """Llamada de red no local durante las pruebas."""


def _es_local(host) -> bool:
    if host is None:
        return False
    if isinstance(host, bytes):
        host = host.decode("ascii", "ignore")
    host = str(host).strip().lower()
    return host in _LOCALES or host.startswith("127.")


def _url_permitida(url) -> bool:
    """Pasan localhost y los esquemas que no son de red (file:, data:)."""
    partes = urlparse(str(getattr(url, "full_url", url)))
    return partes.scheme not in _ESQUEMAS_RED or _es_local(partes.hostname)


def _bloqueos(originales):
    def urlopen(url, *args, **kwargs):
        if not _url_permitida(url):
            raise ErrorRedEnPruebas("Llamada de red externa bloqueada en pruebas: %s" % url)
        return originales["urlopen"](url, *args, **kwargs)

    def https_connect(self, *args, **kwargs):
        host = getattr(self, "host", None)
        if not _es_local(host):
            raise ErrorRedEnPruebas("Conexión HTTPS externa bloqueada en pruebas: %s" % (host or "?"))
        return originales["https_connect"](self, *args, **kwargs)

    def create_connection(address, *args, **kwargs):
        host = address[0] if isinstance(address, (tuple, list)) and address else address
        if not _es_local(host):
            raise ErrorRedEnPruebas("Conexión de red externa bloqueada en pruebas: %s" % (address,))
        return originales["create_connection"](address, *args, **kwargs)

    return {"urlopen": urlopen, "https_connect": https_connect,
            "create_connection": create_connection}


def _capturar():
    return {"urlopen": urllib.request.urlopen,
            "https_connect": http.client.HTTPSConnection.connect,
            "create_connection": socket.create_connection}


def _aplicar(originales):
    bloqueos = _bloqueos(originales)
    urllib.request.urlopen = bloqueos["urlopen"]
    http.client.HTTPSConnection.connect = bloqueos["https_connect"]
    socket.create_connection = bloqueos["create_connection"]


def _restaurar(originales):
    if originales:
        urllib.request.urlopen = originales["urlopen"]
        http.client.HTTPSConnection.connect = originales["https_connect"]
        socket.create_connection = originales["create_connection"]


def instalar_sesion():
    """Instala la guardia para la sesión de pytest (idempotente) y fija STARSEED_PRUEBAS=1."""
    if not _sesion.get("originales"):
        os.environ["STARSEED_PRUEBAS"] = "1"
        _sesion["originales"] = _capturar()
        _aplicar(_sesion["originales"])
        atexit.register(_restaurar, _sesion["originales"])
    return _sesion["originales"]


def activar():
    """Activa la guardia de forma anidada: guarda lo que hubiera y restaura eso al desactivar."""
    if _estado["activa"]:
        return
    _estado["pruebas_previas"] = os.environ.get("STARSEED_PRUEBAS")
    os.environ["STARSEED_PRUEBAS"] = "1"
    _estado["originales"] = _capturar()
    _aplicar(_estado["originales"])
    _estado["activa"] = True


def desactivar():
    """Restaura funciones y variable previas; nunca apaga la guardia de sesión."""
    if not _estado["activa"]:
        return
    _restaurar(_estado["originales"])
    previo = _estado["pruebas_previas"]
    if previo is None:
        os.environ.pop("STARSEED_PRUEBAS", None)
    else:
        os.environ["STARSEED_PRUEBAS"] = previo
    _estado.update(activa=False, originales=None, pruebas_previas=None)


def esta_activa() -> bool:
    return _estado["activa"] or bool(_sesion.get("originales"))
