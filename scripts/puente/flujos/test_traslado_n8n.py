"""Traslado n8n → motor propio: los 3 eventos del export 2026-10-11 coinciden."""
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from scripts.puente.flujos import sombra  # noqa: E402

EXPORTADO = sombra.EXPORTACIONES / "2026-10-11/starseed-producci-n-puentes.json"


class TrasladoN8nTest(unittest.TestCase):
    def test_tres_eventos_coinciden(self):
        informe = sombra.comparar(EXPORTADO)
        self.assertEqual(len(informe["eventos"]), 3)
        for e in informe["eventos"]:
            self.assertTrue(e["coincide"], e)
            self.assertEqual(e["esperado"]["sha"], "sombra")
        self.assertTrue(informe["coincide"])

    def test_no_toca_el_registro_real(self):
        from scripts.puente.flujos import motor
        antes = motor.RAIZ_FLUJOS
        sombra.comparar(EXPORTADO)
        self.assertEqual(motor.RAIZ_FLUJOS, antes)


if __name__ == "__main__":
    unittest.main()
