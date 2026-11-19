#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas de escritor_agy.py: funciones puras de modelo, orden y lectura de errores.

Ninguna prueba ejecuta `agy` de verdad. Se cubren:
- es_tarea_mecanica: clasificación por palabras clave
- modelo_para_tarea: selección con medidor y pausas por cuota
- orden_agy: flags correctos, sin --dangerously-skip-permissions
- leer_salida_agy: JSON, texto, errores de cuota/sesión/timeout
- es_error_cuota/sesion/tiempo: detección pura
"""
import json
import os
import sys
import tempfile
import time
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import escritor_agy as A


AHORA = 1_800_000_000.0  # epoch fijo para tests
MANIANA = AHORA + 86400


class TestEsTareaMecanica(unittest.TestCase):
    def test_mecanica_por_palabras(self):
        for titulo in ("test unitario", "actualizar readme", "corregir typo", "formato lint", "bump version"):
            self.assertTrue(A.es_tarea_mecanica({"titulo": titulo, "archivos": []}), titulo)

    def test_compleja_por_palabras(self):
        for titulo in ("nuevo endpoint api", "implementar motor", "arquitectura sistema", "refactor logica"):
            self.assertFalse(A.es_tarea_mecanica({"titulo": titulo, "archivos": []}), titulo)

    def test_archivos_también_cuentan(self):
        self.assertTrue(A.es_tarea_mecanica({"titulo": "x", "archivos": ["tests/foo.test.ts"]}))
        self.assertTrue(A.es_tarea_mecanica({"titulo": "x", "archivos": ["docs/guia.md"]}))
        self.assertFalse(A.es_tarea_mecanica({"titulo": "x", "archivos": ["src/api/nuevo.ts"]}))

    def test_por_defecto_compleja(self):
        # Sin palabras clave → compleja (prudente)
        self.assertFalse(A.es_tarea_mecanica({"titulo": "tarea genérica", "archivos": ["src/algo.ts"]}))


class TestModeloParaTarea(unittest.TestCase):
    def setUp(self):
        self.medidor_vacio = {}

    def test_mecanica_usa_barato(self):
        tarea = {"titulo": "test unitario", "archivos": []}
        self.assertEqual(A.modelo_para_tarea(tarea, self.medidor_vacio, AHORA), A.MODELO_MECANICO)

    def test_compleja_usa_caro(self):
        tarea = {"titulo": "nuevo endpoint api", "archivos": []}
        self.assertEqual(A.modelo_para_tarea(tarea, self.medidor_vacio, AHORA), A.MODELO_COMPLEJO)

    def test_pausado_barato_pasa_a_caro(self):
        medidor = {A.MODELO_MECANICO: {"pausado_hasta": MANIANA}}
        tarea = {"titulo": "test unitario", "archivos": []}
        self.assertEqual(A.modelo_para_tarea(tarea, medidor, AHORA), A.MODELO_COMPLEJO)

    def test_pausado_caro_pasa_a_barato(self):
        medidor = {A.MODELO_COMPLEJO: {"pausado_hasta": MANIANA}}
        tarea = {"titulo": "nuevo endpoint api", "archivos": []}
        self.assertEqual(A.modelo_para_tarea(tarea, medidor, AHORA), A.MODELO_MECANICO)

    def test_ambos_principales_pausados_pasa_a_fallback(self):
        medidor = {
            A.MODELO_MECANICO: {"pausado_hasta": MANIANA},
            A.MODELO_COMPLEJO: {"pausado_hasta": MANIANA},
        }
        tarea = {"titulo": "test unitario", "archivos": []}
        self.assertEqual(A.modelo_para_tarea(tarea, medidor, AHORA), A.MODELO_FALLBACK)

    def test_todos_pausados_devuelve_principal(self):
        medidor = {
            A.MODELO_MECANICO: {"pausado_hasta": MANIANA},
            A.MODELO_COMPLEJO: {"pausado_hasta": MANIANA},
            A.MODELO_FALLBACK: {"pausado_hasta": MANIANA},
        }
        tarea = {"titulo": "test unitario", "archivos": []}
        # Se devuelve el principal (mecánico) para que la rotación lo salte
        self.assertEqual(A.modelo_para_tarea(tarea, medidor, AHORA), A.MODELO_MECANICO)

    def test_pausa_expirada_no_cuenta(self):
        medidor = {A.MODELO_MECANICO: {"pausado_hasta": AHORA - 1}}  # ya pasó
        tarea = {"titulo": "test unitario", "archivos": []}
        self.assertEqual(A.modelo_para_tarea(tarea, medidor, AHORA), A.MODELO_MECANICO)


class TestOrdenAgy(unittest.TestCase):
    def test_orden_basico(self):
        orden = A.orden_agy("gemini-3.8-flash-medium", "/tmp/wt", "prompt")
        self.assertEqual(orden[0], os.path.expanduser("~/.local/bin/agy"))
        self.assertIn("-p", orden)
        self.assertIn("prompt", orden)
        self.assertIn("--mode", orden)
        self.assertIn("accept-edits", orden)
        self.assertIn("--sandbox", orden)
        self.assertIn("--add-dir", orden)
        self.assertIn("/tmp/wt", orden)
        self.assertIn("--model", orden)
        self.assertIn("gemini-3.8-flash-medium", orden)
        self.assertIn("--print-timeout", orden)
        self.assertIn("--output-format", orden)
        self.assertIn("json", orden)

    def test_nunca_dangerously_skip_permissions(self):
        orden = A.orden_agy("gemini-3.8-flash-medium", "/tmp/wt", "prompt")
        self.assertNotIn("--dangerously-skip-permissions", orden)

    def test_timeout_personalizado(self):
        orden = A.orden_agy("gemini-3.8-flash-medium", "/tmp/wt", "prompt", timeout_s=900)
        idx = orden.index("--print-timeout")
        self.assertEqual(orden[idx + 1], "900s")


class TestLeerSalidaAgy(unittest.TestCase):
    def test_exito_json_con_uso_y_modelo(self):
        salida = json.dumps({
            "response": "Hola desde Antigravity",
            "model": "gemini-3.8-flash-medium",
            "usage": {"input_tokens": 12, "output_tokens": 7}
        })
        r = A.leer_salida_agy(salida, 0)
        self.assertEqual("Hola desde Antigravity", r["texto"])
        self.assertEqual("gemini-3.8-flash-medium", r["modelo"])
        self.assertEqual((12, 7), (r["tokens_entrada"], r["tokens_salida"]))
        self.assertIsNone(r["error"])

    def test_exito_texto_plano(self):
        r = A.leer_salida_agy("Respuesta en texto con acentos: sí.", 0)
        self.assertEqual("Respuesta en texto con acentos: sí.", r["texto"])
        self.assertIsNone(r["error"])

    def test_vacio_es_fallo(self):
        r = A.leer_salida_agy("", 0)
        self.assertEqual("", r["texto"])
        self.assertIn("vacía", r["error"])

    def test_cuota_json_es_fallo(self):
        salida = json.dumps({"error": {"message": "Quota exceeded for this model"}})
        r = A.leer_salida_agy(salida, 0)
        self.assertEqual("", r["texto"])
        # El error viene del JSON tal cual; es_error_cuota lo detecta correctamente
        self.assertTrue(A.es_error_cuota(r["error"]), r["error"])

    def test_cuota_texto_es_fallo(self):
        r = A.leer_salida_agy("ERROR: Quota exceeded for today", 0)
        self.assertEqual("", r["texto"])
        self.assertIn("cuota", r["error"].lower())

    def test_sesion_caida_es_fallo(self):
        r = A.leer_salida_agy("Error: not logged in. Run agy login.", 0)
        self.assertEqual("", r["texto"])
        self.assertIn("sesión", r["error"].lower())

    def test_tiempo_agotado_rc_negativo(self):
        r = A.leer_salida_agy("\n[tiempo agotado]", -9)
        self.assertEqual("", r["texto"])
        self.assertIn("tiempo agotado", r["error"])

    def test_codigo_distinto_cero_es_fallo(self):
        r = A.leer_salida_agy("algo de texto", 1)
        self.assertEqual("", r["texto"])
        self.assertIn("código 1", r["error"])

    def test_respuesta_larga_con_palabra_cuota_no_es_fallo(self):
        largo = "La cuota es un concepto económico. " * 40  # > 600 chars
        r = A.leer_salida_agy(largo, 0)
        self.assertEqual(largo.strip(), r["texto"])
        self.assertIsNone(r["error"])

    def test_modelo_anidado_en_message(self):
        salida = json.dumps({"message": {"content": "Contenido anidado"}, "model": "gemini-4-neon-high"})
        r = A.leer_salida_agy(salida, 0)
        self.assertEqual("Contenido anidado", r["texto"])
        self.assertEqual("gemini-4-neon-high", r["modelo"])


class TestDeteccionErrores(unittest.TestCase):
    def test_es_error_cuota(self):
        for e in ("Quota exceeded", "rate limit", "429 Too Many Requests", "402 Payment Required",
                  "resource exhausted", "daily limit reached", "insufficient credits", "billing issue"):
            self.assertTrue(A.es_error_cuota(e), e)
        self.assertFalse(A.es_error_cuota("otro error"))
        self.assertFalse(A.es_error_cuota(None))
        self.assertFalse(A.es_error_cuota(""))

    def test_es_error_sesion(self):
        for e in ("not logged in", "login required", "please log in", "unauthorized",
                  "session expired", "no session", "invalid api key", "permission denied"):
            self.assertTrue(A.es_error_sesion(e), e)
        self.assertFalse(A.es_error_sesion("quota exceeded"))
        self.assertFalse(A.es_error_sesion(None))

    def test_es_error_tiempo(self):
        for e in ("tiempo agotado", "timed out", "timeout", "[tiempo agotado]"):
            self.assertTrue(A.es_error_tiempo(e), e)
        self.assertFalse(A.es_error_tiempo("quota exceeded"))
        self.assertFalse(A.es_error_tiempo(None))


class TestPrefijos(unittest.TestCase):
    def test_es_modelo_agy(self):
        self.assertTrue(A.es_modelo_agy("agy/gemini-3.8-flash-medium"))
        self.assertTrue(A.es_modelo_agy("agy/claude-sonnet-5-5-medium"))
        self.assertFalse(A.es_modelo_agy("codex/gpt-5.6-sol"))
        self.assertFalse(A.es_modelo_agy("nvidia/nemotron"))
        self.assertFalse(A.es_modelo_agy(""))

    def test_modelo_sin_prefijo(self):
        self.assertEqual("gemini-3.8-flash-medium", A.modelo_agy_sin_prefijo("agy/gemini-3.8-flash-medium"))
        self.assertEqual("claude-sonnet-5-5-medium", A.modelo_agy_sin_prefijo("agy/claude-sonnet-5-5-medium"))
        self.assertEqual("otro", A.modelo_agy_sin_prefijo("otro"))


class TestMedidor(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.ruta_original = A.RUTA_MEDIDOR
        A.RUTA_MEDIDOR = os.path.join(self.dir.name, "agy-medidor.json")

    def tearDown(self):
        A.RUTA_MEDIDOR = self.ruta_original
        self.dir.cleanup()

    def test_registrar_usa_y_pausar_modelo(self):
        A.registrar_uso("gemini-3.8-flash-medium", 10, 5, AHORA)
        # pausar
        A.pausar_modelo_por_cuota("gemini-3.8-flash-medium", AHORA)
        self.assertTrue(A.modelo_pausado("gemini-3.8-flash-medium", AHORA))
        self.assertFalse(A.modelo_pausado("gemini-3.8-flash-medium", MANIANA + 1))

    def test_estado_medidor(self):
        A.registrar_uso("gemini-3.8-flash-medium", 10, 5, AHORA)
        A.pausar_modelo_por_cuota("gemini-4-neon-high", AHORA)
        estado = A.estado_medidor()
        self.assertEqual(estado["gemini-3.8-flash-medium"]["usos"], 1)
        self.assertTrue(estado["gemini-4-neon-high"]["pausado"])
        self.assertFalse(estado["gemini-3.8-flash-medium"]["pausado"])


if __name__ == "__main__":
    unittest.main()