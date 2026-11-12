#!/usr/bin/env python3
"""Pruebas de navegador_reparar.py - validaciones de esqueletos y colas.

Pruebas puras para NAV1112I · reparador del enjambre: validación de esqueletos,
identificación de textos y mensajes a la cola. Sin mocks de Node, solo pruebas
acopladas a la interfaz pública.

Máximo 120 líneas por archivo.
"""

import json
import os
import re
import tempfile
from pathlib import Path
from typing import Dict, Any
import sys


sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import navegador_reparar as NR


def test_tiene_texto_contenido_con_textos() -> None:
    """tiene_texto() devuelve True para HTML con textos visibles."""
    html = '<div><p>Texto visible</p><a href="#">Enlace</a></div>'
    assert NR._tiene_texto(html) is True


def test_tiene_texto_solo_estructuras() -> None:
    """tiene_texto() devuelve False para solo etiquetas y atributos."""
    html = '<div class="c"><span id="i"></span></div>'
    assert NR._tiene_texto(html) is False


def test_tiene_texto_atributos_con_textos() -> None:
    """tiene_texto() ignora textos en atributos."""
    html = '<div title="texto oculto"></div><p>visible</p>'
    assert NR._tiene_texto(html) is True


def test_tiene_texto_sin_contenido() -> None:
    """tiene_texto() devuelve False para cadenas vacías."""
    assert NR._tiene_texto("") is False


def test_tiene_texto_html_vacio() -> None:
    """tiene_texto() devuelve False para HTML vacío."""
    assert NR._tiene_texto("") is False


def test_esqueleto_valido_html_limpio() -> None:
    """esqueleto_valido() devuelve True para HTML sin textos."""
    with tempfile.TemporaryDirectory() as tmp:
        dir_reparar = Path(tmp) / "reparar"
        dir_reparar.mkdir()
        archivo = dir_reparar / "2026-11-12-page.html"
        archivo.write_text('<div class="c"><span></span></div>', encoding="utf-8")

        original_ruta = NR.RUTA_REPARAR
        NR.RUTA_REPARAR = dir_reparar
        try:
            assert NR._esqueleto_valido(archivo.name) is True
        finally:
            NR.RUTA_REPARAR = original_ruta


def test_esqueleto_valido_html_con_texto() -> None:
    """esqueleto_valido() devuelve False para HTML con textos."""
    with tempfile.TemporaryDirectory() as tmp:
        dir_reparar = Path(tmp) / "reparar"
        dir_reparar.mkdir()
        archivo = dir_reparar / "2026-11-12-page.html"
        archivo.write_text('<p>Texto visible</p>', encoding="utf-8")

        original_ruta = NR.RUTA_REPARAR
        NR.RUTA_REPARAR = dir_reparar
        try:
            assert NR._esqueleto_valido(archivo.name) is False
        finally:
            NR.RUTA_REPARAR = original_ruta


def test_esqueleto_contiene_texto_con_textos() -> None:
    """esqueleto_contiene_texto() devuelve True para HTML con textos."""
    with tempfile.TemporaryDirectory() as tmp:
        dir_reparar = Path(tmp) / "reparar"
        dir_reparar.mkdir()
        archivo = dir_reparar / "page.html"
        archivo.write_text('<span>Visible</span>', encoding="utf-8")

        original_ruta = NR.RUTA_REPARAR
        NR.RUTA_REPARAR = dir_reparar
        try:
            assert NR._esqueleto_contiene_texto(archivo.name) is True
        finally:
            NR.RUTA_REPARAR = original_ruta


def test_esqueleto_contiene_texto_html_limpio() -> None:
    """esqueleto_contiene_texto() devuelve False para HTML limpio."""
    with tempfile.TemporaryDirectory() as tmp:
        dir_reparar = Path(tmp) / "reparar"
        dir_reparar.mkdir()
        archivo = dir_reparar / "page.html"
        archivo.write_text('<div></div>', encoding="utf-8")

        original_ruta = NR.RUTA_REPARAR
        NR.RUTA_REPARAR = dir_reparar
        try:
            assert NR._esqueleto_contiene_texto(archivo.name) is False
        finally:
            NR.RUTA_REPARAR = original_ruta


def test_sesion_por_nombre_fecha() -> None:
    """sesion_por_nombre() devuelve 'desconocida' para patrón de fecha."""
    assert NR._sesion_por_nombre("20261112-page.html") == "desconocida"


def test_sesion_por_nombre_instagram() -> None:
    """sesion_por_nombre() devuelve 'instagram-maggasukha' para instagram."""
    assert NR._sesion_por_nombre("20261112-insta-guardados-maggasukha.html") == "instagram-maggasukha"


