"""Listar modelos no demuestra cuota disponible para generar."""
import unittest
from unittest.mock import MagicMock, patch
from test_progreso_irreversible import enjambre


class SondaReservaTest(unittest.TestCase):
    def test_catalogo_accesible_no_borra_429(self):
        respuesta = MagicMock()
        with patch.object(enjambre.urllib.request, "urlopen", return_value=respuesta), patch.object(enjambre, "_liberar_429") as liberar:
            self.assertTrue(enjambre._sonda_ligera("xkiro", (), {"valor": "prueba"}))
            liberar.assert_not_called()


if __name__ == "__main__":
    unittest.main()
