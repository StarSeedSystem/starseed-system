#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Tests para peticiones_reglas.py — reglas puras, sin red."""
import json
import os
import sys
sys.path.insert(0, os.path.dirname(__file__))

from peticiones_reglas import (
    TIPOS,
    CLAVES_TIPO,
    INDICACIONES,
    AYUDA,
    RENOVAR,
    por_reglas,
    validar_plan,
    texto_estado,
)


def test_tipos_estructura():
    """TIPOS tiene todos los artefactos esperados con campos correctos."""
    esperados = {"infographic", "audio", "video", "slide-deck", "report", "mind-map", "quiz", "flashcards", "data-table"}
    assert set(TIPOS.keys()) == esperados
    for tipo, (nombre, ext, fijas, tope, idioma, espera) in TIPOS.items():
        assert isinstance(nombre, str) and nombre
        assert isinstance(ext, str) and ext.startswith(".")
        assert isinstance(fijas, list)
        assert isinstance(tope, int) and tope > 0
        assert isinstance(idioma, bool)
        assert isinstance(espera, bool)


def test_claves_tipo_cobertura():
    """CLAVES_TIPO cubre todos los tipos de TIPOS."""
    tipos_en_claves = {k for k, _ in CLAVES_TIPO}
    assert tipos_en_claves == set(TIPOS.keys())


def test_indicaciones_presentes():
    """INDICACIONES tiene al menos infographic y audio."""
    assert "infographic" in INDICACIONES
    assert "audio" in INDICACIONES


def test_ayuda_contiene_elementos_clave():
    """AYUDA menciona MetaGenesis, A1, ejemplos y /estado."""
    assert "MetaGenesis" in AYUDA
    assert "A1" in AYUDA
    assert "infografía" in AYUDA.lower()
    assert "audio" in AYUDA.lower()
    assert "/estado" in AYUDA


def test_renovar_menciona_metagenesis():
    """RENOVAR menciona MetaGenesis y Apps Linux."""
    assert "MetaGenesis" in RENOVAR
    assert "Apps Linux" in RENOVAR


def test_por_reglas_infografia_y_audio_ultima_sintesis():
    """Mensaje real de Alex → infographic + audio, fuente ultima_sintesis."""
    msg = "infografía y resumen de audio tipo podcast de la última síntesis"
    plan = por_reglas(msg)
    assert plan["tipo"] == "notebooklm"
    assert plan["fuente"] == "ultima_sintesis"
    assert plan["drive_id"] == ""
    tipos = {a["tipo"] for a in plan["artefactos"]}
    assert "infographic" in tipos
    assert "audio" in tipos
    assert len(plan["artefactos"]) == 2


def test_por_reglas_mapa_mental_cuaderno():
    """Pide mapa mental del cuaderno → mind-map, fuente cuaderno."""
    msg = "mapa mental del cuaderno de producción"
    plan = por_reglas(msg)
    assert plan["tipo"] == "notebooklm"
    assert plan["fuente"] == "cuaderno"
    assert plan["artefactos"] == [{"tipo": "mind-map", "indicaciones": ""}]


def test_por_reglas_presentacion_drive():
    """Enlace de Drive → slide-deck, fuente drive con id."""
    msg = "presentación de este Doc: https://docs.google.com/document/d/1ABCdefGHijkLMNopQRS/edit"
    plan = por_reglas(msg)
    assert plan["tipo"] == "notebooklm"
    assert plan["fuente"] == "drive"
    assert plan["drive_id"] == "1ABCdefGHijkLMNopQRS"
    assert plan["artefactos"] == [{"tipo": "slide-deck", "indicaciones": ""}]


def test_por_reglas_pregunta_general_respuesta():
    """Pregunta sin palabras clave → respuesta (no notebooklm)."""
    msg = "¿Cómo está el proyecto?"
    plan = por_reglas(msg)
    assert plan["tipo"] == "respuesta"
    assert plan["artefactos"] == []


def test_por_reglas_chat_ajeno_ignorado_no_es_regla():
    """por_reglas no filtra por chat; eso lo hace la capa de Telegram."""
    # Esta prueba documenta que por_reglas es pura y no conoce CHAT_ID
    plan = por_reglas("infografía de la síntesis")
    assert plan["tipo"] == "notebooklm"