def test_sesion_por_nombre_desconocido() -> None:
    """sesion_por_nombre() devuelve un valor por defecto para lo desconocido."""
    assert NR._sesion_por_nombre("other-page.html") == "desconocida"


def test_estado_sesion_por_archivo() -> None:
    """Lee el estado de la sesión desde el archivo JSON y devuelve el nombre de sesión."""
    with tempfile.TemporaryDirectory() as tmp:
        estado_archivo = Path(tmp) / "estado.json"
        estado_archivo.write_text(
            json.dumps({"sesiones": {"instagram-maggasukha": {"estado": "viva"}}}), encoding="utf-8"
        )

        original_ruta = NR.RUTA_ESTADO
        NR.RUTA_ESTADO = estado_archivo
        try:
            estado = NR._estado_sesion()
            assert estado.get("sesiones") is not None
            assert estado["sesiones"].get("instagram-maggasukha").get("estado") == "viva"
        finally:
            NR.RUTA_ESTADO = original_ruta


def test_enviar_a_cola_crea_tarea() -> None:
    """enviar_a_cola() añade una nueva tarea a la cola."""
    with tempfile.TemporaryDirectory() as tmp:
        cola_archivo = Path(tmp) / "cola-nav-reparar.json"
        original_ruta_cola = NR.RUTA_COLA
        NR.RUTA_COLA = cola_archivo

        try:
            NR._enviar_a_cola("instagram-maggasukha", "<div></div>")

            with open(cola_archivo, "r", encoding="utf-8") as f:
                cola = json.load(f)

            assert len(cola["tareas"]) == 1
            tarea = cola["tareas"][0]
            assert tarea["id"].startswith("NAV1112I-")
            assert tarea["ola"] == "NAV1112"
            assert "lector roto" in tarea["prompt"]
        finally:
            NR.RUTA_COLA = original_ruta_cola


def test_cargar_cola_sin_archivo() -> None:
    """cargar_cola() devuelve estructura por defecto si el archivo no existe."""
    assert NR._cargar_cola() == {"ola": "NAV1112", "tareas": []}


def test_guardar_cola_escribe() -> None:
    """guardar_cola() escribe la cola en disco."""
    with tempfile.TemporaryDirectory() as tmp:
        cola_archivo = Path(tmp) / "cola-nav-reparar.json"
        original_ruta_cola = NR.RUTA_COLA
        NR.RUTA_COLA = cola_archivo

        try:
            prueba_cola = {"ola": "NAV1112", "tareas": [{"id": "prueba", "ola": "NAV1112", "titulo": "Prueba", "archivos": [], "depende": [], "prompt": "Prueba"}]}
            NR._guardar_cola(prueba_cola)

            with open(cola_archivo, "r", encoding="utf-8") as f:
                cola_guardada = json.load(f)

            assert cola_guardada == prueba_cola
        finally:
            NR.RUTA_COLA = original_ruta_cola


def test_procesar_descarta_esqueleto_valido() -> None:
    """procesar() descarta el esqueleto si es válido (sin texto)."""
    with tempfile.TemporaryDirectory() as tmp:
        dir_reparar = Path(tmp) / "reparar"
        dir_reparar.mkdir()

        archivo = dir_reparar / "page.html"
        archivo.write_text('<div class="clean"></div>', encoding="utf-8")

        original_ruta_reparar = NR.RUTA_REPARAR
        NR.RUTA_REPARAR = dir_reparar

        try:
            NR.procesar()

            assert not archivo.exists()
        finally:
            NR.RUTA_REPARAR = original_ruta_reparar


def test_procesar_encola_esqueleto_con_texto() -> None:
    """procesar() encola si el esqueleto lleva texto."""
    with tempfile.TemporaryDirectory() as tmp:
        dir_reparar = Path(tmp) / "reparar"
        dir_reparar.mkdir()

        archivo = dir_reparar / "page.html"
        archivo.write_text('<p>Texto</p>', encoding="utf-8")

        cola_archivo = Path(tmp) / "cola-nav-reparar.json"
        original_ruta_reparar = NR.RUTA_REPARAR
        original_ruta_cola = NR.RUTA_COLA

        NR.RUTA_REPARAR = dir_reparar
        NR.RUTA_COLA = cola_archivo

        try:
            NR.procesar()

            assert not archivo.exists()
            cola = NR._cargar_cola()
            assert len(cola["tareas"]) == 1
        finally:
            NR.RUTA_REPARAR = original_ruta_reparar
            NR.RUTA_COLA = original_ruta_cola


if __name__ == "__main__":
    import unittest
    unittest.main()