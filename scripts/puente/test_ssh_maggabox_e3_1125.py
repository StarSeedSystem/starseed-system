# -*- coding: utf-8 -*-
"""ALM1125E3 · ssh a la Maggabox: rutas expandidas e IPv4 (sin red).

Comprueba que las opciones de ssh/scp hacia `starseed-nodo-1.local` llevan
`-o AddressFamily=inet` (la IPv6 de enlace local no contestaba y cada llamada
tardaba 8,5 s) y rutas locales expandidas: nunca `~` ni `$HOME` literales, que
sin shell no se expanden. No abre red ni toca archivos reales de la Mac.
"""
import os
import sys
import unittest
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import captura_aparatos as CA  # noqa: E402
import pruebas_malla as PM  # noqa: E402

HOST = "maggasukha@starseed-nodo-1.local"


def _sin_rutas_literales(opciones):
    texto = " ".join(opciones)
    assert "~" not in texto, texto
    assert "$HOME" not in texto, texto


class TestCapturaSSH(unittest.TestCase):
    def test_opciones_incluyen_ipv4(self):
        self.assertIn("AddressFamily=inet", CA.SSH_BASE)

    def test_rutas_expandidas(self):
        _sin_rutas_literales(CA.SSH_BASE)
        self.assertIn(str(Path.home() / ".ssh" / "starseed_nodo1"), CA.SSH_BASE)
        self.assertIn(
            "UserKnownHostsFile=" + str(Path.home() / ".ssh/known_hosts_starseed_nodo"),
            CA.SSH_BASE,
        )

    def test_host_destino(self):
        self.assertEqual(CA.SSH_BASE[-1], HOST)

    def test_scp_tambien_ipv4(self):
        self.assertIn("AddressFamily=inet", CA.SCP_BASE)


class TestPruebasMallaSSH(unittest.TestCase):
    def test_opciones_incluyen_ipv4(self):
        self.assertIn("AddressFamily=inet", PM.SSH_BASE)

    def test_rutas_expandidas(self):
        _sin_rutas_literales(PM.SSH_BASE)
        self.assertIn(str(PM.MAGGABOX_KEY), PM.SSH_BASE)
        self.assertIn(
            "UserKnownHostsFile=" + str(Path.home() / ".ssh/known_hosts_starseed_nodo"),
            PM.SSH_BASE,
        )

    def test_host_destino(self):
        self.assertEqual(PM.SSH_BASE[-1], HOST)


if __name__ == "__main__":
    unittest.main()