"""HER1118G: detecta proveedores con clave rechazada en gateway.error.log y los manda al final."""
import importlib.util
import os
import unittest
from datetime import datetime, timedelta

_r = os.path.join(os.path.dirname(os.path.abspath(__file__)), "enrutar-hermes.py")
_s = importlib.util.spec_from_file_location("enrutar_hermes", _r)
E = importlib.util.module_from_spec(_s)
_s.loader.exec_module(E)


class Rechazados(unittest.TestCase):
    def test_detecta_google_gemini_rechazado(self):
        log = """2026-11-18 10:00:00 Google Gemini rejected this API key's type. Google began rejecting legacy 'Standard' Google Cloud keys for the Gemini API on June 19, 2026
2026-11-18 10:00:01 provider=gemini"""
        rechazados = E.proveedores_con_clave_rechazada(log.splitlines())
        self.assertIn("gemini", rechazados)

    def test_detecta_por_provider_en_linea_siguiente(self):
        log = """2026-11-18 10:00:00 API key not valid for this provider
2026-11-18 10:00:01 provider=openrouter"""
        rechazados = E.proveedores_con_clave_rechazada(log.splitlines())
        self.assertIn("openrouter", rechazados)

    def test_detecta_api_key_invalid(self):
        log = """2026-11-18 10:00:00 Error: API_KEY_INVALID provider=apinex"""
        rechazados = E.proveedores_con_clave_rechazada(log.splitlines())
        self.assertIn("apinex", rechazados)

    def test_detecta_permission_denied(self):
        log = """2026-11-18 10:00:00 PERMISSION_DENIED: Invalid credentials provider=tokenrouter"""
        rechazados = E.proveedores_con_clave_rechazada(log.splitlines())
        self.assertIn("tokenrouter", rechazados)

    def test_ignora_lineas_sin_patron(self):
        log = """2026-11-18 10:00:00 INFO: Request completed successfully
2026-11-18 10:00:01 DEBUG: Cache hit"""
        rechazados = E.proveedores_con_clave_rechazada(log.splitlines())
        self.assertEqual(rechazados, set())

    def test_solo_ultimas_300_lineas(self):
        log = ["2026-11-18 10:00:00 Google Gemini rejected this API key's type"] + ["2026-11-18 10:00:%02d INFO: ok" % i for i in range(350)]
        rechazados = E.proveedores_con_clave_rechazada(log)
        self.assertNotIn("gemini", rechazados)  # la línea de rechazo quedó fuera de las últimas 300

    def test_normaliza_nombres_proveedor(self):
        log = """2026-11-18 10:00:00 Google Gemini rejected this API key's type
2026-11-18 10:00:01 provider=gemini"""
        rechazados = E.proveedores_con_clave_rechazada(log.splitlines())
        self.assertIn("gemini", rechazados)
        self.assertNotIn("Google Gemini", rechazados)

    def test_cadena_pone_rechazados_al_final(self):
        # Simula estados donde gemini escribe pero está rechazado hace < 24h
        provs = {"gemini": ["gemini-3.6-flash"], "freellmapi": ["auto"]}
        estados = {"gemini": "escribe", "freellmapi": "escribe"}
        # La función cadena debe recibir el set de rechazados y ponerlos al final
        cad = E.cadena(provs, estados, rechazados={"gemini"})
        self.assertEqual(cad[-1][0], "gemini")

    def test_rechazado_no_va_por_defecto_si_menos_24h(self):
        # El primer elemento de la cadena no debe ser un proveedor rechazado hace < 24h
        provs = {"gemini": ["gemini-3.6-flash"], "freellmapi": ["auto"], "groq": ["openai/gpt-oss-20b"]}
        estados = {"gemini": "escribe", "freellmapi": "escribe", "groq": "escribe"}
        cad = E.cadena(provs, estados, rechazados={"gemini"})
        self.assertNotEqual(cad[0][0], "gemini")

    def test_rechazado_viejo_mas_24h_vuelve_a_la_normalidad(self):
        # Si el rechazo fue hace > 24h, no se penaliza
        ahora = datetime.now()
        hace_25h = (ahora - timedelta(hours=25)).strftime("%Y-%m-%d %H:%M:%S")
        log = """%s Google Gemini rejected this API key's type
%s provider=gemini""" % (hace_25h, hace_25h)
        rechazados = E.proveedores_con_clave_rechazada(log.splitlines(), ahora=ahora)
        self.assertNotIn("gemini", rechazados)


if __name__ == "__main__":
    unittest.main()