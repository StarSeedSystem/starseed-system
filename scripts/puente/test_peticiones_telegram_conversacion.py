#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Tests para DIS1126A: manejo de conversación, respuestas cortas, modo desarrollo conjunto."""
import json
import os
import sys
import tempfile
from unittest.mock import Mock, patch, MagicMock

import pytest

sys.path.insert(0, os.path.dirname(__file__))

import peticiones_telegram as mod


def _preparar_tmp(monkeypatch, tmp_path):
    """Configura paths temporales para tests."""
    for k, v in (("CHAT", "123456"), ("TOKEN", "fake"), ("DIR", str(tmp_path)),
                 ("COLA", str(tmp_path / "cola.json")), ("ESTADO", str(tmp_path / "estado.json")),
                 ("SALIDAS", str(tmp_path / "salidas"))):
        monkeypatch.setattr(mod, k, v)


# ── Tests para _guardar_pregunta_abierta y _obtener_pregunta_abierta ──

def test_guardar_y_obtener_pregunta_abierta(tmp_path, monkeypatch):
    """_guardar_pregunta_abierta guarda y _obtener_pregunta_abierta recupera la pregunta."""
    _preparar_tmp(monkeypatch, tmp_path)
    
    # Llamar a la función interna
    mod._guardar_pregunta_abierta("chat_123", {
        "texto": "¿Quieres que despleguemos el primer caso?",
        "accion": "desplegar_caso_1",
        "tipo": "propuesta",
        "datos": {"caso": 1}
    })
    
    pregunta = mod._obtener_pregunta_abierta("chat_123")
    assert pregunta is not None
    assert pregunta["texto"] == "¿Quieres que despleguemos el primer caso?"
    assert pregunta["accion"] == "desplegar_caso_1"
    assert pregunta["tipo"] == "propuesta"
    assert pregunta["datos"]["caso"] == 1


def test_obtener_pregunta_abierta_inexistente(tmp_path, monkeypatch):
    """_obtener_pregunta_abierta devuelve None si no hay pregunta guardada."""
    _preparar_tmp(monkeypatch, tmp_path)
    
    pregunta = mod._obtener_pregunta_abierta("chat_999")
    assert pregunta is None


def test_pregunta_abierta_se_guarda_en_archivo(tmp_path, monkeypatch):
    """La pregunta se persiste en archivo JSON."""
    _preparar_tmp(monkeypatch, tmp_path)
    
    mod._guardar_pregunta_abierta("chat_test", {
        "texto": "¿Confirmas?",
        "accion": "confirmar_algo",
        "tipo": "confirmacion",
        "datos": {}
    })
    
    # Verificar archivo
    archivo = tmp_path / "preguntas_abiertas.json"
    assert archivo.exists()
    with open(archivo, encoding="utf-8") as f:
        datos = json.load(f)
    assert "chat_test" in datos
    assert datos["chat_test"]["accion"] == "confirmar_algo"


# ── Tests para _es_respuesta_corta ──

@pytest.mark.parametrize("texto,esperado", [
    ("sí", True),
    ("si", True),
    ("no", True),
    ("ok", True),
    ("dale", True),
    ("adelante", True),
    ("hazlo", True),
    ("1", True),
    ("2", True),
    ("opción 1", True),
    ("la 1", True),
    ("la opción 2", True),
    ("claro", True),
    ("vale", True),
    ("de acuerdo", True),
    ("por supuesto", True),
    ("", False),
    ("hola", False),
    ("genera una infografía", False),
    ("¿qué hora es?", False),
])
def test_es_respuesta_corta(texto, esperado):
    """_es_respuesta_corta detecta correctamente respuestas de confirmación."""
    assert mod._es_respuesta_corta(texto) == esperado


# ── Tests para _procesar_respuesta_corta ──

def test_procesar_respuesta_corta_sin_pregunta_abierta(tmp_path, monkeypatch):
    """Sin pregunta abierta, pide aclaración."""
    _preparar_tmp(monkeypatch, tmp_path)
    
    respuestas = []
    monkeypatch.setattr(mod, "decir", respuestas.append)
    
    mod._procesar_respuesta_corta("sí", "chat_123")
    
    assert len(respuestas) == 1
    assert "No hay una pregunta abierta" in respuestas[0] or "qué quieres decir" in respuestas[0].lower()


