"""Codex escribe si la máquina puede; el interruptor solo sirve para apagarlo.

CAMBIO DELIBERADO (2026-09-16). Estas pruebas defendían lo contrario: que la
suscripción de ChatGPT no habilitara escritores por sí sola, con
`STARSEED_CODEX_ESCRITOR=1` como opt-in. La idea era prudente, pero el resultado
en la práctica fue que esa variable no se puso NUNCA en ningún sitio permanente
—ni en los plist de launchd, ni en `~/.starseed/env`, ni en el lanzamiento del
Mando— y desde la ola 296, que construyó la integración y la dejó verificada,
todos los orquestadores arrancaron con Codex apagado.

O sea: una capacidad de escritura de coste cero, viva y funcionando
(`codex exec -m gpt-5.6-sol` responde), sin usarse durante semanas, mientras la
flota gratuita tardaba veinte minutos por archivo.

Ahora manda lo que de verdad importa —que el binario exista y que la sesión
guardada sea la de ChatGPT— y `STARSEED_CODEX_ESCRITOR=0` lo apaga a mano.
"""
import os
import unittest
from unittest import mock
from unittest.mock import patch
from test_progreso_irreversible import enjambre


class ReservaCodexTest(unittest.TestCase):
    def test_con_binario_y_sesion_de_chatgpt_esta_disponible_sin_tocar_nada(self):
        with patch.dict(os.environ, {}, clear=True), patch.object(
            enjambre, "ruta_codex", return_value="/Users/alex/.local/bin/codex"
        ), patch("builtins.open", mock.mock_open(read_data='{"auth_mode": "chatgpt"}')):
            self.assertTrue(enjambre.codex_disponible())

    def test_el_interruptor_en_cero_lo_apaga(self):
        for apagado in ("0", "no", "false", "FALSE", " 0 "):
            with patch.dict(os.environ, {"STARSEED_CODEX_ESCRITOR": apagado}, clear=True):
                self.assertFalse(enjambre.codex_disponible(), apagado)

    def test_apagado_tampoco_ejecuta_una_peticion_directa(self):
        with patch.dict(os.environ, {"STARSEED_CODEX_ESCRITOR": "0"}, clear=True):
            codigo, motivo = enjambre.escribir_con_codex("", "codex/prueba", ".", "")
            self.assertEqual(codigo, 126)
            self.assertIn("STARSEED_CODEX_ESCRITOR", motivo)

    def test_sin_binario_no_esta_disponible_aunque_no_se_apague(self):
        # En la nube no hay `codex`: ahí sigue sin existir, diga lo que diga el entorno.
        with patch.dict(os.environ, {}, clear=True), patch.object(
            enjambre, "ruta_codex", return_value=None
        ):
            self.assertFalse(enjambre.codex_disponible())

    def test_una_sesion_que_no_sea_de_chatgpt_no_vale(self):
        # Con `auth_mode: apikey` se gastarían créditos de la API de pago, que es
        # justo lo que esta integración evita.
        with patch.dict(os.environ, {}, clear=True), patch.object(
            enjambre, "ruta_codex", return_value="/Users/alex/.local/bin/codex"
        ), patch("builtins.open", mock.mock_open(read_data='{"auth_mode": "apikey"}')):
            self.assertFalse(enjambre.codex_disponible())


if __name__ == "__main__":
    unittest.main()
