# -*- coding: utf-8 -*-
"""Pruebas del motor «agy» (Antigravity CLI) con ejecutor FALSO.

Ninguna prueba llama a agy de verdad: `correr` es un falso que devuelve lo
que cada caso necesita. Verifica: éxito, vacío, cuota, tiempo agotado, sin binario.
"""

import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import motores_director as M


class FalsoCorrer:
    """`correr` falso: devuelve lo configurado para 'agy'."""

    def __init__(self, respuesta_agy=(0, '{"result": "Respuesta de agy"}')):
        self.respuesta_agy = respuesta_agy
        self.llamadas = []

    def __call__(self, orden, entrada=None, segundos=300, env=None, cwd=None):
        self.llamadas.append((list(orden), entrada, segundos, cwd))
        if orden and orden[0] == "agy":
            return self.respuesta_agy
        raise AssertionError("no se esperaba llamar a %s" % (orden[0] if orden else "vacío"))


class TestOrdenAgy(unittest.TestCase):
    """La orden que se construye para agy."""

    def test_orden_basica(self):
        orden = M.orden_agy("prompt de prueba", "gemini-3.8-flash-medium")
        self.assertEqual(orden[0], "agy")
        self.assertIn("-p", orden)
        self.assertIn("prompt de prueba", orden)
        self.assertIn("--model", orden)
        self.assertIn("gemini-3.8-flash-medium", orden)
        self.assertIn("--mode", orden)
        self.assertIn("plan", orden)
        self.assertIn("--print-timeout", orden)
        self.assertIn("--output-format", orden)
        self.assertIn("json", orden)

    def test_orden_con_sesion(self):
        orden = M.orden_agy("prompt", "gemini-3.8-flash-medium", sesion="sesion-123")
        self.assertIn("--resume", orden)
        self.assertIn("sesion-123", orden)

    def test_modelo_por_defecto(self):
        orden = M.orden_agy("prompt")
        self.assertIn("gemini-3.8-flash-medium", orden)

    def test_modelo_para_plan_largo(self):
        orden = M.orden_agy("prompt", "gemini-4-neon-medium")
        self.assertIn("gemini-4-neon-medium", orden)


class TestLeerAgy(unittest.TestCase):
    """Traducción de la salida de agy al dict común."""

    def test_json_valido(self):
        salida = json.dumps({
            "result": "Respuesta de agy",
            "session_id": "sesion-agy-1",
            "usage": {"input_tokens": 100, "output_tokens": 50},
            "total_cost_usd": 0.0,
        })
        r = M.leer_agy(salida)
        self.assertEqual(r["texto"], "Respuesta de agy")
        self.assertEqual(r["sesion"], "sesion-agy-1")
        self.assertEqual(r["tokens_entrada"], 100)
        self.assertEqual(r["tokens_salida"], 50)
        self.assertEqual(r["coste"], 0.0)
        self.assertIsNone(r["error"])

    def test_json_con_error(self):
        salida = json.dumps({
            "result": "Algo falló",
            "is_error": True,
            "session_id": "sesion-agy-1",
        })
        r = M.leer_agy(salida)
        self.assertEqual(r["error"], "Algo falló")

    def test_salida_no_json(self):
        r = M.leer_agy("texto plano sin json")
        self.assertEqual(r["texto"], "")
        self.assertIn("no es JSON", r["error"])

    def test_salida_vacia(self):
        r = M.leer_agy("")
        self.assertEqual(r["texto"], "")
        self.assertIn("no es JSON", r["error"])


