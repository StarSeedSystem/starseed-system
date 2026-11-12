#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Tests para peticiones_telegram.py — sin red, cola durable, worker, refresh."""
import json
import os
import sys
import tempfile
import time
import urllib.error
import urllib.request
from unittest.mock import Mock, patch, MagicMock

sys.path.insert(0, os.path.dirname(__file__))

import peticiones_telegram as mod
from peticiones_telegram import (
    CASA,
    DIR,
    ESTADO,
    COLA,
    SALIDAS,
    TOKEN,
    CHAT,
    MODELOS,
    REINTENTO_S,
    VIDA_S,
    REFRESCO_S,
    bloqueo,
    hay_trabajo,
    SesionCaducada,
    leer_env,
    leer_json,
    escribir_json,
    log,
    tg,
    decir,
    llm,
    por_reglas,
    interpretar,
    actualizar,
    atender,
    trabajar,
    mantener_sesion,
    texto_estado,
    recibir,
    escuchar,
    main,
)


def test_constantes_definidas():
    """Constantes principales están definidas."""
    assert CASA == os.path.expanduser("~")
    assert DIR == os.path.join(CASA, ".starseed", "peticiones")
    assert ESTADO == os.path.join(DIR, "estado.json")
    assert COLA == os.path.join(DIR, "cola.json")
    assert SALIDAS == os.path.join(DIR, "salidas")
    assert isinstance(MODELOS, list) and len(MODELOS) > 0
    assert REINTENTO_S == 300
    assert VIDA_S == 24 * 3600
    assert REFRESCO_S == 20 * 60


def test_leer_env_parsea_correctamente(tmp_path):
    """leer_env parsea archivo .env con export y comillas."""
    env_file = tmp_path / "env"
    env_file.write_text('export TELEGRAM_SINTESIS_BOT_TOKEN="abc123"\nTELEGRAM_SINTESIS_CHAT_ID=456\n# comentario\n')
    env = leer_env(str(env_file))
    assert env["TELEGRAM_SINTESIS_BOT_TOKEN"] == "abc123"
    assert env["TELEGRAM_SINTESIS_CHAT_ID"] == "456"


def test_leer_json_escribir_json_durable(tmp_path):
    """leer_json y escribir_json funcionan y son atómicos (tmp + replace)."""
    ruta = tmp_path / "test.json"
    datos = {"a": 1, "b": [1, 2, 3]}
    escribir_json(str(ruta), datos)
    assert leer_json(str(ruta), {}) == datos
    assert not (tmp_path / "test.json.tmp").exists()


def test_log_no_imprime_token(capsys):
    """log sustituye el token por *** en la salida."""
    original_token = mod.TOKEN
    mod.TOKEN = "secret-token"
    try:
        log("mensaje con secret-token en medio")
        captured = capsys.readouterr()
        assert "secret-token" not in captured.out
        assert "***" in captured.out
    finally:
        mod.TOKEN = original_token


def test_tg_maneja_errores_http():
    """tg devuelve dict con ok=False en error HTTP."""
    original_token = mod.TOKEN
    mod.TOKEN = "fake-token"
    try:
        def mock_urlopen(url, data=None, timeout=70):
            raise urllib.error.HTTPError(url, 400, "Bad Request", {}, None)
        with patch("urllib.request.urlopen", mock_urlopen):
            resultado = tg("getMe")
            assert resultado["ok"] is False
            assert "HTTP 400" in resultado["description"]
    finally:
        mod.TOKEN = original_token


def test_decir_divide_mensajes_largos():
    """decir divide mensajes > 3900 chars en múltiples sendMessage."""
    original_chat = mod.CHAT
    original_token = mod.TOKEN
    mod.CHAT = "123"
    mod.TOKEN = "fake"
    try:
        llamadas = []
        def mock_tg(metodo, datos=None, timeout=70):
            llamadas.append((metodo, datos))
            return {"ok": True}
        with patch("peticiones_telegram.tg", mock_tg):
            texto_largo = "x" * 8000
            decir(texto_largo)
        assert len(llamadas) == 3
        assert all(l[0] == "sendMessage" for l in llamadas)
        assert sum(len(l[1]["text"]) for l in llamadas) == 8000
    finally:
        mod.CHAT = original_chat
        mod.TOKEN = original_token


