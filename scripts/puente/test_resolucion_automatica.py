# -*- coding: utf-8 -*-
"""Pruebas de resolucion_automatica.py.

Lo que de verdad importa fijar aquí no es que apruebe: es que NO apruebe
cuando alguno de los dos supervisores puso una pega. El interruptor puede
ahorrar horas de espera a una rama limpia; no puede colar una sucia.
"""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import resolucion_automatica as R
from analisis_aprobacion import puede_aprobar_solo

VERDE = {"bloqueante": False, "revisor": "respondio", "faltan": []}
APRUEBA = {"veredicto": "aprobar", "confianza": "alta", "razones": ["cambio acotado y con pruebas"]}


def decidir(ajustes, ficha, veredicto):
    return R.decidir(ajustes, ficha, veredicto, puede_aprobar_solo)


class TestInterruptor(unittest.TestCase):
    def test_encendido_por_defecto(self):
        self.assertTrue(R.encendida({}))
        self.assertTrue(R.encendida(None))
        self.assertTrue(R.encendida({"workers": 3}))      # ajustes sin la llave

    def test_se_puede_apagar(self):
        self.assertFalse(R.encendida({R.LLAVE: False}))

    def test_apagado_manda_sobre_todo_lo_demas(self):
        accion, motivo = decidir({R.LLAVE: False}, VERDE, APRUEBA)
        self.assertEqual(accion, "esperar")
        self.assertIn("apagada", motivo)


class TestVerificadores(unittest.TestCase):
    def test_revision_bloqueante_no_pasa(self):
        ficha = dict(VERDE, bloqueante=True)
        accion, motivo = decidir({}, ficha, APRUEBA)
        self.assertEqual(accion, "esperar")
        self.assertIn("bloqueante", motivo)

    def test_revisor_en_bloqueante_tampoco(self):
        ficha = dict(VERDE, revisor="bloqueante")
        self.assertEqual(decidir({}, ficha, APRUEBA)[0], "esperar")

    def test_alcance_incompleto_no_pasa(self):
        # El fallo de la Ola 320: una puerta levantada por alcance incompleto se
        # abría igual a los diez minutos. Aquí no.
        ficha = dict(VERDE, faltan=["src/lib/mando/permisos.ts"])
        accion, motivo = decidir({}, ficha, APRUEBA)
        self.assertEqual(accion, "esperar")
        self.assertIn("permisos.ts", motivo)

    def test_sin_revisor_vivo_no_bloquea(self):
        ficha = dict(VERDE, revisor="sin_revisor")
        self.assertEqual(decidir({}, ficha, APRUEBA)[0], "aprobar")


class TestDirector(unittest.TestCase):
    def test_todo_conforme_aprueba(self):
        accion, motivo = decidir({}, VERDE, APRUEBA)
        self.assertEqual(accion, "aprobar")
        self.assertIn("confianza alta", motivo)
        self.assertIn("cambio acotado", motivo)     # dice POR QUÉ, no solo que sí

    def test_confianza_media_espera(self):
        accion, motivo = decidir({}, VERDE, dict(APRUEBA, confianza="media"))
        self.assertEqual(accion, "esperar")
        self.assertIn("confianza media", motivo)

    def test_veredicto_dudoso_espera(self):
        self.assertEqual(decidir({}, VERDE, dict(APRUEBA, veredicto="dudoso"))[0], "esperar")

    def test_veredicto_rechazar_espera(self):
        # Rechazar NO es rechazar solo: lo mira Alex. Aprobar sola es la única
        # decisión que el automatismo puede tomar; tirar trabajo, nunca.
        self.assertEqual(decidir({}, VERDE, dict(APRUEBA, veredicto="rechazar"))[0], "esperar")

    def test_veredicto_ilegible_espera(self):
        for malo in (None, "aprobar", [], {}):
            self.assertEqual(decidir({}, VERDE, malo)[0], "esperar")


class TestNota(unittest.TestCase):
    def test_no_se_hace_pasar_por_alex(self):
        n = R.nota("aprobar", "todo conforme")
        self.assertIn("automáticamente", n)
        self.assertIn(R.QUIEN, n)
        self.assertNotIn("desde el Mando", n)

    def test_la_espera_dice_por_que(self):
        self.assertIn("bloqueante", R.nota("esperar", "la revisión es bloqueante"))


if __name__ == "__main__":
    unittest.main()
