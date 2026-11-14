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
        assert len(hilos) == 3
        targets = [t.__name__ for t, _ in hilos]
        assert "trabajar" in targets
        assert "mantener_sesion" in targets
        assert "_tarea_multiformato_periodica" in targets
        assert mock_hay.set.called
    finally:
        mod.COLA = original_cola
        mod.ESTADO = original_estado
        mod.DIR = original_dir
        mod.SALIDAS = original_salidas
        mod.TOKEN = original_token
        mod.CHAT = original_chat


# Higgsfield (HGF1113B) tests

def _hfa_base_test(tmp_path):
    return str(tmp_path / "higgsfield")


def _hfa_setup(tmp_path, monkeypatch, propuestas=None, aprobaciones=None, gastos=None, limites=None):
    base = _hfa_base_test(tmp_path)
    os.makedirs(base, exist_ok=True)
    with open(os.path.join(base, "propuestas.json"), "w", encoding="utf-8") as f:
        json.dump({"propuestas": propuestas or []}, f)
    with open(os.path.join(base, "aprobaciones.json"), "w", encoding="utf-8") as f:
        json.dump(aprobaciones or {}, f)
    with open(os.path.join(base, "gasto.jsonl"), "w", encoding="utf-8") as f:
        for g in (gastos or []):
            f.write(json.dumps(g) + "\n")
    with open(os.path.join(base, "presupuestos.json"), "w", encoding="utf-8") as f:
        json.dump(limites or {}, f)
    monkeypatch.setattr(mod, "hfa", __import__("higgsfield_aprobado"))
    monkeypatch.setattr(mod.hfa, "DIR", base)


def _recibir_higgsfield(tmp_path, monkeypatch, texto, propuestas=None, aprobaciones=None, gastos=None, limites=None):
    for k, v in (("CHAT", "123456"), ("TOKEN", "fake"), ("DIR", str(tmp_path)),
                 ("COLA", str(tmp_path / "cola.json")), ("ESTADO", str(tmp_path / "estado.json"))):
        monkeypatch.setattr(mod, k, v)
    respuestas = []
    monkeypatch.setattr(mod, "decir", respuestas.append)
    _hfa_setup(tmp_path, monkeypatch, propuestas, aprobaciones, gastos, limites)
    recibir({"update_id": 999, "message": {"chat": {"id": "123456"}, "text": texto}})
    return respuestas


def test_higgsfield_listar_vacio(tmp_path, monkeypatch):
    """/higgsfield sin propuestas dice que no hay pendientes."""
    respuestas = _recibir_higgsfield(tmp_path, monkeypatch, "/higgsfield")
    assert "No hay propuestas" in respuestas[0]


def test_higgsfield_listar_con_propuestas(tmp_path, monkeypatch):
    """/higgsfield muestra propuestas con créditos, presupuesto y gasto."""
    propuestas = [
        {"id": "abc123", "proyecto": "demo", "pieza": "intro", "modelo": "seedance-2.0",
         "comando": ["higgsfield", "generate", "seedance_2_0"], "tomas": 1, "creditos_estimados": 10.0,
         "motivo": "test"},
        {"id": "def456", "proyecto": "sistema-diseno", "pieza": "hero", "modelo": "veo-3",
         "comando": ["higgsfield", "generate", "veo_3"], "tomas": 1, "creditos_estimados": 25.0,
         "motivo": "test2"},
    ]
    respuestas = _recibir_higgsfield(tmp_path, monkeypatch, "/higgsfield", propuestas=propuestas)
    texto = respuestas[0]
    assert "abc123" in texto
    assert "def456" in texto
    assert "demo" in texto
    assert "sistema-diseno" in texto
    assert "10.0" in texto or "10" in texto
    assert "25.0" in texto or "25" in texto


def test_higgsfield_aprobar_ejecuta(tmp_path, monkeypatch):
    """/higgsfield aprobar <id> aprueba y ejecuta la propuesta."""
    propuestas = [
        {"id": "test123", "proyecto": "demo", "pieza": "intro", "modelo": "seedance-2.0",
         "comando": ["higgsfield", "generate", "seedance_2_0"], "tomas": 1, "creditos_estimados": 10.0,
         "motivo": "test"},
    ]
    respuestas = _recibir_higgsfield(tmp_path, monkeypatch, "/higgsfield aprobar test123", propuestas=propuestas)
    # Debe responder con aprobada y ejecutada
    assert any("Aprobada" in r for r in respuestas)
    assert any("completada" in r or "falló" in r for r in respuestas)


