# -*- coding: utf-8 -*-
"""La regla de compilación tiene que llegar a los cuatro IDE, no solo al documento."""
import importlib.util
import os
import tempfile
import unittest
from unittest import mock

_RUTA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "sincronizar-ides.py")
_ESPEC = importlib.util.spec_from_file_location("sincronizar_ides_en_prueba", _RUTA)
S = importlib.util.module_from_spec(_ESPEC)
_ESPEC.loader.exec_module(S)


class ReglaEnLosCuatro(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        parche = mock.patch.object(
            S.os.path, "expanduser",
            side_effect=lambda p: p.replace("~", self.tmp.name, 1),
        )
        parche.start()
        self.addCleanup(parche.stop)

    def _documento(self):
        with mock.patch.object(S, "api", return_value={"_error": "sin Genesis"}), \
             mock.patch.object(S, "latido", return_value=({}, 0)), \
             mock.patch.object(S, "git", return_value=""):
            return S.documento()

    def _leer(self, ruta):
        with open(ruta, encoding="utf-8") as f:
            return f.read()

    def test_la_regla_sale_en_los_cuatro(self):
        with mock.patch.object(S, "RAIZ", self.tmp.name):
            S.repartir("")
        fuentes = {
            "Claude": self._documento(),
            "Codex": self._leer(os.path.join(self.tmp.name, ".codex", "AGENTS.md")),
            "Hermes": self._leer(
                os.path.join(self.tmp.name, ".hermes", "PUENTE-DE-MANDO.md")),
            "Antigravity": self._leer(
                os.path.join(self.tmp.name, ".gemini", "antigravity", "PUENTE-DE-MANDO.md")),
        }
        claves = ("next build", "next dev", "/tmp/starseed-reconstruir.log",
                  "starseed-director", "reconstruir_mando.py --una-vez --ya", "A1")
        for ide, texto in fuentes.items():
            for clave in claves:
                self.assertIn(clave, texto, "%s no lleva %r" % (ide, clave))


if __name__ == "__main__":
    unittest.main()
