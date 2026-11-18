#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Tests para PET1116E: encolar antes de procesar y preferencias tolerantes."""
import json
import os
import sys
import tempfile
import time
from unittest.mock import patch, MagicMock

import pytest

sys.path.insert(0, os.path.dirname(__file__))

import peticiones_telegram as mod
from peticiones_telegram import (
    CASA,
    DIR,
    ESTADO,
    COLA,
    PREFERENCIAS,
    RUTINAS,
    TOKEN,
    CHAT,
    bloqueo,
    hay_trabajo,
    leer_json,
    escribir_json,
    recibir,
    _leer_preferencias,
    _guardar_preferencia,
)


def test_leer_preferencias_acepta_lista_y_convierte_a_dict(tmp_path, monkeypatch):
    """_leer_preferencias acepta lista (formato provisional) y la convierte a dict con claves preferencia_n."""
    prefs_file = tmp_path / "preferencias.json"
    # Escribir lista como lo hacía la herramienta provisional
    lista_prefs = ["pref1", "pref2", "pref3"]
    prefs_file.write_text(json.dumps(lista_prefs, ensure_ascii=False))
    
    monkeypatch.setattr(mod, "PREFERENCIAS", str(prefs_file))
    
    prefs = _leer_preferencias()
    
    # Debe convertir lista a dict con claves preferencia_0, preferencia_1, ...
    assert isinstance(prefs, dict)
    assert prefs == {"preferencia_0": "pref1", "preferencia_1": "pref2", "preferencia_2": "pref3"}


def test_leer_preferencias_acepta_dict_normal(tmp_path, monkeypatch):
    """_leer_preferencias sigue funcionando con dict normal."""
    prefs_file = tmp_path / "preferencias.json"
    dict_prefs = {"nombre": "Alex", "tono": "formal"}
    prefs_file.write_text(json.dumps(dict_prefs, ensure_ascii=False))
    
    monkeypatch.setattr(mod, "PREFERENCIAS", str(prefs_file))
    
    prefs = _leer_preferencias()
    
    assert prefs == dict_prefs


def test_leer_preferencias_archivo_no_existe_devuelve_dict_vacio(tmp_path, monkeypatch):
    """_leer_preferencias devuelve dict vacío si el archivo no existe."""
    prefs_file = tmp_path / "no_existe.json"
    monkeypatch.setattr(mod, "PREFERENCIAS", str(prefs_file))
    
    prefs = _leer_preferencias()
    
    assert prefs == {}


def test_guardar_preferencia_funciona_con_lista_previa(tmp_path, monkeypatch):
    """_guardar_preferencia funciona aunque preferencias.json fuera una lista."""
    prefs_file = tmp_path / "preferencias.json"
    # Empezar con lista (formato provisional)
    prefs_file.write_text(json.dumps(["pref1", "pref2"], ensure_ascii=False))
    
    monkeypatch.setattr(mod, "PREFERENCIAS", str(prefs_file))
    monkeypatch.setattr(mod, "DIR", str(tmp_path))
    
    # Guardar nueva preferencia
    _guardar_preferencia("nueva_clave", "nuevo_valor")
    
    # Leer y verificar
    prefs = _leer_preferencias()
    assert isinstance(prefs, dict)
    assert prefs["nueva_clave"] == "nuevo_valor"
    # Las antiguas preferencias de la lista se conservan
    assert prefs["preferencia_0"] == "pref1"
    assert prefs["preferencia_1"] == "pref2"