def test_higgsfield_aprobar_no_existe(tmp_path, monkeypatch):
    """/higgsfield aprobar con id inexistente da error."""
    respuestas = _recibir_higgsfield(tmp_path, monkeypatch, "/higgsfield aprobar noexiste")
    assert any("no encontrada" in r for r in respuestas)


def test_higgsfield_rechazar(tmp_path, monkeypatch):
    """/higgsfield rechazar <id> rechaza la propuesta."""
    propuestas = [
        {"id": "test456", "proyecto": "demo", "pieza": "intro", "modelo": "seedance-2.0",
         "comando": ["higgsfield", "generate", "seedance_2_0"], "tomas": 1, "creditos_estimados": 10.0,
         "motivo": "test"},
    ]
    respuestas = _recibir_higgsfield(tmp_path, monkeypatch, "/higgsfield rechazar test456", propuestas=propuestas)
    assert any("Rechazada" in r for r in respuestas)


def test_higgsfield_presupuesto(tmp_path, monkeypatch):
    """/higgsfield presupuesto <proyecto> <créditos> establece el límite."""
    respuestas = _recibir_higgsfield(tmp_path, monkeypatch, "/higgsfield presupuesto demo 100")
    assert any("Presupuesto de demo establecido a 100" in r for r in respuestas)
    # Verificar que se guardó
    base = _hfa_base_test(tmp_path)
    with open(os.path.join(base, "presupuestos.json"), encoding="utf-8") as f:
        limites = json.load(f)
    assert limites.get("proyectos", {}).get("demo", {}).get("creditos") == 100.0


def test_higgsfield_presupuesto_uso_incorrecto(tmp_path, monkeypatch):
    """/higgsfield presupuesto sin argumentos da ayuda."""
    respuestas = _recibir_higgsfield(tmp_path, monkeypatch, "/higgsfield presupuesto")
    assert any("Uso:" in r for r in respuestas)


def test_peticion_higgsfield_crea_propuesta(tmp_path, monkeypatch):
    """Mensaje pidiendo video de Higgsfield crea propuesta y pide aprobación."""
    respuestas = _recibir_higgsfield(tmp_path, monkeypatch, "genera un video con seedance de 5 segundos")
    assert len(respuestas) == 1
    texto = respuestas[0]
    assert "Nueva propuesta" in texto
    assert "id:" in texto
    assert "proyecto:" in texto
    assert "créditos estimados" in texto
    assert "/higgsfield aprobar" in texto
    assert "/higgsfield rechazar" in texto
    # Verificar que se guardó en propuestas.json
    base = _hfa_base_test(tmp_path)
    with open(os.path.join(base, "propuestas.json"), encoding="utf-8") as f:
        datos = json.load(f)
    assert len(datos.get("propuestas", [])) == 1
    assert datos["propuestas"][0]["modelo"] == "seedance-2.0"


def test_peticion_higgsfield_veo_crea_propuesta(tmp_path, monkeypatch):
    """Mensaje pidiendo Veo crea propuesta con modelo veo-3."""
    respuestas = _recibir_higgsfield(tmp_path, monkeypatch, "haz un clip con veo 3")
    texto = respuestas[0]
    assert "veo-3" in texto


def test_peticion_higgsfield_proyecto_sistema_diseno(tmp_path, monkeypatch):
    """Mensaje sobre sistema de diseño asigna proyecto correcto."""
    respuestas = _recibir_higgsfield(tmp_path, monkeypatch, "video para el sistema de diseño")
    texto = respuestas[0]
    assert "sistema-diseno" in texto


