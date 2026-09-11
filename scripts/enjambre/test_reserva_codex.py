"""La suscripción no habilita escritores automáticamente."""
import os
import unittest
from unittest.mock import patch
from test_progreso_irreversible import enjambre


class ReservaCodexTest(unittest.TestCase):
    def test_por_defecto_no_anuncia_capacidad(self):
        with patch.dict(os.environ, {}, clear=True):
            self.assertFalse(enjambre.codex_disponible())

    def test_tampoco_ejecuta_una_peticion_directa(self):
        with patch.dict(os.environ, {}, clear=True):
            codigo, _ = enjambre.escribir_con_codex("", "codex/prueba", ".", "")
            self.assertEqual(codigo, 126)

    def test_opt_in_aun_exige_binario(self):
        with patch.dict(os.environ, {"STARSEED_CODEX_ESCRITOR": "1"}), patch.object(enjambre, "ruta_codex", return_value=None):
            self.assertFalse(enjambre.codex_disponible())


if __name__ == "__main__":
    unittest.main()