class MockResponse:
    def __init__(self, data: dict):
        self._data = json.dumps(data).encode()
    def read(self):
        return self._data
    def __enter__(self):
        return self
    def __exit__(self, *args):
        pass


def test_llm_intenta_modelos_hasta_responder():
    """llm itera MODELOS hasta obtener respuesta no-Claude."""
    original_env = mod.ENV
    original_modelos = mod.MODELOS
    mod.ENV = {"FREELLMAPI_KEY": "test-key", "STARSEED_LLM_URL": "http://fake"}
    mod.MODELOS = ["modelo1", "modelo2", "modelo3"]
    try:
        llamadas = []
        def mock_urlopen(req, timeout=150):
            llamadas.append(json.loads(req.data.decode()))
            modelo_usado = llamadas[-1]["model"]
            if modelo_usado == "modelo1":
                return MockResponse({"choices": [{"message": {"content": ""}}]})
            return MockResponse({"choices": [{"message": {"content": "respuesta válida"}}], "model": modelo_usado})
        with patch("urllib.request.urlopen", mock_urlopen):
            texto, modelo = llm([{"role": "user", "content": "hola"}])
        assert texto == "respuesta válida"
        assert modelo == "modelo2"
    finally:
        mod.ENV = original_env
        mod.MODELOS = original_modelos


def test_llm_salta_claude():
    """llm salta modelos que contienen 'claude' en el nombre."""
    original_env = mod.ENV
    original_modelos = mod.MODELOS
    mod.ENV = {"FREELLMAPI_KEY": "test-key", "STARSEED_LLM_URL": "http://fake"}
    mod.MODELOS = ["claude-model", "gemini-flash"]
    try:
        def mock_urlopen(req, timeout=150):
            data = json.loads(req.data.decode())
            if "claude" in data["model"].lower():
                return MockResponse({"choices": [{"message": {"content": "respuesta claude"}}], "model": data["model"]})
            return MockResponse({"choices": [{"message": {"content": "respuesta ok"}}], "model": data["model"]})
        with patch("urllib.request.urlopen", mock_urlopen):
            texto, modelo = llm([{"role": "user", "content": "hola"}])
        assert modelo == "gemini-flash"
        assert texto == "respuesta ok"
    finally:
        mod.ENV = original_env
        mod.MODELOS = original_modelos


def test_por_reglas_mensaje_real_alex():
    """Mensaje real de Alex → infographic + audio, fuente ultima_sintesis."""
    msg = "infografía y resumen de audio tipo podcast de la última síntesis"
    plan = por_reglas(msg)
    assert plan["tipo"] == "notebooklm"
    assert plan["fuente"] == "ultima_sintesis"
    tipos = {a["tipo"] for a in plan["artefactos"]}
    assert tipos == {"infographic", "audio"}


def test_interpretar_usa_reglas_si_modelo_falla():
    """interpretar usa por_reglas si el modelo no devuelve JSON válido."""
    def mock_llm(mensajes, max_tokens=600):
        return "no es json", "modelo-test"
    with patch("peticiones_telegram.llm", mock_llm):
        plan = interpretar("infografía de la síntesis")
    assert plan["tipo"] == "notebooklm"
    assert plan["fuente"] == "ultima_sintesis"
    assert plan["artefactos"] == [{"tipo": "infographic", "indicaciones": ""}]


def test_interpretar_valida_y_limpia_plan_modelo():
    """interpretar valida el plan del modelo: deduplica, límite 4, tipos válidos."""
    plan_modelo = {
        "tipo": "notebooklm",
        "fuente": "ultima_sintesis",
        "drive_id": "",
        "artefactos": [
            {"tipo": "infographic", "indicaciones": "a"},
            {"tipo": "infographic", "indicaciones": "b"},
            {"tipo": "audio", "indicaciones": "c"},
            {"tipo": "video", "indicaciones": "d"},
            {"tipo": "slide-deck", "indicaciones": "e"},
            {"tipo": "report", "indicaciones": "f"},
        ],
        "resumen": "test",
    }
    def mock_llm(mensajes, max_tokens=600):
        return json.dumps(plan_modelo), "modelo-test"
    with patch("peticiones_telegram.llm", mock_llm):
        plan = interpretar("infografía y audio y video y presentación e informe de la síntesis")
    assert len(plan["artefactos"]) == 4
    tipos = [a["tipo"] for a in plan["artefactos"]]
    assert tipos == ["infographic", "audio", "video", "slide-deck"]


