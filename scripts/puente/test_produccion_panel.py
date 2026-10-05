# -*- coding: utf-8 -*-
"""test_produccion_panel · pruebas puras del panel de respaldo (director-produccion §9).

Unittest con un `llamar` falso inyectado por modelo: sin red, sin archivos, sin reloj
real (tope sobrado). Casos del contrato: unanimidad, empate, veto de seguridad y
roles caídos (uno no responde no cuenta; con menos de 3 respuestas no se publica).
"""

import importlib.util
import json
import os
import sys
import unittest

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
if DIRECTORIO not in sys.path:
    sys.path.insert(0, DIRECTORIO)

import optimizador_panel  # noqa: E402,F401  (lo carga en sys.path para el módulo)

_ruta = os.path.join(DIRECTORIO, "produccion_panel.py")
_spec = importlib.util.spec_from_file_location("produccion_panel", _ruta)
_mod = importlib.util.module_from_spec(_spec)
sys.modules["produccion_panel"] = _mod
_spec.loader.exec_module(_mod)

CANDIDATA = {"tid": "PRD1005N", "titulo": "Panel de respaldo", "diffstat": "+120"}
MODELOS = ["m1", "m2", "m3", "m4"]


def llamar_falso(respuestas_por_modelo):
    """`llamar(modelo, prompt)` falso: dict modelo → texto o excepción."""
    def _llamar(modelo, prompt):
        salida = respuestas_por_modelo[modelo]
        if isinstance(salida, Exception):
            raise salida
        return salida
    return _llamar


def _json(publicar, motivo="motivo de una línea"):
    return json.dumps({"publicar": publicar, "motivo": motivo})


class TestProduccionPanel(unittest.TestCase):
    def test_unanimidad_si_publica(self):
        llamar = llamar_falso({m: _json("si") for m in MODELOS})
        salida = _mod.decidir_panel(CANDIDATA, llamar=llamar, modelos=MODELOS)
        self.assertTrue(salida["publicar"])
        self.assertEqual(salida["votos"], {r: True for r in _mod.ROLES})

    def test_unanimidad_no_no_publica(self):
        llamar = llamar_falso({m: _json("no") for m in MODELOS})
        salida = _mod.decidir_panel(CANDIDATA, llamar=llamar, modelos=MODELOS)
        self.assertFalse(salida["publicar"])

    def test_empate_no_publica(self):
        llamar = llamar_falso({
            "m1": _json("si"), "m2": _json("si"),
            "m3": _json("no"), "m4": _json("no"),
        })
        salida = _mod.decidir_panel(CANDIDATA, llamar=llamar, modelos=MODELOS)
        self.assertFalse(salida["publicar"])

    def test_mayoria_si_publica(self):
        llamar = llamar_falso({
            "m1": _json("si"), "m2": _json("si"),
            "m3": _json("si"), "m4": _json("no"),
        })
        salida = _mod.decidir_panel(CANDIDATA, llamar=llamar, modelos=MODELOS)
        self.assertTrue(salida["publicar"])

    def test_veto_de_seguridad(self):
        llamar = llamar_falso({
            "m1": _json("si"), "m2": _json("si"),
            "m3": _json("no", "hay un secreto en el diff"), "m4": _json("si"),
        })
        salida = _mod.decidir_panel(CANDIDATA, llamar=llamar, modelos=MODELOS)
        self.assertFalse(salida["publicar"])
        self.assertEqual(salida["votos"]["seguridad"], False)
        self.assertIn("secreto", salida["motivos"]["seguridad"])

    def test_rol_caido_no_cuenta_y_aun_puede_publicar(self):
        llamar = llamar_falso({
            "m1": _json("si"), "m2": RuntimeError("colgado"),
            "m3": _json("si"), "m4": _json("no"),
        })
        salida = _mod.decidir_panel(CANDIDATA, llamar=llamar, modelos=MODELOS)
        self.assertEqual(len(salida["votos"]), 3)
        self.assertNotIn("qa", salida["votos"])
        self.assertTrue(salida["publicar"])

    def test_json_roto_no_cuenta(self):
        llamar = llamar_falso({
            "m1": _json("si"), "m2": "no sé qué decir",
            "m3": _json("no"), "m4": _json("no"),
        })
        salida = _mod.decidir_panel(CANDIDATA, llamar=llamar, modelos=MODELOS)
        self.assertEqual(len(salida["votos"]), 3)
        self.assertFalse(salida["publicar"])

    def test_menos_de_minimo_respuestas_no_publica(self):
        llamar = llamar_falso({
            "m1": _json("si"), "m2": RuntimeError("caído"),
            "m3": _json("si"), "m4": None,
        })
        salida = _mod.decidir_panel(CANDIDATA, llamar=llamar, modelos=MODELOS)
        self.assertEqual(len(salida["votos"]), 2)
        self.assertFalse(salida["publicar"])

    def test_modelos_distintos_por_rol(self):
        llamar = llamar_falso({m: _json("si") for m in MODELOS})
        salida = _mod.decidir_panel(CANDIDATA, llamar=llamar, modelos=MODELOS)
        self.assertEqual(len(set(salida["modelos"].values())), len(_mod.ROLES))

    def test_parsear_respuesta_booleana_y_motivo_de_una_linea(self):
        v = _mod.parsear_respuesta('texto {"publicar": true, "motivo": "a\\nb\\nc"} fin')
        self.assertEqual(v, {"publicar": True, "motivo": "a"})
        self.assertIsNone(_mod.parsear_respuesta("sin json"))
        self.assertIsNone(_mod.parsear_respuesta('{"otro": 1}'))


if __name__ == "__main__":
    unittest.main()
