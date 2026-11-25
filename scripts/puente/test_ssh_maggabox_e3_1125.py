# -*- coding: utf-8 -*-
"""ALM1125E3 · ssh a la Maggabox: rutas expandidas e IPv4 (sin red ni archivos reales)."""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import captura_aparatos as CA  # noqa: E402
import pruebas_malla as PM  # noqa: E402

HOST = "maggasukha@starseed-nodo-1.local"


class TestSshMaggabox(unittest.TestCase):
    """Las órdenes ssh a la Maggabox llevan rutas expandidas y fuerzan IPv4."""

    def _argv(self, modulo):
        return modulo.ssh_argv("echo ok")

    def test_sin_rutas_sin_expandir(self):
        for modulo in (CA, PM):
            texto = " ".join(self._argv(modulo))
            self.assertNotIn("$HOME", texto)
            self.assertNotIn("~/", texto)

    def test_fuerza_ipv4(self):
        for modulo in (CA, PM):
            self.assertIn("AddressFamily=inet", self._argv(modulo))

    def test_clave_y_known_hosts_expandidas(self):
        for modulo in (CA, PM):
            argv = self._argv(modulo)
            self.assertIn(os.path.expanduser("~/.ssh/starseed_nodo1"), argv)
            self.assertTrue(
                any(
                    a.startswith("UserKnownHostsFile=")
                    and a.endswith("known_hosts_starseed_nodo")
                    and "~" not in a
                    for a in argv
                )
            )

    def test_host_destino_y_comando(self):
        for modulo in (CA, PM):
            argv = self._argv(modulo)
            self.assertEqual(argv[0], "ssh")
            self.assertEqual(argv[-2], HOST)
            self.assertEqual(argv[-1], "echo ok")

    def test_scp_maggabox_tambien_ipv4(self):
        argv = CA.scp_argv("origen", "destino")
        self.assertEqual(argv[0], "scp")
        self.assertIn("AddressFamily=inet", argv)
        self.assertNotIn("~", " ".join(argv))


if __name__ == "__main__":
    unittest.main()