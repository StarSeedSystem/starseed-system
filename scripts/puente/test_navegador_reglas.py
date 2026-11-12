# -*- coding: utf-8 -*-
"""Pruebas de las reglas puras del navegador propio (NAV1112A · §4 y §5)."""
import datetime as dt
import os
import stat
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import navegador_reglas as R  # noqa: E402

AHORA = dt.datetime(2026, 11, 12, 12, 0, tzinfo=dt.timezone.utc)
HOY = "2026-11-12"


def _guardar(tmp_path, sesion, cuenta=0, fecha=HOY):
    estado = R.estado_inicial()
    estado["sesiones"][sesion]["paginas_hoy"] = {"fecha": fecha, "cuenta": cuenta}
    ruta = str(tmp_path / "estado.json")
    R.guardar_estado(estado, ruta)
    return ruta


def test_registro_de_las_cuatro_sesiones_y_sus_dominios():
    assert list(R.SESIONES) == ["google-alex", "google-fundacion", "instagram-maggasukha", "instagram-sociedad"]
    assert R.SESIONES["google-alex"]["dominios"] == ("myactivity.google.com", "www.youtube.com",
                                                     "gemini.google.com", "notebooklm.google.com")
    assert R.SESIONES["instagram-maggasukha"]["dominios"] == ("www.instagram.com",)
    assert R.SESIONES["instagram-sociedad"]["pausa_minima"] > 0


def test_solo_https_y_solo_dominios_de_la_lista():
    assert R.permitida("google-alex", "https://myactivity.google.com/product/youtube") is True
    assert R.permitida("google-alex", "https://www.youtube.com/feed/history") is True
    assert R.permitida("instagram-maggasukha", "https://www.instagram.com/saved/") is True
    assert R.permitida("google-alex", "http://www.youtube.com/") is False
    assert R.permitida("google-alex", "https://mail.google.com/") is False
    assert R.permitida("instagram-sociedad", "https://www.youtube.com/") is False
    assert R.permitida("google-alex", "https://evil.example/www.youtube.com") is False
    assert R.permitida("desconocida", "https://www.youtube.com/") is False


def test_los_selectores_prohibidos_en_espanol_y_en_ingles():
    for texto in ("Enviar", "Publicar", "Eliminar", "Seguir", "Me gusta", "Guardar cambios",
                  "Send", "Publish", "Delete", "Remove", "Follow", "Like", "Save changes"):
        assert R.selector_prohibido(texto) is True, texto
    assert R.selector_prohibido('button[aria-label="Enviar"]') is True
    assert R.selector_prohibido("a.btn-like") is True
    assert R.selector_prohibido("guardar_cambios") is True
    assert R.selector_prohibido("Leer más") is False
    assert R.selector_prohibido("siguiente") is False
    assert R.selector_prohibido("dislike") is False
    assert R.selector_prohibido("unfollow") is False


def test_dentro_de_tope_cuenta_las_paginas_de_hoy(tmp_path):
    assert R.dentro_de_tope("google-alex", AHORA, _guardar(tmp_path, "google-alex", 0)) is True
    assert R.dentro_de_tope("google-alex", AHORA, _guardar(tmp_path, "google-alex", 39)) is True
    assert R.dentro_de_tope("google-alex", AHORA, _guardar(tmp_path, "google-alex", 40)) is False
    assert R.dentro_de_tope("instagram-sociedad", AHORA, _guardar(tmp_path, "instagram-sociedad", 8)) is False
    assert R.dentro_de_tope("google-alex", AHORA, _guardar(tmp_path, "google-alex", 99, "2026-11-11")) is True
    assert R.dentro_de_tope("desconocida", AHORA, _guardar(tmp_path, "google-alex")) is False


def test_el_estado_inicial_y_la_escritura_atomica(tmp_path):
    ruta = _guardar(tmp_path, "google-fundacion")
    assert R.leer_estado(ruta)["sesiones"]["google-fundacion"]["estado"] == "sin alta"
    datos = R.marcar_estado("google-fundacion", "viva", AHORA, ruta)
    assert datos["estado"] == "viva" and datos["ultima_comprobacion"] == AHORA.isoformat()
    assert R.leer_estado(ruta)["sesiones"]["google-fundacion"]["estado"] == "viva"
    assert not [n for n in os.listdir(tmp_path) if ".tmp-" in n]
    assert stat.S_IMODE(os.stat(ruta).st_mode) == 0o600


def test_los_interruptores_de_entorno():
    assert R.apagado({}) is False
    assert R.apagado({"STARSEED_NAVEGADOR": "1"}) is False
    assert R.apagado({"STARSEED_NAVEGADOR": "0"}) is True
    assert R.apagado({"STARSEED_NAVEGADOR_INSTAGRAM": "0"}, "instagram-maggasukha") is True
    assert R.apagado({"STARSEED_NAVEGADOR_INSTAGRAM": "0"}, "google-alex") is False