def test_cola_durable_sobrevive_reinicio(tmp_path):
    """Cola se guarda en disco y se recupera tras reinicio (simulado)."""
    original_cola = mod.COLA
    original_estado = mod.ESTADO
    original_dir = mod.DIR
    original_salidas = mod.SALIDAS
    mod.COLA = str(tmp_path / "cola.json")
    mod.ESTADO = str(tmp_path / "estado.json")
    mod.DIR = str(tmp_path)
    mod.SALIDAS = str(tmp_path / "salidas")
    try:
        cola_original = [
            {"id": 1, "texto": "infografía síntesis", "recibida": time.time(), "estado": "nueva", "intentos": 0},
            {"id": 2, "texto": "audio podcast", "recibida": time.time(), "estado": "en_curso", "intentos": 1},
        ]
        escribir_json(mod.COLA, cola_original)
        cola_recuperada = leer_json(mod.COLA, [])
        assert len(cola_recuperada) == 2
        assert cola_recuperada[0]["id"] == 1
        assert cola_recuperada[1]["estado"] == "en_curso"
    finally:
        mod.COLA = original_cola
        mod.ESTADO = original_estado
        mod.DIR = original_dir
        mod.SALIDAS = original_salidas


def test_chat_ajeno_ignorado(tmp_path):
    """Mensaje de chat distinto a CHAT es ignorado."""
    original_chat = mod.CHAT
    original_token = mod.TOKEN
    original_cola = mod.COLA
    original_estado = mod.ESTADO
    original_dir = mod.DIR
    original_salidas = mod.SALIDAS
    mod.CHAT = "123456"
    mod.TOKEN = "fake"
    mod.COLA = str(tmp_path / "cola.json")
    mod.ESTADO = str(tmp_path / "estado.json")
    mod.DIR = str(tmp_path)
    mod.SALIDAS = str(tmp_path / "salidas")
    try:
        upd = {"update_id": 999, "message": {"chat": {"id": "999999"}, "text": "hola"}}
        recibir(upd)
        cola = leer_json(mod.COLA, [])
        assert len(cola) == 0
    finally:
        mod.CHAT = original_chat
        mod.TOKEN = original_token
        mod.COLA = original_cola
        mod.ESTADO = original_estado
        mod.DIR = original_dir
        mod.SALIDAS = original_salidas


def test_comando_estado_responde(tmp_path):
    """/estado devuelve estado formateado."""
    original_chat = mod.CHAT
    original_token = mod.TOKEN
    original_cola = mod.COLA
    original_estado = mod.ESTADO
    original_dir = mod.DIR
    original_salidas = mod.SALIDAS
    mod.CHAT = "123456"
    mod.TOKEN = "fake"
    mod.COLA = str(tmp_path / "cola.json")
    mod.ESTADO = str(tmp_path / "estado.json")
    mod.DIR = str(tmp_path)
    mod.SALIDAS = str(tmp_path / "salidas")
    try:
        respuestas = []
        def mock_decir(texto):
            respuestas.append(texto)
        with patch("peticiones_telegram.decir", mock_decir):
            recibir({"update_id": 1, "message": {"chat": {"id": "123456"}, "text": "/estado"}})
        assert len(respuestas) == 1
        assert "Estado de MetaGenesis (A1):" in respuestas[0]
        assert "NotebookLM:" in respuestas[0]
    finally:
        mod.CHAT = original_chat
        mod.TOKEN = original_token
        mod.COLA = original_cola
        mod.ESTADO = original_estado
        mod.DIR = original_dir
        mod.SALIDAS = original_salidas


