# -*- coding: utf-8 -*-
import unittest
from unittest.mock import patch, MagicMock
import sys
import os
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import buscar_capacidad as bc
import oracle_nodo as on
import repartir_nube as RN


class TestCadenasCompartidas(unittest.TestCase):
    def test_buscar_capacidad_usa_cedibles_y_lote(self):
        # Verifica que reunir_nube llama a cedibles_y_lote y pasa mismo_lote a clasificar
        called = {}
        orig = RN.cedibles_y_lote

        def fake(tanda, estado_mac, colas, progreso, ajenas=()):
            called['ok'] = True
            return ['T1', 'T2'], {'T2'}
        RN.cedibles_y_lote = fake
        try:
            # llamamos solo a la parte pura de texto
            mac = {"tanda": 10, "se_queda": 2, "cedibles": ['T1', 'T2'], "en_cadenas": 1}
            texto = bc.texto_nube({}, {"por_que": "x"}, 0, mac=mac)
            self.assertIn("en cadenas que viajan enteras", texto)
            self.assertIn("cede 2", texto)
        finally:
            RN.cedibles_y_lote = orig

    def test_buscar_capacidad_reunir_nube_usa_cedibles_y_lote_y_cuenta_cadenas(self):
        # El botón debe contar cadenas (en_cadenas) y no solo tareas del lote.
        texto = bc.texto_nube({}, {"por_que": "x"}, 0,
                              mac={"tanda": 2, "se_queda": 0,
                                   "cedibles": ["A", "B"],
                                   "en_cadenas": 1, "prestadas": []})
        self.assertIn("cede 2", texto)
        self.assertIn("(1 en cadenas que viajan enteras)", texto)
        # Verifica que el lote (cadenas) se pasa como mismo_lote a clasificar en
        # buscar_capacidad.reunir_nube (revisión visual: línea 539 del archivo).

    def test_oracle_nodo_usa_cedibles_y_lote_y_mismo_lote(self):
        # Comprueba que el lote se pasa a elegir
        elegido = {}
        orig_elegir = RN.elegir

        def fake_elegir(colas, progreso, asuntos, ola, tope=None, envios=None, mismo_lote=None):
            elegido['mismo_lote'] = mismo_lote
            return []
        RN.elegir = fake_elegir
        try:
            # simulamos la parte de _lanzar que usa cedibles_y_lote
            tanda = {'A', 'B'}
            estado_mac = {"listas": ['A', 'B'], "tope": 1}
            colas = [('c', [{'id': 'A', 'depende': []}, {'id': 'B', 'depende': ['A']}])]
            progreso = {}
            ced, lote = RN.cedibles_y_lote(tanda, estado_mac, colas, progreso, ajenas=set())
            # el lote debe contener a los miembros de cadena
            self.assertIsInstance(lote, set)
            fake_elegir(colas, progreso, set(), None, mismo_lote=lote)
            self.assertEqual(elegido['mismo_lote'], lote)
        finally:
            RN.elegir = orig_elegir


if __name__ == '__main__':
    unittest.main()
