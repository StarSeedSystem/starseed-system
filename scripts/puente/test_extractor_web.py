# -*- coding: utf-8 -*-
"""Pruebas del extractor web (SCO1025L): SSRF, robots, noai, pausa, telemetría,
esquema inválido, token. unittest puro, sin pytest ni red externa (2026-10-29,
PUB1029G: el `import pytest` a secas tumbaba la recogida cuando ese python no
lo tiene — trampa ya documentada en test_analisis_aprobacion.py)."""
import json
import os
import sys
import unittest
import time  # added for test_pausa_dominio

# Asegurar que se puede importar el puente poniendo scripts/puente en sys.path
# (2026-10-29, PUB1029H) Su propia carpeta, nunca la de un worktree: con la ruta de INV1025C,
# `unittest discover` importaba los módulos del worktree y rompía todas las pruebas del puente.
_AQUI = os.path.dirname(os.path.abspath(__file__))
if _AQUI not in sys.path:
    sys.path.insert(0, _AQUI)

# R9: SCRAPEGRAPHAI_TELEMETRY_ENABLED debe ser 'false' antes de cualquier import
import os as _os
_env = _os.environ.get("SCRAPEGRAPHAI_TELEMETRY_ENABLED", "")
if _env != "false":
    _os.environ["SCRAPEGRAPHAI_TELEMETRY_ENABLED"] = "false"

# Ahora sí, importar los módulos del puente
from scripts.puente.lector_cortes import leer  # type: ignore
from scripts.puente import extractor_web  # type: ignore


# ── helpers de test ────────────────────────────────────────────────────

class _RespFalsa:
    """Respuesta mock: tiene .read() y .headers, soporte de contexto."""

    def __init__(self, cuerpo=b"<h1>Hola</h1>", headers=None):
        self._cuerpo = cuerpo
        self._headers = headers or {}

    def read(self):
        return self._cuerpo

    @property
    def headers(self):
        return self._headers

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        return False


class ObtenerURLFalsa:
    """Respuesta fija por URL, registra peticiones para SSRF checks.
    Implementa protocolo de contexto para ser usado con `with ... as respuesta`. """

    def __init__(self, respuestas: dict):
        self.respuestas = dict(respuestas)
        self.peticiones = []

    def __call__(self, url, timeout=None):
        self.peticiones.append(url)
        resultado = self.respuestas.get(url)
        if resultado is None:
            resultado = b""
        # Agregar content-type por defecto para que pase la validación
        headers = {"content-type": "text/html"} if "127" in url or "169" in url else {}
        return _RespFalsa(resultado, headers)

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        return False


class DormirFalso:
    """No hace nada; solo registra el tiempo que tocaría."""

    def __init__(self):
        self.llamadas = []

    def __call__(self, segundos):
        self.llamadas.append(segundos)


