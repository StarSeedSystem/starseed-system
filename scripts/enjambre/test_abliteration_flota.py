# -*- coding: utf-8 -*-
"""Pruebas de abliteration como proveedor de pago (MOD1116).
 
 Sin la variable STARSEED_ABLITERATION no entra; con la variable y saldo bajo el margen
 no entra; con tope del día alcanzado no entra; con todo bien entra; STARSEED_PAGO=1
 no cambia el comportamiento de los demás proveedores de pago.
 
 (2026-11-16) Uso: unittest con entorno e inyección de estado.
 """
import importlib.util
import json
import os
import sys
import unittest
from unittest import mock

RUTA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "starseed-enjambre.py")
ESPEC = importlib.util.spec_from_file_location("enjambre", RUTA)
enjambre = importlib.util.module_from_spec(ESPEC)
sys.modules["enjambre"] = enjambre
ESPEC.loader.exec_module(enjambre)

ABLITATION = "abliteration/modelo-test"
BUENO = "nvidia/moonshotai/kimi-k3"

_PERMITE_OK = None
_PERMITE_MOTIVO = "ok"


def _mock_permitido(estado, ahora, tope):
    return (_PERMITE_OK if _PERMITE_OK is not None else True, _PERMITE_MOTIVO)


class SinVariableNoEntra(unittest.TestCase):
    def test_sin_variable_entorno_no_aparece(self):
        with mock.patch.dict(os.environ, {"STARSEED_ABLITERATION": "", "STARSEED_PAGO": ""}):
            r = enjambre.sin_pago([ABLITATION, BUENO])
        self.assertEqual(r, [BUENO])


class ConVariableSaldoBajoNoEntra(unittest.TestCase):
    def setUp(self):
        os.environ["STARSEED_ABLITERATION"] = "1"
        global _PERMITE_OK
        _PERMITE_OK = False

    def tearDown(self):
        os.environ.pop("STARSEED_ABLITERATION", None)
        global _PERMITE_OK
        _PERMITE_OK = None

    def test_saldo_bajo_el_margen_no_entra(self):
        with mock.patch.dict(os.environ, {"STARSEED_PAGO": ""}):
            with mock.patch.object(enjambre, "_permitido_abilliteration", _mock_permitido):
                r = enjambre.sin_pago([ABLITATION, BUENO])
        self.assertEqual(r, [BUENO])


class ConTopeAlcanzadoNoEntra(unittest.TestCase):
    def setUp(self):
        os.environ["STARSEED_ABLITERATION"] = "1"
        global _PERMITE_OK
        _PERMITE_OK = False

    def tearDown(self):
        os.environ.pop("STARSEED_ABLITERATION", None)
        global _PERMITE_OK
        _PERMITE_OK = None

    def test_tope_dia_alcanzado_no_entra(self):
        with mock.patch.dict(os.environ, {"STARSEED_PAGO": ""}):
            with mock.patch.object(enjambre, "_permitido_abilliteration", _mock_permitido):
                r = enjambre.sin_pago([ABLITATION, BUENO])
        self.assertEqual(r, [BUENO])


class ConTodoBienEntra(unittest.TestCase):
    def setUp(self):
        os.environ["STARSEED_ABLITERATION"] = "1"
        global _PERMITE_OK
        _PERMITE_OK = True

    def tearDown(self):
        os.environ.pop("STARSEED_ABLITERATION", None)
        global _PERMITE_OK
        _PERMITE_OK = None

    def test_con_saldo_ok_entra(self):
        with mock.patch.dict(os.environ, {"STARSEED_PAGO": ""}):
            with mock.patch.object(enjambre, "_permitido_abilliteration", _mock_permitido):
                r = enjambre.sin_pago([ABLITATION, BUENO])
        self.assertEqual(r, [ABLITATION, BUENO])


class ConPagoNoCambiaOtros(unittest.TestCase):
    def test_starseed_pago_no_cambia_comportamiento_sin_cupo(self):
        with mock.patch.dict(os.environ, {"STARSEED_PAGO": "", "STARSEED_ABLITERATION": ""}):
            r = enjambre.sin_pago(["xai/grok-4.6", BUENO, ABLITATION])
        self.assertEqual(r, [BUENO])

    def test_starseed_pago_no_cambia_comportamiento_con_pago(self):
        with mock.patch.dict(os.environ, {"STARSEED_PAGO": "1", "STARSEED_ABLITERATION": "1"}):
            with mock.patch.object(enjambre, "_permitido_abilliteration", _mock_permitido):
                r = enjambre.sin_pago(["xai/grok-4.6", BUENO, ABLITATION])
        self.assertEqual(r, ["xai/grok-4.6", BUENO, ABLITATION])


if __name__ == "__main__":
    unittest.main()