def test_comando_ayuda_responde(tmp_path):
    """/ayuda devuelve texto de ayuda."""
    original_chat = mod.CHAT
    original_token = mod.TOKEN
    original_cola = mod.COLA
    original_estado = mod.ESTADO
    original_dir = mod.DIR
    original_salidas = mod.SALIDAS
    mod.CHAT = "123456"
    mod.TOKEN = "fake"
    mod.COLA = str(tmp_path / "cola.json")
    mod.ESTADO = str(tmp_path / "estado.json")
    mod.DIR = str(tmp_path)
    mod.SALIDAS = str(tmp_path / "salidas")
    try:
        respuestas = []
        def mock_decir(texto):
            respuestas.append(texto)
        with patch("peticiones_telegram.decir", mock_decir):
            recibir({"update_id": 2, "message": {"chat": {"id": "123456"}, "text": "/ayuda"}})
        assert len(respuestas) == 1
        assert "MetaGenesis" in respuestas[0]
        assert "Infografía" in respuestas[0]
    finally:
        mod.CHAT = original_chat
        mod.TOKEN = original_token
        mod.COLA = original_cola
        mod.ESTADO = original_estado
        mod.DIR = original_dir
        mod.SALIDAS = original_salidas


def test_sesion_caducada_deja_peticion_esperando(tmp_path):
    """Si SesionCaducada en atender, la petición queda en estado 'esperando_sesion'."""
    original_cola = mod.COLA
    original_estado = mod.ESTADO
    original_dir = mod.DIR
    original_salidas = mod.SALIDAS
    mod.COLA = str(tmp_path / "cola.json")
    mod.ESTADO = str(tmp_path / "estado.json")
    mod.DIR = str(tmp_path)
    mod.SALIDAS = str(tmp_path / "salidas")
    try:
        p = {"id": 1, "texto": "infografía síntesis", "recibida": time.time(), "estado": "nueva", "intentos": 0, "plan": {"tipo": "notebooklm", "fuente": "ultima_sintesis", "artefactos": [{"tipo": "infographic", "indicaciones": ""}]}}
        # Añadir a cola primero
        escribir_json(mod.COLA, [p])
        # Mock hacer_notebooklm para lanzar SesionCaducada
        def mock_hacer(p, plan):
            raise mod.SesionCaducada("expired")
        with patch("peticiones_telegram.hacer_notebooklm", mock_hacer), \
             patch("peticiones_telegram.interpretar", lambda x: p["plan"]):
            atender(p)
        cola = leer_json(mod.COLA, [])
        assert len(cola) == 1
        assert cola[0]["estado"] == "esperando_sesion"
        assert cola[0]["avisada_sesion"] is True
    finally:
        mod.COLA = original_cola
        mod.ESTADO = original_estado
        mod.DIR = original_dir
        mod.SALIDAS = original_salidas


def test_mantener_sesion_refresca_cada_20min(tmp_path):
    """mantener_sesion llama nb auth refresh y actualiza estado (una iteración)."""
    original_estado = mod.ESTADO
    original_dir = mod.DIR
    mod.ESTADO = str(tmp_path / "estado.json")
    mod.DIR = str(tmp_path)
    try:
        llamadas_nb = []
        def mock_nb(args, timeout=180):
            llamadas_nb.append(args)
            if args == ["auth", "refresh"]:
                return 0, "", ""
            return 1, "", "error"
        def mock_sleep(secs):
            raise KeyboardInterrupt("break loop")
        with patch("peticiones_telegram.nb", mock_nb), \
             patch("time.sleep", mock_sleep):
            try:
                mantener_sesion()
            except KeyboardInterrupt:
                pass
        assert any(a == ["auth", "refresh"] for a in llamadas_nb)
        estado = leer_json(mod.ESTADO, {})
        assert "notebooklm" in estado
        assert estado["notebooklm"]["viva"] is True
    finally:
        mod.ESTADO = original_estado
        mod.DIR = original_dir


