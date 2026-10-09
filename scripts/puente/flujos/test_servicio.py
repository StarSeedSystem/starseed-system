"""Pruebas del servicio de Flujos: bucle con dobles."""
import unittest
from unittest.mock import patch, MagicMock

from scripts.puente.flujos.modelo import Flujo, Nodo
from scripts.puente.flujos.servicio import _ejecutar_pares, _avisar_fallo

class ServicioTest(unittest.TestCase):
    def test_avisar_fallo_no_lanza(self):
        # (2026-10-08) Sin este parche llamaba a la `publicar` de verdad y el Chat Director de
        # Alex recibió «Flujo falló: f1 · Ejecución: e1 · Error: error» desde una prueba.
        with patch("scripts.puente.director_chat.publicar") as publicar_mock:
            _avisar_fallo("f1", "e1", "error")
        publicar_mock.assert_called_once()
        texto = publicar_mock.call_args.args[0]
        self.assertIn("Flujo falló: f1", texto)
        self.assertEqual(publicar_mock.call_args.kwargs["de"], "flujos-servicio")

    def test_avisar_fallo_traga_el_error_del_chat(self):
        with patch("scripts.puente.director_chat.publicar", side_effect=RuntimeError("sin chat")):
            _avisar_fallo("f1", "e1", "error")  # no lanza

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

class ArranqueComoScriptTest(unittest.TestCase):
    def test_launchd_lo_lanza_como_script_y_arranca(self):
        # launchd ejecuta `python3 …/flujos/servicio.py`, sin `-m`: con imports relativos
        # sin arreglo moría con ImportError y quedaba en bucle de caídas (2026-10-08).
        import os
        import subprocess
        import sys
        ruta = os.path.join(os.path.dirname(os.path.abspath(__file__)), "servicio.py")
        r = subprocess.run([sys.executable, ruta, "--comprobar"], capture_output=True, text=True,
                           timeout=60, cwd="/")
        self.assertEqual(r.returncode, 0, r.stderr[-800:])
        self.assertIn("flujos: listo", r.stdout)


if __name__ == "__main__":
    unittest.main()
