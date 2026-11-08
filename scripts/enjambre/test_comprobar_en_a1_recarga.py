# -*- coding: utf-8 -*-
"""Prueba de recarga de `comprobar_en_a1` (SUP0811H, 22.ª pasada).

El orquestador toma el módulo recargado con `sys.modules` y devuelve su `comprobar`
atributo con `getattr` tras recargar/importar, evitando el AttributeError de
`.get()`. Se carga el orquestador como hacen las demás pruebas de `scripts/enjambre`,
con un módulo de mentira en un ROOT temporal, y se comprueba que la recarga entrega
la función del módulo (sin avisos) y que los cambios y las sin-cambios se comportan
como se espera.
"""
import importlib.util
import os
import sys

import pytest

RUTA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "starseed-enjambre.py")
ESPEC = importlib.util.spec_from_file_location("enjambre_a1_recarga_0811", RUTA)
assert ESPEC is not None and ESPEC.loader is not None
enjambre = importlib.util.module_from_spec(ESPEC)
sys.modules.setdefault("enjambre_a1_recarga_0811", enjambre)
ESPEC.loader.exec_module(enjambre)

FAKE = (
    "\ndef comprobar(base_sha, shas, cambiados, timeout=900, cwd=None):\n"
    "    return ('v%s', base_sha)\n"
)

TAREA = "fallo al recargar comprobar_en_a1"


def _quitar(sys_path, ruta):
    """Deja `sys.modules["comprobar_en_a1"]` y `sys.path` como estaban."""
    sys.modules.pop("comprobar_en_a1", None)
    sys.path[:] = [p for p in sys_path if os.path.abspath(p) != os.path.abspath(ruta)]


@pytest.fixture
def a1(tmp_path, monkeypatch):
    """Orquestador con `_en_la_mac` True, `ROOT` temporal con módulo de mentira y `evento` grabando."""
    puente = tmp_path / "scripts" / "puente"
    puente.mkdir(parents=True)
    archivo = puente / "comprobar_en_a1.py"
    archivo.write_text(FAKE % 1, encoding="utf-8")
    monkeypatch.setattr(enjambre, "ROOT", str(tmp_path))
    monkeypatch.setattr(enjambre, "_en_la_mac", lambda: True)
    avisos = []
    monkeypatch.setattr(
        enjambre,
        "evento",
        lambda tipo, tarea, texto, datos=None: avisos.append((tipo, texto)),
    )
    visto = enjambre._MTIMES_MODULOS["comprobar_en_a1"]
    enjambre._MTIMES_MODULOS["comprobar_en_a1"] = 0.0
    _quitar(sys.path, str(puente))
    yield archivo, avisos
    enjambre._MTIMES_MODULOS["comprobar_en_a1"] = visto
    _quitar(sys.path, str(puente))


def test_primera_carga_sin_aviso(a1):
    """(a) La primera llamada devuelve la función del módulo de mentira y no hay aviso de recarga."""
    archivo, avisos = a1
    fn = enjambre._comprobar_en_a1()
    assert fn("sha", ["a"], []) == ("v1", "sha")
    assert not any(TAREA in texto for _, texto in avisos), avisos


def test_recarga_devuelve_la_nueva_funcion(a1):
    """(b) Cambio el archivo (otra función, mtime mayor): la siguiente entrega la NUEVA, sin aviso."""
    archivo, avisos = a1
    fn = enjambre._comprobar_en_a1()
    assert fn("sha", ["a"], []) == ("v1", "sha")
    visto = os.path.getmtime(archivo)
    archivo.write_text(FAKE % 2, encoding="utf-8")
    os.utime(archivo, (visto + 100, visto + 100))
    fn_nueva = enjambre._comprobar_en_a1()
    assert fn_nueva("sha", ["a"], []) == ("v2", "sha")
    assert fn_nueva is not fn
    assert not any(TAREA in texto for _, texto in avisos), avisos


def test_sin_cambios_misma_funcion(a1):
    """(c) Sin cambios en el archivo dos veces seguidas: la misma función, sin aviso."""
    _, avisos = a1
    fn = enjambre._comprobar_en_a1()
    otra = enjambre._comprobar_en_a1()
    assert otra is fn
    assert fn("sha", ["a"], []) == ("v1", "sha")
    assert not any(TAREA in texto for _, texto in avisos), avisos