def test_comando_higgsfield_aprobar_llama_drive(tmp_path, monkeypatch):
    """/higgsfield aprobar llama a la función de subida a Drive cuando la ejecución es exitosa."""
    propuestas = [
        {"id": "test-drive", "proyecto": "demo", "pieza": "intro", "modelo": "seedance-2.0",
         "comando": ["higgsfield", "generate", "seedance_2_0"], "tomas": 1, "creditos_estimados": 10.0,
         "motivo": "test"},
    ]
    drive_calls = []
    def mock_subir(propuesta, resultado):
        drive_calls.append((propuesta, resultado))
    monkeypatch.setattr(mod, "_subir_resultado_higgsfield_a_drive", mock_subir)
    respuestas = _recibir_higgsfield(tmp_path, monkeypatch, "/higgsfield aprobar test-drive", propuestas=propuestas)
    # Verificar que se llamó a la función de Drive
    assert len(drive_calls) == 1
    assert drive_calls[0][0]["id"] == "test-drive"
    assert drive_calls[0][1].get("ok") is True
    # Verificar respuestas: aprobada + completada
    assert any("Aprobada" in r for r in respuestas)
    assert any("completada" in r for r in respuestas)


def test_comando_higgsfield_aprobar_no_llama_drive_si_falla(tmp_path, monkeypatch):
    """/higgsfield aprobar NO llama a Drive si la ejecución falla."""
    propuestas = [
        {"id": "test-drive-fail", "proyecto": "demo", "pieza": "intro", "modelo": "seedance-2.0",
         "comando": ["higgsfield", "generate", "seedance_2_0"], "tomas": 1, "creditos_estimados": 10.0,
         "motivo": "test"},
    ]
    drive_calls = []
    def mock_subir(propuesta, resultado):
        drive_calls.append((propuesta, resultado))
    # Mock ejecutar para que falle
    import higgsfield_aprobado as hfa_mod
    original_ejecutar = hfa_mod.ejecutar
    def mock_ejecutar(*args, **kwargs):
        return {"ok": False, "motivo": "error de prueba", "creditos": 0, "aviso": "", "reintentado": False}
    monkeypatch.setattr(hfa_mod, "ejecutar", mock_ejecutar)
    try:
        respuestas = _recibir_higgsfield(tmp_path, monkeypatch, "/higgsfield aprobar test-drive-fail", propuestas=propuestas)
    finally:
        monkeypatch.setattr(hfa_mod, "ejecutar", original_ejecutar)
    # Verificar que NO se llamó a Drive
    assert len(drive_calls) == 0
    # Verificar respuesta de error
    assert any("falló" in r for r in respuestas)


if __name__ == "__main__":
    import pytest
    pytest.main([__file__, "-v"])

# ── GEN1114D · «Este chat: <nombre> · id <id>» en /estado y /ayuda, leído de chat-a1.json ──

def _chat_a1(tmp_path, datos, modo=0o600):
    ruta = tmp_path / "chat-a1.json"
    ruta.write_text(json.dumps(datos, ensure_ascii=False))
    os.chmod(ruta, modo)


def _responde(tmp_path, monkeypatch, texto):
    for k, v in (("CHAT", "123456"), ("TOKEN", "fake"), ("DIR", str(tmp_path)),
                 ("COLA", str(tmp_path / "cola.json")), ("ESTADO", str(tmp_path / "estado.json"))):
        monkeypatch.setattr(mod, k, v)
    respuestas = []
    monkeypatch.setattr(mod, "decir", respuestas.append)
    recibir({"update_id": 3, "message": {"chat": {"id": "123456"}, "text": texto}})
    assert len(respuestas) == 1
    return respuestas[0]


CHAT_B = {"v": 1, "id": "telegram.ejemplo_b_bot", "nombre": "Bot B de ejemplo",
          "alias": ["puente:peticiones", "peticiones", "Peticiones y encargos"]}


def test_estado_y_ayuda_empiezan_con_el_nombre_y_el_id_del_chat(tmp_path, monkeypatch):
    _chat_a1(tmp_path, CHAT_B)
    for orden in ("/estado", "/ayuda", "/start"):
        primera, resto = _responde(tmp_path, monkeypatch, orden).split("\n", 1)
        assert primera == "Este chat: Bot B de ejemplo · id telegram.ejemplo_b_bot"
        assert ("Estado de MetaGenesis (A1):" in resto) if orden == "/estado" else (resto == mod.AYUDA)
    assert not (tmp_path / "estado.json").exists()        # contestar no mueve el offset ni escribe estado