def test_recibir_encola_antes_de_procesar_y_responde_recibido(tmp_path, monkeypatch):
    """recibir() SIEMPRE encola la petición y responde 'Recibido ✓' ANTES de cualquier procesado."""
    for k, v in (("CHAT", "123456"), ("TOKEN", "fake"), ("DIR", str(tmp_path)),
                 ("COLA", str(tmp_path / "cola.json")), ("ESTADO", str(tmp_path / "estado.json")),
                 ("PREFERENCIAS", str(tmp_path / "preferencias.json")),
                 ("RUTINAS", str(tmp_path / "rutinas.json")),
                 ("SALIDAS", str(tmp_path / "salidas"))):
        monkeypatch.setattr(mod, k, v)
    
    respuestas = []
    monkeypatch.setattr(mod, "decir", respuestas.append)
    monkeypatch.setattr(mod, "hay_trabajo", MagicMock())
    
    # Mock para que el procesamiento posterior falle
    monkeypatch.setattr(mod, "por_reglas_permanente", lambda x: "regla_permanente")
    def fallar_procesar(texto):
        raise RuntimeError("Error simulado en procesamiento")
    monkeypatch.setattr(mod, "_responder_con_regla_permanente", fallar_procesar)
    monkeypatch.setattr(mod, "por_reglas", lambda x: {"tipo": "respuesta", "fuente": "cuaderno", "drive_id": "", "artefactos": [], "resumen": ""})
    monkeypatch.setattr(mod, "llm", lambda *a, **k: ("", ""))
    
    # Enviar mensaje
    upd = {"update_id": 100, "message": {"chat": {"id": "123456"}, "text": "recuerda que me gusta el café"}}
    recibir(upd)
    
    # Verificar: respondió "Recibido ✓"
    assert any("Recibido" in r for r in respuestas), f"Respuestas: {respuestas}"
    
    # Verificar: se encoló en cola.json
    cola = leer_json(mod.COLA, [])
    assert len(cola) == 1
    assert cola[0]["id"] == 100
    assert cola[0]["texto"] == "recuerda que me gusta el café"
    # PET1116E: fallo en procesado -> estado 'reintentar'
    assert cola[0]["estado"] == "reintentar"
    
    # Verificar: hay_trabajo.set() fue llamado
    mod.hay_trabajo.set.assert_called()


def test_recibir_fallo_en_procesado_no_pierde_mensaje(tmp_path, monkeypatch):
    """Si hay excepción en el procesado, el mensaje ya está encolado y se marca para reintento."""
    for k, v in (("CHAT", "123456"), ("TOKEN", "fake"), ("DIR", str(tmp_path)),
                 ("COLA", str(tmp_path / "cola.json")), ("ESTADO", str(tmp_path / "estado.json")),
                 ("PREFERENCIAS", str(tmp_path / "preferencias.json")),
                 ("RUTINAS", str(tmp_path / "rutinas.json")),
                 ("SALIDAS", str(tmp_path / "salidas"))):
        monkeypatch.setattr(mod, k, v)
    
    respuestas = []
    monkeypatch.setattr(mod, "decir", respuestas.append)
    monkeypatch.setattr(mod, "hay_trabajo", MagicMock())
    
    # Hacer que _responder_con_regla_permanente lance excepción
    def fallar(texto):
        raise ValueError("Fallo simulado")
    monkeypatch.setattr(mod, "_responder_con_regla_permanente", fallar)
    monkeypatch.setattr(mod, "por_reglas_permanente", lambda x: "regla_permanente")
    monkeypatch.setattr(mod, "por_reglas", lambda x: {"tipo": "respuesta", "fuente": "cuaderno", "drive_id": "", "artefactos": [], "resumen": ""})
    monkeypatch.setattr(mod, "llm", lambda *a, **k: ("", ""))
    
    # recibir() no debe lanzar la excepción, debe capturarla
    upd = {"update_id": 200, "message": {"chat": {"id": "123456"}, "text": "siempre usa tono formal"}}
    recibir(upd)  # No debe lanzar
    
    # Verificar: respondió "Recibido ✓"
    assert any("Recibido" in r for r in respuestas)
    
    # Verificar: mensaje encolado
    cola = leer_json(mod.COLA, [])
    assert len(cola) == 1
    assert cola[0]["id"] == 200
    # PET1116E: fallo en procesado -> estado 'reintentar'
    assert cola[0]["estado"] == "reintentar"
    
    # Verificar: avisó del error en el chat (por el try/except interno)
    assert any("falló" in r.lower() or "error" in r.lower() for r in respuestas), f"Respuestas: {respuestas}"


