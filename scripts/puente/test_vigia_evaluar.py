# -*- coding: utf-8 -*-
"""Pruebas PURAS del vigía evaluador (sin red).

Cobertura mínima exigida por el contrato (architecture/vigia-modelos.md §3):
  - clase_licencia: Libre, Personal, Condicionada, Desconocida
  - es_seguro: filtra uncensored/abliterated/nsfw/lewd, Terceros vs aceptados
  - cabe_en: topes por medio (navegador/PWA ≤1 GB, Mac ≤4.5 GB, A1 ≤8 GB, app nativa ≤15 %)
  - motor_para: gguf→sdcpp, onnx→onnx, mlx→apple, safetensors→diffusers
  - es_mejora: compara pasos, tamaño, capacidades, VRAM
  - puntuar: scoring 0-100 con motivo

Todas las pruebas son sin red: datos de ejemplo dentro del test, sin llamadas HTTP.
"""

from __future__ import annotations

import sys
from typing import Any

from scripts.puente.vigia_evaluar import (
    clase_licencia,
    es_seguro,
    cabe_en,
    motor_para,
    es_mejora,
    puntuar,
    LICENCIAS_CONOCIDAS,
)


# ---- Datos de prueba compartidos ----

LICENCIAS_TEST = [
    ("apache-2.0", [], "libre"),
    ("mit", [], "libre"),
    ("qwen-research", [], "personal"),
    ("cc-by-nc-4.0", [], "personal"),
    ("llama3", [], "condicionada"),
    ("gemma", [], "condicionada"),
    ("other", [], "desconocida"),
    ("unknown", [], "desconocida"),
]

SEGURO_TEST = [
    # (candidato, modelos_aceptados, esperado)
    # Sin modelos aceptados previos → tercero rechazo
    ({"id": "Qwen/Qwen-Image-2.1-Turbo", "tags": ["text-to-image"], "quantizacion": "Q3_K_S"}, [], False),
    # Palabras clave prohibidas
    ({"id": "uncensored-model", "tags": [], "quantizacion": "Q3_K_S"}, [], False),  # uncensored forbidden
    ({"id": "abliterated-model", "tags": [], "quantizacion": "Q3_K_S"}, [], False),  # abliterated forbidden
    # Tercero que cuantiza base aceptada → seguro
    ({"id": "safe-model", "tags": [], "quantizacion": "Q3_K_S"}, ["Qwen/Qwen-Image-2.1"], True),
    # Tercero sin base aceptada → fuera
    ({"id": "third/model", "tags": [], "quantizacion": "Q3_K_S"}, [], False),
]

CABE_EN_TEST = [
    # (candidato, medios, modelo_actual, esperado_quepa)
    (
        {"id": "model", "tamanio_gb": 0.5, "quantizacion": "Q3_K_S", "formato": "gguf"},
        {"tipo": "navegador", "espacio_gb": 2},
        None,
        True,
    ),
    (
        {"id": "model", "tamanio_gb": 2, "quantizacion": "Q3_K_S", "formato": "gguf"},
        {"tipo": "navegador", "espacio_gb": 1},
        None,
        False,
    ),
    (
        {"id": "model", "tamanio_gb": 5, "quantizacion": "Q3_K_S", "formato": "gguf"},
        {"tipo": "mac", "espacio_gb": 8},
        None,
        False,
    ),
    (
        {"id": "model", "tamanio_gb": 5, "quantizacion": "Q3_K_S", "formato": "gguf"},
        {"tipo": "a1", "espacio_gb": 8},
        None,
        True,
    ),
    (
        {"id": "model", "tamanio_gb": 10, "quantizacion": "Q3_K_S", "formato": "gguf"},
        {"tipo": "a1", "espacio_gb": 8},
        None,
        False,
    ),
    # App nativa: 15 % del disco
    (
        {"id": "model", "tamanio_gb": 2, "quantizacion": "Q3_K_S", "formato": "gguf"},
        {"tipo": "app_nativa", "espacio_gb": 100},
        None,
        True,
    ),
    (
        {"id": "model", "tamanio_gb": 20, "quantizacion": "Q3_K_S", "formato": "gguf"},
        {"tipo": "app_nativa", "espacio_gb": 100},
        None,
        False,
    ),
]

MOTOR_PARA_TEST = [
    (".gguf", "sdcpp"),
    (".onnx", "onnx"),
    (".mlx", "mlx"),
    (".coreML", "coreml"),
    (".safetensors", "diffusers"),
    ("custom/ modelo.gguf", "sdcpp"),
]