def test_sin_chat_a1_no_se_inventa_nombre(tmp_path, monkeypatch):
    assert _responde(tmp_path, monkeypatch, "/estado").startswith("Este chat: nombre aún no publicado por la Mac\n")


def test_chat_a1_que_otro_pudo_tocar_o_mal_formado_no_vale(tmp_path, monkeypatch):
    _chat_a1(tmp_path, CHAT_B, modo=0o644)
    assert "nombre aún no publicado" in _responde(tmp_path, monkeypatch, "/ayuda")
    for malo in (dict(CHAT_B, id="Telegram.Mayus"), dict(CHAT_B, v=2), dict(CHAT_B, nombre=""), ["no", "es", "objeto"]):
        _chat_a1(tmp_path, malo)
        assert mod.chat_a1() is None


def test_nombre_del_chat_sin_controles_ni_marcas_bidi(tmp_path, monkeypatch):
    _chat_a1(tmp_path, dict(CHAT_B, nombre="Bot\u202e B\u2066\n de\u200f ejemplo" + "x" * 100))
    primera = _responde(tmp_path, monkeypatch, "/estado").split("\n", 1)[0]
    assert primera.startswith("Este chat: Bot B de ejemplo") and len(primera) < 140
    assert not any(c in primera for c in "\u202e\u2066\u200f")


def test_sin_ficha_importar_el_bot_no_carga_la_puerta_ni_las_firmas(tmp_path):
    """Sin la variable de la puerta el bot es el de hoy: ni peticiones_puerta ni genesis_firma_logica se cargan."""
    import subprocess
    env = dict(os.environ, HOME=str(tmp_path))
    env.pop("STARSEED_PUERTA_FICHA_GENESIS_A1", None)
    codigo = "import sys, peticiones_telegram; print(sorted({'peticiones_puerta', 'genesis_firma_logica'} & set(sys.modules)))"
    r = subprocess.run([sys.executable, "-c", codigo], cwd=os.path.dirname(os.path.abspath(__file__)), env=env,
                       capture_output=True, text=True, timeout=30)
    assert r.returncode == 0 and r.stdout.strip() == "[]", r.stderr[-300:]


# --- Tests para PSF1113B: reglas permanentes ---

def test_por_reglas_permanente_detecta_palabras_clave(tmp_path, monkeypatch):
    """por_reglas_permanente detecta 'recuerda', 'cada día', 'siempre', 'para cada', 'a partir de ahora'."""
    # Configurar paths temporales
    for k, v in (("DIR", str(tmp_path)), ("PREFERENCIAS", str(tmp_path / "preferencias.json")),
                 ("RUTINAS", str(tmp_path / "rutinas.json"))):
        monkeypatch.setattr(mod, k, v)
    
    for msg in [
        "Recuerda cada día: genera todos los formatos al terminar la síntesis",
        "Siempre envía los archivos al chat",
        "Para cada síntesis diaria, haz la infografía",
        "A partir de ahora, genera audio tipo podcast",
        "Cada día procesa la síntesis completa",
    ]:
        tipo = mod.por_reglas_permanente(msg)
        assert tipo == "regla_permanente", f"Fallo con: {msg}"


def test_por_reglas_permanente_no_detecta_sin_palabras_clave(tmp_path, monkeypatch):
    """Mensajes sin palabras clave de regla permanente → 'otro'."""
    for k, v in (("DIR", str(tmp_path)), ("PREFERENCIAS", str(tmp_path / "preferencias.json")),
                 ("RUTINAS", str(tmp_path / "rutinas.json"))):
        monkeypatch.setattr(mod, k, v)
    
    for msg in [
        "Genera una infografía de la síntesis",
        "Haz un audio de esto",
        "Quiero el vídeo de hoy",
    ]:
        tipo = mod.por_reglas_permanente(msg)
        assert tipo == "otro", f"Fallo con: {msg}"


def test_guardar_y_leer_preferencia(tmp_path, monkeypatch):
    """_guardar_preferencia y _leer_preferencias funcionan correctamente."""
    for k, v in (("DIR", str(tmp_path)), ("PREFERENCIAS", str(tmp_path / "preferencias.json")),
                 ("RUTINAS", str(tmp_path / "rutinas.json"))):
        monkeypatch.setattr(mod, k, v)
    
    mod._guardar_preferencia("nombre", "Maggasukha")
    mod._guardar_preferencia("tono", "formal")
    
    prefs = mod._leer_preferencias()
    assert prefs["nombre"] == "Maggasukha"
    assert prefs["tono"] == "formal"