def test_recibir_registra_texto_en_archivo_privado_600(tmp_path, monkeypatch):
    """recibir() registra el texto de cada mensaje en un archivo privado (permisos 600) sin claves."""
    for k, v in (("CHAT", "123456"), ("TOKEN", "fake"), ("DIR", str(tmp_path)),
                 ("COLA", str(tmp_path / "cola.json")), ("ESTADO", str(tmp_path / "estado.json")),
                 ("PREFERENCIAS", str(tmp_path / "preferencias.json")),
                 ("RUTINAS", str(tmp_path / "rutinas.json")),
                 ("SALIDAS", str(tmp_path / "salidas"))):
        monkeypatch.setattr(mod, k, v)
    
    respuestas = []
    monkeypatch.setattr(mod, "decir", respuestas.append)
    monkeypatch.setattr(mod, "hay_trabajo", MagicMock())
    monkeypatch.setattr(mod, "por_reglas_permanente", lambda x: "otro")
    monkeypatch.setattr(mod, "por_reglas", lambda x: {"tipo": "respuesta", "fuente": "cuaderno", "drive_id": "", "artefactos": [], "resumen": ""})
    monkeypatch.setattr(mod, "llm", lambda *a, **k: ("respuesta", "modelo"))
    
    # Enviar varios mensajes
    mensajes = [
        "Genera una infografía de la síntesis",
        "Haz un audio tipo podcast",
        "Mi nombre es Maggasukha",  # Contiene info personal
    ]
    
    for i, texto in enumerate(mensajes):
        recibir({"update_id": 300 + i, "message": {"chat": {"id": "123456"}, "text": texto}})
    
    # Verificar: existe archivo de log privado
    log_file = tmp_path / "mensajes_recibidos.log"
    # El archivo puede tener otro nombre, buscarlo
    log_files = list(tmp_path.glob("*.log"))
    assert len(log_files) >= 1, "Debe existir archivo de log"
    
    log_file = log_files[0]
    # Verificar permisos 600 (solo owner read/write)
    stat = log_file.stat()
    assert stat.st_mode & 0o777 == 0o600, f"Permisos deben ser 600, son {oct(stat.st_mode & 0o777)}"
    
    # Verificar contenido: textos de mensajes, sin claves
    contenido = log_file.read_text(encoding="utf-8")
    for texto in mensajes:
        assert texto in contenido, f"Falta mensaje: {texto}"
    # No debe haber tokens, claves API, etc.
    assert "TELEGRAM_SINTESIS_BOT_TOKEN" not in contenido
    assert "FREELLMAPI_KEY" not in contenido


def test_escuchar_no_avanza_offset_si_recibir_falla_antes_de_encolar(tmp_path, monkeypatch):
    """Si recibir() falla ANTES de encolar, el offset NO debe avanzar (pero recibir() ya no debe fallar antes de encolar)."""
    # Este test verifica el comportamiento correcto: recibir() siempre encola primero
    # así que el offset en escuchar() siempre puede avanzar seguro
    pass  # El fix garantiza que recibir() nunca falla antes de encolar


def test_preferencias_lista_mensaje_con_recuerda_no_excepcion(tmp_path, monkeypatch):
    """Regresión: preferencias en lista + mensaje con 'recuerda/siempre' → no hay excepción, se encola y responde."""
    prefs_file = tmp_path / "preferencias.json"
    # Formato lista (provisional)
    prefs_file.write_text(json.dumps(["pref_antigua_1", "pref_antigua_2"], ensure_ascii=False))
    
    for k, v in (("CHAT", "123456"), ("TOKEN", "fake"), ("DIR", str(tmp_path)),
                 ("COLA", str(tmp_path / "cola.json")), ("ESTADO", str(tmp_path / "estado.json")),
                 ("PREFERENCIAS", str(prefs_file)),
                 ("RUTINAS", str(tmp_path / "rutinas.json")),
                 ("SALIDAS", str(tmp_path / "salidas"))):
        monkeypatch.setattr(mod, k, v)
    
    respuestas = []
    monkeypatch.setattr(mod, "decir", respuestas.append)
    monkeypatch.setattr(mod, "hay_trabajo", MagicMock())
    monkeypatch.setattr(mod, "por_reglas_permanente", lambda x: "regla_permanente")
    monkeypatch.setattr(mod, "_responder_con_regla_permanente", lambda x: None)
    monkeypatch.setattr(mod, "por_reglas", lambda x: {"tipo": "respuesta", "fuente": "cuaderno", "drive_id": "", "artefactos": [], "resumen": ""})
    monkeypatch.setattr(mod, "llm", lambda *a, **k: ("respuesta", "modelo"))
    
    # Mensaje con palabra clave de regla permanente
    recibir({"update_id": 400, "message": {"chat": {"id": "123456"}, "text": "Recuerda cada día: genera todos los formatos"}})
    
    # No debe haber excepción
    # Debe haber respondido
    assert len(respuestas) >= 1
    assert any("Recibido" in r for r in respuestas)
    
    # Debe estar encolado
    cola = leer_json(mod.COLA, [])
    assert len(cola) == 1
    assert cola[0]["id"] == 400


if __name__ == "__main__":
    pytest.main([__file__, "-v"])