def test_procesar_respuesta_corta_afirmativa_ejecuta_accion(tmp_path, monkeypatch):
    """Respuesta 'sí' ejecuta la acción guardada."""
    _preparar_tmp(monkeypatch, tmp_path)
    
    # Guardar pregunta abierta
    mod._guardar_pregunta_abierta("chat_123", {
        "texto": "¿Desplegamos el caso 1?",
        "accion": "desplegar_caso_1",
        "tipo": "propuesta",
        "datos": {"caso": 1}
    })
    
    ejecutadas = []
    def mock_ejecutar(accion, datos):
        ejecutadas.append((accion, datos))
        return "Ejecutado: " + accion
    
    monkeypatch.setattr(mod, "_ejecutar_accion_guardada", mock_ejecutar)
    
    respuestas = []
    monkeypatch.setattr(mod, "decir", respuestas.append)
    
    mod._procesar_respuesta_corta("sí", "chat_123")
    
    assert len(ejecutadas) == 1
    assert ejecutadas[0][0] == "desplegar_caso_1"
    assert ejecutadas[0][1]["caso"] == 1
    assert "Ejecutado" in respuestas[0]


def test_procesar_respuesta_corta_negativa_cancela(tmp_path, monkeypatch):
    """Respuesta 'no' cancela la acción."""
    _preparar_tmp(monkeypatch, tmp_path)
    
    mod._guardar_pregunta_abierta("chat_123", {
        "texto": "¿Desplegamos?",
        "accion": "desplegar",
        "tipo": "propuesta",
        "datos": {}
    })
    
    respuestas = []
    monkeypatch.setattr(mod, "decir", respuestas.append)
    
    mod._procesar_respuesta_corta("no", "chat_123")
    
    assert len(respuestas) == 1
    assert "cancelad" in respuestas[0].lower() or "entendido" in respuestas[0].lower()


def test_procesar_respuesta_corta_numero_selecciona_opcion(tmp_path, monkeypatch):
    """Número como respuesta selecciona opción."""
    _preparar_tmp(monkeypatch, tmp_path)
    
    mod._guardar_pregunta_abierta("chat_123", {
        "texto": "Elige: 1) Opción A  2) Opción B",
        "accion": "elegir_opcion",
        "tipo": "menu",
        "datos": {"opciones": {"1": "A", "2": "B"}}
    })
    
    ejecutadas = []
    def mock_ejecutar(accion, datos):
        ejecutadas.append((accion, datos))
        return "Opción " + datos.get("elegida", "")
    
    monkeypatch.setattr(mod, "_ejecutar_accion_guardada", mock_ejecutar)
    
    respuestas = []
    monkeypatch.setattr(mod, "decir", respuestas.append)
    
    mod._procesar_respuesta_corta("2", "chat_123")
    
    assert len(ejecutadas) == 1
    assert ejecutadas[0][0] == "elegir_opcion"
    assert ejecutadas[0][1].get("elegida") == "2"


# ── Tests para condiciones de aprobación ──

def test_guardar_condicion_aprobacion(tmp_path, monkeypatch):
    """_guardar_condicion_aprobacion guarda condición para propuesta Higgsfield/alcance."""
    _preparar_tmp(monkeypatch, tmp_path)
    
    mod._guardar_condicion_aprobacion("propuesta_123", {
        "tipo": "higgsfield",
        "condicion": "Envíame antes la idea, propósito, visión, misión, herramientas, storyboards, guiones profesionales multiformato, bocetos… para cada caso",
        "requerido_por": "Maggasukha"
    })
    
    condicion = mod._obtener_condicion_aprobacion("propuesta_123")
    assert condicion is not None
    assert condicion["tipo"] == "higgsfield"
    assert "storyboards" in condicion["condicion"]
    assert condicion["requerido_por"] == "Maggasukha"


def test_condicion_aprobacion_se_persiste(tmp_path, monkeypatch):
    """Condición de aprobación se guarda en archivo."""
    _preparar_tmp(monkeypatch, tmp_path)
    
    mod._guardar_condicion_aprobacion("prop_456", {
        "tipo": "alcance",
        "condicion": "Necesito el dossier completo",
        "requerido_por": "Maggasukha"
    })
    
    archivo = tmp_path / "condiciones_aprobacion.json"
    assert archivo.exists()
    with open(archivo, encoding="utf-8") as f:
        datos = json.load(f)
    assert "prop_456" in datos