def test_guardar_y_leer_rutina(tmp_path, monkeypatch):
    """_guardar_rutina y _leer_rutinas funcionan correctamente."""
    for k, v in (("DIR", str(tmp_path)), ("PREFERENCIAS", str(tmp_path / "preferencias.json")),
                 ("RUTINAS", str(tmp_path / "rutinas.json"))):
        monkeypatch.setattr(mod, k, v)
    
    rutina = {
        "nombre": "sintesis_diaria",
        "disparador": "cada día",
        "accion": "genera todos los formatos",
        "texto_original": "Recuerda cada día: genera todos los formatos",
        "creada": time.time(),
    }
    mod._guardar_rutina(rutina)
    
    rutinas = mod._leer_rutinas()
    assert len(rutinas) == 1
    assert rutinas[0]["nombre"] == "sintesis_diaria"
    assert rutinas[0]["disparador"] == "cada día"
    assert rutinas[0]["accion"] == "genera todos los formatos"


def test_guardar_rutina_evita_duplicados(tmp_path, monkeypatch):
    """_guardar_rutina evita duplicados por nombre."""
    for k, v in (("DIR", str(tmp_path)), ("PREFERENCIAS", str(tmp_path / "preferencias.json")),
                 ("RUTINAS", str(tmp_path / "rutinas.json"))):
        monkeypatch.setattr(mod, k, v)
    
    rutina = {"nombre": "test", "disparador": "cada día", "accion": "accion 1", "texto_original": "t1", "creada": time.time()}
    mod._guardar_rutina(rutina)
    rutina2 = {"nombre": "test", "disparador": "siempre", "accion": "accion 2", "texto_original": "t2", "creada": time.time()}
    mod._guardar_rutina(rutina2)
    
    rutinas = mod._leer_rutinas()
    assert len(rutinas) == 1
    assert rutinas[0]["accion"] == "accion 2"  # La segunda sobrescribe


def test_es_rutina_detecta_palabras_clave(tmp_path, monkeypatch):
    """_es_rutina detecta correctamente las rutinas."""
    for k, v in (("DIR", str(tmp_path)), ("PREFERENCIAS", str(tmp_path / "preferencias.json")),
                 ("RUTINAS", str(tmp_path / "rutinas.json"))):
        monkeypatch.setattr(mod, k, v)
    
    assert mod._es_rutina("Cada día genera la infografía")
    assert mod._es_rutina("Diario haz el audio")
    assert mod._es_rutina("Siempre que termine la síntesis, envía los archivos")
    assert mod._es_rutina("Cuando acabe, genera el vídeo")
    assert mod._es_rutina("Al terminar la síntesis, procesa todo")
    assert mod._es_rutina("Después de la síntesis, haz el resumen")
    
    assert not mod._es_rutina("Genera una infografía ahora")
    assert not mod._es_rutina("Haz un audio de esto")


def test_extraer_regla_permanente_preferencia_simple(tmp_path, monkeypatch):
    """_extraer_regla_permanente extrae preferencias simples correctamente."""
    for k, v in (("DIR", str(tmp_path)), ("PREFERENCIAS", str(tmp_path / "preferencias.json")),
                 ("RUTINAS", str(tmp_path / "rutinas.json"))):
        monkeypatch.setattr(mod, k, v)
    
    # "mi nombre es X" - el valor se extrae en minúsculas por el regex
    regla = mod._extraer_regla_permanente("Mi nombre es Maggasukha")
    assert regla["tipo"] == "preferencia"
    assert regla["clave"] == "nombre"
    assert regla["valor"] == "maggasukha"
    
    # "llámame X"
    regla = mod._extraer_regla_permanente("Llámame Alex")
    assert regla["clave"] == "nombre"
    assert regla["valor"] == "alex"
    
    # "recuerda que X"
    regla = mod._extraer_regla_permanente("Recuerda que me gusta el café")
    assert regla["clave"] == "recordatorio"
    assert "café" in regla["valor"]
    
    # "siempre X"
    regla = mod._extraer_regla_permanente("Siempre usa tono formal")
    assert regla["clave"] == "siempre"
    assert "tono formal" in regla["valor"]
    
    # "a partir de ahora X"
    regla = mod._extraer_regla_permanente("A partir de ahora genera todo en PDF")
    assert regla["clave"] == "a_partir_de_ahora"
    assert "pdf" in regla["valor"].lower()


