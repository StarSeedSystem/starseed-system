# -*- coding: utf-8 -*-
"""La revisión es bloqueante por su ÚLTIMA línea «Seguimiento», no por la palabra suelta
(SUP0711E, 2026-11-07).

Los revisores gratuitos que razonan en voz alta (freellmapi/auto) devuelven el razonamiento
entero, que repite la regla del enunciado («Bloqueante SOLO por un defecto visible…»). La regla
antigua marcaba bloqueante por esa palabra aunque la respuesta final dijera «Seguimiento: no»:
60 de 123 revisiones salieron bloqueantes desde el 01-11 y la segunda opinión deshizo 45.
"""
import importlib.util
import os
import sys

RUTA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "starseed-enjambre.py")
ESPEC = importlib.util.spec_from_file_location("enjambre", RUTA)
enjambre = importlib.util.module_from_spec(ESPEC)
sys.modules.setdefault("enjambre", enjambre)
ESPEC.loader.exec_module(enjambre)


def test_razonamiento_que_repite_la_regla_y_termina_en_no():
    """(a) El enunciado dice «Bloqueante SOLO por un defecto visible», pero acaba en no."""
    rev = (
        "Regla: Bloqueante SOLO por un defecto visible en el código mostrado.\n"
        "El diff se ve bien y pasa tsc y vitest.\n\n"
        "**Seguimiento:** no"
    )
    assert enjambre.revision_bloqueante(rev) is False


def test_ultima_linea_dice_si_bloqueante():
    """(b) La última línea confirma el bloqueo."""
    assert enjambre.revision_bloqueante("**Seguimiento:** sí, bloqueante — falta X") is True


def test_manda_la_ultima_aparicion_de_seguimiento():
    """(c) Un «Seguimiento: sí, bloqueante» dentro del razonamiento no manda: manda el último."""
    rev = (
        "Si dudara diría Seguimiento: sí, bloqueante por el diff.\n"
        "Pero lo he revisado entero.\n\n"
        "**Seguimiento:** no"
    )
    assert enjambre.revision_bloqueante(rev) is False


def test_sin_seguimiento_usa_la_regla_de_la_palabra():
    """(d) Sin «Seguimiento», el defecto dicho con todas las letras sigue bloqueando."""
    assert enjambre.revision_bloqueante("esto es bloqueante") is True


def test_sin_seguimiento_y_no_bloqueante_no_bloquea():
    """(e) Sin «Seguimiento», «no bloqueante» desactiva la palabra suelta."""
    assert enjambre.revision_bloqueante("esto no bloqueante, se puede fusionar") is False


def test_revision_vacia_no_bloquea():
    """(f) Una revisión vacía (sin revisor) no bloquea nada."""
    assert enjambre.revision_bloqueante("") is False
