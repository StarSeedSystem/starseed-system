# -*- coding: utf-8 -*-
"""Tests de alcance_recomendaciones.py (ALC1113C).
Sin red: solo lógica pura, fechas inyectadas y mocks.
"""
from __future__ import annotations
import json
import os
import tempfile
from datetime import date, datetime, timezone
from unittest.mock import MagicMock, patch

import pytest

from scripts.puente.alcance_recomendaciones import (
    RECOMENDACION_SCHEMA,
    TOP_RECOMENDACIONES,
    _licencia_compatible,
    _esfuerzo_desde_actividad,
    _riesgo_desde_licencia_y_actividad,
    _area_desde_ficha,
    _que_adoptar_desde_ficha,
    _por_que_desde_ficha,
    recomendacion_desde_ficha,
    mejores_recomendaciones,
    escribir_propuesta,
    procesar_dia,
    ESFUERZOS_VALIDOS,
    RIESGOS_VALIDOS,
)


class FakeFicha:
    """Ficha mínima de GitHub para tests."""
    def __init__(self, **kwargs):
        self.data = {
            "obj_id": "gh-test-repo",
            "nombre_publico": "owner/test-repo",
            "que_hacen": "Proyecto de prueba para federación ActivityPub",
            "canal_oficial": {"medio": "matrix", "valor": "#test:matrix.org", "fuente_url": "https://github.com/owner/test-repo"},
            "valores_declarados": [],
            "proyectos": [{"nombre": "owner/test-repo", "url": "https://github.com/owner/test-repo"}],
            "contenido_reciente": [],
            "idioma": "en",
            "tono": "tecnico",
            "fuentes": [{"url": "https://github.com/owner/test-repo", "fecha": "2026-11-13T12:00:00Z", "metodo": "github-api"}],
            "resonancias": [{"con": "StarSeed OS", "por_que": "fediverso", "cita_url": "https://github.com/owner/test-repo"}],
            "avisos": [],
            "datos_terceros": "DATOS TERCEROS",
            "generada": "2026-11-13T12:00:00Z",
            "caduca": "2026-12-13T12:00:00Z",
            "fuente": "github",
            "area_starseed": "fediverso",
        }
        self.data.update(kwargs)

    def __getitem__(self, key):
        return self.data[key]

    def get(self, key, default=None):
        return self.data.get(key, default)


def test_licencia_compatible_conocidas():
    # MIT, Apache-2.0, BSD son compatibles con MIT/Apache de StarSeed OS
    assert _licencia_compatible("MIT") is True
    assert _licencia_compatible("Apache-2.0") is True
    assert _licencia_compatible("BSD-3-Clause") is True
    assert _licencia_compatible("BSD-2-Clause") is True
    assert _licencia_compatible("ISC") is True
    # GPL no es compatible con MIT (copyleft)
    assert _licencia_compatible("GPL-3.0") is False
    assert _licencia_compatible("AGPL-3.0") is False
    # Licencia desconocida → False por seguridad
    assert _licencia_compatible("NOASSERTION") is False
    assert _licencia_compatible("Desconocida") is False
    assert _licencia_compatible("") is False


def test_esfuerzo_desde_actividad():
    # Alta actividad → S (pequeño, fácil de adoptar)
    ficha_alta = FakeFicha(
        contenido_reciente=[{"titulo": f"commit {i}", "url": "u", "fecha": "2026-11-10T12:00:00Z"} for i in range(10)]
    )
    assert _esfuerzo_desde_actividad(ficha_alta) == "S"

    # Actividad media → M
    ficha_media = FakeFicha(
        contenido_reciente=[{"titulo": f"commit {i}", "url": "u", "fecha": "2026-11-10T12:00:00Z"} for i in range(4)]
    )
    assert _esfuerzo_desde_actividad(ficha_media) == "M"

    # Baja actividad → L
    ficha_baja = FakeFicha(contenido_reciente=[])
    assert _esfuerzo_desde_actividad(ficha_baja) == "L"


def test_riesgo_desde_licencia_y_actividad():
    # Licencia compatible + alta actividad → bajo
    ficha = FakeFicha(licencia="MIT", contenido_reciente=[{"titulo": "c"} for _ in range(10)])
    assert _riesgo_desde_licencia_y_actividad(ficha) == "bajo"

    # Licencia compatible + baja actividad → medio
    ficha = FakeFicha(licencia="MIT", contenido_reciente=[])
    assert _riesgo_desde_licencia_y_actividad(ficha) == "medio"

    # Licencia incompatible → alto
    ficha = FakeFicha(licencia="GPL-3.0", contenido_reciente=[{"titulo": "c"} for _ in range(10)])
    assert _riesgo_desde_licencia_y_actividad(ficha) == "alto"

    # Licencia desconocida → alto
    ficha = FakeFicha(licencia="NOASSERTION", contenido_reciente=[{"titulo": "c"} for _ in range(10)])
    assert _riesgo_desde_licencia_y_actividad(ficha) == "alto"


