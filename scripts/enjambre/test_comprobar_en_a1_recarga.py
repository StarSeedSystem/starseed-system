# -*- coding: utf-8 -*-
"""Prueba de la recarga de comprobar_en_a1 en _comprobar_en_a1 (SUP0811H).

El código de main llamaba ``sys.modules.get(nombre, {}).get(...)`` sobre un
módulo, que no tiene ``.get``: AttributeError y aviso en CADA arranque. Aquí
se prueba con un módulo de mentira en un temporal que la función devuelve la
función ``comprobar`` del módulo, recarga cuando cambia el mtime y no avisa
en el camino feliz.
"""
import importlib.util
import os
import sys

import pytest

RUTA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "starseed-enjambre.py")
ESPEC = importlib.util.spec_from_file_location("enjambre", RUTA)
enjambre = importlib.util.module_from_spec(ESPEC)
sys.modules.setdefault("enjambre", enjambre)
ESPEC.loader.exec_module(enjambre)

NOMBRE_MODULO = "comprobar_en_a1"


CONTENIDO_A = "def comprobar(cwd=None):\n    return 'A'\n"
CONTENIDO_B = "def comprobar(cwd=None):\n    return 'B'\n"


def _escribir_fake(raiz, contenido):
    """Escribe scripts/puente/comprobar_en_a1.py de mentira bajo ``raiz``."""
    ruta = os.path.join(str(raiz), "scripts", "puente")
    os.makedirs(ruta, exist_ok=True)
    archivo = os.path.join(ruta, "comprobar_en_a1.py")
    with open(archivo, "w", encoding="utf-8") as f:
        f.write(contenido)
    return archivo


@pytest.fixture
def a1_fake(tmp_path, monkeypatch):
    """ROOT temporal, _en_la_mac True y evento capturado, sin el módulo real."""
    _limpiar()
    fake = _escribir_fake(tmp_path, CONTENIDO_A)
    avisos = []
    monkeypatch.setattr(enjambre, "_en_la_mac", lambda: True)
    monkeypatch.setattr(enjambre, "ROOT", str(tmp_path))
    monkeypatch.setattr(
        enjambre,
        "evento",
        lambda tipo, tarea, texto, datos=None: avisos.append(texto),
    )
    enjambre._MTIMES_MODULOS["comprobar_en_a1"] = 0.0
    yield fake, avisos
    _limpiar()
    ruta_tmp = os.path.dirname(fake)
    while ruta_tmp in sys.path:
        sys.path.remove(ruta_tmp)


def _limpiar():
    """Saca el módulo real/de mentira de sys.modules y sys.path."""
    sys.modules.pop(NOMBRE_MODULO, None)
    ruta = os.path.join(os.path.dirname(RUTA), "..", "puente")
    ruta = os.path.normpath(ruta)
    if ruta in sys.path:
        sys.path.remove(ruta)


def test_primera_llamada_sin_aviso(a1_fake):
    fake, avisos = a1_fake
    funcion = enjambre._comprobar_en_a1()
    assert funcion() == "A"
    assert not any("fallo al recargar" in a for a in avisos), avisos


def test_recarga_con_mtime_nuevo(a1_fake):
    fake, avisos = a1_fake
    enjambre._comprobar_en_a1()
    with open(fake, "w", encoding="utf-8") as f:
        f.write(CONTENIDO_B)
    viejo = os.path.getmtime(fake)
    os.utime(fake, (viejo + 30, viejo + 30))
    funcion = enjambre._comprobar_en_a1()
    assert funcion() == "B"
    assert not any("fallo al recargar" in a for a in avisos), avisos


def test_sin_cambio_misma_funcion(a1_fake):
    fake, avisos = a1_fake
    primera = enjambre._comprobar_en_a1()
    segunda = enjambre._comprobar_en_a1()
    assert segunda() == "A"
    assert segunda is primera
    assert not any("fallo al recargar" in a for a in avisos), avisos
