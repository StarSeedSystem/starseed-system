#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""ALM1125E3 · Opciones de ssh a la Maggabox: IPv4 y rutas expandidas.

Pruebas puras: no abren red, no ejecutan ssh ni tocan archivos reales de la Mac.
"""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import captura_aparatos as CA  # noqa: E402
import pruebas_malla as PM  # noqa: E402


class TestCapturaAparatos:
    def test_opciones_llevan_ipv4(self):
        assert "AddressFamily=inet" in CA.opciones_ssh()

    def test_las_rutas_del_host_van_expandidas(self):
        opciones = CA.opciones_ssh(casa="/tmp/casa")
        texto = " ".join(opciones)
        assert "~" not in texto and "$HOME" not in texto
        assert "UserKnownHostsFile=/tmp/casa/.ssh/known_hosts_starseed_nodo" in opciones

    def test_ssh_lleva_ipv4_y_la_clave_expandida(self):
        argv = CA.comando_ssh("true", casa="/tmp/casa")
        assert argv[0] == "ssh"
        assert "AddressFamily=inet" in argv
        assert "/tmp/casa/.ssh/starseed_nodo1" in argv
        assert argv[-1] == "true"

    def test_scp_lleva_ipv4(self):
        argv = CA.comando_scp("origen", "destino", casa="/tmp/casa")
        assert argv[0] == "scp" and "AddressFamily=inet" in argv


class TestPruebasMalla:
    def test_opciones_llevan_ipv4_y_rutas_expandidas(self):
        opciones = PM.opciones_ssh(casa="/tmp/casa")
        assert "AddressFamily=inet" in opciones
        assert "UserKnownHostsFile=/tmp/casa/.ssh/known_hosts_starseed_nodo" in opciones

    def test_ssh_lleva_ipv4_y_la_clave_expandida(self):
        argv = PM.comando_ssh("true", casa="/tmp/casa")
        assert "AddressFamily=inet" in argv
        assert "/tmp/casa/.ssh/starseed_nodo1" in argv
        assert argv[-1] == "true"

    def test_ruta_de_logs_la_expande_el_shell_del_nodo(self):
        assert PM.ruta_logs_maggabox() == "$HOME/.local/share/app.starseed.os"
