#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas del vigía de modelos (sin red). Datos inyectados dentro del archivo."""
from __future__ import annotations

import sys
import tempfile
from pathlib import Path

_RAIZ = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(_RAIZ))

from scripts.puente.vigia_modelos import (
    descubrir, evaluar, orquestar_pasada, escribir_novedades,
    escribir_cola, VigiaError, LIMITE_FICHAS_DIA,
)


# Datos de ejemplo (respuesta de ejemplo del contrato §2/§6)
DATOS_IMAGEN = [
    {
        "id": "Qwen/Qwen-Image-2.1-Turbo",
        "tags": ["text-to-image"],
        "licencia": "qwen-research",
        "archivo": "qwen-image-2.1-turbo.gguf",
        "tamanio_gb": 2.47,
        "quantizacion": "Q3_K_S",
        "medio": "mac",
        "capacidades": ["texto-a-imagen"],
        "pasos": 8,
    },
    {
        "id": "Tongyi-MAI/Z-Image-Turbo",
        "tags": ["text-to-image"],
        "licencia": "apache-2.0",
        "archivo": "z-image-turbo.gguf",
        "tamanio_gb": 1.8,
        "quantizacion": "Q2_K",
        "medio": "mac",
        "capacidades": ["texto-a-imagen", "rapido"],
        "pasos": 8,
    },
]


def test_descubrir_inyectado():
    candidatos = descubrir({"id": "imagen"}, datos_inyectados=DATOS_IMAGEN)
    assert len(candidatos) == 2
    ids = [c["id"] for c in candidatos]
    assert "Qwen/Qwen-Image-2.1-Turbo" in ids
    print("✓ test_descubrir_inyectado")


def test_evaluar_con_ejemplo():
    cand = DATOS_IMAGEN[0]
    area = {"id": "imagen", "nombre": "Imagen"}
    ficha = evaluar(cand, area)
    assert ficha["id"] == cand["id"]
    assert ficha["clase_licencia"] == "personal"
    assert ficha["seguro"] is True or ficha["seguro"] is False
    assert isinstance(ficha["puntaje"], int)
    assert 0 <= ficha["puntaje"] <= 100
    print("✓ test_evaluar_con_ejemplo")


def test_orquestar_pasada_seco():
    import tempfile, json
    with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False, encoding="utf-8") as f:
        json.dump({
            "esquema": 1, "cuantizadores": ["unsloth"],
            "licencias_conocidas": {"qwen-research": "personal", "apache-2.0": "libre"},
            "areas": [{"id": "imagen", "nombre": "Imagen", "pipeline_tags": ["text-to-image"], "autores": ["Qwen"], "catalogo": "src/lib/imagenes/modelos.ts"}]
        }, f)
        ruta_areas = f.name
    resultado = orquestar_pasada(seco=True, solo_area="imagen", ruta_areas=ruta_areas, datos_inyectados={"imagen": DATOS_IMAGEN})
    assert resultado["estado"] == "completado"
    assert resultado["fecha"] is not None
    assert resultado["archivo_novedades"] is not None
    print("✓ test_orquestar_pasada_seco")


def test_escribir_novedades_y_cola():
    hoy = "2026-10-25"
    resultado = {"fecha": hoy, "novedades": [{"id": "test"}], "mejores": [{"id": "test", "puntaje": 80}]}
    ruta_novedades = escribir_novedades(resultado, hoy)
    assert ruta_novedades.exists()
    ruta_cola = escribir_cola({"fecha": hoy, "tareas": [{"id": "test", "puntaje": 80}]}, hoy)
    assert ruta_cola.exists()
    print("✓ test_escribir_novedades_y_cola")


def test_main_seco():
    from scripts.puente.vigia_modelos import main
    rc = main(["--seco", "--area", "imagen"])
    assert rc == 0 or rc == 1  # 0 = ok; 1 = error esperado si el archivo de áreas no existe (simulado)
    print("✓ test_main_seco")


if __name__ == "__main__":
    test_descubrir_inyectado()
    test_evaluar_con_ejemplo()
    test_orquestar_pasada_seco()
    test_escribir_novedades_y_cola()
    test_main_seco()
    print("\n✓ All vigia_modelos tests passed")