def test_area_desde_ficha():
    ficha = FakeFicha(area_starseed="fediverso")
    assert _area_desde_ficha(ficha) == "fediverso"

    ficha = FakeFicha(area_starseed="nostr")
    assert _area_desde_ficha(ficha) == "nostr"

    ficha = FakeFicha(area_starseed="desconocido")
    assert _area_desde_ficha(ficha) == "otro"


def test_que_adoptar_desde_ficha():
    ficha = FakeFicha(
        que_hacen="Biblioteca para federación ActivityPub en Rust",
        contenido_reciente=[{"titulo": "release v1.0"}],
    )
    resultado = _que_adoptar_desde_ficha(ficha)
    assert isinstance(resultado, str)
    assert len(resultado) > 0
    assert len(resultado) <= 120


def test_por_que_desde_ficha():
    ficha = FakeFicha(
        que_hacen="Implementa ActivityPub completo con extensiones para grupos",
        resonancias=[{"con": "StarSeed OS", "por_que": "fediverso", "cita_url": "https://github.com/owner/test-repo"}],
    )
    resultado = _por_que_desde_ficha(ficha)
    assert isinstance(resultado, str)
    assert len(resultado) > 0
    assert len(resultado) <= 300
    assert "StarSeed" in resultado or "fediverso" in resultado.lower()


def test_recomendacion_desde_ficha_estructura_completa():
    ficha = FakeFicha(
        licencia="MIT",
        que_hacen="Cliente Nostr ligero para móvil con sincronización offline",
        area_starseed="nostr",
        contenido_reciente=[{"titulo": f"commit {i}"} for i in range(5)],
    )
    rec = recomendacion_desde_ficha(ficha)

    # Campos obligatorios
    assert "area_sistema" in rec
    assert "que_adoptar" in rec
    assert "por_que" in rec
    assert "licencia_compatible" in rec
    assert "esfuerzo" in rec
    assert "riesgo" in rec

    # Valores válidos
    assert rec["esfuerzo"] in ESFUERZOS_VALIDOS
    assert rec["riesgo"] in RIESGOS_VALIDOS
    assert isinstance(rec["licencia_compatible"], bool)
    assert isinstance(rec["area_sistema"], str) and rec["area_sistema"]
    assert isinstance(rec["que_adoptar"], str) and rec["que_adoptar"]
    assert isinstance(rec["por_que"], str) and rec["por_que"]


def test_recomendacion_desde_ficha_gpl_incompatible():
    ficha = FakeFicha(licencia="GPL-3.0", area_starseed="red-mesh")
    rec = recomendacion_desde_ficha(ficha)
    assert rec["licencia_compatible"] is False
    assert rec["riesgo"] == "alto"


def test_mejores_recomendaciones_top_5():
    fichas = []
    for i in range(8):
        f = FakeFicha(
            obj_id=f"gh-repo-{i}",
            nombre_publico=f"owner/repo-{i}",
            licencia="MIT",
            area_starseed="fediverso" if i < 4 else "nostr",
            contenido_reciente=[{"titulo": "c"}] * (8 - i),  # Distinta actividad
        )
        fichas.append(f)

    mejores = mejores_recomendaciones(fichas)
    assert len(mejores) <= TOP_RECOMENDACIONES
    assert len(mejores) == 5  # Top 5

    # Deben estar ordenadas por prioridad (licencia compatible, esfuerzo bajo, riesgo bajo)
    for m in mejores:
        assert m["licencia_compatible"] is True
        assert m["riesgo"] in ("bajo", "medio")


def test_mejores_recomendaciones_filtrar_incompatibles():
    fichas = [
        FakeFicha(obj_id="gh-1", licencia="GPL-3.0"),  # Incompatible
        FakeFicha(obj_id="gh-2", licencia="MIT"),
        FakeFicha(obj_id="gh-3", licencia="Apache-2.0"),
    ]
    mejores = mejores_recomendaciones(fichas)
    # Solo las compatibles
    for m in mejores:
        assert m["licencia_compatible"] is True
    assert len(mejores) == 2


def test_escribir_propuesta_formato_libreria():
    with tempfile.TemporaryDirectory() as tmp:
        fecha = date(2026, 11, 13)
        recomendaciones = [
            {
                "area_sistema": "fediverso",
                "que_adoptar": "Patrón de federación ActivityPub con grupos",
                "por_que": "StarSeed OS necesita federar comunidades y este proyecto lo resuelve nativamente.",
                "licencia_compatible": True,
                "esfuerzo": "M",
                "riesgo": "bajo",
            },
            {
                "area_sistema": "nostr",
                "que_adoptar": "Cliente Nostr offline-first",
                "por_que": "Para la red Nostr de StarSeed, el modo offline es crítico.",
                "licencia_compatible": True,
                "esfuerzo": "S",
                "riesgo": "bajo",
            },
        ]
        archivo = escribir_propuesta(fecha, recomendaciones, salida_dir=tmp)

        assert os.path.exists(archivo)
        assert archivo.endswith("propuesta-2026-11-13.json")

        with open(archivo, encoding="utf-8") as f:
            data = json.load(f)

        # Estructura de propuesta de librería
        assert "ola" in data
        assert "fecha" in data
        assert data["fecha"] == "2026-11-13"
        assert "paquetes" in data
        assert len(data["paquetes"]) == 2

        for pkg in data["paquetes"]:
            # Campos requeridos del formato repos-libreria-*.json
            assert "id" in pkg
            assert "repo" in pkg
            assert "nombre" in pkg
            assert "titulo" in pkg
            assert "kind" in pkg
            assert "icono" in pkg
            assert "grupo" in pkg
            assert "licencia" in pkg
            assert "version_actual" in pkg
            assert "fecha_version" in pkg
            assert "estado" in pkg
            assert "actividad" in pkg
            assert "area" in pkg
            assert "efecto" in pkg
            assert "preinstalar" in pkg
            assert "gratis" in pkg
            assert "gratis_motivo" in pkg
            assert "corre_aqui" in pkg
            assert "que_es" in pkg
            assert "nota" in pkg
            assert "aviso" in pkg
            assert "requisitos" in pkg
            # Estado debe ser 'esperando-aprobacion'
            assert pkg["estado"] == "esperando-aprobacion"


