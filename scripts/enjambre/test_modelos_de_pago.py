# -*- coding: utf-8 -*-
"""Un modelo que pide suscripción sale de la rotación sin gastar intento (2026-10-03).

apinex pasó modelos «free/» a suscripción. opencode contestaba en 1-2 s
«Error: This model is currently available only with a subscription», el intento contaba
como «sin cambios» del modelo y Jev lo volvía a elegir para reintentar en otras tareas.
"""
import importlib.util
import os
import sys
import unittest
from unittest import mock

RUTA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "starseed-enjambre.py")
ESPEC = importlib.util.spec_from_file_location("enjambre", RUTA)
enjambre = importlib.util.module_from_spec(ESPEC)
sys.modules["enjambre"] = enjambre
ESPEC.loader.exec_module(enjambre)

# Línea tal cual la deja opencode en el registro de la tarea (con sus colores ANSI).
SALIDA_APINEX = (
    "$ opencode run --model apinex/free/qwen-3.8-max · 2026-10-03 19:11:07\n"
    "\x1b[0m\x1b[91m\x1b[1mError: \x1b[0mThis model is currently available only with a "
    "subscription. Buy a subscription at https://apinex.bond/subscriptions to use it.\n"
)


class ExigePago(unittest.TestCase):
    def test_reconoce_la_linea_de_apinex_con_colores(self):
        linea = enjambre.exige_pago(SALIDA_APINEX)
        self.assertTrue(linea.startswith("Error: This model is currently available only"))

    def test_sin_colores_tambien(self):
        self.assertTrue(enjambre.exige_pago("Error: subscription required for this model"))

    def test_la_salida_de_una_herramienta_no_cuenta(self):
        # El agente leyó un documento que habla de suscripciones: el modelo no pidió nada.
        salida = "→ Read docs/precios.md\n| Plan | requires a subscription |\n"
        self.assertEqual(enjambre.exige_pago(salida), "")

    def test_vacio_o_none(self):
        self.assertEqual(enjambre.exige_pago(""), "")
        self.assertEqual(enjambre.exige_pago(None), "")

    def test_un_429_no_es_pago(self):
        self.assertEqual(enjambre.exige_pago("Error: Too Many Requests"), "")


class ApartarSiPidePago(unittest.TestCase):
    def setUp(self):
        enjambre.MUERTOS.discard("apinex/free/qwen-3.8-max")

    def tearDown(self):
        enjambre.MUERTOS.discard("apinex/free/qwen-3.8-max")

    def test_aparta_anota_y_avisa(self):
        eventos = []
        with mock.patch.object(enjambre, "evento", side_effect=lambda *a, **k: eventos.append(a)), \
                mock.patch.object(enjambre, "_anotar_fallido") as anotar:
            hecho = enjambre.apartar_si_pide_pago("CC1003A", "apinex/free/qwen-3.8-max", SALIDA_APINEX)
        self.assertTrue(hecho)
        self.assertIn("apinex/free/qwen-3.8-max", enjambre.MUERTOS)
        anotar.assert_called_once_with("CC1003A", "apinex/free/qwen-3.8-max")
        self.assertEqual(eventos[0][0], "proveedor")
        self.assertIn("sin gastar intento", eventos[0][2])

    def test_dos_modelos_del_mismo_proveedor_lo_apartan_horas(self):
        marcados = []
        enjambre.PIDEN_PAGO.clear()
        otro = "apinex/free/gemini-3.8-flash"
        try:
            with mock.patch.object(enjambre, "evento"), \
                    mock.patch.object(enjambre, "_anotar_fallido"), \
                    mock.patch.object(enjambre, "sin_cupo", return_value=False), \
                    mock.patch.object(enjambre, "marcar_sin_cupo", side_effect=lambda *a, **k: marcados.append(a)):
                enjambre.apartar_si_pide_pago("CDA1004", "apinex/free/qwen-3.8-max", SALIDA_APINEX)
                self.assertEqual(marcados, [], "con un solo modelo no se aparta el proveedor")
                enjambre.apartar_si_pide_pago("CDA1004", otro, SALIDA_APINEX)
            self.assertEqual(len(marcados), 1)
            self.assertEqual(marcados[0][0], "apinex")
            self.assertEqual(marcados[0][2], enjambre.HORAS_PAGO)
        finally:
            enjambre.MUERTOS.discard(otro)
            enjambre.PIDEN_PAGO.clear()

    def test_sin_pista_no_toca_nada(self):
        with mock.patch.object(enjambre, "evento") as ev, \
                mock.patch.object(enjambre, "_anotar_fallido") as anotar:
            hecho = enjambre.apartar_si_pide_pago("CC1003A", "apinex/free/qwen-3.8-max", "sin cambios")
        self.assertFalse(hecho)
        self.assertNotIn("apinex/free/qwen-3.8-max", enjambre.MUERTOS)
        ev.assert_not_called()
        anotar.assert_not_called()


if __name__ == "__main__":
    unittest.main()