class TestLlamarAgy(unittest.TestCase):
    """Llamada completa a agy con `correr` inyectado."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.raiz = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def test_exito(self):
        """agy contesta con JSON válido."""
        falso = FalsoCorrer((0, json.dumps({
            "result": "Respuesta correcta",
            "session_id": "s1",
            "usage": {"input_tokens": 10, "output_tokens": 5},
            "total_cost_usd": 0.0,
        })))
        texto, motivo, uso = M.llamar_agy("prompt", falso, cwd=str(self.raiz))
        self.assertEqual(texto, "Respuesta correcta")
        self.assertEqual(motivo, "")
        self.assertEqual(uso["tokensEntrada"], 10)
        self.assertEqual(uso["tokensSalida"], 5)
        self.assertEqual(uso["coste"], 0.0)
        self.assertEqual(len(falso.llamadas), 1)
        orden, *_ = falso.llamadas[0]
        self.assertEqual(orden[0], "agy")
        self.assertIn("--print-timeout", orden)

    def test_respuesta_vacia(self):
        """agy devuelve JSON sin resultado → fallo, pasa al siguiente motor."""
        falso = FalsoCorrer((0, json.dumps({"result": "", "session_id": "s1"})))
        texto, motivo, uso = M.llamar_agy("prompt", falso, cwd=str(self.raiz))
        self.assertIsNone(texto)
        self.assertIn("vacía", motivo.lower())
        self.assertEqual(uso, {})

    def test_tiempo_agotado(self):
        """agy supera el timeout → salida con marca [tiempo agotado]."""
        falso = FalsoCorrer((-9, "algo\n[tiempo agotado]"))
        texto, motivo, uso = M.llamar_agy("prompt", falso, cwd=str(self.raiz))
        self.assertIsNone(texto)
        self.assertIn("tiempo agotado", motivo.lower())
        self.assertEqual(uso, {})

    def test_error_cuota(self):
        """agy devuelve error de cuota/429 → fallo."""
        falso = FalsoCorrer((1, '{"error": "quota exceeded", "result": null}'))
        texto, motivo, uso = M.llamar_agy("prompt", falso, cwd=str(self.raiz))
        self.assertIsNone(texto)
        self.assertIn("cuota", motivo.lower())
        self.assertEqual(uso, {})

    def test_sin_binario(self):
        """agy no existe → OSError al lanzar."""
        def falso_falla(orden, **kw):
            if orden[0] == "agy":
                raise OSError("No such file or directory: 'agy'")
            raise AssertionError("no se esperaba %s" % orden[0])
        texto, motivo, uso = M.llamar_agy("prompt", falso_falla, cwd=str(self.raiz))
        self.assertIsNone(texto)
        self.assertIn("no se pudo lanzar", motivo.lower())
        self.assertEqual(uso, {})

    def test_stdin_devnull(self):
        """La llamada usa stdin=DEVNULL para que agy no espere entrada."""
        capturas = {}
        def falso_captura(orden, entrada=None, **kw):
            capturas["stdin"] = entrada
            return (0, json.dumps({"result": "ok", "session_id": "s1"}))
        M.llamar_agy("prompt", falso_captura, cwd=str(self.raiz))
        # subprocess.DEVNULL es un valor especial; aquí verificamos que entrada es None
        # (porque en _corren se pasa stdin=subprocess.PIPE solo si entrada no es None)
        self.assertIsNone(capturas.get("stdin"))

    def test_cwd_es_raiz_repo(self):
        """El cwd es la raíz del repo."""
        capturas = {}
        def falso_cwd(orden, cwd=None, **kw):
            capturas["cwd"] = cwd
            return (0, json.dumps({"result": "ok", "session_id": "s1"}))
        M.llamar_agy("prompt", falso_cwd, cwd=str(self.raiz))
        self.assertEqual(capturas["cwd"], str(self.raiz))

    def test_timeout_incluye_margen(self):
        """El timeout incluye SEGUNDOS_PROVEEDOR_PRESIDENTE + 15."""
        capturas = {}
        def falso_timeout(orden, segundos=None, **kw):
            capturas["segundos"] = segundos
            return (0, json.dumps({"result": "ok", "session_id": "s1"}))
        M.llamar_agy("prompt", falso_timeout, cwd=str(self.raiz))
        esperado = M.SEGUNDOS_PROVEEDOR_PRESIDENTE + 15
        self.assertEqual(capturas["segundos"], esperado)


class TestModeloPorDefecto(unittest.TestCase):
    """Selección de modelo según el tipo de prompt."""

    def test_modelo_por_defecto_es_flash_medium(self):
        self.assertEqual(M.MODELO_AGY_POR_DEFECTO, "gemini-3.8-flash-medium")

    def test_modelo_para_plan_es_neon_medium(self):
        self.assertEqual(M.MODELO_AGY_PLAN, "gemini-4-neon-medium")


if __name__ == "__main__":
    unittest.main()