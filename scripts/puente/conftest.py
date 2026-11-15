"""Configuración de pytest para scripts/puente (COL1012Md-d1).

POR QUÉ existe: esta carpeta tiene `__init__.py`, así que pytest (modo de importación «prepend») sube
hasta la primera carpeta SIN `__init__.py` y mete en `sys.path` `scripts/`, no `scripts/puente/`. Los
módulos del puente se importan unos a otros por nombre simple (`import produccion_puentes`), y con
`python3 -m unittest discover -s scripts/puente` eso funciona porque unittest sí añade la carpeta de
inicio. Con pytest, cada prueba que no hiciera su propio `sys.path.insert` moría en la recogida con
`ModuleNotFoundError` (medido el 2026-10-20: 29 de los 188 `test_*.py`).

Eso importa más de lo que parece: `traer_nube._puertas` corre `python -m pytest` sobre la prueba
hermana de cada `.py` que toca una rama de la nube, así que un fallo de RECOGIDA (no de una aserción)
hacía caer la puerta de tareas correctas y las dejaba «bloqueadas» sin que nadie hubiera roto nada.

Aquí se hace lo que unittest hace solo: la carpeta de este archivo pasa a `sys.path`, una sola vez y
sin duplicar. No cambia ninguna prueba que ya hacía su `sys.path.insert` (el lugar nuevo queda detrás de
los suyos, o delante con el mismo valor: da igual, es la misma carpeta).
"""
import os
import sys

_CARPETA = os.path.dirname(os.path.abspath(__file__))

if _CARPETA not in sys.path:
    sys.path.insert(0, _CARPETA)

# TMP1113B: cada corrida es dueña de UNA raíz temporal (`raiz_pruebas.py`) y la quita al salir (pase, falle o se
# interrumpa). Va ANTES de cualquier `mkdtemp` de este archivo para que todo caiga dentro.
import raiz_pruebas as _raiz_pruebas  # noqa: E402

_raiz_pruebas.abrir()

# TMP1113B: la recogida de worktrees (registro y marca de permiso) jamás escribe en el ~/.starseed real desde pytest.
os.environ["STARSEED_REGISTRO_WORKTREES"] = os.path.join(os.environ["TMPDIR"], "recogida-worktrees.jsonl")
os.environ["STARSEED_PERMISO_WORKTREES"] = os.path.join(os.environ["TMPDIR"], "recogida-worktrees.permitida")

# (1103 · U) Las pruebas nunca leen ni escriben las preguntas de «Potenciar» de verdad: Genesis se las enseña a Alex.
import tempfile as _tempfile  # noqa: E402

os.environ["STARSEED_POTENCIAR_RUTA"] = os.path.join(_tempfile.mkdtemp(prefix="potenciar-pruebas-"), "potenciar.json")
os.environ.pop("STARSEED_POTENCIAR", None)

# (2026-11-14 · SIN1114Ab) La guardia de red para TODAS las pruebas de esta carpeta.
#
# POR QUÉ existe: `guardia_pruebas.activar()` solo lo llamaban sus propias pruebas, y
# `desactivar()` (en su tearDown) quita `STARSEED_PRUEBAS` del entorno global. Medido el
# 2026-11-14: `test_entregar_con_sintesis_envia_resumen_y_completa` y
# `test_solo_una_entrega_al_dia` de test_agente_sintesis.py llamaban a `ciclo()`/`_entregar()`
# SIN inyectar `subir_drive`, así que `_subir_doc` pedía un token OAuth REAL a
# `oauth2.googleapis.com` y subía un Google Doc «Síntesis diaria 2026-11-11» en cada corrida.
# Con la red cortada la prueba pasaba igual (el fallo se lo tragaba el `except`), así que el
# test verde NO demostraba que no hubiera fugas.
#
# QUÉ hace: pone `STARSEED_PRUEBAS=1` y sustituye `urllib.request.urlopen`,
# `http.client.HTTPSConnection.connect` y `socket.create_connection` por funciones que
# lanzan `ErrorRedEnPruebas` para todo lo que no sea localhost. La guardia se activa al
# IMPORTAR este archivo y se queda puesta; las pruebas que necesitan red real (ninguna hoy)
# pueden desactivarla con `guardia_pruebas.desactivar()`.
#
# La red se corta en la CONEXIÓN, no en la URL: así también paran las librerías que usan
# `requests` o `httpx`, que no pasan por `urllib.request.urlopen`.
import socket as _socket  # noqa: E402
import http.client as _httpclient  # noqa: E402
import urllib.request as _urllib_request  # noqa: E402

import guardia_pruebas as _guardia  # noqa: E402


def _localhost(host):
    if not host:
        return False
    return str(host).lower() in ("localhost", "127.0.0.1", "::1", "[::1]", "0.0.0.0")


def _connect_bloqueada(self, *args, **kwargs):
    """HTTPSConnection.connect: corta todo lo que no sea local.

    La firma real de `HTTPSConnection.connect` es `connect(self)`: el host ya está en
    `self.host`, no llega como argumento.
    """
    destino = getattr(self, "host", "")
    if not _localhost(destino):
        raise _guardia.ErrorRedEnPruebas(
            f"Conexión HTTPS externa bloqueada en pruebas: {destino}")
    return _connect_original(self, *args, **kwargs)


_connect_original = _httpclient.HTTPSConnection.connect
_httpclient.HTTPSConnection.connect = _connect_bloqueada

# (2026-11-14) La guardia sustituye urlopen y create_connection; http.client.connect
# se intercepta aquí porque `urllib` lo usa por debajo en muchas rutas (y requests/httpx
# van directos a socket). Con las tres cortadas, ninguna prueba alcanza la red real.
_guardia.activar()