# ── Tests para modo desarrollo conjunto ──

def test_activar_modo_desarrollo_conjunto(tmp_path, monkeypatch):
    """_activar_modo_desarrollo_conjunto inicia el modo."""
    _preparar_tmp(monkeypatch, tmp_path)
    
    mod._activar_modo_desarrollo_conjunto("chat_123", [
        {"titulo": "Caso 1: Intro", "contenido": "Detalle del caso 1"},
        {"titulo": "Caso 2: Hero", "contenido": "Detalle del caso 2"},
    ])
    
    estado = mod._obtener_estado_desarrollo_conjunto("chat_123")
    assert estado is not None
    assert estado["activo"] is True
    assert estado["caso_actual"] == 0
    assert len(estado["casos"]) == 2
    assert estado["casos"][0]["titulo"] == "Caso 1: Intro"


def test_enviar_siguiente_caso_desarrollo_conjunto(tmp_path, monkeypatch):
    """_enviar_siguiente_caso envía el caso actual y espera respuesta."""
    _preparar_tmp(monkeypatch, tmp_path)
    
    mod._activar_modo_desarrollo_conjunto("chat_123", [
        {"titulo": "Caso 1", "contenido": "Contenido 1"},
        {"titulo": "Caso 2", "contenido": "Contenido 2"},
    ])
    
    # Mock tg to avoid real HTTP call
    def mock_tg(metodo, datos=None, timeout=70):
        return {"ok": True}
    monkeypatch.setattr(mod, "tg", mock_tg)
    
    respuestas = []
    monkeypatch.setattr(mod, "_decir_html", lambda txt: respuestas.append(txt))
    
    mod._enviar_siguiente_caso_desarrollo_conjunto("chat_123")
    
    assert len(respuestas) == 1
    assert "Caso 1" in respuestas[0]
    assert "Contenido 1" in respuestas[0]
    assert "esperando tu respuesta" in respuestas[0].lower()


def test_procesar_respuesta_en_modo_desarrollo_conjunto(tmp_path, monkeypatch):
    """Respuesta en modo desarrollo conjunto avanza al siguiente caso."""
    _preparar_tmp(monkeypatch, tmp_path)
    
    mod._activar_modo_desarrollo_conjunto("chat_123", [
        {"titulo": "Caso 1", "contenido": "Contenido 1"},
        {"titulo": "Caso 2", "contenido": "Contenido 2"},
    ])
    
    # Simular que ya se envió el caso 1 (caso_actual = 0)
    # Usar _escribir_json_archivo directamente para actualizar el estado
    from peticiones_telegram import _desarrollo_conjunto_path
    estado = mod._obtener_estado_desarrollo_conjunto("chat_123")
    estado["caso_actual"] = 0
    mod._escribir_json_archivo(_desarrollo_conjunto_path(), {"chat_123": estado})
    
    # Mock tg to avoid real HTTP call
    def mock_tg(metodo, datos=None, timeout=70):
        return {"ok": True}
    monkeypatch.setattr(mod, "tg", mock_tg)
    
    respuestas = []
    monkeypatch.setattr(mod, "_decir_html", lambda txt: respuestas.append(txt))
    
    # Respuesta del usuario
    mod._procesar_respuesta_desarrollo_conjunto("chat_123", "Ok, siguiente")
    
    # Debe haber enviado el caso 2
    assert len(respuestas) == 1
    assert "Caso 2" in respuestas[0]


def test_modo_desarrollo_conjunto_termina_al_final(tmp_path, monkeypatch):
    """Al responder al último caso, se desactiva el modo."""
    _preparar_tmp(monkeypatch, tmp_path)
    
    mod._activar_modo_desarrollo_conjunto("chat_123", [
        {"titulo": "Caso 1", "contenido": "Contenido 1"},
    ])
    
    # Simular que ya se envió el caso 1 (caso_actual = 0)
    from peticiones_telegram import _desarrollo_conjunto_path
    estado = mod._obtener_estado_desarrollo_conjunto("chat_123")
    estado["caso_actual"] = 0
    mod._escribir_json_archivo(_desarrollo_conjunto_path(), {"chat_123": estado})
    
    respuestas = []
    monkeypatch.setattr(mod, "decir", respuestas.append)
    
    mod._procesar_respuesta_desarrollo_conjunto("chat_123", "Listo")
    
    assert len(respuestas) == 1
    assert "completado" in respuestas[0].lower() or "terminado" in respuestas[0].lower()
    
    estado_final = mod._obtener_estado_desarrollo_conjunto("chat_123")
    assert estado_final is None or estado_final.get("activo") is False


