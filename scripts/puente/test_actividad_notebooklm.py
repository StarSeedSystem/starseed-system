# -*- coding: utf-8 -*-
"""Pruebas del lector de actividad de NotebookLM (SDP1111J), sin el CLI real.

Todo va por `ejecutar` inyectado: ni red, ni CLI, ni sesión de Google. Se comprueba lo que
devuelve cada costura pública (CLI ausente, sesión caducada, fichas nuevas e incrementales).
"""
import json
import os
import sys
from types import SimpleNamespace

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import actividad_notebooklm as A


def _ok(dato):
    return SimpleNamespace(returncode=0, stdout=json.dumps(dato), stderr="")


def _cli(tabla):
    """`ejecutar` falso: la clave es lo que va después de `ruta -p <perfil>`."""
    llamadas = []

    def ejecutar(cmd, **_):
        llamadas.append(list(cmd))
        return tabla.get(tuple(cmd[3:]), SimpleNamespace(returncode=1, stdout="", stderr="sin guion"))

    ejecutar.llamadas = llamadas
    return ejecutar


def _tabla(fuentes, notas, cuadernos=None):
    return {
        ("list", "--json"): _ok({"notebooks": cuadernos or [{"id": "nb1", "title": "Cuaderno uno"}], "count": 1}),
        ("source", "list", "-n", "nb1", "--json"): _ok({"sources": fuentes, "count": len(fuentes)}),
        ("note", "list", "-n", "nb1", "--json"): _ok({"notes": notas, "count": len(notas)}),
    }


def test_sin_cli_devuelve_ok_false_sin_fallar():
    r = A.recolectar(existe=lambda _: False)
    assert r["ok"] is False
    assert "CLI" in r["motivo"]


def test_sesion_caducada_no_reintenta_login():
    ejecutar = _cli({("list", "--json"): SimpleNamespace(
        returncode=1, stdout=json.dumps({"error": True, "code": "AUTH_REQUIRED", "message": "Not logged in"}), stderr="")})
    r = A.recolectar(ejecutar=ejecutar, existe=lambda _: True)
    assert r["ok"] is False
    assert "sesión" in r["motivo"]
    assert len(ejecutar.llamadas) == 1
    assert all("login" not in c for c in ejecutar.llamadas)


def test_lista_fuentes_y_notas_como_fichas_privadas(tmp_path):
    tabla = _tabla(
        [{"id": "s1", "title": "Fuente vieja", "url": "https://x.example/a", "created_at": "2026-11-10T10:00:00"},
         {"id": "s2", "title": "Fuente nueva", "url": "https://x.example/b", "created_at": "2026-11-11T10:00:00"}],
        [{"id": "n1", "title": "Idea", "preview": "Una idea"}])
    r = A.recolectar(ejecutar=_cli(tabla), existe=lambda _: True, home=str(tmp_path))
    assert r["ok"] is True
    assert {f["id"] for f in r["fichas"]} == {"s1", "s2", "n1"}
    assert all(f["privado"] is True for f in r["fichas"])
    assert {f["cuenta"] for f in r["fichas"]} == {"alexbordongarrigos@gmail.com"}
    assert os.path.exists(r["fichero"])
    with open(r["fichero"], encoding="utf-8") as f:
        assert len(json.load(f)) == 3


def test_segunda_pasada_solo_emite_lo_nuevo(tmp_path):
    primera = _tabla([{"id": "s1", "title": "Vieja", "url": None, "created_at": "2026-11-10T10:00:00"}], [])
    A.recolectar(ejecutar=_cli(primera), existe=lambda _: True, home=str(tmp_path))
    segunda = _tabla(
        [{"id": "s1", "title": "Vieja", "url": None, "created_at": "2026-11-10T10:00:00"},
         {"id": "s2", "title": "Nueva", "url": "https://x.example/b", "created_at": "2026-11-11T10:00:00"}],
        [{"id": "n1", "title": "Idea", "preview": "Una idea"}])
    r = A.recolectar(ejecutar=_cli(segunda), existe=lambda _: True, home=str(tmp_path))
    assert r["ok"] is True
    assert {f["id"] for f in r["fichas"]} == {"s2", "n1"}


def test_error_no_auth_en_un_cuaderno_se_anota_y_sigue(tmp_path):
    tabla = _tabla([], [{"id": "n1", "title": "Idea", "preview": "x"}])
    tabla[("source", "list", "-n", "nb1", "--json")] = SimpleNamespace(returncode=1, stdout="", stderr="timeout de red")
    r = A.recolectar(ejecutar=_cli(tabla), existe=lambda _: True, home=str(tmp_path))
    assert r["ok"] is True
    assert [f["id"] for f in r["fichas"]] == ["n1"]
    assert r["errores"]


def test_dos_perfiles_se_leen_por_separado(tmp_path):
    def ejecutar(cmd, **_):
        clave = tuple(cmd[3:])
        perfil = cmd[2]
        if clave == ("list", "--json"):
            return _ok({"notebooks": [{"id": "nb-" + perfil, "title": perfil}], "count": 1})
        if clave[0] == "source":
            return _ok({"sources": [{"id": "s-%s" % perfil, "title": "Fuente", "url": None,
                                     "created_at": "2026-11-11T10:00:00"}], "count": 1})
        return _ok({"notes": [], "count": 0})

    r = A.recolectar(ejecutar=ejecutar, existe=lambda _: True, home=str(tmp_path))
    assert r["ok"] is True
    assert {f["perfil"] for f in r["fichas"]} == {"default", "fundacion"}
    assert {f["cuenta"] for f in r["fichas"]} == set(A.CORREOS.values())
