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
        self.logs = []

        # Patch module constants to use test paths
        self._originales = {}
        for nombre in (
            "ESTADO_DEF", "CATALOGO_DEF", "CATALOGO_OPENROUTER_DEF",
            "ULTIMO_BUENO_FREELLM_DEF", "ULTIMO_BUENO_OPENROUTER_DEF",
        ):
            self._originales[nombre] = getattr(PL, nombre)
        PL.ESTADO_DEF = self.estado_file
        PL.CATALOGO_DEF = self.catalogo_file
        PL.CATALOGO_OPENROUTER_DEF = self.salud_dir / "catalogo_openrouter_free.json"
        PL.ULTIMO_BUENO_FREELLM_DEF = self.salud_dir / "catalogo_freellmapi_ultimo_bueno.json"
        PL.ULTIMO_BUENO_OPENROUTER_DEF = self.salud_dir / "catalogo_openrouter_ultimo_bueno.json"
        dormir = patch("peticiones_llm.time.sleep")
        dormir.start()
        self.addCleanup(dormir.stop)

    def tearDown(self):
        for nombre, valor in self._originales.items():
            setattr(PL, nombre, valor)
        self.t.cleanup()

    def _log_fn(self, msg: str):
        self.logs.append(msg)

    def _http_get_ok(self, data: dict, openrouter: list | None = None):
        modelos_or = openrouter if openrouter is not None else [
            {"id": "meta-llama/llama-3.1-8b-instruct:free", "supported_endpoints": ["/v1/chat/completions"]}
        ]

        def fn(url: str):
            if "openrouter.ai" in url:
                return {"data": modelos_or}
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

    def test_modelo_con_cuota_agotada_despues_de_tres_fallos(self):
        """modelo_con_cuota_agotada retorna True tras 3 fallos consecutivos."""
        ahora = datetime(2026, 11, 17, 12, 0, 0)

        self.assertFalse(PL.modelo_con_cuota_agotada("gemini-flash"))

        PL.registrar_fallo("gemini-flash", PL.RUTA_FREELLM, self._ahora_fijo(ahora))
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
        """El enrutador salta modelos con cuota agotada (3 fallos seguidos)."""
        ahora = datetime(2026, 11, 17, 12, 0, 0)

        PL.registrar_fallo("gemini-flash", PL.RUTA_FREELLM, self._ahora_fijo(ahora))
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
        self.assertEqual(len(http_get_called), 2)
        self.assertTrue(any("127.0.0.1:3001" in u for u in http_get_called))
        self.assertTrue(any("openrouter.ai" in u for u in http_get_called))
        self.assertEqual(len(http_post_called), 1)

    # ─────────────────────────── PET1121B · catálogo vivo y salud de rutas ───────────────────────────

    def test_catalogo_openrouter_sale_del_catalogo_vivo_y_acepta_solo_chat_gratis(self):
        """El catálogo de OpenRouter sale de /api/v1/models: :free y con chat, nunca escrito a mano."""
        ahora = datetime(2026, 11, 21, 1, 11, 0)
        modelos = PL.obtener_catalogo_openrouter_free(
            self._http_get_ok({"data": []}, openrouter=[
                {"id": "openai/gpt-oss-120b:free", "supported_endpoints": ["/v1/chat/completions"]},
                {"id": "google/gemma-4-27b:free", "supported_endpoints": ["/v1/chat/completions"]},
                {"id": "algo/pago", "supported_endpoints": ["/v1/chat/completions"]},
                {"id": "otro/solo-completions:free", "supported_endpoints": ["/v1/completions"]},
                {"id": "anthropic/claude-3-opus:free", "supported_endpoints": ["/v1/chat/completions"]},
            ]),
            self._ahora_fijo(ahora),
            self._log_fn,
        )

        self.assertEqual(modelos, ["openai/gpt-oss-120b:free", "google/gemma-4-27b:free"])
        self.assertNotIn("meta-llama/llama-3.1-8b-instruct:free", modelos)
        guardado = PL._leer_json(PL.CATALOGO_OPENROUTER_DEF)
        self.assertEqual(guardado["modelos"], modelos)

    def test_catalogo_openrouter_cache_seis_horas_y_ultima_lista_buena(self):
        """Cache de 6 h; con la red caída o lista vacía se usa la última buena, nunca una lista fija."""
        ahora = datetime(2026, 11, 21, 1, 11, 0)
        buenos = ["openai/gpt-oss-120b:free"]
        PL._escribir_atomico(PL.CATALOGO_OPENROUTER_DEF, {
            "timestamp": (ahora - timedelta(hours=5)).isoformat(), "modelos": buenos,
        })
        PL._escribir_atomico(PL.ULTIMO_BUENO_OPENROUTER_DEF, {
            "timestamp": (ahora - timedelta(days=1)).isoformat(), "modelos": buenos,
        })

        sin_llamadas = self._http_get_ok({"data": []}, openrouter=[])
        self.assertEqual(
            PL.obtener_catalogo_openrouter_free(sin_llamadas, self._ahora_fijo(ahora), self._log_fn),
            buenos,
        )

        def caido(url: str):
            raise OSError("sin red")

        viejo = ahora + timedelta(hours=7)
        self.assertEqual(
            PL.obtener_catalogo_openrouter_free(caido, self._ahora_fijo(viejo), self._log_fn),
            buenos,
        )
        self.assertEqual(PL._leer_json(PL.CATALOGO_OPENROUTER_DEF)["modelos"], buenos)

    def test_catalogo_freellmapi_vacio_no_sustituye_a_la_ultima_lista_buena(self):
        """Un catálogo FreeLLMAPI con 0 modelos no se guarda como bueno: se conserva el anterior."""
        ahora = datetime(2026, 11, 21, 1, 11, 0)
        buenos = ["gemini-flash-lite", "qwen3.8-max"]
        PL._escribir_atomico(PL.CATALOGO_DEF, {
            "timestamp": (ahora - timedelta(hours=2)).isoformat(), "modelos": [],
        })
        PL._escribir_atomico(PL.ULTIMO_BUENO_FREELLM_DEF, {
            "timestamp": (ahora - timedelta(days=1)).isoformat(), "modelos": buenos,
        })

        modelos = PL.obtener_catalogo_freellmapi(
            self._http_get_ok({"data": []}), self._ahora_fijo(ahora), self._log_fn,
        )
        self.assertEqual(modelos, buenos)
        self.assertEqual(PL._leer_json(PL.CATALOGO_DEF)["modelos"], buenos)

    def test_ordenar_intentos_pone_primera_la_ruta_que_respondio_antes(self):
        """El orden lo decide la salud reciente: la última ruta que respondió va primero."""
        ahora = datetime(2026, 11, 21, 1, 11, 0)
        intentos = [
            ("gemini-flash-lite", PL.RUTA_FREELLM, None),
            ("minimax-m3.1-flash", PL.RUTA_NIM, None),
            ("openrouter", PL.RUTA_OPENROUTER, None),
            ("hermes", PL.RUTA_HERMES, None),
        ]
        salud = {PL.SALUD_KEY: {"rutas": {
            PL.RUTA_NIM: {"ultimo_exito": (ahora - timedelta(minutes=1)).isoformat()},
            PL.RUTA_FREELLM: {"ultimo_exito": (ahora - timedelta(minutes=20)).isoformat()},
        }}}

        orden = PL.ordenar_intentos(intentos, salud, ahora)
        self.assertEqual([i[1] for i in orden], [
            PL.RUTA_NIM, PL.RUTA_FREELLM, PL.RUTA_OPENROUTER, PL.RUTA_HERMES,
        ])

    def test_ordenar_intentos_salta_tres_fallos_durante_30_minutos(self):
        """Tras 3 fallos la ruta se salta 30 min y vuelve sola cuando expira el plazo."""
        ahora = datetime(2026, 11, 21, 1, 11, 0)
        intentos = [
            ("minimax-m3.1-flash", PL.RUTA_NIM, None),
            ("gemini-flash-lite", PL.RUTA_FREELLM, None),
        ]
        salud = {PL.SALUD_KEY: {"rutas": {
            PL.RUTA_NIM: {"hasta": (ahora + timedelta(minutes=10)).isoformat()},
        }}}
        self.assertEqual([i[1] for i in PL.ordenar_intentos(intentos, salud, ahora)], [PL.RUTA_FREELLM])

        salud[PL.SALUD_KEY]["rutas"][PL.RUTA_NIM]["hasta"] = (ahora - timedelta(minutes=1)).isoformat()
        self.assertEqual([i[1] for i in PL.ordenar_intentos(intentos, salud, ahora)], [
            PL.RUTA_NIM, PL.RUTA_FREELLM,
        ])

    def test_registrar_tres_fallos_pausa_la_ruta_y_la_estado_lo_cuenta(self):
        """Tres fallos consecutivos congelan la ruta 30 min y /estado puede mostrarla."""
        ahora = datetime(2026, 11, 21, 1, 11, 0)
        for modelo in ("minimax-m3.1-flash", "nemotron-3.5-lightning", "nim-otro"):
            n = PL.registrar_fallo(modelo, PL.RUTA_NIM, self._ahora_fijo(ahora))
        self.assertEqual(n, 1)
        estado = PL._leer_json(self.estado_file)
        rutas = estado[PL.SALUD_KEY]["rutas"][PL.RUTA_NIM]
        self.assertEqual(rutas["fallos"], 3)
        self.assertEqual(
            datetime.fromisoformat(rutas["hasta"]), ahora + timedelta(minutes=30),
        )
        self.assertIn(PL.RUTA_NIM, estado["detalle"]["rutas LLM"]["detalle"])

        PL.registrar_exito("minimax-m3.1-flash", PL.RUTA_NIM, self._ahora_fijo(ahora))
        self.assertNotIn("hasta", PL._leer_json(self.estado_file)[PL.SALUD_KEY]["rutas"][PL.RUTA_NIM])

    def test_llm_toma_el_modelo_openrouter_del_catalogo_vivo(self):
        """El enrutador usa el id :free que trae el catálogo vivo, no una lista antigua."""
        ahora = datetime(2026, 11, 21, 1, 11, 0)
        http_post = self._http_post_sequence([
            {"error": {"message": "sin modelo"}},
            {"error": {"message": "NIM 1 caído"}},
            {"error": {"message": "NIM 2 caído"}},
            {"choices": [{"message": {"content": "Respuesta viva"}}], "model": "nuevo/modelo-2026:free"},
        ])
        texto, modelo = PL.llm(
            [{"role": "user", "content": "Hola"}],
            http_get=self._http_get_ok(
                {"data": []},
                openrouter=[{"id": "nuevo/modelo-2026:free", "supported_endpoints": ["/v1/chat/completions"]}],
            ),
            http_post=http_post,
            ahora_fn=self._ahora_fijo(ahora),
            leer_clave=self._leer_clave_mock({"FREELLMAPI_KEY": "test", "NIM_KEY": "test", "OPENROUTER_KEY": "test"}),
            log_fn=self._log_fn,
        )
        self.assertEqual((texto, modelo), ("Respuesta viva", "nuevo/modelo-2026:free"))

    def test_llm_lee_clave_nim_de_hermes_env_cuando_el_inyector_no_la_ve(self):
        """El bot ve claves de ~/.hermes/.env aunque su inyector solo lea ~/.starseed/env."""
        ahora = datetime(2026, 11, 21, 1, 11, 0)
        env_hermes = self.home / ".hermes" / ".env"
        env_hermes.parent.mkdir(parents=True, exist_ok=True)
        env_hermes.write_text("export NVIDIA_API_KEY=nim-desde-hermes\n", encoding="utf-8")
        capturas = []

        def http_post(url: str, cuerpo: bytes, headers: dict):
            capturas.append((url, headers))
            if len(capturas) == 1:
                return {"error": {"message": "NIM caído"}}
            return {"choices": [{"message": {"content": "Ok"}}], "model": "nim-2026"}

        with patch("pathlib.Path.home", return_value=self.home), \
             patch("entorno.leer_clave", return_value=""), \
             patch("entorno._CACHE", None), patch("entorno._CACHE_RUTA", None):
            PL.llm(
                [{"role": "user", "content": "Hola"}],
                http_get=self._http_get_ok({"data": []}),
                http_post=http_post,
                ahora_fn=self._ahora_fijo(ahora),
                leer_clave=lambda _: None,
                log_fn=self._log_fn,
            )

        llamada_nim = next(c for c in capturas if "nvidia" in c[0])
        self.assertEqual(llamada_nim[1]["Authorization"], "Bearer nim-desde-hermes")

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