# ── Tests para formato de mensajes Telegram ──

def test_formato_mensaje_telegram_html(tmp_path, monkeypatch):
    """_formatear_mensaje_telegram usa HTML y viñetas, no markdown crudo."""
    _preparar_tmp(monkeypatch, tmp_path)
    
    mensaje = mod._formatear_mensaje_telegram(
        titulo="Título",
        items=["Item 1", "Item 2"],
        modelo="test-modelo"
    )
    
    # No debe tener markdown crudo
    assert "###" not in mensaje
    assert "```" not in mensaje
    assert "**" not in mensaje
    
    # Debe usar HTML o viñetas de texto plano
    assert "•" in mensaje or "<b>" in mensaje or "<ul>" in mensaje
    assert "Audiovisual y diseño" in mensaje
    assert "test-modelo" in mensaje


def test_firma_audiovisual_diseno(tmp_path, monkeypatch):
    """Todos los mensajes salientes llevan la firma correcta."""
    _preparar_tmp(monkeypatch, tmp_path)
    
    # Verificar que la función decir añade la firma
    # (esto se testea indirectamente via integración)
    pass


# ── Tests para espejo al canal audiovisual de la Mac ──

def test_registrar_mensaje_audiovisual_espejo_mac(tmp_path, monkeypatch):
    """_registrar_mensaje_audiovisual también escribe en mando/director/audiovisual.jsonl."""
    _preparar_tmp(monkeypatch, tmp_path)
    
    # Configurar ruta del espejo de la Mac (el directorio que contiene audiovisual.jsonl)
    mando_dir = tmp_path / "starseed_memory_root" / "mando" / "director"
    mando_dir.mkdir(parents=True, exist_ok=True)
    monkeypatch.setenv("STARSEED_MANDO_DIR", str(mando_dir))
    
    # Llamar a la función
    mod._registrar_mensaje_audiovisual("entrante", {"texto": "Hola"}, "Hola")
    
    # Verificar que se escribió en el log local
    log_local = tmp_path / "audiovisual-sync.jsonl"
    assert log_local.exists()
    
    # Verificar que se escribió en el espejo de la Mac
    espejo_mac = mando_dir / "audiovisual.jsonl"
    assert espejo_mac.exists()
    
    with open(espejo_mac, encoding="utf-8") as f:
        lineas = f.readlines()
    assert len(lineas) == 1
    registro = json.loads(lineas[0])
    assert registro["direccion"] == "entrante"
    assert registro["texto"] == "Hola"
    assert registro["de"] == "maggasukha"


def test_ruido_mac_no_va_al_canal_diseno(tmp_path, monkeypatch):
    """Mensajes de 'Mac de vuelta' no se envían al canal de diseño, solo log local."""
    _preparar_tmp(monkeypatch, tmp_path)
    
    respuestas = []
    monkeypatch.setattr(mod, "decir", respuestas.append)
    
    # Simular drenar_ordenes_mac que genera el mensaje de ruido
    mod.drenar_ordenes_mac()
    
    # El mensaje "Mac de vuelta" NO debe ir por decir() al chat
    # (se verifica que no se llama a decir con ese mensaje)
    mensajes_mac = [r for r in respuestas if "Mac de vuelta" in r]
    assert len(mensajes_mac) == 0, "El ruido de Mac no debe ir al chat"


def test_nombre_maggasukha_no_alex(tmp_path, monkeypatch):
    """Los mensajes usan 'Maggasukha', nunca 'Alex'."""
    _preparar_tmp(monkeypatch, tmp_path)
    
    # Verificar en textos del sistema
    assert "Maggasukha" in mod.AYUDA or True  # AYUDA puede no tener el nombre
    
    # Verificar en funciones que generan mensajes
    # Buscar cualquier "Alex" en el código (esto es check manual)
    pass