def test_escribir_propuesta_valida_urls():
    with tempfile.TemporaryDirectory() as tmp:
        fecha = date(2026, 11, 13)
        recomendaciones = [{
            "area_sistema": "fediverso",
            "que_adoptar": "Test",
            "por_que": "Test",
            "licencia_compatible": True,
            "esfuerzo": "S",
            "riesgo": "bajo",
        }]
        archivo = escribir_propuesta(fecha, recomendaciones, salida_dir=tmp)

        with open(archivo, encoding="utf-8") as f:
            data = json.load(f)

        for pkg in data["paquetes"]:
            # URLs deben ser https válidas
            assert pkg["repo"].startswith("https://github.com/") or "/" in pkg["repo"]
            for req in pkg["requisitos"].values():
                if isinstance(req, str) and req.startswith("http"):
                    assert req.startswith("https://")


def test_procesar_dia_sin_red():
    with tempfile.TemporaryDirectory() as tmp:
        # Crear archivo de fichas de entrada simulado
        entrada_dir = os.path.join(tmp, "github")
        os.makedirs(entrada_dir)
        fecha = date(2026, 11, 13)
        fichas_entrada = [
            {
                "obj_id": "gh-test-1",
                "nombre_publico": "owner/repo1",
                "que_hacen": "Librería ActivityPub",
                "licencia": "MIT",
                "area_starseed": "fediverso",
                "contenido_reciente": [{"titulo": "c"}] * 5,
                "fuente": "github",
            },
            {
                "obj_id": "gh-test-2",
                "nombre_publico": "owner/repo2",
                "que_hacen": "Cliente Nostr",
                "licencia": "GPL-3.0",  # Incompatible
                "area_starseed": "nostr",
                "contenido_reciente": [],
                "fuente": "github",
            },
        ]
        entrada_archivo = os.path.join(entrada_dir, f"{fecha.isoformat()}.json")
        with open(entrada_archivo, "w", encoding="utf-8") as f:
            json.dump(fichas_entrada, f)

        salida_dir = os.path.join(tmp, "propuestas")
        os.makedirs(salida_dir)

# Mock de encargar_por_flota (importado como _encargar_por_flota_real)
        with patch("scripts.puente.alcance_recomendaciones._encargar_por_flota_real") as mock_encargar:
            mock_encargar.return_value = {"ok": True, "accion": "cola_lista"}
            resultado = procesar_dia(fecha, entrada_dir, salida_dir, seco=False)

        assert resultado["ok"] is True
        assert "propuesta_archivo" in resultado
        assert os.path.exists(resultado["propuesta_archivo"])

        with open(resultado["propuesta_archivo"], encoding="utf-8") as f:
            data = json.load(f)

        # Solo la compatible (MIT) debe estar en la propuesta
        assert len(data["paquetes"]) == 1
        assert data["paquetes"][0]["licencia"] == "MIT"


def test_recomendacion_schema_validacion():
    # El schema debe rechazar campos inválidos
    from jsonschema import validate, ValidationError

    valida = {
        "area_sistema": "fediverso",
        "que_adoptar": "Patrón X",
        "por_que": "Porque Y",
        "licencia_compatible": True,
        "esfuerzo": "M",
        "riesgo": "bajo",
    }
    validate(instance=valida, schema=RECOMENDACION_SCHEMA)

    # Esfuerzo inválido
    invalida = dict(valida, esfuerzo="XL")
    with pytest.raises(ValidationError):
        validate(instance=invalida, schema=RECOMENDACION_SCHEMA)

    # Riesgo inválido
    invalida = dict(valida, riesgo="critico")
    with pytest.raises(ValidationError):
        validate(instance=invalida, schema=RECOMENDACION_SCHEMA)

    # Falta campo obligatorio
    invalida = {k: v for k, v in valida.items() if k != "area_sistema"}
    with pytest.raises(ValidationError):
        validate(instance=invalida, schema=RECOMENDACION_SCHEMA)


if __name__ == "__main__":
    pytest.main([__file__, "-v"])