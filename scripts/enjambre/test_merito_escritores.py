# -*- coding: utf-8 -*-
"""Rotación de escritores por MÉRITO medido (2026-10-03).

La rotación por hash del id ponía a la cabeza, una de cada tres veces, un modelo que casi
nunca escribe (apinex: 2 integradas tras 313 eventos de intentos) y cada intento fallido
cuesta 12-25 min. Ahora manda la tasa de acierto de progreso.json, la carga se reparte entre
los mejores y lo que cobra por token queda fuera salvo STARSEED_PAGO=1.
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

BUENO = "nvidia/moonshotai/kimi-k3"
MEDIO = "google/gemini-3.6-flash"
MALO = "apinex/free/glm-5.3-flash"
NUEVO = "xkiro/qwen/qwen3-coder-plus:free"

PROGRESO = {
    "A1": {"estado": "commit", "modelo": BUENO},
    "A2": {"estado": "commit", "modelo": BUENO},
    "A3": {"estado": "commit", "modelo": BUENO, "modelos_fallidos": [MALO]},
    "A4": {"estado": "commit", "modelo": MEDIO},
    "A5": {"estado": "sin_cambios", "modelo": MEDIO},
    "A6": {"estado": "sin_cambios", "modelo": MALO},
    "A7": {"estado": "integrada", "modelo": BUENO, "modelos_fallidos": [MALO, "basura"]},
    "ruido": "no es un dict",
}


class Merito(unittest.TestCase):
    def test_cuenta_aciertos_fallos_y_modelos_fallidos(self):
        tabla = enjambre.merito_escritores(PROGRESO)
        self.assertEqual(tabla[BUENO], [4, 0])
        self.assertEqual(tabla[MEDIO], [1, 1])
        self.assertEqual(tabla[MALO], [0, 3])
        self.assertNotIn("basura", tabla)

    def test_progreso_vacio_o_raro_no_rompe(self):
        self.assertEqual(enjambre.merito_escritores(None), {})
        self.assertEqual(enjambre.merito_escritores({"x": {"modelo": 3}}), {})


class Orden(unittest.TestCase):
    def test_sin_cabeza_manda_el_merito_y_lo_nuevo_va_entre_medias(self):
        orden = enjambre.orden_por_merito([MALO, NUEVO, MEDIO, BUENO], PROGRESO, "T1", cabeza=1)
        # BUENO 5/6 · MEDIO 2/4=0,5 · NUEVO 1/2=0,5 (empate: manda el orden original) · MALO 1/5
        self.assertEqual(orden, [BUENO, NUEVO, MEDIO, MALO])

    def test_la_cabeza_rota_por_tarea_y_el_malo_nunca_encabeza(self):
        modelos = [MALO, NUEVO, MEDIO, BUENO]
        primeros = {enjambre.orden_por_merito(modelos, PROGRESO, tid, cabeza=3)[0]
                    for tid in ("T1", "T2", "T3", "T4", "T5", "T6")}
        self.assertNotIn(MALO, primeros)
        self.assertGreater(len(primeros), 1)
        for tid in ("T1", "T2", "T3"):
            self.assertEqual(enjambre.orden_por_merito(modelos, PROGRESO, tid, cabeza=3)[-1], MALO)

    def test_sin_historia_respeta_el_orden_de_la_lista(self):
        modelos = ["a/1", "b/2", "c/3", "d/4"]
        self.assertEqual(enjambre.orden_por_merito(modelos, {}, "x", cabeza=1), modelos)

    def test_no_pierde_ni_duplica_modelos(self):
        modelos = [MALO, NUEVO, MEDIO, BUENO, "x/y"]
        for tid in ("a", "bb", "ccc"):
            orden = enjambre.orden_por_merito(modelos, PROGRESO, tid)
            self.assertEqual(sorted(orden), sorted(modelos))


class Pago(unittest.TestCase):
    def test_los_de_pago_quedan_fuera_por_defecto(self):
        with mock.patch.dict(os.environ, {"STARSEED_PAGO": ""}):
            r = enjambre.sin_pago(["xai/grok-4.6", BUENO, "deepseek/deepseek-chat", "codex/gpt-5.6-sol"])
        self.assertEqual(r, [BUENO, "codex/gpt-5.6-sol"])

    def test_con_permiso_explicito_entran(self):
        with mock.patch.dict(os.environ, {"STARSEED_PAGO": "1"}):
            r = enjambre.sin_pago(["xai/grok-4.6", BUENO])
        self.assertEqual(r, ["xai/grok-4.6", BUENO])

    def test_modelos_para_no_ofrece_grok_sin_permiso(self):
        with mock.patch.dict(os.environ, {"STARSEED_PAGO": ""}):
            self.assertFalse([m for m in enjambre.modelos_para("Z1") if m.startswith("xai/")])


if __name__ == "__main__":
    unittest.main()