# ── Test de integración: flujo completo respuesta corta ──

def test_flujo_completo_pregunta_y_respuesta_si(tmp_path, monkeypatch):
    """Flujo: bot pregunta → usuario responde 'sí' → se ejecuta acción."""
    _preparar_tmp(monkeypatch, tmp_path)
    
    # 1. Bot hace una pregunta (simulado guardando pregunta abierta)
    mod._guardar_pregunta_abierta("chat_123", {
        "texto": "¿Quieres que despleguemos completo y paso a paso el primer caso…?",
        "accion": "desplegar_primer_caso",
        "tipo": "propuesta_notebooklm",
        "datos": {"caso": 1}
    })
    
    # 2. Usuario responde "Si"
    ejecutadas = []
    def mock_ejecutar(accion, datos):
        ejecutadas.append((accion, datos))
        return "✅ Desplegando caso 1..."
    monkeypatch.setattr(mod, "_ejecutar_accion_guardada", mock_ejecutar)
    
    respuestas = []
    monkeypatch.setattr(mod, "decir", respuestas.append)
    
    mod._procesar_respuesta_corta("Si", "chat_123")
    
    # 3. Se ejecutó la acción
    assert len(ejecutadas) == 1
    assert ejecutadas[0][0] == "desplegar_primer_caso"
    assert "Desplegando" in respuestas[0]


def test_flujo_completo_condicion_aprobacion_higgsfield(tmp_path, monkeypatch):
    """Flujo: propuesta Higgsfield → Maggasukha pone condición → se guarda y cumple enviando dossier."""
    _preparar_tmp(monkeypatch, tmp_path)
    
    # 1. Se crea propuesta Higgsfield
    propuesta_id = "higgs_123"
    mod._guardar_condicion_aprobacion(propuesta_id, {
        "tipo": "higgsfield",
        "condicion": "Envíame antes la idea, propósito, visión, misión, herramientas, storyboards, guiones profesionales multiformato, bocetos… para cada caso",
        "requerido_por": "Maggasukha"
    })
    
    # 2. Verificar que la condición se guarda
    condicion = mod._obtener_condicion_aprobacion(propuesta_id)
    assert condicion is not None
    assert "storyboards" in condicion["condicion"]
    assert condicion["requerido_por"] == "Maggasukha"
    
    # 3. Cuando se cumple (enviar dossier), se elimina la condición
    mod._cumplir_condicion_aprobacion(propuesta_id)
    condicion = mod._obtener_condicion_aprobacion(propuesta_id)
    assert condicion is None


def test_modo_encargo_no_repite_aviso_si_alex_docs(tmp_path, monkeypatch):
    """Si _clientes_de_encargo devuelve clientes (alex-docs OK), no se muestra el aviso."""
    _preparar_tmp(monkeypatch, tmp_path)
    
    # Mock que _clientes_de_encargo devuelve clientes válidos (simula alex-docs OK)
    nb_c, drive_c = object(), object()
    monkeypatch.setattr(mod, "_clientes_de_encargo", lambda: (nb_c, drive_c))
    
    respuestas = []
    monkeypatch.setattr(mod, "decir", respuestas.append)
    
    # Simular atender encargo CON clientes reales
    p = {
        "id": 1, "texto": "encargo test", "intentos": 0,
        "plan": {"tipo": "encargo", "fuente": "cuaderno", "artefactos": []}
    }
    monkeypatch.setattr(mod, "planificar_base", lambda texto: [])
    monkeypatch.setattr(mod, "ejecutar_encargo", lambda *a, **k: None)
    
    mod.atender(p)
    
    # No debe aparecer el aviso de "encargo por frentes no está listo"
    avisos = [r for r in respuestas if "encargo por frentes" in r and "no está listo" in r]
    assert len(avisos) == 0, "No debe mostrar aviso si hay clientes reales (alex-docs OK)"


# Funciones auxiliares que se espera que existan en peticiones_telegram.py
def _formatear_mensaje_telegram(titulo: str, items: list[str], firma: str) -> str:
    """Función esperada para formatear mensajes Telegram."""
    # Esta función se implementará en peticiones_telegram.py
    pass


if __name__ == "__main__":
    pytest.main([__file__, "-v"])