#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Tests for the repair of CAPC1011Cb: use of repartir_nube.cedibles_y_lote in buscar_capacidad.py and oracle_nodo.py."""

import os
import sys
import json
from unittest.mock import patch, MagicMock

# Add the raíz to the path so we can import the modules
DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(os.path.dirname(DIRECTORIO))
if DIRECTORIO not in sys.path:
    sys.path.insert(0, DIRECTORIO)
if RAIZ not in sys.path:
    sys.path.insert(0, RAIZ)

def test_buscar_capacidad_uses_cedibles_y_lote():
    """Test that reunir_nube in buscar_capacidad.py uses cedibles_y_lote."""
    from scripts.puente.buscar_capacidad import reunir_nube

    # Mock the dependencies
    with patch('scripts.puente.buscar_capacidad._repartidor') as mock_repartidor, \
         patch('scripts.puente.buscar_capacidad._leer_json') as mock_leer_json, \
         patch('scripts.puente.buscar_capacidad.ran.asuntos_main') as mock_asuntos, \
         patch('scripts.puente.buscar_capacidad.ran.OLAS', 'fake_olas'), \
         patch('scripts.puente.buscar_capacidad.subprocess.run') as mock_subprocess, \
         patch('scripts.puente.buscar.capacidad.RN') as mock_rn:

        # Set up the mocks
        mock_ran = MagicMock()
        mock_ran.colas_fuente.return_value = [('cola1', [{'id': '1'}])]
        mock_ran.PROGRESO = 'fake_progreso'
        mock_ran.asuntos_main.return_value = 'fake_asuntos'
        mock_ran.DESTINO_DIR = 'fake_destino'
        mock_repartidor.return_value = mock_ran

        mock_leer_json.return_value = {}

        mock_subprocess.return_value.stdout = 'fake_procesos'

        mock_rn.nube_pausada.return_value = False
        mock_rn.colas_de_la_tanda_viva.return_value = []
        mock_rn.leer_prestadas.return_value = set()
        mock_rn.cedibles_y_lote.return_value = (['1', '2'], {'1', '2'})  # cedibles, lote
        mock_rn.sin_lo_de_la_mac.return_value = [('cola1', [])]
        mock_rn.clasificar.return_value = {'elegibles': []}

        # Call the function
        result = reunir_nube(ahora=0, estado_mac={'listas': [], 'tope': 3}, ceder=True)

        # Check that cedibles_y_lote was called
        mock_rn.cedibles_y_lote.assert_called_once()
        # Check that the result contains the lote in the mac dictionary
        assert 'lote' in result['mac']
        assert result['mac']['lote'] == {'1', '2'}
        # Check that the cedibles are set correctly
        assert result['mac']['cedibles'] == ['1', '2']

def test_oracle_nodo_lote_initialization():
    """Test that in oracle_nodo.py, lote is initialized in the except block."""
    from scripts.puente.oracle_nodo import lanzar

    # We will mock the dependencies to trigger the except block
    with patch('scripts.puente.oracle_nodo.RN') as mock_rn, \
         patch('scripts.puente.oracle_nodo.rep.asuntos_main') as mock_asuntos, \
         patch('scripts.puente.oracle_nodo.rep.ola_actual') as mock_ola, \
         patch('scripts.puente.oracle_nodo._leer') as mock_leer, \
         patch('scripts.puente.oracle_nodo.time.time') as mock_time, \
         patch('scripts.puente.oracle_nodo._Cerrojo') as mock_cerrojo, \
         patch('scripts.puente.oracle_nodo.subprocess.run') as mock_subprocess:

        # Set up the mocks to throw an exception in the try block
        mock_rn.nube_pausada.return_value = False
        mock_rep = MagicMock()
        mock_rep.asuntos_main.return_value = 'fake_asuntos'
        mock_rep.ola_actual.return_value = 'fake_ola'
        mock_rep.leer_prestadas.return_value = set()
        mock_rn.colas_de_la_tanda_viva.return_value = []
        mock_rn.leer_prestadas.return_value = set()
        # Make the call to asignar_huecos.reunir throw an exception
        with patch('scripts.puente.oracle_nodo.asignar_huecos.reunir') as mock_reunir:
            mock_reunir.side_effect = Exception("test exception")

            mock_leer.return_value = {}  # for progreso.json
            mock_time.return_value = 1000
            mock_cerrojo_instance = MagicMock()
            mock_cerrojo.return_value.__enter__.return_value = mock_cerrojo_instance
            mock_cerrojo_instance.__exit__.return_value = None
            mock_subprocess.return_value.stdout = 'fake_procesos'

            # Call the lanzar function
            result = lanzar(tope=2, simular=False)

            # Check that in the except block, cedibles was set to [] and lote was set to set()
            # We can't directly check the local variables, but we can check that the llamar to elegir was made with mismo_lote=set()
            # The elegir call is after the except block, so we can check the mock
            mock_rn.elegir.assert_called_once()
            args, kwargs = mock_rn.elegir.call_args
            # Check that mismo_lote was passed and is an empty set
            assert 'mismo_lote' in kwargs
            assert kwargs['mismo_lote'] == set()

