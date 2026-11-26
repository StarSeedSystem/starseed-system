# -*- coding: utf-8 -*-
"""SUE1125A · Los Sueños profundos y la consolidación se anuncian también en Audiovisual y diseño."""
import os
import sys

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, DIRECTORIO)

import director_suenos as S  # noqa: E402


def test_la_orden_del_canal_de_diseno_es_la_acordada():
    """Decisión pura: canal audiovisual, directores de diseño, metagenesis y CON Telegram."""
    orden = S.orden_canal_diseno("resumen de la sesión")
    assert orden[:3] == [
        "python3",
        "scripts/puente/sincronizador_direccion.py",
        "publicar-canal",
    ]
    assert orden[orden.index("--canal") + 1] == "audiovisual"
    assert orden[orden.index("--de") + 1] == "Directores de diseño (Sueños profundos)"
    assert orden[orden.index("--origen") + 1] == "metagenesis"
    assert orden[-1] == "resumen de la sesión"
    assert "--sin-telegram" not in orden


def test_anunciar_publica_una_vez_en_diseno_sin_quitar_el_canal_comun():
    publicados, comunes = [], []

    def publicar(texto):
        publicados.append(texto)
        return True

    hecho = S.anunciar(
        "resumen de la sesión",
        decir=lambda *args: comunes.append(args),
        publicar_canal=publicar,
    )
    assert publicados == ["resumen de la sesión"]
    assert comunes == [("resumen de la sesión", "suenos", "hecho")]
    assert hecho["canal"] is True
    assert hecho["diseno"] is True


def test_un_fallo_en_el_canal_de_diseno_no_impide_el_canal_comun():
    comunes = []

    def publicar(texto):
        raise RuntimeError("el canal especializado no responde")

    hecho = S.anunciar(
        "resumen de la sesión",
        decir=lambda *args: comunes.append(args),
        publicar_canal=publicar,
    )
    assert comunes == [("resumen de la sesión", "suenos", "hecho")]
    assert hecho["canal"] is True
    assert hecho["diseno"] is False


def test_el_publicador_por_defecto_no_rompe_si_falla_el_comando(monkeypatch):
    def falla(*args, **kwargs):
        raise OSError("sin subprocesos reales en la prueba")

    monkeypatch.setattr(S.subprocess, "run", falla)
    assert S.publicar_canal("resumen") is False