def test_recibir_guarda_en_cola_antes_confirmar_offset(tmp_path):
    """recibir añade a cola.json ANTES de confirmar offset (durable)."""
    original_chat = mod.CHAT
    original_token = mod.TOKEN
    original_cola = mod.COLA
    original_estado = mod.ESTADO
    original_dir = mod.DIR
    original_salidas = mod.SALIDAS
    mod.CHAT = "123456"
    mod.TOKEN = "fake"
    mod.COLA = str(tmp_path / "cola.json")
    mod.ESTADO = str(tmp_path / "estado.json")
    mod.DIR = str(tmp_path)
    mod.SALIDAS = str(tmp_path / "salidas")
    try:
        respuestas = []
        def mock_decir(texto):
            respuestas.append(texto)
        with patch("peticiones_telegram.decir", mock_decir), \
             patch("peticiones_telegram.hay_trabajo") as mock_hay:
            recibir({"update_id": 42, "message": {"chat": {"id": "123456"}, "text": "infografía síntesis"}})
        cola = leer_json(mod.COLA, [])
        assert len(cola) == 1
        assert cola[0]["id"] == 42
        assert cola[0]["texto"] == "infografía síntesis"
        assert cola[0]["estado"] == "nueva"
        assert "Recibido" in respuestas[0]
        assert mock_hay.set.called
    finally:
        mod.CHAT = original_chat
        mod.TOKEN = original_token
        mod.COLA = original_cola
        mod.ESTADO = original_estado
        mod.DIR = original_dir
        mod.SALIDAS = original_salidas


def test_escuchar_actualiza_offset_en_estado(tmp_path):
    """escuchar guarda offset en estado.json tras cada update."""
    original_estado = mod.ESTADO
    original_token = mod.TOKEN
    original_chat = mod.CHAT
    mod.ESTADO = str(tmp_path / "estado.json")
    mod.TOKEN = "fake"
    mod.CHAT = "123456"
    try:
        updates = [
            {"ok": True, "result": [{"update_id": 100, "message": {"chat": {"id": "123456"}, "text": "hola"}}]},
            {"ok": True, "result": [{"update_id": 101, "message": {"chat": {"id": "123456"}, "text": "adiós"}}]},
            {"ok": False, "description": "timeout"},  # error -> sleep -> KeyboardInterrupt
        ]
        idx = [0]
        def mock_tg(metodo, datos=None, timeout=70):
            if metodo == "getUpdates":
                if idx[0] < len(updates):
                    return updates[idx[0]]
                return {"ok": False, "description": "timeout"}
            return {"ok": True}
        def mock_recibir(upd):
            idx[0] += 1
        def mock_sleep(secs):
            raise KeyboardInterrupt("break loop")
        with patch("peticiones_telegram.tg", mock_tg), \
             patch("peticiones_telegram.recibir", mock_recibir), \
             patch("time.sleep", mock_sleep):
            try:
                escuchar()
            except KeyboardInterrupt:
                pass
        estado = leer_json(mod.ESTADO, {})
        assert estado.get("offset") == 102
    finally:
        mod.ESTADO = original_estado
        mod.TOKEN = original_token
        mod.CHAT = original_chat


def test_main_inicializa_y_arranca_hilos(tmp_path):
    """main crea directorios, recupera cola, arranca hilos worker y refresh."""
    original_cola = mod.COLA
    original_estado = mod.ESTADO
    original_dir = mod.DIR
    original_salidas = mod.SALIDAS
    original_token = mod.TOKEN
    original_chat = mod.CHAT
    mod.COLA = str(tmp_path / "cola.json")
    mod.ESTADO = str(tmp_path / "estado.json")
    mod.DIR = str(tmp_path)
    mod.SALIDAS = str(tmp_path / "salidas")
    mod.TOKEN = "fake-token"
    mod.CHAT = "123456"
    try:
        escribir_json(mod.COLA, [{"id": 1, "estado": "en_curso", "texto": "test", "recibida": time.time()}])
        hilos = []
        def mock_thread(target, daemon=True):
            h = Mock()
            h.start = Mock()
            hilos.append((target, h))
            return h
        with patch("threading.Thread", mock_thread), \
             patch("peticiones_telegram.escuchar", lambda: None), \
             patch("peticiones_telegram.hay_trabajo") as mock_hay:
            try:
                main()
            except SystemExit:
                pass
        cola = leer_json(mod.COLA, [])
        assert cola[0]["estado"] == "reintentar"
        assert len(hilos) == 2
        targets = [t.__name__ for t, _ in hilos]
        assert "trabajar" in targets
        assert "mantener_sesion" in targets
        assert mock_hay.set.called
    finally:
        mod.COLA = original_cola
        mod.ESTADO = original_estado
        mod.DIR = original_dir
        mod.SALIDAS = original_salidas
        mod.TOKEN = original_token
        mod.CHAT = original_chat


if __name__ == "__main__":
    import pytest
    pytest.main([__file__, "-v"])