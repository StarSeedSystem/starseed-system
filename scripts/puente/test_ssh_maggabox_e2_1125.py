# -*- coding: utf-8 -*-
"""Pruebas herméticas de las órdenes SSH hacia la Maggabox (ALM1125E2)."""
import os
import shlex
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import hermes_capacidades as H  # noqa: E402
import respaldo_datos as R  # noqa: E402

LLAVE = os.path.expanduser("~/.ssh/starseed_nodo1")
KNOWN_HOSTS = os.path.expanduser("~/.ssh/known_hosts_starseed_nodo")


def test_respaldo_orden_maggabox_usa_ipv4_y_rutas_expandidas():
    argv = R.comando_huella("maggabox", "datos-os-2026-11-25.gpg")

    assert "AddressFamily=inet" in argv
    assert argv[argv.index("-i") + 1] == LLAVE
    assert "IdentitiesOnly=yes" in argv
    assert "UserKnownHostsFile=" + KNOWN_HOSTS in argv
    assert "$HOME" not in " ".join(argv)
    assert "~/" not in " ".join(argv)


def test_respaldo_transporte_rsync_usa_ipv4_y_rutas_expandidas():
    argv = R.comando_subida("maggabox", "/tmp/datos.gpg", "datos-os-2026-11-25.gpg")
    transporte = argv[argv.index("-e") + 1]
    opciones = shlex.split(transporte)

    assert "AddressFamily=inet" in opciones
    assert opciones[opciones.index("-i") + 1] == LLAVE
    assert "IdentitiesOnly=yes" in opciones
    assert "UserKnownHostsFile=" + KNOWN_HOSTS in opciones
    assert "$HOME" not in transporte
    assert "~/" not in transporte


def test_respaldo_otro_host_usa_ipv4_sin_llave_del_nodo(monkeypatch):
    monkeypatch.setattr(R, "HOST_MAGGABOX", "maggasukha@otro-nodo.local")

    argv = R.comando_huella("maggabox", "datos-os-2026-11-25.gpg")

    assert "AddressFamily=inet" in argv
    assert "-i" not in argv
    assert "IdentitiesOnly=yes" not in argv
    assert "UserKnownHostsFile=" not in " ".join(argv)


def test_hermes_orden_maggabox_usa_ipv4_y_rutas_expandidas(monkeypatch):
    capturada = {}

    def ejecutar(argv, **_kwargs):
        capturada["argv"] = argv
        return H.subprocess.CompletedProcess(argv, 0, stdout="SIN", stderr="")

    monkeypatch.setattr(H.subprocess, "run", ejecutar)
    H.medir_registro_maggabox()

    argv = capturada["argv"]
    base = argv[:argv.index(H.HOST_MAGGABOX)]
    assert "AddressFamily=inet" in base
    assert base[base.index("-i") + 1] == LLAVE
    assert "IdentitiesOnly=yes" in base
    assert "UserKnownHostsFile=" + KNOWN_HOSTS in base
    assert "$HOME" not in " ".join(base)
    assert "~/" not in " ".join(base)