def test_buscar_capacidad_texto_nube_breakdown():
    """Test that the texto_nube function in buscar_capacidad.py shows the correct breakdown."""
    from scripts.puente.buscar_capacidad import texto_nube

    # Mock the mac dictionary to have cedibles and lote
    mac = {
        "tanda": 10,
        "se_queda": 2,
        "cedibles": ['1', '2', '3', '4', '5'],  # 5 cedibles in total
        "lote": {'3', '4'}  # 2 of them are in chains
    }
    # Expected: suelta_count = 5 - 2 = 3, chain_task_count = 2

    # Call the function
    result = texto_nube(clases={}, plan={}, runs_vivos=0, mac=mac)

    # Check that the result contains the expected string
    expected_part = "la tanda de la Mac tiene 10: se queda 2 para sus próximas rondas y cede 3 sueltas y 2 tareas en cadenas que nadie espera"
    assert expected_part in result

def test_aproximacion_fixed():
    """Test that the approximation cadenas_m = cadenas_k is fixed by showing different numbers for sueltas and chain tasks when appropriate."""
    from scripts.puente.buscar_capacidad import texto_nube

    # Case 1: a chain with more than one task
    mac = {
        "tanda": 10,
        "se_queda": 2,
        "cedibles": ['1', '2', '3', '4', '5', '6'],  # 6 cedibles
        "lote": {'3', '4', '5', '6'}  # 4 tasks in chains (so two chains of two tasks each, or one chain of four tasks, etc.)
    }
    # suelta_count = 6 - 4 = 2
    # chain_task_count = 4
    result = texto_nube(clases={}, plan={}, runs_vivos=0, mac=mac)
    assert "cede 2 sueltas y 4 tareas en cadenas" in result
    # We are not showing the number of chains, so we don't check for "M cadenas"

    # Case 2: no chains
    mac = {
        "tanda": 10,
        "se_queda": 2,
        "cedibles": ['1', '2', '3'],
        "lote": set()
    }
    result = texto_nube(clases={}, plan={}, runs_vivos=0, mac=mac)
    assert "cede 3 sueltas y 0 tareas en cadenas" in result

    # Case 3: all tasks are in chains
    mac = {
        "tanda": 10,
        "se_queda": 2,
        "cedibles": ['1', '2', '3'],
        "lote": {'1', '2', '3'}
    }
    result = texto_nube(clases={}, plan={}, runs_vivos=0, mac=mac)
    assert "cede 0 sueltas y 3 tareas en cadenas" in result

if __name__ == '__main__':
    test_buscar_capacidad_uses_cedibles_y_lote()
    test_oracle_nodo_lote_initialization()
    test_buscar_capacidad_texto_nube_breakdown()
    test_aproximacion_fixed()
    print("All tests passed!")