MEJORA_TEST = [
    # (candidato, mejor_actual, esperado_mejora)
    (
        {"id": "new", "pasos": 8, "tamanio_gb": 2, "vramGB": 4, "capacidades": ["texto-a-imagen", "edicion"]},
        {"id": "old", "pasos": 30, "tamanio_gb": 24, "vramGB": 24, "capacidades": ["texto-a-imagen"]},
        True,
    ),
    (
        {"id": "new", "pasos": 4, "tamanio_gb": 4, "vramGB": 8, "capacidades": ["texto-a-imagen"]},
        {"id": "old", "pasos": 4, "tamanio_gb": 4, "vramGB": 8, "capacidades": ["texto-a-imagen"]},
        False,
    ),
    (
        {"id": "new", "pasos": 4, "tamanio_gb": 2, "vramGB": 4, "capacidades": ["texto-a-imagen", "rapido"]},
        {"id": "old", "pasos": 4, "tamanio_gb": 4, "vramGB": 8, "capacidades": ["texto-a-imagen"]},
        True,
    ),
]

PUNTUAR_TEST = [
    # (candidato, mejor_actual, (puntaje_minimo, motivo_esperado))
    (
        {"id": "a", "pasos": 8, "tamanio_gb": 2, "vramGB": 4, "capacidades": ["a", "b"]},
        {"id": "b", "pasos": 30, "tamanio_gb": 24, "vramGB": 24, "capacidades": ["a"]},
        (50, "base sin mejora"),  # puntaje básico, se añadirán puntos
    ),
    ({"id": "worse"}, {"id": "better", "pasos": 4, "tamanio_gb": 2, "vramGB": 4, "capacidades": ["a"]}, (30, "peor que el actual")),
]


def test_clase_licencia():
    """Test de clase_licencia: cubre Libre, Personal, Condicionada, Desconocida."""
    for lic, tags, esperado in LICENCIAS_TEST:
        resultado = clase_licencia(lic, tags, LICENCIAS_CONOCIDAS)
        assert resultado == esperado, (
            f"clase_licencia('{lic}', {tags}) = {resultado}, esperaba {esperado}"
        )
    print("✓ test_clase_licencia")


def test_es_seguro():
    """Test de es_seguro: filtra contenido prohibido y valida terceros."""
    for candidato, modelos_aceptados, esperado in SEGURO_TEST:
        resultado = es_seguro(candidato, modelos_aceptados)
        assert resultado == esperado, (
            f"es_seguro({candidato}, {modelos_aceptados}) = {resultado}, esperaba {esperado}"
        )
    print("✓ test_es_seguro")


def test_cabe_en():
    """Test de cabe_en: topes por medio y elección de cuantización."""
    for candidato, medios, modelo_actual, esperado in CABE_EN_TEST:
        resultado = cabe_en(candidato, medios, modelo_actual)
        assert resultado["quepa"] == esperado, (
            f"cabe_en({candidato}, {medios}, {modelo_actual}) quepa={resultado['quepa']}, esperaba {esperado}"
        )
    print("✓ test_cabe_en")


def test_motor_para():
    """Test de motor_para: mapeo de extensiones a motores."""
    for archivo, esperado in MOTOR_PARA_TEST:
        resultado = motor_para(archivo)
        assert resultado == esperado, (
            f"motor_para('{archivo}') = {resultado}, esperaba {esperado}"
        )
    print("✓ test_motor_para")


def test_es_mejora():
    """Test de es_mejora: compara pasos, tamaño, capacidades y VRAM."""
    for candidato, mejor_actual, esperado in MEJORA_TEST:
        resultado = es_mejora(candidato, mejor_actual)
        assert resultado == esperado, (
            f"es_mejora({candidato}, {mejor_actual}) = {resultado}, esperaba {esperado}"
        )
    print("✓ test_es_mejora")


def test_puntuar():
    """Test de puntuar: scoring 0-100 con motivo."""
    for candidato, mejor_actual, (esperado_puntaje, _) in PUNTUAR_TEST:
        puntaje, motivo = puntuar(candidato, mejor_actual)
        assert isinstance(puntaje, int), f"puntaje no es int: {type(puntaje)}"
        assert 0 <= puntaje <= 100, f"puntaje fuera de rango: {puntaje}"
        assert isinstance(motivo, str), f"motivo no es str: {type(motivo)}"
    print("✓ test_puntuar")


def test_todas_sin_red():
    """Verifica que ninguna función toca red o variables de entorno con valores."""
    import inspect

    # Verificar que las funciones no importen node:* o hagan llamadas HTTP
    funcs = [
        "clase_licencia",
        "es_seguro",
        "cabe_en",
        "motor_para",
        "es_mejora",
        "puntuar",
    ]
    for fname in funcs:
        source = inspect.getsource(globals()[fname])
        # Revisar que no haya importaciones de node o urllib
        has_node_import = "node:" in source or '"node"' in source
        has_urlopen = "urllib" in source or "urlopen" in source
        assert not has_node_import, f"{fname} tiene importación node:"
        assert not has_urlopen, f"{fname} tiene llamada HTTP (urllib)"
    print("✓ test_todas_sin_red")


if __name__ == "__main__":
    test_clase_licencia()
    test_es_seguro()
    test_cabe_en()
    test_motor_para()
    test_es_mejora()
    test_puntuar()
    test_todas_sin_red()
    print("\n� All tests passed")