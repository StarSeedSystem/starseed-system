# -*- coding: utf-8 -*-
"""test_produccion_panel · pruebas puras del panel de respaldo (§9, patrón CrewAI).

Unittest con un `llamar` falso inyectado: sin red, sin archivos, sin reloj real.
Casos del contrato: unanimidad publica, empate no publica, el «no» de seguridad
veta aunque los demás digan sí, y con menos de 3 respuestas no se publica.
"""

import importlib.util
import os
import sys
import unittest

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
if DIRECTORIO not in sys.path:
    sys.path.insert(0, DIRECTORIO)

_ruta_mod = os.path.join(DIRECTORIO, "produccion_panel.py")
_spec = importlib.util.spec_from_file_location("produccion_panel", _ruta_mod)
_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_mod)

CANDIDATA = {"titulo": "Puerta de diseño", "archivos": ["a.py"], "diffstat": "1+"}
MODELOS = {"lanzamiento": "m1", "qa": "m2", "seguridad": "m3", "sre": "m4"}


def hacer_llamar(respuestas_por_modelo):
    """`llamar` falso: cada modelo responde su texto; None o excepción = caído."""
    def llamar(modelo, prompt):
        valor = respuestas_por_modelo.get(modelo)
        if isinstance(valor, Exception):
            raise valor
        return valor
    return llamar


def voto(publicar, motivo="ok"):
    return '{"publicar": %s, "motivo": "%s"}' % (
        "true" if publicar else "false", motivo)


class DecidirPanelTest(unittest.TestCase):
    def test_unanimidad_publica(self):
        llamar = hacer_llamar({m: voto(True) for m in MODELOS.values()})
        salida = _mod.decidir_panel(CANDIDATA, llamar=llamar, modelos_roles=MODELOS)
        self.assertTrue(salida["publicar"])
        self.assertEqual(set(salida["votos"]), set(MODELOS))

    def test_empate_no_publica(self):
        llamar = hacer_llamar({
            "m1": voto(True), "m2": voto(True),
            "m3": voto(False), "m4": voto(False),
        })
        salida = _mod.decidir_panel(CANDIDATA, llamar=llamar, modelos_roles=MODELOS)
        self.assertFalse(salida["publicar"])

    def test_veto_de_seguridad(self):
        llamar = hacer_llamar({
            "m1": voto(True), "m2": voto(True),
            "m3": voto(False, "expone un token"), "m4": voto(True),
        })
        salida = _mod.decidir_panel(CANDIDATA, llamar=llamar, modelos_roles=MODELOS)
        self.assertFalse(salida["publicar"])
        self.assertIn("token", salida["motivos"]["seguridad"])

    def test_roles_caidos_no_cuentan(self):
        llamar = hacer_llamar({
            "m1": voto(True), "m2": RuntimeError("caído"),
            "m3": None, "m4": voto(True),
        })
        salida = _mod.decidir_panel(CANDIDATA, llamar=llamar, modelos_roles=MODELOS)
        self.assertEqual(len(salida["votos"]), 2)
        self.assertFalse(salida["publicar"])  # menos de 3 respuestas

    def test_tres_respuestas_con_mayoria_publican(self):
        llamar = hacer_llamar({
            "m1": voto(True), "m2": voto(False),
            "m3": RuntimeError("caído"), "m4": voto(True),
        })
        salida = _mod.decidir_panel(CANDIDATA, llamar=llamar, modelos_roles=MODELOS)
        self.assertTrue(salida["publicar"])
        self.assertNotIn("seguridad", salida["votos"])  # caída: no veta ni cuenta

    def test_sin_llamar_no_publica(self):
        salida = _mod.decidir_panel(CANDIDATA, llamar=None, modelos_roles=MODELOS)
        self.assertEqual(salida, {"publicar": False, "votos": {}, "motivos": {}})

    def test_tiempo_agotado_detiene_el_panel(self):
        tiempos = iter([0.0, 0.0, 61.0])  # el segundo rol ya se pasa del tope
        llamar = hacer_llamar({m: voto(True) for m in MODELOS.values()})
        salida = _mod.decidir_panel(
            CANDIDATA, llamar=llamar, modelos_roles=MODELOS,
            tiempo_max=60, reloj=lambda: next(tiempos))
        self.assertEqual(len(salida["votos"]), 1)
        self.assertFalse(salida["publicar"])


class PiezasTest(unittest.TestCase):
    def test_interpretar_voto_roto(self):
        self.assertIsNone(_mod.interpretar_voto("sin json"))
        self.assertIsNone(_mod.interpretar_voto('{"publicar": "quizá"}'))
        self.assertIsNone(_mod.interpretar_voto(None))

    def test_elegir_modelos_roles_distintos_y_respaldo(self):
        asignacion = _mod.elegir_modelos_roles(["a", "b"])
        self.assertEqual(set(asignacion), set(_mod.ROLES))
        self.assertEqual(len(set(asignacion.values())), 4)
        self.assertEqual(asignacion["lanzamiento"], "a")
        self.assertEqual(asignacion["qa"], "b")

    def test_pregunta_rol_lleva_instruccion_y_paquete(self):
        texto = _mod.pregunta_rol("qa", CANDIDATA)
        self.assertIn("QA", texto)
        self.assertIn("Puerta de diseño", texto)


if __name__ == "__main__":
    unittest.main()
