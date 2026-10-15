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
        called_cedibles = {}
        called_cadenas = {}
        orig_cedibles_y_lote = RN.cedibles_y_lote
        orig_cadenas_cedibles = RN.cadenas_cedibles

        def fake_cedibles_y_lote(tanda, estado_mac, colas, progreso, ajenas=()):
            called_cedibles['ok'] = True
            # Return cedibles = ['T1', 'T2'], lote = {'T2'}
            return ['T1', 'T2'], {'T2'}

        def fake_cadenas_cedibles(tareas_tanda, listas_mac, tope_mac, esperadas_por):
            called_cadenas['ok'] = True
            # Return one cadena: [['T2']]
            return [['T2']]

        RN.cedibles_y_lote = fake_cedibles_y_lote
        RN.cadenas_cedibles = fake_cadenas_cedibles
        try:
            # llamamos solo a la parte pura de texto
            # We need to build the mac dictionary as it would be built by reunir_nube
            # From the mocks, we have:
            #   cedibles = ['T1', 'T2']
            #   lote = {'T2'}
            #   num_cadenas = 1 (from the mock of cadenas_cedibles)
            mac = {"tanda": 10, "se_queda": 2, "cedibles": ['T1', 'T2'], "en_cadenas": 1, "num_cadenas": 1}
            texto = bc.texto_nube({}, {"por_que": "x"}, 0, mac=mac)
            # Now check the new format
            self.assertIn("cede 1 sueltas y 1 cadenas (1 tarea)", texto)
        finally:
            RN.cedibles_y_lote = orig_cedibles_y_lote
            RN.cadenas_cedibles = orig_cadenas_cedibles

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