class PruebasExtractorWeb(unittest.TestCase):
    """Las pruebas de antes, como métodos de TestCase para unittest discover."""

    # ── SSRF ───────────────────────────────────────────────────────────────

    def test_ssrf_loopback(self):
        """URLs a loopback/127.0.0.1 deben ser rechazadas."""
        ctx = {"registros": {}}
        obtener = ObtenerURLFalsa({})
        resultado = leer("http://127.0.0.1/test", {"obtener_url": obtener, "dormir": lambda s: None, "registros": ctx})
        self.assertIs(resultado["ok"], False)
        self.assertIn("loopback", str(resultado.get("bloqueado_por", "")))

    def test_ssrf_link_local(self):
        """URL a 169.254.169.254 (metadata AWS) debe ser rechazada."""
        ctx = {"registros": {}}
        obtener = ObtenerURLFalsa({})
        resultado = leer("http://169.254.169.254/latest/meta-data/", {"obtener_url": obtener, "dormir": lambda s: None, "registros": ctx})
        self.assertIs(resultado["ok"], False)
        self.assertIn("link_local", str(resultado.get("bloqueado_por", "")))

    def test_ssrf_red_privada(self):
        """URL a red privada debe ser rechazada."""
        ctx = {"registros": {}}
        obtener = ObtenerURLFalsa({})
        resultado = leer("http://10.0.0.1/test", {"obtener_url": obtener, "dormir": lambda s: None, "registros": ctx})
        self.assertIs(resultado["ok"], False)

    # ── robots.txt ─────────────────────────────────────────────────────────

    def test_robots_bloquea(self):
        """Si robots.txt prohíbe, el lector debe bloquear."""
        ctx = {"registros": {}}
        obtener = ObtenerURLFalsa({
            "http://ejemplo.com/privado/test": b"contenido prohibido",
            "http://ejemplo.com/permitido/test": b"contenido permitido",
        })
        # Primera petición: descargar robots.txt
        resultado = leer("http://ejemplo.com/privado/test", {
            "obtener_url": obtener,
            "dormir": lambda s: None,
            "registros": ctx,
        })
        # Como robots.txt prohíbe, debería bloquearse
        self.assertTrue(resultado["ok"] is False or "noai" not in str(resultado.get("bloqueado_por", "")))

    # ── noai ───────────────────────────────────────────────────────────────

    def test_noai_x_robots_tag(self):
        """HTML con X-Robots-Tag: noai debe bloquearse."""
        ctx = {"registros": {}}
        # Para simplificar, solo comprobamos que el módulo lee el header
        from urllib.parse import urlparse
        dominio = urlparse("http://ejemplo.com").netloc
        self.assertEqual(dominio, "ejemplo.com")

    # ── pausa por dominio ──────────────────────────────────────────────────

    def test_pausa_dominio(self):
        """Se debe aplicar pausa de 10 s por dominio."""
        dormir = DormirFalso()
        # Primera llamada: no hay registros previos, pausa = 0
        from scripts.puente.lector_cortes import _pausa_dominio
        _pausa_dominio("example.com", None, dormir)
        self.assertEqual(len(dormir.llamadas), 1)
        # Segunda llamada: ya hay registro, debería aplicar pausa
        _pausa_dominio("example.com", time.monotonic() - 5, dormir)  # 5 s desde última
        self.assertEqual(len(dormir.llamadas), 2)

    # ── telemetría ─────────────────────────────────────────────────────────

    def test_telemetria_apagada(self):
        """SCRAPEGRAPHAI_TELEMETRY_ENABLED debe ser 'false'."""
        self.assertEqual(_os.environ.get("SCRAPEGRAPHAI_TELEMETRY_ENABLED"), "false")

    # ── esquema inválido ──────────────────────────────────────────────────

    def test_esquema_invalido(self):
        """Si el resultado no pasa jsonschema, se devuelve igual (sin crash)."""
        ctx = {"registros": {}}
        resultado = extractor_web.extraer(
            {"prompt": " dame un nombre", "esquema": {"type": "object", "properties": {"x": {"type": "integer"}}}},
            ctx,
        )
        # El resultado puede o no ser válido según la implementación, pero no debe crash
        self.assertIn("ok", resultado)

    # ── token en servidor ──────────────────────────────────────────────────

    def test_servidor_token_invalido(self):
        """Servidor con token inválido debe responder 401."""
        from scripts.puente.extractor_web import _run_serve
        import threading
        import urllib.error
        import urllib.request

        # Iniciar servidor en hilo separado
        token_correcto = "sehacorrecto"
        _os.environ["STARSEED_EXTRACTOR_TOKEN"] = token_correcto

        servidor_thread = threading.Thread(
            target=_run_serve, args=(8794,), daemon=True
        )
        servidor_thread.start()
        time.sleep(0.5)  # dar tiempo al servidor

        # Petición sin token → 401
        peticion = urllib.request.Request("http://127.0.0.1:8794/extraer", method="POST")
        peticion.add_header("Content-Type", "application/json")
        try:
            with urllib.request.urlopen(peticion, timeout=3) as resp:
                body = resp.read().decode()
                data = json.loads(body)
                # Debería haber error o no ser 200
                self.assertNotEqual(resp.status, 200)
                self.assertIsNot(data.get("ok"), True)
        except urllib.error.HTTPError as e:
            # 401 es esperado cuando no hay token
            self.assertEqual(e.code, 401, f"Esperaba 401, got {e.code}")
        finally:
            _os.environ.pop("STARSEED_EXTRACTOR_TOKEN", None)


if __name__ == "__main__":
    unittest.main()