def test_validar_plan_acepta_plan_valido():
    """Plan válido del modelo pasa la validación."""
    plan = {
        "tipo": "notebooklm",
        "fuente": "ultima_sintesis",
        "drive_id": "",
        "artefactos": [
            {"tipo": "infographic", "indicaciones": "destacar recomendaciones"},
            {"tipo": "audio", "indicaciones": "tono cálido"},
        ],
        "resumen": "Generar infografía y audio de la última síntesis",
    }
    ok, err = validar_plan(plan)
    assert ok is True
    assert err == ""


def test_validar_plan_rechaza_tipo_invalido():
    """Tipo desconocido → error."""
    plan = {"tipo": "notebooklm", "fuente": "ultima_sintesis", "drive_id": "", "artefactos": [{"tipo": "inexistente", "indicaciones": ""}], "resumen": ""}
    ok, err = validar_plan(plan)
    assert ok is False
    assert "tipo de artefacto desconocido" in err.lower()


def test_validar_plan_rechaza_fuente_invalida():
    """Fuente desconocida → error."""
    plan = {"tipo": "notebooklm", "fuente": "desconocida", "drive_id": "", "artefactos": [{"tipo": "infographic", "indicaciones": ""}], "resumen": ""}
    ok, err = validar_plan(plan)
    assert ok is False
    assert "fuente" in err.lower()


def test_validar_plan_drive_sin_id():
    """Fuente drive sin drive_id → error."""
    plan = {"tipo": "notebooklm", "fuente": "drive", "drive_id": "", "artefactos": [{"tipo": "infographic", "indicaciones": ""}], "resumen": ""}
    ok, err = validar_plan(plan)
    assert ok is False
    assert "drive_id" in err.lower()


def test_validar_plan_elimina_duplicados():
    """Artefactos duplicados se deduplican (mantiene el primero)."""
    plan = {"tipo": "notebooklm", "fuente": "ultima_sintesis", "drive_id": "", "artefactos": [{"tipo": "infographic", "indicaciones": "a"}, {"tipo": "infographic", "indicaciones": "b"}], "resumen": ""}
    ok, err = validar_plan(plan)
    assert ok is True
    # validar_plan no modifica, solo valida; la deduplicación es en interpretar
    # esta prueba verifica que no falla por duplicados


def test_validar_plan_limite_4_artefactos():
    """Más de 4 artefactos → error (límite de seguridad)."""
    plan = {"tipo": "notebooklm", "fuente": "ultima_sintesis", "drive_id": "", "artefactos": [{"tipo": "infographic", "indicaciones": ""}, {"tipo": "audio", "indicaciones": ""}, {"tipo": "video", "indicaciones": ""}, {"tipo": "slide-deck", "indicaciones": ""}, {"tipo": "report", "indicaciones": ""}], "resumen": ""}
    ok, err = validar_plan(plan)
    assert ok is False
    assert "4" in err or "cuatro" in err.lower()


def test_texto_estado_formato():
    """texto_estado devuelve líneas con estado NotebookLM y peticiones."""
    cola = [
        {"id": 1, "estado": "nueva", "texto": "infografía de la síntesis", "recibida": 1000.0},
        {"id": 2, "estado": "hecha", "texto": "audio podcast", "recibida": 2000.0, "terminada": 3000.0},
    ]
    nb_estado = {"viva": True, "comprobada": "2026-11-12T10:30"}
    texto = texto_estado(cola, nb_estado)
    assert "Estado de MetaGenesis (A1):" in texto
    assert "viva" in texto
    assert "2026-11-12T10:30" in texto
    assert "en curso: 1" in texto
    assert "hechas: 1" in texto
    assert "infografía de la síntesis" in texto


def test_texto_estado_sin_peticiones():
    """Estado con cola vacía."""
    texto = texto_estado([], {"viva": False, "comprobada": "—"})
    assert "en curso: 0" in texto
    assert "hechas: 0" in texto
    assert "caducada" in texto or "sin comprobar" in texto


if __name__ == "__main__":
    import os
    # Ejecutar todas las funciones test_*
    import inspect
    fallos = 0
    for nombre, fn in list(globals().items()):
        if nombre.startswith("test_") and callable(fn):
            try:
                fn()
                print(f"✓ {nombre}")
            except AssertionError as e:
                print(f"✗ {nombre}: {e}")
                fallos += 1
            except Exception as e:
                print(f"✗ {nombre}: ERROR {type(e).__name__}: {e}")
                fallos += 1
    if fallos:
        print(f"\n{fallos} test(s) fallaron")
        sys.exit(1)
    else:
        print(f"\nTodos los tests pasaron")
        sys.exit(0)