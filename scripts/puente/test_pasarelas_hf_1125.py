"""DIR1125Q: el 402 de Hugging Face es el crédito mensual agotado (se repone solo), no un fichaje."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pasarelas as P  # noqa: E402

CUERPO_HF = ('{"error":"Purchase pre-paid credits to continue using Inference Providers. Alternatively, '
             'subscribe to PRO to get monthly included credits."}')


def test_el_402_de_hugging_face_es_sin_cupo_y_no_fichaje():
    assert P.clasificar(402, CUERPO_HF) == P.SIN_CUPO


def test_el_aviso_de_creditos_mensuales_agotados_es_sin_cupo():
    assert P.clasificar(402, "You have depleted your monthly included credits.") == P.SIN_CUPO


def test_el_check_in_diario_sigue_siendo_fichaje_aunque_hable_de_cuota():
    assert P.clasificar(402, "daily check-in required to keep your free quota") == P.FICHAJE


def test_un_402_sin_cuerpo_conocido_sigue_pidiendo_una_accion():
    assert P.clasificar(402, "") == P.FICHAJE


def test_la_nota_de_hugging_face_explica_el_credito_mensual():
    nota = P.CATALOGO["huggingface"]["nota"]
    assert "mensual" in nota.lower() and "no hay fichaje" in nota
