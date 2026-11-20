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
        # El log de Google indica que la clave fue rechazada por el tipo 'Standard'
        log = """2026-11-18 10:00:00 Google Gemini rejected this API key's type. Google began rejecting legacy 'Standard' Google Cloud keys for the Gemini API on June 19, 2026
2026-11-18 10:00:01 provider=gemini"""
        ahora = datetime(2026, 11, 18, 12, 0, 0)  # 2h después del log, dentro de 24h
        rechazados = E.proveedores_con_clave_rechazada(log.splitlines(), ahora=ahora)
        self.assertIn("gemini", rechazados)  # Detecta que el log indica clave rechazada de Gemini

    def test_detecta_por_provider_en_linea_siguiente(self):
        # El patrón 'api key not valid' aparece en una línea, el provider en la siguiente
        log = """2026-11-18 10:00:00 API key not valid for this provider
2026-11-18 10:00:01 provider=openrouter"""
        ahora = datetime(2026, 11, 18, 12, 0, 0)
        rechazados = E.proveedores_con_clave_rechazada(log.splitlines(), ahora=ahora)
        self.assertIn("openrouter", rechazados)  # Detecta que el log indica clave rechazada de OpenRouter

    def test_detecta_api_key_invalid(self):
        # El patrón 'api_key_invalid' indica clave inválida
        log = """2026-11-18 10:00:00 Error: API_KEY_INVALID provider=apinex"""
        ahora = datetime(2026, 11, 18, 12, 0, 0)
        rechazados = E.proveedores_con_clave_rechazada(log.splitlines(), ahora=ahora)
        self.assertIn("apinex", rechazados)  # Detecta que el log indica clave rechazada de Apinex

    def test_detecta_permission_denied(self):
        # El patrón 'permission_denied' indica permiso denegado
        log = """2026-11-18 10:00:00 PERMISSION_DENIED: Invalid credentials provider=tokenrouter"""
        ahora = datetime(2026, 11, 18, 12, 0, 0)
        rechazados = E.proveedores_con_clave_rechazada(log.splitlines(), ahora=ahora)
        self.assertIn("tokenrouter", rechazados)  # Detecta que el log indica permiso denegado de TokenRouter

    def test_ignora_lineas_sin_patron(self):
        # Los mensajes informativos no deben ser detectados como rechazos
        log = """2026-11-18 10:00:00 INFO: Request completed successfully
2026-11-18 10:00:01 DEBUG: Cache hit"""
        rechazados = E.proveedores_con_clave_rechazada(log.splitlines())
        self.assertEqual(rechazados, set())  # Ningún proveedor debería estar en el set

    def test_solo_ultimas_300_lineas(self):
        # Sólo se examinan las últimas 300 líneas: la línea de rechazo está fuera del rango
        log = ["2026-11-18 10:00:00 Google Gemini rejected this API key's type"] + ["2026-11-18 10:00:%02d INFO: ok" % i for i in range(350)]
        ahora = datetime(2026, 11, 18, 12, 0, 0)
        rechazados = E.proveedores_con_clave_rechazada(log, ahora=ahora)
        self.assertNotIn("gemini", rechazados)  # La línea de rechazo quedó fuera de las últimas 300

    def test_normaliza_nombres_proveedor(self):
        # El nombre del proveedor debe normalizarse a 'gemini', no a 'Google Gemini'
        log = """2026-11-18 10:00:00 Google Gemini rejected this API key's type
2026-11-18 10:00:01 provider=gemini"""
        ahora = datetime(2026, 11, 18, 12, 0, 0)
        rechazados = E.proveedores_con_clave_rechazada(log.splitlines(), ahora=ahora)
        self.assertIn("gemini", rechazados)  # Normaliza 'Google Gemini' a 'gemini'
        self.assertNotIn("Google Gemini", rechazados)  # El nombre legible no debe estar en el set

    def test_cadena_pone_rechazados_al_final(self):
        # Simula estados donde gemini escribe pero está rechazado hace < 24h
        provs = {"gemini": ["gemini-3.6-flash"], "freellmapi": ["auto"]}
        estados = {"gemini": "escribe", "freellmapi": "escribe"}
        # La función cadena debe recibir el set de rechazados y ponerlos al final
        cad = E.cadena(provs, estados, rechazados={"gemini"})
        self.assertEqual(cad[-1][0], "gemini")  # Los rechazados van al final de la cadena

    def test_rechazado_no_va_por_defecto_si_menos_24h(self):
        # El primer elemento de la cadena no debe ser un proveedor rechazado hace < 24h
        provs = {"gemini": ["gemini-3.6-flash"], "freellmapi": ["auto"], "groq": ["openai/gpt-oss-20b"]}
        estados = {"gemini": "escribe", "freellmapi": "escribe", "groq": "escribe"}
        cad = E.cadena(provs, estados, rechazados={"gemini"})
        self.assertNotEqual(cad[0][0], "gemini")  # Un rechazado reciente no debe ser el primero

    def test_rechazado_viejo_mas_24h_vuelve_a_la_normalidad(self):
        # Si el rechazo fue hace > 24h, no se penaliza por la política de ventana
        ahora = datetime.now()
        hace_25h = (ahora - timedelta(hours=25)).strftime("%Y-%m-%d %H:%M:%S")
        log = """%s Google Gemini rejected this API key's type
%s provider=gemini""" % (hace_25h, hace_25h)
        rechazados = E.proveedores_con_clave_rechazada(log.splitlines(), ahora=ahora)
        self.assertNotIn("gemini", rechazados)  # Rechazos viejos no deben aparecer

    def test_reescribir_limpia_base_url_y_key_env_al_pasar_a_nativo(self):
        yaml_roto = """model:
  base_url: 'https://integrate.api.nvidia.com/v1'
  default: minimaxai/minimax-m3.1-flash
  provider: nvidia
  api_mode: chat_completions
  key_env: NVIDIA_API_KEY
providers:
  freellmapi:
    base_url: http://127.0.0.1:3001/v1
    key_env: FREELLMAPI_KEY
    models:
      auto:
        context_length: 131072
mcp_servers:
  starseed-director:
    command: python3
"""
        nuevo = E.reescribir(yaml_roto, ("gemini", "gemini-3.6-flash"), [("gemini", "gemini-3.6-flash", "escribe")])
        self.assertIn("provider: gemini", nuevo)  # Debe incluir el provider del modelo seleccionado
        self.assertIn("default: gemini-3.6-flash", nuevo)  # Debe incluir el modelo por defecto
        self.assertNotIn("base_url: 'https://integrate.api.nvidia.com/v1'", nuevo.split("providers:")[0])  # El nativo no usa base_url externo
        self.assertNotIn("key_env: NVIDIA_API_KEY", nuevo.split("providers:")[0])  # El nativo no usa key_env externo
        self.assertIn("mcp_servers:", nuevo)  # Los MCP deben conservarse

    def test_reescribir_sincroniza_base_url_y_key_env_para_proveedor_custom(self):
        yaml_base = """model:
  default: gemini-3.6-flash
  provider: gemini
  api_mode: chat_completions
providers:
  freellmapi:
    base_url: http://127.0.0.1:3001/v1
    key_env: FREELLMAPI_KEY
    models:
      auto:
        context_length: 131072
"""
        nuevo = E.reescribir(yaml_base, ("freellmapi", "auto"), [("freellmapi", "auto", "escribe")])
        cabecera = nuevo.split("providers:")[0]
        self.assertIn("provider: freellmapi", cabecera)  # Debe incluir el provider del modelo seleccionado
        self.assertIn("base_url: http://127.0.0.1:3001/v1", cabecera)  # Debe sincronizar el base_url del proveedor
        self.assertIn("key_env: FREELLMAPI_KEY", cabecera)  # Debe sincronizar el key_env del proveedor


if __name__ == "__main__":
    unittest.main()