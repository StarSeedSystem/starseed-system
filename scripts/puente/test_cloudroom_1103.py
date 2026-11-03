# -*- coding: utf-8 -*-
"""Ola 1103 · H: Cloudroom con la Mac cargada sigue siendo un medio usable."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import medio_cloudroom as MC  # noqa: E402


def test_status_local_lento_pero_cuenta_lista_es_usable():
    nube = {"ready": True, "account": {"id": "x"}}
    m = MC.interpretar(None, nube, {"count": 3}, ("TimeoutExpired", None))
    assert m["estado"] == "usable", m


def test_sin_cuenta_ni_local_sigue_no_disponible():
    assert MC.interpretar(None, None, None, ("TimeoutExpired", "TimeoutExpired"))["estado"] == "no_disponible"


def test_tope_de_la_cli():
    assert MC.TOPE_CLI_S >= 30