def test_extraer_regla_permanente_rutina(tmp_path, monkeypatch):
    """_extraer_regla_permanente extrae rutinas correctamente."""
    for k, v in (("DIR", str(tmp_path)), ("PREFERENCIAS", str(tmp_path / "preferencias.json")),
                 ("RUTINAS", str(tmp_path / "rutinas.json"))):
        monkeypatch.setattr(mod, k, v)
    
    # "cada día X"
    regla = mod._extraer_regla_permanente("Cada día genera la infografía de la síntesis")
    assert regla["tipo"] == "rutina"
    assert regla["disparador"] == "cada día"
    assert "infografía" in regla["accion"]
    
    # "cuando X, haz Y"
    regla = mod._extraer_regla_permanente("Cuando termine la síntesis, haz el audio")
    assert regla["tipo"] == "rutina"
    assert regla["disparador"] == "cuando"
    assert "audio" in regla["accion"]
    
    # "al terminar X, haz Y"
    regla = mod._extraer_regla_permanente("Al terminar la síntesis, genera el vídeo")
    assert regla["tipo"] == "rutina"
    assert regla["disparador"] == "al terminar"
    assert "vídeo" in regla["accion"]


def test_procesar_regla_permanente_guarda_y_confirma(tmp_path, monkeypatch):
    """_procesar_regla_permanente guarda la regla y devuelve mensaje de confirmación."""
    for k, v in (("DIR", str(tmp_path)), ("PREFERENCIAS", str(tmp_path / "preferencias.json")),
                 ("RUTINAS", str(tmp_path / "rutinas.json"))):
        monkeypatch.setattr(mod, k, v)
    
    # Preferencia
    msg, es_rutina = mod._procesar_regla_permanente("Mi nombre es Maggasukha")
    assert not es_rutina
    assert "Preferencia guardada" in msg
    assert "nombre" in msg
    assert "maggasukha" in msg.lower()
    
    # Rutina
    msg, es_rutina = mod._procesar_regla_permanente("Cada día genera la infografía")
    assert es_rutina
    assert "Rutina registrada" in msg
    assert "cada día" in msg
    assert "infografía" in msg


def test_recibir_procesa_regla_permanente_y_continua(tmp_path, monkeypatch):
    """recibir procesa regla permanente y continúa con procesamiento normal."""
    for k, v in (("CHAT", "123456"), ("TOKEN", "fake"), ("DIR", str(tmp_path)),
                 ("COLA", str(tmp_path / "cola.json")), ("ESTADO", str(tmp_path / "estado.json")),
                 ("PREFERENCIAS", str(tmp_path / "preferencias.json")),
                 ("RUTINAS", str(tmp_path / "rutinas.json")),
                 ("SALIDAS", str(tmp_path / "salidas"))):
        monkeypatch.setattr(mod, k, v)
    
    respuestas = []
    monkeypatch.setattr(mod, "decir", respuestas.append)
    
    # Mock para que no intente procesar como encargo real
    monkeypatch.setattr(mod, "por_reglas", lambda x: {"tipo": "respuesta", "fuente": "cuaderno", "drive_id": "", "artefactos": [], "resumen": ""})
    monkeypatch.setattr(mod, "llm", lambda *a, **k: ("", ""))
    
    # Enviar mensaje con regla permanente
    recibir({"update_id": 1, "message": {"chat": {"id": "123456"}, "text": "Recuerda cada día: genera todos los formatos"}})
    
    # Debe haber respondido con confirmación de regla
    assert any("Rutina registrada" in r or "Preferencia guardada" in r for r in respuestas)
    
    # Y debe haber añadido a la cola (procesamiento normal)
    cola = mod.leer_json(mod.COLA, [])
    assert len(cola) == 1
    assert cola[0]["texto"] == "Recuerda cada día: genera todos los formatos"
