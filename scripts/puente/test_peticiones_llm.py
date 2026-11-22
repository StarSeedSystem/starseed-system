#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas de peticiones_llm: catálogo vivo, enrutador, salud compartida, fallback."""
import json
import os
import sys
import tempfile
import time
import unittest
import urllib.error
from datetime import datetime, timedelta
from pathlib import Path
from unittest.mock import patch, MagicMock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import peticiones_llm as PL


class PeticionesLLMTest(unittest.TestCase):
    def setUp(self):
        self.t = tempfile.TemporaryDirectory()
        self.home = Path(self.t.name) / "h"
        self.raiz = Path(self.t.name) / "r"
        self.home.mkdir(parents=True)
        self.raiz.mkdir(parents=True)
        self.salud_dir = self.raiz / "starseed_memory_root" / "salud"
        self.salud_dir.mkdir(parents=True)
        self.estado_file = self.salud_dir / "estado.json"
        self.catalogo_file = self.salud_dir / "catalogo_freellmapi.json"
        self.catalogo_or_file = self.salud_dir / "catalogo_openrouter.json"
        self.logs = []

        # Patch module constants to use test paths
        self._original_estado_def = PL.ESTADO_DEF
        self._original_catalogo_def = PL.CATALOGO_DEF
        self._original_catalogo_or_def = PL.CATALOGO_OPENROUTER_DEF
        PL.ESTADO_DEF = self.estado_file
        PL.CATALOGO_DEF = self.catalogo_file
        PL.CATALOGO_OPENROUTER_DEF = self.catalogo_or_file

    def tearDown(self):
        # Restore module constants
        PL.ESTADO_DEF = self._original_estado_def
        PL.CATALOGO_DEF = self._original_catalogo_def
        PL.CATALOGO_OPENROUTER_DEF = self._original_catalogo_or_def
        self.t.cleanup()

    def _log_fn(self, msg: str):
        self.logs.append(msg)

    def _http_get_ok(self, data: dict):
        def fn(url: str):
            return data
        return fn

    def _http_post_ok(self, response: dict):
        def fn(url: str, cuerpo: bytes, headers: dict):
            return response
        return fn

    def _http_post_sequence(self, responses: list[dict]):
        """Devuelve una función que devuelve respuestas en secuencia."""
        it = iter(responses)
        def fn(url: str, cuerpo: bytes, headers: dict):
            return next(it)
        return fn

    def _ahora_fijo(self, dt: datetime):
        return lambda: dt

    def _leer_clave_mock(self, claves: dict[str, str]):
        def fn(nombre: str):
            return claves.get(nombre)
        return fn

    # ─────────────────────────────── Catálogo FreeLLMAPI ───────────────────────────────

    def test_catalogo_freellmapi_cache_valido(self):
        """Catálogo en caché válido se devuelve sin llamar a la API."""
        ahora = datetime(2026, 11, 17, 12, 0, 0)
        catalogo = {
            "timestamp": (ahora - timedelta(minutes=10)).isoformat(),
            "modelos": ["gemini-flash", "qwen3.8-max"],
        }
        PL._escribir_atomico(self.catalogo_file, catalogo)

        modelos = PL.obtener_catalogo_freellmapi(
            self._http_get_ok({"data": [{"id": "nuevo-modelo"}]}),
            self._ahora_fijo(ahora),
            self._log_fn,
        )

        self.assertEqual(modelos, ["gemini-flash", "qwen3.8-max"])
        self.assertIn("en caché", self.logs[-1])

    def test_catalogo_freellmapi_cache_caducado_actualiza(self):
        """Catálogo caducado llama a la API y actualiza."""
        ahora = datetime(2026, 11, 17, 12, 0, 0)
        catalogo = {
            "timestamp": (ahora - timedelta(minutes=40)).isoformat(),
            "modelos": ["viejo-modelo"],
        }
        PL._escribir_atomico(self.catalogo_file, catalogo)

        modelos = PL.obtener_catalogo_freellmapi(
            self._http_get_ok({"data": [{"id": "gemini-flash"}, {"id": "qwen3.8-max"}]}),
            self._ahora_fijo(ahora),
            self._log_fn,
        )

        self.assertEqual(modelos, ["gemini-flash", "qwen3.8-max"])
        self.assertIn("actualizado", self.logs[-1])

        # Verificar que se guardó el nuevo catálogo
        guardado = PL._leer_json(self.catalogo_file)
        self.assertEqual(guardado["modelos"], ["gemini-flash", "qwen3.8-max"])

    def test_catalogo_freellmapi_filtra_auto_y_claude(self):
        """El catálogo filtra modelos 'auto' y Claude."""
        ahora = datetime(2026, 11, 17, 12, 0, 0)

        modelos = PL.obtener_catalogo_freellmapi(
            self._http_get_ok({"data": [
                {"id": "auto"},
                {"id": "claude-3-opus"},
                {"id": "Claude-3.5-Sonnet"},
                {"id": "gemini-flash"},
                {"id": "qwen3.8-max"},
            ]}),
            self._ahora_fijo(ahora),
            self._log_fn,
        )

        self.assertEqual(modelos, ["gemini-flash", "qwen3.8-max"])

    def test_catalogo_freellmapi_fallo_red_usa_cache_caducado(self):
        """Si falla la red, usa caché aunque esté caducado."""
        ahora = datetime(2026, 11, 17, 12, 0, 0)
        catalogo = {
            "timestamp": (ahora - timedelta(minutes=40)).isoformat(),
            "modelos": ["modelo-cache"],
        }
        PL._escribir_atomico(self.catalogo_file, catalogo)

        def http_get_falla(url: str):
            raise urllib.error.URLError("Connection refused")

        import urllib.error
        modelos = PL.obtener_catalogo_freellmapi(
            http_get_falla,
            self._ahora_fijo(ahora),
            self._log_fn,
        )

        self.assertEqual(modelos, ["modelo-cache"])
        self.assertIn("caducado", self.logs[-1])

    # ─────────────────────────────── Salud compartida ───────────────────────────────

    def test_registrar_exito_guarda_ultimo_exito(self):
        """registrar_exito guarda el último éxito con modelo, ruta, timestamp."""
        ahora = datetime(2026, 11, 17, 12, 0, 0)
        PL.registrar_exito("gemini-flash", PL.RUTA_FREELLM, self._ahora_fijo(ahora))

        estado = PL._leer_json(self.estado_file)
        salud = estado.get(PL.SALUD_KEY, {})
        exito = salud.get("ultimo_exito")

        self.assertIsNotNone(exito)
        self.assertEqual(exito["modelo"], "gemini-flash")
        self.assertEqual(exito["ruta"], PL.RUTA_FREELLM)
        self.assertEqual(exito["timestamp"], ahora.isoformat())

    def test_registrar_fallo_incrementa_contador(self):
        """registrar_fallo incrementa fallos consecutivos por modelo."""
        ahora = datetime(2026, 11, 17, 12, 0, 0)

        n1 = PL.registrar_fallo("gemini-flash", PL.RUTA_FREELLM, self._ahora_fijo(ahora))
        n2 = PL.registrar_fallo("gemini-flash", PL.RUTA_FREELLM, self._ahora_fijo(ahora))
        n3 = PL.registrar_fallo("qwen3.8-max", PL.RUTA_FREELLM, self._ahora_fijo(ahora))

        self.assertEqual(n1, 1)
        self.assertEqual(n2, 2)
        self.assertEqual(n3, 1)

        estado = PL._leer_json(self.estado_file)
        fallos = estado.get(PL.SALUD_KEY, {}).get("fallos_consecutivos", {})
        self.assertEqual(fallos["gemini-flash"], 2)
        self.assertEqual(fallos["qwen3.8-max"], 1)

    def test_obtener_ultimo_exito_devuelve_none_si_no_hay(self):
        """obtener_ultimo_exito devuelve None si no hay éxitos previos."""
        self.assertIsNone(PL.obtener_ultimo_exito())

    def test_modelo_con_cuota_agotada_despues_de_dos_fallos(self):
        """modelo_con_cuota_agotada retorna True tras 2 fallos consecutivos."""
        ahora = datetime(2026, 11, 17, 12, 0, 0)

        self.assertFalse(PL.modelo_con_cuota_agotada("gemini-flash"))

        PL.registrar_fallo("gemini-flash", PL.RUTA_FREELLM, self._ahora_fijo(ahora))
        self.assertFalse(PL.modelo_con_cuota_agotada("gemini-flash"))

        PL.registrar_fallo("gemini-flash", PL.RUTA_FREELLM, self._ahora_fijo(ahora))
        self.assertTrue(PL.modelo_con_cuota_agotada("gemini-flash"))

    def test_registrar_exito_limpia_fallos_consecutivos(self):
        """Un éxito limpia los fallos consecutivos de ese modelo."""
        ahora = datetime(2026, 11, 17, 12, 0, 0)

        PL.registrar_fallo("gemini-flash", PL.RUTA_FREELLM, self._ahora_fijo(ahora))
        PL.registrar_fallo("gemini-flash", PL.RUTA_FREELLM, self._ahora_fijo(ahora))
        self.assertTrue(PL.modelo_con_cuota_agotada("gemini-flash"))

        PL.registrar_exito("gemini-flash", PL.RUTA_FREELLM, self._ahora_fijo(ahora))
        self.assertFalse(PL.modelo_con_cuota_agotada("gemini-flash"))

    # ─────────────────────────────── Enrutador principal ───────────────────────────────

    def test_llm_usa_ultimo_exito_primero(self):
        """El enrutador intenta primero el último modelo exitoso."""
        ahora = datetime(2026, 11, 17, 12, 0, 0)

        # Configurar último éxito previo
        PL.registrar_exito("qwen3.8-max", PL.RUTA_FREELLM, self._ahora_fijo(ahora - timedelta(minutes=5)))

        # Mock: catálogo devuelve gemini-flash y qwen3.8-max
        # Primera llamada (qwen3.8-max) tiene éxito
        http_post = self._http_post_sequence([
            {"choices": [{"message": {"content": "Respuesta de qwen"}}], "model": "qwen3.8-max"},
        ])

        texto, modelo = PL.llm(
            [{"role": "user", "content": "Hola"}],
            http_get=self._http_get_ok({"data": [{"id": "gemini-flash"}, {"id": "qwen3.8-max"}]}),
            http_post=http_post,
            ahora_fn=self._ahora_fijo(ahora),
            leer_clave=self._leer_clave_mock({"FREELLMAPI_KEY": "test"}),
            log_fn=self._log_fn,
        )

        self.assertEqual(texto, "Respuesta de qwen")
        self.assertEqual(modelo, "qwen3.8-max")
        # Verificar que se intentó qwen3.8-max primero (último éxito)
        self.assertIn("qwen3.8-max", str(self.logs))

    def test_llm_salta_modelo_con_cuota_agotada(self):
        """El enrutador salta modelos con cuota agotada (2+ fallos)."""
        ahora = datetime(2026, 11, 17, 12, 0, 0)

        # Marcar gemini-flash como cuota agotada
        PL.registrar_fallo("gemini-flash", PL.RUTA_FREELLM, self._ahora_fijo(ahora))
        PL.registrar_fallo("gemini-flash", PL.RUTA_FREELLM, self._ahora_fijo(ahora))

        # Catálogo tiene gemini-flash y qwen3.8-max
        # gemini-flash debe saltarse, qwen3.8-max debe responder
        http_post = self._http_post_sequence([
            {"choices": [{"message": {"content": "Respuesta de qwen"}}], "model": "qwen3.8-max"},
        ])

        texto, modelo = PL.llm(
            [{"role": "user", "content": "Hola"}],
            http_get=self._http_get_ok({"data": [{"id": "gemini-flash"}, {"id": "qwen3.8-max"}]}),
            http_post=http_post,
            ahora_fn=self._ahora_fijo(ahora),
            leer_clave=self._leer_clave_mock({"FREELLMAPI_KEY": "test"}),
            log_fn=self._log_fn,
        )

        self.assertEqual(modelo, "qwen3.8-max")
        self.assertIn("Saltando gemini-flash", str(self.logs))

    def test_llm_freellmapi_falla_pasa_a_nim(self):
        """Si FreeLLMAPI falla, pasa a NIM (minimax-m3.1-flash)."""
        ahora = datetime(2026, 11, 17, 12, 0, 0)

        # FreeLLMAPI falla, NIM responde
        http_post = self._http_post_sequence([
            {"error": {"message": "Rate limit exceeded"}},  # FreeLLMAPI falla
            {"choices": [{"message": {"content": "Respuesta de NIM"}}], "model": "minimax-m3.1-flash"},  # NIM ok
        ])

        texto, modelo = PL.llm(
            [{"role": "user", "content": "Hola"}],
            http_get=self._http_get_ok({"data": [{"id": "gemini-flash"}]}),
            http_post=http_post,
            ahora_fn=self._ahora_fijo(ahora),
            leer_clave=self._leer_clave_mock({"FREELLMAPI_KEY": "test", "NIM_KEY": "test"}),
            log_fn=self._log_fn,
        )

        self.assertEqual(texto, "Respuesta de NIM")
        self.assertEqual(modelo, "minimax-m3.1-flash")
        self.assertIn("nim", str(self.logs).lower())

    def test_llm_nim_max_tokens_alto_para_razonamiento(self):
        """NIM usa max_tokens alto (>= 4000) para razonamiento."""
        ahora = datetime(2026, 11, 17, 12, 0, 0)
        capturas = []
        call_count = [0]

        def http_post_captura(url: str, cuerpo: bytes, headers: dict):
            call_count[0] += 1
            capturas.append((url, json.loads(cuerpo)))
            if call_count[0] == 1:
                # Primera llamada (FreeLLMAPI) falla
                return {"error": {"message": "Rate limit"}}
            # Segunda llamada (NIM) tiene éxito
            return {"choices": [{"message": {"content": "Ok"}}], "model": "minimax-m3.1-flash"}

        PL.llm(
            [{"role": "user", "content": "Hola"}],
            max_tokens=1500,
            http_get=self._http_get_ok({"data": [{"id": "gemini-flash"}]}),
            http_post=http_post_captura,
            ahora_fn=self._ahora_fijo(ahora),
            leer_clave=self._leer_clave_mock({"FREELLMAPI_KEY": "test", "NIM_KEY": "test"}),
            log_fn=self._log_fn,
        )

        # La llamada a NIM debe tener max_tokens >= 4000
        llamada_nim = capturas[-1][1]
        self.assertGreaterEqual(llamada_nim["max_tokens"], 4000)

    def test_llm_nunca_usa_auto_ni_claude(self):
        """El enrutador nunca usa modelos 'auto' ni Claude."""
        ahora = datetime(2026, 11, 17, 12, 0, 0)

        # Catálogo incluye auto y claude, pero deben filtrarse
        http_post = self._http_post_sequence([
            {"choices": [{"message": {"content": "Ok"}}], "model": "gemini-flash"},
        ])

        texto, modelo = PL.llm(
            [{"role": "user", "content": "Hola"}],
            http_get=self._http_get_ok({"data": [
                {"id": "auto"},
                {"id": "claude-3-opus"},
                {"id": "gemini-flash"},
            ]}),
            http_post=http_post,
            ahora_fn=self._ahora_fijo(ahora),
            leer_clave=self._leer_clave_mock({"FREELLMAPI_KEY": "test"}),
            log_fn=self._log_fn,
        )

        self.assertEqual(modelo, "gemini-flash")
        self.assertNotIn("auto", modelo.lower())
        self.assertNotIn("claude", modelo.lower())

    def test_llm_espera_despues_de_fallo(self):
        """El enrutador espera ESPERA_DESPUES_FALLO_S tras cada fallo."""
        ahora = datetime(2026, 11, 17, 12, 0, 0)
        tiempos = []

        def time_mock():
            tiempos.append(time.time())
            return time.time()

        with patch("time.sleep") as mock_sleep, \
             patch("time.time", side_effect=[1000.0, 1000.0, 1005.0, 1005.0, 1010.0]):
            # FreeLLMAPI falla, luego NIM responde
            http_post = self._http_post_sequence([
                {"error": {"message": "Rate limit"}},
                {"choices": [{"message": {"content": "NIM ok"}}], "model": "minimax-m3.1-flash"},
            ])

            PL.llm(
                [{"role": "user", "content": "Hola"}],
                http_get=self._http_get_ok({"data": [{"id": "gemini-flash"}]}),
                http_post=http_post,
                ahora_fn=self._ahora_fijo(ahora),
                leer_clave=self._leer_clave_mock({"FREELLMAPI_KEY": "test", "NIM_KEY": "test"}),
                log_fn=self._log_fn,
            )

            # Debe haber llamado a sleep al menos una vez
            self.assertTrue(mock_sleep.called)
            args = mock_sleep.call_args[0]
            self.assertEqual(args[0], PL.ESPERA_DESPUES_FALLO_S)

    # ─────────────────────────────── Fallback y escalado ───────────────────────────────

    def test_llm_con_fallback_devuelve_mensaje_si_todos_fallan(self):
        """llm_con_fallback nunca lanza, devuelve mensaje de reintento."""
        ahora = datetime(2026, 11, 17, 12, 0, 0)

        # Todas las rutas fallan
        http_post = self._http_post_sequence([
            {"error": {"message": "Rate limit"}},  # FreeLLMAPI
            {"error": {"message": "NIM down"}},    # NIM
            {"error": {"message": "OR down"}},     # OpenRouter
            {"error": {"message": "Hermes down"}}, # Hermes
        ])

        texto, modelo = PL.llm_con_fallback(
            [{"role": "user", "content": "Analiza este vídeo"}],
            http_get=self._http_get_ok({"data": [{"id": "gemini-flash"}]}),
            http_post=http_post,
            ahora_fn=self._ahora_fijo(ahora),
            leer_clave=self._leer_clave_mock({
                "FREELLMAPI_KEY": "test", "NIM_KEY": "test", "OPENROUTER_KEY": "test"
            }),
            log_fn=self._log_fn,
        )

        self.assertEqual(modelo, "reglas")
        self.assertIn("Recibido", texto)
        self.assertIn("Reintento a las", texto)
        self.assertIn("ESCALADO", str(self.logs))

    def test_mensaje_sin_modelos_formato_correcto(self):
        """mensaje_sin_modelos incluye hora de reintento en formato HH:MM."""
        ahora = datetime(2026, 11, 17, 14, 30, 0)
        msg = PL.mensaje_sin_modelos(self._ahora_fijo(ahora))

        self.assertIn("Recibido", msg)
        self.assertIn("14:35", msg)  # 5 minutos después
        self.assertIn("enrutador automático", msg)

    def test_interpretar_por_reglas_delega_a_peticiones_reglas(self):
        """interpretar_por_reglas delega a peticiones_reglas.por_reglas."""
        with patch("peticiones_reglas.por_reglas") as mock_por_reglas:
            mock_por_reglas.return_value = {"tipo": "respuesta", "artefactos": []}
            resultado = PL.interpretar_por_reglas("texto de prueba")
            self.assertEqual(resultado["tipo"], "respuesta")
            mock_por_reglas.assert_called_once_with("texto de prueba")

    # ─────────────────────────────── Regresión 2026-11-17 00:34 ───────────────────────────────

    def test_regresion_freellmapi_cuota_agotada_nim_responde(self):
        """
        Regresión: 2026-11-17 00:34
        FreeLLMAPI devuelve cuota agotada y "not found or removed upstream",
        NIM responde, así que la petición se atiende.
        """
        ahora = datetime(2026, 11, 17, 0, 34, 0)

        # Simular: catálogo tiene gemini-flash y qwen3.8-max
        # gemini-flash: cuota agotada (429 / quota exceeded)
        # qwen3.8-max: "not found or removed upstream" (404)
        # NIM minimax-m3.1-flash: responde OK
        http_post = self._http_post_sequence([
            {"error": {"message": "Quota exceeded", "code": 429}},  # gemini-flash
            {"error": {"message": "Model not found or removed upstream", "code": 404}},  # qwen3.8-max
            {"choices": [{"message": {"content": "Respuesta de NIM tras fallo FreeLLMAPI"}}], "model": "minimax-m3.1-flash"},  # NIM
        ])

        texto, modelo = PL.llm(
            [{"role": "user", "content": "Descarta lo del tema del rallador..."}],
            http_get=self._http_get_ok({"data": [{"id": "gemini-flash"}, {"id": "qwen3.8-max"}]}),
            http_post=http_post,
            ahora_fn=self._ahora_fijo(ahora),
            leer_clave=self._leer_clave_mock({"FREELLMAPI_KEY": "test", "NIM_KEY": "test"}),
            log_fn=self._log_fn,
        )

        self.assertEqual(texto, "Respuesta de NIM tras fallo FreeLLMAPI")
        self.assertEqual(modelo, "minimax-m3.1-flash")
        # Verificar que se intentó gemini-flash, luego qwen, luego NIM
        log_str = str(self.logs)
        self.assertIn("gemini-flash", log_str)
        self.assertIn("qwen3.8-max", log_str)
        self.assertIn("minimax-m3.1-flash", log_str)

    # ─────────────────────────────── OpenRouter y Hermes ───────────────────────────────

    def test_llm_openrouter_free_solo_modelos_free(self):
        """OpenRouter solo usa modelos :free."""
        ahora = datetime(2026, 11, 17, 12, 0, 0)

        # FreeLLMAPI y NIM fallan, OpenRouter responde con modelo :free
        http_post = self._http_post_sequence([
            {"error": {"message": "Rate limit"}},  # FreeLLMAPI
            {"error": {"message": "NIM down"}},    # NIM
            {"choices": [{"message": {"content": "OpenRouter ok"}}], "model": "meta-llama/llama-3.1-8b-instruct:free"},  # OpenRouter
        ])

        texto, modelo = PL.llm(
            [{"role": "user", "content": "Hola"}],
            http_get=self._http_get_ok({"data": [{"id": "gemini-flash"}]}),
            http_post=http_post,
            ahora_fn=self._ahora_fijo(ahora),
            leer_clave=self._leer_clave_mock({"FREELLMAPI_KEY": "test", "NIM_KEY": "test", "OPENROUTER_KEY": "test"}),
            log_fn=self._log_fn,
        )

        self.assertEqual(modelo, "meta-llama/llama-3.1-8b-instruct:free")
        self.assertIn(":free", modelo)

    def test_llm_hermes_si_vive(self):
        """Hermes se usa si está vivo (puerto 3011)."""
        ahora = datetime(2026, 11, 17, 12, 0, 0)

        # Todo falla menos Hermes
        http_post = self._http_post_sequence([
            {"error": {"message": "Rate limit"}},  # FreeLLMAPI
            {"error": {"message": "NIM down"}},    # NIM
            {"error": {"message": "OR down"}},     # OpenRouter
            {"choices": [{"message": {"content": "Hermes ok"}}], "model": "hermes"},  # Hermes
        ])

        texto, modelo = PL.llm(
            [{"role": "user", "content": "Hola"}],
            http_get=self._http_get_ok({"data": [{"id": "gemini-flash"}]}),
            http_post=http_post,
            ahora_fn=self._ahora_fijo(ahora),
            leer_clave=self._leer_clave_mock({"FREELLMAPI_KEY": "test", "NIM_KEY": "test", "OPENROUTER_KEY": "test"}),
            log_fn=self._log_fn,
        )

        self.assertEqual(modelo, "hermes")

    # ─────────────────────────────── OpenRouter catálogo vivo ───────────────────────────────

    def test_catalogo_openrouter_cache_valido(self):
        """Catálogo OpenRouter en caché válido se devuelve sin llamar a la API."""
        ahora = datetime(2026, 11, 17, 12, 0, 0)
        catalogo = {
            "timestamp": (ahora - timedelta(hours=2)).isoformat(),
            "modelos": ["meta-llama/llama-3.1-8b-instruct:free", "google/gemma-2-9b-it:free"],
        }
        PL._escribir_atomico(PL.CATALOGO_OPENROUTER_DEF, catalogo)

        modelos = PL.obtener_catalogo_openrouter(
            self._http_get_ok({"data": [{"id": "nuevo-modelo:free"}]}),
            self._ahora_fijo(ahora),
            self._log_fn,
        )

        self.assertEqual(modelos, ["meta-llama/llama-3.1-8b-instruct:free", "google/gemma-2-9b-it:free"])
        self.assertIn("en caché", self.logs[-1])

    def test_catalogo_openrouter_cache_caducado_actualiza(self):
        """Catálogo OpenRouter caducado llama a la API y actualiza."""
        ahora = datetime(2026, 11, 17, 12, 0, 0)
        catalogo = {
            "timestamp": (ahora - timedelta(hours=10)).isoformat(),
            "modelos": ["viejo-modelo:free"],
        }
        PL._escribir_atomico(PL.CATALOGO_OPENROUTER_DEF, catalogo)

        modelos = PL.obtener_catalogo_openrouter(
            self._http_get_ok({"data": [
                {"id": "meta-llama/llama-3.1-8b-instruct:free", "context_length": 8192},
                {"id": "google/gemma-2-9b-it:free", "context_length": 8192},
                {"id": "modelo-de-pago", "context_length": 4096},
            ]}),
            self._ahora_fijo(ahora),
            self._log_fn,
        )

        self.assertEqual(modelos, ["meta-llama/llama-3.1-8b-instruct:free", "google/gemma-2-9b-it:free"])
        self.assertIn("actualizado", self.logs[-1])

        guardado = PL._leer_json(PL.CATALOGO_OPENROUTER_DEF)
        self.assertEqual(guardado["modelos"], ["meta-llama/llama-3.1-8b-instruct:free", "google/gemma-2-9b-it:free"])

    def test_catalogo_openrouter_filtra_solo_free_y_chat(self):
        """El catálogo OpenRouter filtra solo modelos :free que aceptan chat."""
        ahora = datetime(2026, 11, 17, 12, 0, 0)

        modelos = PL.obtener_catalogo_openrouter(
            self._http_get_ok({"data": [
                {"id": "meta-llama/llama-3.1-8b-instruct:free", "context_length": 8192},
                {"id": "google/gemma-2-9b-it:free", "context_length": 8192},
                {"id": "modelo-de-pago", "context_length": 4096},
                {"id": "otro-free:free", "context_length": 2048},
                {"id": "solo-embedding:free", "context_length": 512},  # sin chat
            ]}),
            self._ahora_fijo(ahora),
            self._log_fn,
        )

        # Solo modelos :free
        for m in modelos:
            self.assertTrue(m.endswith(":free"))
        self.assertIn("meta-llama/llama-3.1-8b-instruct:free", modelos)
        self.assertIn("google/gemma-2-9b-it:free", modelos)
        self.assertIn("otro-free:free", modelos)
        self.assertNotIn("modelo-de-pago", modelos)

    def test_catalogo_openrouter_fallo_red_usa_cache_caducado(self):
        """Si falla la red, usa caché aunque esté caducado."""
        ahora = datetime(2026, 11, 17, 12, 0, 0)
        catalogo = {
            "timestamp": (ahora - timedelta(hours=10)).isoformat(),
            "modelos": ["modelo-cache:free"],
        }
        PL._escribir_atomico(PL.CATALOGO_OPENROUTER_DEF, catalogo)

        def http_get_falla(url: str):
            raise urllib.error.URLError("Connection refused")

        modelos = PL.obtener_catalogo_openrouter(
            http_get_falla,
            self._ahora_fijo(ahora),
            self._log_fn,
        )

        self.assertEqual(modelos, ["modelo-cache:free"])
        self.assertIn("caducado", self.logs[-1])

    def test_catalogo_openrouter_sin_cache_ni_red_devuelve_vacio(self):
        """Sin caché y sin red, devuelve lista vacía."""
        ahora = datetime(2026, 11, 17, 12, 0, 0)

        def http_get_falla(url: str):
            raise urllib.error.URLError("Connection refused")

        modelos = PL.obtener_catalogo_openrouter(
            http_get_falla,
            self._ahora_fijo(ahora),
            self._log_fn,
        )

        self.assertEqual(modelos, [])

    # ─────────────────────────────── Salud de rutas (3 fallos = 30 min) ───────────────────────────────

    def test_ruta_tres_fallos_salta_30_min(self):
        """Una ruta con 3 fallos consecutivos se salta 30 minutos."""
        ahora = datetime(2026, 11, 17, 12, 0, 0)

        # Registrar 3 fallos para OpenRouter
        for _ in range(3):
            PL.registrar_fallo_ruta(PL.RUTA_OPENROUTER, self._ahora_fijo(ahora))

        # Debe estar saltada
        self.assertTrue(PL.ruta_saltada(PL.RUTA_OPENROUTER, self._ahora_fijo(ahora)))

        # Después de 31 minutos, ya no está saltada
        despues = datetime(2026, 11, 17, 12, 31, 0)
        self.assertFalse(PL.ruta_saltada(PL.RUTA_OPENROUTER, self._ahora_fijo(despues)))

    def test_ruta_dos_fallos_no_salta(self):
        """Una ruta con 2 fallos NO se salta."""
        ahora = datetime(2026, 11, 17, 12, 0, 0)

        PL.registrar_fallo_ruta(PL.RUTA_OPENROUTER, self._ahora_fijo(ahora))
        PL.registrar_fallo_ruta(PL.RUTA_OPENROUTER, self._ahora_fijo(ahora))

        self.assertFalse(PL.ruta_saltada(PL.RUTA_OPENROUTER, self._ahora_fijo(ahora)))

    def test_exito_ruta_limpia_fallos(self):
        """Un éxito en una ruta limpia sus fallos consecutivos."""
        ahora = datetime(2026, 11, 17, 12, 0, 0)

        PL.registrar_fallo_ruta(PL.RUTA_OPENROUTER, self._ahora_fijo(ahora))
        PL.registrar_fallo_ruta(PL.RUTA_OPENROUTER, self._ahora_fijo(ahora))
        PL.registrar_fallo_ruta(PL.RUTA_OPENROUTER, self._ahora_fijo(ahora))
        self.assertTrue(PL.ruta_saltada(PL.RUTA_OPENROUTER, self._ahora_fijo(ahora)))

        PL.registrar_exito_ruta(PL.RUTA_OPENROUTER, self._ahora_fijo(ahora))
        self.assertFalse(PL.ruta_saltada(PL.RUTA_OPENROUTER, self._ahora_fijo(ahora)))

    # ─────────────────────────────── Ordenación por salud reciente ───────────────────────────────

    def test_orden_rutas_por_salud_reciente(self):
        """Las rutas se ordenan por salud reciente: la que respondió va primero."""
        ahora = datetime(2026, 11, 17, 12, 0, 0)

        # Registrar éxito reciente en NIM
        PL.registrar_exito_ruta(PL.RUTA_NIM, self._ahora_fijo(ahora - timedelta(minutes=5)))

        # Registrar éxito más antiguo en FreeLLMAPI
        PL.registrar_exito_ruta(PL.RUTA_FREELLM, self._ahora_fijo(ahora - timedelta(minutes=30)))

        orden = PL.obtener_orden_rutas_por_salud(self._ahora_fijo(ahora))

        # NIM debe ir antes que FreeLLMAPI
        idx_nim = orden.index(PL.RUTA_NIM)
        idx_freellm = orden.index(PL.RUTA_FREELLM)
        self.assertLess(idx_nim, idx_freellm)

    def test_orden_rutas_sin_salud_usando_orden_defecto(self):
        """Sin salud previa, usa orden por defecto: FreeLLMAPI, NIM, OpenRouter, Hermes."""
        ahora = datetime(2026, 11, 17, 12, 0, 0)

        orden = PL.obtener_orden_rutas_por_salud(self._ahora_fijo(ahora))

        self.assertEqual(orden[0], PL.RUTA_FREELLM)
        self.assertEqual(orden[1], PL.RUTA_NIM)
        self.assertEqual(orden[2], PL.RUTA_OPENROUTER)
        self.assertEqual(orden[3], PL.RUTA_HERMES)

    def test_orden_rutas_salta_rutas_con_penalizacion(self):
        """Rutas con penalización (3 fallos) van al final."""
        ahora = datetime(2026, 11, 17, 12, 0, 0)

        # Penalizar OpenRouter
        for _ in range(3):
            PL.registrar_fallo_ruta(PL.RUTA_OPENROUTER, self._ahora_fijo(ahora))

        orden = PL.obtener_orden_rutas_por_salud(self._ahora_fijo(ahora))

        # OpenRouter debe ir al final
        self.assertEqual(orden[-1], PL.RUTA_OPENROUTER)

    # ─────────────────────────────── Inyectabilidad de E/S ───────────────────────────────

    def test_llm_accepts_injected_io(self):
        """llm acepta funciones de E/S inyectadas para pruebas."""
        ahora = datetime(2026, 11, 17, 12, 0, 0)
        http_get_called = []
        http_post_called = []

        def http_get_mock(url: str):
            http_get_called.append(url)
            return {"data": [{"id": "test-model"}]}

        def http_post_mock(url: str, cuerpo: bytes, headers: dict):
            http_post_called.append((url, json.loads(cuerpo)))
            return {"choices": [{"message": {"content": "Injected OK"}}], "model": "test-model"}

        texto, modelo = PL.llm(
            [{"role": "user", "content": "Test"}],
            http_get=http_get_mock,
            http_post=http_post_mock,
            ahora_fn=self._ahora_fijo(ahora),
            leer_clave=lambda _: "test",
            log_fn=self._log_fn,
        )

        self.assertEqual(texto, "Injected OK")
        self.assertEqual(len(http_get_called), 1)
        self.assertEqual(len(http_post_called), 1)

    # ─────────────────────────────── CLI ───────────────────────────────

    def test_cli_catalogo(self):
        """CLI catalogo muestra modelos."""
        from io import StringIO
        import sys

        old_stdout = sys.stdout
        sys.stdout = StringIO()
        try:
            with patch("peticiones_llm.obtener_catalogo_freellmapi", return_value=["m1", "m2"]):
                PL.main(["catalogo"])
            output = sys.stdout.getvalue()
            self.assertIn("m1", output)
            self.assertIn("m2", output)
        finally:
            sys.stdout = old_stdout

    def test_cli_salud(self):
        """CLI salud muestra estado agregado."""
        from io import StringIO
        import sys

        PL.registrar_exito("test-model", PL.RUTA_FREELLM, datetime.now)

        old_stdout = sys.stdout
        sys.stdout = StringIO()
        try:
            with patch("peticiones_llm.ESTADO_DEF", self.estado_file):
                PL.main(["salud"])
            output = sys.stdout.getvalue()
            self.assertIn("test-model", output)
        finally:
            sys.stdout = old_stdout


if __name__ == "__main__":
    unittest.main()