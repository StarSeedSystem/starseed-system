# -*- coding: utf-8 -*-
"""Pruebas del latido del nodo de MetaGenesis (COL1012C): verifica los campos nuevos en el latido."""
import json
import os
import sys
import time
import unittest
from unittest.mock import patch, MagicMock

DIR = os.path.dirname(os.path.abspath(__file__))
if DIR not in sys.path:
    sys.path.insert(0, DIR)

import nodo_metagenesis_medio as M
import nodo_metagenesis_logica as L
import colmena_logica as C


class TestColmenaLatido(unittest.TestCase):
    def setUp(self):
        # Variables de entorno por defecto
        self.env_patcher = patch.dict(os.environ, {
            "STARSEED_ROOT": "/fake/repo",
            "STARSEED_NODO_AUTORITATIVO": "0",
        })
        self.env_patcher.start()

    def tearDown(self):
        self.env_patcher.stop()

    def test_latido_tiene_campos_nuevos(self):
        """El latido debe incluir periodo_s, en_curso y contenedor en la salud."""
        # Mock de las funciones que dependen del sistema
        with patch('nodo_metagenesis_medio.raiz_repo', return_value="/fake/repo"), \
             patch('nodo_metagenesis_medio.detectar_medio', return_value="mac"), \
             patch('nodo_metagenesis_medio.lineas_ps', return_value=[]), \
             patch('nodo_metagenesis_medio.orquestadores', return_value=[]), \
             patch('nodo_metagenesis_medio.sabe_orquestar', return_value=False), \
             patch('nodo_metagenesis_medio.ram_libre_mb', return_value=8000), \
             patch('nodo_metagenesis_medio.disco_libre_gb', return_value=100.0), \
             patch('nodo_metagenesis_medio.os.cpu_count', return_value=8), \
             patch('nodo_metagenesis_medio.os.getloadavg', return_value=[1.0, 0.5, 0.2]), \
             patch('nodo_metagenesis_medio.servicios_mac', return_value=([], [])), \
             patch('nodo_metagenesis_medio.servicios_linux', return_value=[]), \
             patch('nodo_metagenesis_medio.medidores_mac', return_value=({}, None)), \
             patch('nodo_metagenesis_medio.resultados_mac', return_value={}), \
             patch('nodo_metagenesis_medio.nube_pausada', return_value=False), \
             patch('nodo_metagenesis_medio.estado_a1', return_value={}):

            # Llamar a la función medir
            resultado = M.medir("real")

            # Verificar que la estructura básica esté presente
            self.assertIn("medio", resultado)
            self.assertIn("raiz", resultado)
            self.assertIn("salud", resultado)
            self.assertIn("cap", resultado)

            salud = resultado["salud"]
            # Verificar los campos nuevos
            self.assertIn("periodo_s", salud)
            self.assertIn("en_curso", salud)
            self.assertIn("contenedor", salud)

            # Verificar tipos
            self.assertIsInstance(salud["periodo_s"], float)
            self.assertIsInstance(salud["en_curso"], list)
            self.assertIsInstance(salud["contenedor"], dict)

            # Verificar que el contenedor tenga los subcampos esperados
            contenedor = salud["contenedor"]
            self.assertIn("activo", contenedor)
            self.assertIn("agentes", contenedor)
            self.assertIn("apto", contenedor)
            self.assertIn("motivo", contenedor)

            # Verificar valores por defecto (porque estamos usando TODOs)
            self.assertEqual(salud["en_curso"], [])
            self.assertEqual(contenedor["activo"], False)
            self.assertEqual(contenedor["agentes"], 0)
            self.assertEqual(contenedor["apto"], False)
            self.assertEqual(contenedor["motivo"], "")

            # Verificar que el periodo_s sea el valor por defecto (L.LATIDO_S) si no se establece la variable de entorno
            self.assertEqual(salud["periodo_s"], float(L.LATIDO_S))

    def test_latido_periodo_s_desde_variable_de_entorno(self):
        """El periodo_s puede ser sobrescrito por la variable de entorno STARSEED_NODO_LATIDO_S."""
        with patch('nodo_metagenesis_medio.raiz_repo', return_value="/fake/repo"), \
              patch('nodo_metagenesis_medio.detectar_medio', return_value="mac"), \
              patch('nodo_metagenesis_medio.lineas_ps', return_value=[]), \
              patch('nodo_metagenesis_medio.orquestadores', return_value=[]), \
              patch('nodo_metagenesis_medio.sabe_orquestar', return_value=False), \
              patch('nodo_metagenesis_medio.ram_libre_mb', return_value=8000), \
              patch('nodo_metagenesis_medio.disco_libre_gb', return_value=100.0), \
              patch('nodo_metagenesis_medio.os.cpu_count', return_value=8), \
              patch('nodo_metagenesis_medio.os.getloadavg', return_value=[1.0, 0.5, 0.2]), \
              patch('nodo_metagenesis_medio.servicios_mac', return_value=([], [])), \
              patch('nodo_metagenesis_medio.servicios_linux', return_value=[]), \
              patch('nodo_metagenesis_medio.medidores_mac', return_value=({}, None)), \
              patch('nodo_metagenesis_medio.resultados_mac', return_value={}), \
              patch('nodo_metagenesis_medio.nube_pausada', return_value=False), \
              patch('nodo_metagenesis_medio.estado_a1', return_value={}):

            # Establecer la variable de entorno
            os.environ["STARSEED_NODO_LATIDO_S"] = "123.45"

            resultado = M.medir("real")
            salud = resultado["salud"]
            self.assertEqual(salud["periodo_s"], 123.45)

            # Limpiar la variable de entorno para no afectar otras pruebas
            del os.environ["STARSEED_NODO_LATIDO_S"]


if __name__ == '__main__':
    unittest.main()