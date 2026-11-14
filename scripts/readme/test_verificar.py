#!/usr/bin/env python3
"""
Test para scripts/readme/verificar.py (RDM1113)
"""

import sys
from pathlib import Path
from dataclasses import dataclass

import pytest

sys.path.insert(0, str(Path(__file__).parent))
import verificar


class TestExtraerEnlaces:
    def test_extrae_enlaces_http(self):
        contenido = "[StarSeed OS](https://github.com/StarSeedSystem/starseed-system)"
        enlaces = verificar.extraer_enlaces(contenido)
        assert len(enlaces) == 1
        assert enlaces[0].url == "https://github.com/StarSeedSystem/starseed-system"
        assert enlaces[0].es_interna is False
        assert enlaces[0].tipo == "web"

    def test_extrae_enlaces_descargas(self):
        contenido = "[descarga](https://github.com/StarSeedSystem/starseed-system/releases/download/v0.5.0/app.dmg)"
        enlaces = verificar.extraer_enlaces(contenido)
        assert len(enlaces) == 1
        assert enlaces[0].tipo == "descarga"

    def test_ignora_enlaces_internos(self):
        contenido = "[Ver más](#descargas)"
        enlaces = verificar.extraer_enlaces(contenido)
        assert len(enlaces) == 0

    def test_extrae_varios_enlaces(self):
        contenido = """
        [Estable](https://github.com/StarSeedSystem/starseed-system/releases/latest)
        [Web](https://starseed-os.vercel.app)
        """
        enlaces = verificar.extraer_enlaces(contenido)
        assert len(enlaces) == 2


class TestExtraerAnclas:
    def test_extrae_titulos(self):
        contenido = "# Portada\n## Subtítulo"
        anclas = verificar.extraer_anclas(contenido)
        assert "Portada" in anclas

    def test_extrae_ids(self):
        contenido = '<h2 id="descargas">Descargas</h2>'
        anclas = verificar.extraer_anclas(contenido)
        assert "descargas" in anclas


class TestExtraerTextosAlternativos:
    def test_extrae_alt_text(self):
        contenido = "![Texto alternativo](ruta/imagen.webp)"
        textos = verificar.extraer_textos_alternativos(contenido)
        assert "ruta/imagen.webp" in textos
        assert textos["ruta/imagen.webp"] == "Texto alternativo"

    def test_ignora_sin_alt(self):
        contenido = "![](ruta/imagen.webp)"
        textos = verificar.extraer_textos_alternativos(contenido)
        assert len(textos) == 0


class TestExtraerTerminosInternos:
    def test_detecta_terminos(self):
        contenido = "StarSeed OS con Astraura y Next.js"
        terminos = verificar.extraer_terminos_internos(contenido)
        assert "Astraura" in terminos
        assert "Next.js" in terminos

    def test_filtra_sin_terminos(self):
        contenido = "Este es un sistema operativo"
        terminos = verificar.extraer_terminos_internos(contenido)
        assert len(terminos) == 0


class TestVerificarRecurso:
    def test_recurso_existente(self, tmp_path):
        archivo = tmp_path / "test.svg"
        archivo.write_text("<svg width='100' height='100'></svg>")
        recurso = verificar.verificar_recurso(archivo)
        assert recurso.archivo == "test.svg"
        assert recurso.es_valido is True

    def test_recurso_no_existente(self, tmp_path):
        archivo = tmp_path / "noexiste.svg"
        recurso = verificar.verificar_recurso(archivo)
        assert recurso.es_valido is False
        assert "Archivo no encontrado" in recurso.errores