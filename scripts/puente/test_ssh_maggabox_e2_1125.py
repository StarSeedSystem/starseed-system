#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""ALM1125E2 · ssh a la Maggabox: rutas expandidas e IPv4 en respaldo_datos.py y hermes_capacidades.py.

Comprueba el argv construido (sin red) de cada orden ssh/rsync hacia los nodos.
"""
from __future__ import annotations

import os
from typing import List

import pytest

LLAVE = os.path.expanduser("~/.ssh/starseed_nodo1")
CONOCIDOS = os.path.expanduser("~/.ssh/known_hosts_starseed_nodo")
REMOTO = "StarSeed-respaldos/datos"


def _tiene_opcion(argv: List[str], opcion: str, valor: str) -> bool:
    for i, parte in enumerate(argv):
        if parte == opcion and i + 1 < len(argv) and argv[i + 1] == valor:
            return True
    return False


def _tiene_valor(argv: List[str], valor: str) -> bool:
    return valor in argv


class TestRespaldoDatos:
    def test_ssh_maggabox_tiene_ipv4_llave_y_known_hosts(self):
        from respaldo_datos import _ssh

        argv = _ssh("maggabox", "sha256sum", f"{REMOTO}/x.gpg")
        assert _tiene_opcion(argv, "-o", "AddressFamily=inet")
        assert _tiene_opcion(argv, "-i", LLAVE)
        assert _tiene_opcion(argv, "-o", "IdentitiesOnly=yes")
        assert _tiene_opcion(argv, "-o", "UserKnownHostsFile=" + CONOCIDOS)
        assert _tiene_valor(argv, "maggasukha@starseed-nodo-1.local")
        assert _tiene_valor(argv, "BatchMode=yes") and _tiene_valor(argv, "ConnectTimeout=8")

    def test_ssh_a1_tiene_ipv4_sin_llave(self):
        from respaldo_datos import _ssh, HOST_A1

        argv = _ssh("a1", "sha256sum", f"{REMOTO}/x.gpg")
        assert _tiene_opcion(argv, "-o", "AddressFamily=inet")
        assert LLAVE not in argv
        assert CONOCIDOS not in argv
        assert _tiene_valor(argv, HOST_A1)

    def test_todas_las_ordenes_maggabox_traen_ipv4(self):
        from respaldo_datos import (
            comando_subida, comando_huella, comando_preparar,
            comando_listar, comando_borrar,
        )
        for argv in [
            comando_subida("maggabox", "/tmp/x.gpg", "x.gpg"),
            comando_huella("maggabox", "x.gpg"),
            comando_preparar("maggabox"),
            comando_listar("maggabox"),
            comando_borrar("maggabox", "x.gpg"),
        ]:
            texto = " ".join(argv)
            assert "AddressFamily=inet" in texto, argv

    def test_rsync_subida_usa_ssh_con_ipv4_y_llave(self):
        from respaldo_datos import comando_subida

        argv = comando_subida("maggabox", "/tmp/x.gpg", "x.gpg")
        assert argv[0] == "rsync"
        ssh = argv[argv.index("-e") + 1]
        assert "AddressFamily=inet" in ssh
        assert LLAVE in ssh
        assert "IdentitiesOnly=yes" in ssh
        assert "UserKnownHostsFile=" + CONOCIDOS in ssh
        assert "maggasukha@starseed-nodo-1.local:" in argv[-1]


class TestHermesCapacidades:
    def test_ssh_base_tiene_ipv4_llave_y_known_hosts(self):
        from hermes_capacidades import _ssh_base, HOST_MAGGABOX

        argv = _ssh_base()
        assert _tiene_opcion(argv, "-o", "AddressFamily=inet")
        assert _tiene_opcion(argv, "-i", LLAVE)
        assert _tiene_opcion(argv, "-o", "IdentitiesOnly=yes")
        assert _tiene_opcion(argv, "-o", "UserKnownHostsFile=" + CONOCIDOS)
        assert _tiene_valor(argv, HOST_MAGGABOX)

    def test_medir_registro_maggabox_construye_ssh_con_ipv4(self, monkeypatch):
        from hermes_capacidades import medir_registro_maggabox
        import hermes_capacidades as HC

        capturado: List[List[str]] = []

        class FakeProc:
            returncode = 0
            stdout = "123 1700000000\nenlace\n"
            stderr = ""

        def fake_run(argv, *a, **k):
            capturado.append(list(argv))
            return FakeProc()

        monkeypatch.setattr(HC.subprocess, "run", fake_run)
        medir_registro_maggabox()
        assert capturado, "no se invocó ssh"
        argv = capturado[0]
        assert _tiene_opcion(argv, "-o", "AddressFamily=inet")
        assert _tiene_opcion(argv, "-i", LLAVE)
        assert _tiene_opcion(argv, "-o", "UserKnownHostsFile=" + CONOCIDOS)


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
