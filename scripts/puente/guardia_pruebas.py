#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Guardia de red para pruebas: bloquea cualquier llamada de red externa durante las pruebas.

Uso:
    import guardia_pruebas
    guardia_pruebas.activar()  # Pone STARSEED_PRUEBAS=1 y bloquea red externa

    # ... pruebas ...

    guardia_pruebas.desactivar()  # Restaura estado original (opcional)
"""

import os
import socket
import urllib.request

_guardia_activa = False
_original_urlopen = None
_original_create_connection = None
_original_starseed_pruebas = None


class ErrorRedEnPruebas(RuntimeError):
    """Se lanza cuando una prueba intenta hacer una llamada de red externa."""
    pass


def _es_local(host: str) -> bool:
    """True si el host es localhost o equivalente."""
    if not host:
        return False
    host_lower = host.lower()
    return host_lower in ("localhost", "127.0.0.1", "[::1]", "::1")


def _urlopen_bloqueada(url, *args, **kwargs):
    """Versión de urlopen que bloquea hosts no locales."""
    global _original_urlopen, _original_create_connection
    if _original_urlopen is None or _original_create_connection is None:
        raise RuntimeError("Guardia de pruebas no activada: llama a guardia_pruebas.activar() primero")
    try:
        from urllib.parse import urlparse
        parsed = urlparse(str(url))
        host = parsed.hostname or ""
        if not _es_local(host):
            raise ErrorRedEnPruebas(f"Llamada de red externa bloqueada en pruebas: {url}")
    except ErrorRedEnPruebas:
        raise
    except Exception:
        raise ErrorRedEnPruebas(f"URL no válida en pruebas: {url}")
    return _original_urlopen(url, *args, **kwargs)


def _create_connection_bloqueada(address, *args, **kwargs):
    """Versión de create_connection que bloquea hosts no locales."""
    global _original_urlopen, _original_create_connection
    if _original_urlopen is None or _original_create_connection is None:
        raise RuntimeError("Guardia de pruebas no activada: llama a guardia_pruebas.activar() primero")
    host = address[0] if address else ""
    if not _es_local(host):
        raise ErrorRedEnPruebas(f"Conexión de red externa bloqueada en pruebas: {address}")
    return _original_create_connection(address, *args, **kwargs)


def activar():
    """Activa la guardia: pone STARSEED_PRUEBAS=1 y bloquea urllib/socket externos."""
    global _guardia_activa, _original_urlopen, _original_create_connection, _original_starseed_pruebas
    if _guardia_activa:
        return
    _original_starseed_pruebas = os.environ.get("STARSEED_PRUEBAS")
    os.environ["STARSEED_PRUEBAS"] = "1"
    _original_urlopen = urllib.request.urlopen
    _original_create_connection = socket.create_connection
    urllib.request.urlopen = _urlopen_bloqueada
    socket.create_connection = _create_connection_bloqueada
    _guardia_activa = True


def desactivar():
    """Desactiva la guardia: restaura STARSEED_PRUEBAS y urllib/socket originales."""
    global _guardia_activa
    if not _guardia_activa:
        return
    if _original_starseed_pruebas is None:
        os.environ.pop("STARSEED_PRUEBAS", None)
    else:
        os.environ["STARSEED_PRUEBAS"] = _original_starseed_pruebas
    if _original_urlopen is not None:
        urllib.request.urlopen = _original_urlopen
    if _original_create_connection is not None:
        socket.create_connection = _original_create_connection
    _guardia_activa = False


def esta_activa() -> bool:
    """True si la guardia está activa."""
    return _guardia_activa