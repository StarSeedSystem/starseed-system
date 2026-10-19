#!/usr/bin/env python3
"""
Tests para el vigía de referencias e inspiración.
"""

import unittest
from unittest.mock import patch, mock_open
import json
import sys
import os

# Añadir el directorio scripts/puente al path para importar el módulo
sys.path.insert(0, os.path.join(os.path.dirname(__file__)))

import vigia_referencias


class TestVigiaReferencias(unittest.TestCase):
    
    def setUp(self):
        """Configuración inicial para cada test."""
        self.catalogo_ejemplo = {
            "entradas": [
                {
                    "id": "fontshare",
                    "nombre": "Fontshare",
                    "url": "https://www.fontshare.com",
                    "tipo": "recursos-descargables",
                    "acceso": "libre",
                    "clase_uso": "reutilizable-con-condiciones",
                    "actualizacion": [
                        {
                            "tipo": "api",
                            "url": "https://api.fontshare.com/v2/fonts"
                        }
                    ],
                    "terminos": "https://www.fontshare.com/licenses/itf-ffl"
                },
                {
                    "id": "github-ejemplo",
                    "nombre": "GitHub Ejemplo",
                    "url": "https://github.com/usuario/repo",
                    "tipo": "codigo-abierto",
                    "acceso": "libre",
                    "clase_uso": "reutilizable",
                    "actualizacion": [
                        {
                            "tipo": "github",
                            "ref": "usuario/repo"
                        }
                    ],
                    "terminos": None
                }
            ]
        }
    
    @patch('vigia_referencias._fetch')
    def test_procesar_entrada_fontshare_api(self, mock_fetch):
        """Test procesamiento de entrada Fontshare con API."""
        # Simular respuesta de API de Fontshare
        mock_fetch.return_value = json.dumps({
            "fonts": [
                {"id": "satoshi", "version": "1.0", "is_new": True}
            ]
        }).encode('utf-8')
        
        entrada = self.catalogo_ejemplo["entradas"][0]  # fontshare
        estado_entrada = {}
        
        novedades, nuevo_estado = vigia_referencias.procesar_entrada(entrada, estado_entrada)
        
        # Verificaciones básicas
        self.assertIsInstance(novedades, list)
        self.assertIsInstance(nuevo_estado, dict)
    
    def test_cargar_estado_inexistente(self):
        """Test carga de estado cuando no existe archivo."""
        with patch('builtins.open', side_effect=FileNotFoundError):
            estado = vigia_referencias.cargar_estado()
            self.assertEqual(estado, {})
    
    def test_cargar_estado_existente(self):
        """Test carga de estado cuando existe archivo."""
        datos_prueba = {"test": {"clave": "valor"}}
        with patch('builtins.open', mock_open(read_data=json.dumps(datos_prueba))):
            estado = vigia_referencias.cargar_estado()
            self.assertEqual(estado, datos_prueba)
    
    def test_guardar_estado(self):
        """Test guardado de estado."""
        estado_prueba = {"test": {"clave": "valor"}}
        with patch('builtins.open', mock_open()) as mock_file:
            vigia_referencias.guardar_estado(estado_prueba)
            mock_file.assert_called_once_with(
                vigia_referencias.ESTADO_PATH, 'w', encoding='utf-8'
            )
            # Verificar que se escribió JSON
            handle = mock_file()
            handle.write.assert_called()


if __name__ == '__main__':
    unittest.main()