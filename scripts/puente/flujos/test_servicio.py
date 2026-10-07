"""Pruebas del servicio de Flujos: bucle con dobles."""
import unittest
from unittest.mock import patch, MagicMock

from scripts.puente.flujos.modelo import Flujo, Nodo
from scripts.puente.flujos.servicio import _ejecutar_pares, _avisar_fallo

class ServicioTest(unittest.TestCase):
    def test_avisar_fallo_no_lanza(self):
        _avisar_fallo("f1", "e1", "error")

    def test_ejecutar_pares_llama_motor_y_avisa(self):
        flujo = Flujo(id="f1", nombre="f1", nodos=[Nodo(id="n1", tipo="log")])
        entrada = [{"k": "v"}]
        mock_res = MagicMock()
        mock_res.estado = "fallida"
        mock_res.id = "e1"
        mock_res.error = "boom"
        with patch("scripts.puente.flujos.servicio.ejecutar", return_value=mock_res) as ejec_mock:
            with patch("scripts.puente.flujos.servicio._avisar_fallo") as avisar_mock:
                _ejecutar_pares([(flujo, entrada)])
                ejec_mock.assert_called_once()
                avisar_mock.assert_called_once_with("f1", "e1", "boom")

if __name__ == "__main__":
    unittest.main()
