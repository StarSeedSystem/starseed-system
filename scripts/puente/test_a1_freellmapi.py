#!/usr/bin/env python3
"""(2026-10-13) FreeLLMAPI en el A1: solo en local, sin claves escritas y la misma versión que la Mac."""
import os
import re
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import a1_freellmapi as F  # noqa: E402


class SoloLocalYSinClaves(unittest.TestCase):
    def test_escucha_solo_en_127(self):
        self.assertIn("export HOST=127.0.0.1", F.LANZADOR_SH)
        self.assertNotIn("0.0.0.0", F.LANZADOR_SH + F.UNIDAD_TXT)

    def test_las_claves_se_leen_del_env_y_no_se_escriben(self):
        self.assertIn('. "$HOME/.starseed/env"', F.LANZADOR_SH)
        # Ningún valor con forma de clave en el lanzador ni en la unidad.
        self.assertIsNone(re.search(r"(sk-|nvapi-|AIza|hf_)[A-Za-z0-9]{8,}", F.LANZADOR_SH + F.UNIDAD_TXT))
        self.assertNotIn("FREELLMAPI_KEY=", F.LANZADOR_SH)

    def test_servicio_acotado_y_con_su_usuario(self):
        self.assertIn("User=starseed", F.UNIDAD_TXT)
        self.assertIn("MemoryMax=1G", F.UNIDAD_TXT)
        self.assertIn("Restart=always", F.UNIDAD_TXT)

    def test_misma_version_que_la_mac(self):
        self.assertRegex(F.COMMIT, r"^[0-9a-f]{7,40}$")
        self.assertTrue(F.REPO.startswith("https://github.com/tashfeenahmed/freellmapi"))


if __name__ == "__main__":
    unittest.main()
