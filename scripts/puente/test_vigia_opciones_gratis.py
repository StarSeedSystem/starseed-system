#!/usr/bin/env python3
"""
Pruebas para vigia_opciones_gratis.py
"""
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch, MagicMock

# Importar el módulo a probar
import sys
sys.path.insert(0, str(Path(__file__).parent))

import vigia_opciones_gratis as vigia_mod

class TestVigiaOpcionesGratis(unittest.TestCase):
    
    def setUp(self):
        """Configuración antes de cada prueba."""
        # Crear un catálogo de prueba
        self.catalogo_prueba = [
            {
                "id": "opcion1",
                "nombre": "Opción de prueba 1",
                "tipo": "proveedor",
                "papeles": ["escritor"],
                "gratis": {"rpm": 10, "porDia": 100, "horasMes": None, "almacenamientoGb": None, "nota": "10 req/min"},
                "requiereCuenta": True,
                "enlaceAlta": "https://example.com/alta",
                "enlaceClave": "https://example.com/clave",
                "variables": ["EJEMPLO_API_KEY"],
                "privacidad": "nube-con-retencion",
                "licencia": "MIT",
                "verificado": None,
                "a_revisar": False,
                "fuente": "proveedores-catalogo"
            },
            {
                "id": "opcion2",
                "nombre": "Opción de prueba 2",
                "tipo": "modelo",
                "papeles": ["código"],
                "gratis": {"rpm": None, "porDia": 50, "horasMes": None, "almacenamientoGb": None, "nota": "50 req/día"},
                "requiereCuenta": False,
                "enlaceAlta": "https://example.com/get-key",
                "enlaceClave": "https://example.com/get-key",
                "variables": [],
                "privacidad": "local",
                "licencia": "Apache-2.0",
                "verificado": "2026-01-01T00:00:00Z",
                "a_revisar": False,
                "fuente": "free-catalog"
            }
        ]
    
    @patch('vigia_opciones_gratis.Path')
    def test_obtener_catalogo_desde_json(self, mock_path_class):
        """Test que obtener_catalogo lee el JSON existente."""
        # Configurar el mock de Path
        mock_path_instance = MagicMock()
        mock_path_instance.exists.return_value = True
        mock_path_class.return_value = mock_path_instance
        
        # Mock de open
        with patch('builtins.open') as mock_open:
            mock_file = MagicMock()
            mock_file.__enter__.return_value.read.return_value = json.dumps(self.catalogo_prueba)
            mock_open.return_value = mock_file
            
            # Ejecutar función
            resultado = vigia_mod.obtener_catalogo()
            
            # Verificar
            self.assertEqual(resultado, self.catalogo_prueba)
            # Verificar que se creó el Path con el camino correcto
            mock_path_class.assert_called_once_with("starseed_memory_root/genesis/catalogo-opciones.json")
            # Verificar que se llamó a exists
            mock_path_instance.exists.assert_called_once()
            # Verificar que se abrió el archivo
            mock_open.assert_called_once_with(mock_path_instance, 'r', encoding='utf-8')
    
    @patch('vigia_opciones_gratis.Path')
    @patch('vigia_opciones_gratis.subprocess.run')
    def test_obtener_catalogo_generado(self, mock_subprocess, mock_path_class):
        """Test que obtener_catalogo genera el catálogo si no existe JSON."""
        # Configurar el mock de Path
        mock_path_instance = MagicMock()
        mock_path_instance.exists.return_value = False  # No existe JSON
        mock_path_class.return_value = mock_path_instance
        
        # Configurar el mock de subprocess
        mock_result = MagicMock()
        mock_result.returncode = 0
        mock_result.stdout = json.dumps(self.catalogo_prueba)
        mock_subprocess.return_value = mock_result
        
        # Ejecutar función
        resultado = vigia_mod.obtener_catalogo()
        
        # Verificar
        self.assertEqual(resultado, self.catalogo_prueba)
        # Verificar que se creó el Path con el camino correcto
        mock_path_class.assert_called_once_with("starseed_memory_root/genesis/catalogo-opciones.json")
        # Verificar que se llamó a exists
        mock_path_instance.exists.assert_called_once()
        # Verificar que se llamó a subprocess
        mock_subprocess.assert_called_once()
    
    @patch('vigia_opciones_gratis.Path')
    def test_obtener_catalogo_vacio(self, mock_path_class):
        """Test que obtener_catalogo retorna lista vacía si no puede obtener el catálogo."""
        # Configurar el mock de Path
        mock_path_instance = MagicMock()
        mock_path_instance.exists.return_value = False  # No existe JSON
        mock_path_class.return_value = mock_path_instance
        
        # También hacemos que subprocess falle
        with patch('vigia_opciones_gratis.subprocess.run') as mock_subprocess:
            mock_subprocess.side_effect = Exception("Error al ejecutar")
            
            # Ejecutar función
            resultado = vigia_mod.obtener_catalogo()
            
            # Verificar
            self.assertEqual(resultado, [])
            # Verificar que se creó el Path con el camino correcto
            mock_path_class.assert_called_once_with("starseed_memory_root/genesis/catalogo-opciones.json")
            # Verificar que se llamó a exists
            mock_path_instance.exists.assert_called_once()
    
    @patch('vigia_opciones_gratis.time.sleep')  # Mock sleep para no esperar realmente
    def test_vigia_opciones_gratis(self, mock_sleep):
        """Test principal del vigía de opciones gratis."""
        # Mock obtener_catalogo para retornar nuestro catálogo de prueba
        with patch.object(vigia_mod, 'obtener_catalogo', return_value=self.catalogo_prueba):
            # Mock consultar_canal_oficial para retornar opciones actualizadas
            def mock_consultar(opcion):
                opcion_copy = opcion.copy()
                opcion_copy["verificado"] = "2026-10-19T10:00:00Z"
                opcion_copy["a_revisar"] = False
                return opcion_copy
            
            with patch.object(vigia_mod, 'consultar_canal_oficial', side_effect=mock_consultar):
                # Ejecutar el vigía
                resultado = vigia_mod.vigia_opciones_gratis()
                
                # Verificar que se procesaron todas las opciones
                self.assertEqual(len(resultado), 2)
                
                # Verificar que cada opción tiene los campos actualizados
                for opcion in resultado:
                    self.assertEqual(opcion["verificado"], "2026-10-19T10:00:00Z")
                    self.assertEqual(opcion["a_revisar"], False)
                
                # Verificar que se hizo sleep después de cada opción exitosa
                # En nuestro caso, 2 opciones exitosas -> 2 llamadas a sleep
                self.assertEqual(mock_sleep.call_count, 2)
                mock_sleep.assert_called_with(10)
    
    @patch('vigia_opciones_gratis.time.sleep')
    def test_vigia_opciones_gratis_con_errores(self, mock_sleep):
        """Test del vigía cuando hay errores en algunas opciones."""
        # Mock obtener_catalogo
        with patch.object(vigia_mod, 'obtener_catalogo', return_value=self.catalogo_prueba):
            # Mock consultar_canal_oficial que falla para la primera opción y funciona para la segunda
            def mock_consultar(opcion):
                if opcion["id"] == "opcion1":
                    raise Exception("Error de conexión")
                opcion_copy = opcion.copy()
                opcion_copy["verificado"] = "2026-10-19T10:00:00Z"
                opcion_copy["a_revisar"] = False
                return opcion_copy
            
            with patch.object(vigia_mod, 'consultar_canal_oficial', side_effect=mock_consultar):
                # Ejecutar el vigía
                resultado = vigia_mod.vigia_opciones_gratis()
                
                # Verificar que se procesaron todas las opciones
                self.assertEqual(len(resultado), 2)
                
                # Primera opción: error -> verificado None, a_revisar True
                self.assertEqual(resultado[0]["id"], "opcion1")
                self.assertIsNone(resultado[0]["verificado"])
                self.assertTrue(resultado[0]["a_revisar"])
                
                # Segunda opción: éxito -> verificado fecha, a_revisar False
                self.assertEqual(resultado[1]["id"], "opcion2")
                self.assertEqual(resultado[1]["verificado"], "2026-10-19T10:00:00Z")
                self.assertFalse(resultado[1]["a_revisar"])
                
                # Verificar que se hizo sleep después de cada opción exitosa
                # Primera opción: error -> no sleep
                # Segunda opción: éxito -> sleep después
                # Por lo tanto, debería haber 1 llamada a sleep
                self.assertEqual(mock_sleep.call_count, 1)
                mock_sleep.assert_called_with(10)
    
    def test_main_func(self):
        """Test de la función main."""
        # Mock vigia_opciones_gratis para retornar datos de prueba
        test_estado = [
            {
                "id": "test",
                "nombre": "Test",
                "tipo": "proveedor",
                "papeles": ["escritor"],
                "gratis": {"rpm": 10, "porDia": 100, "horasMes": None, "almacenamientoGb": None, "nota": "test"},
                "requiereCuenta": True,
                "enlaceAlta": "https://test.com",
                "enlaceClave": "https://test.com",
                "variables": ["TEST_KEY"],
                "privacidad": "nube-con-retencion",
                "licencia": "MIT",
                "verificado": "2026-10-19T10:00:00Z",
                "a_revisar": False,
                "fuente": "proveedores-catalogo"
            }
        ]
        
        # Mockear vigia_opciones_gratis para que retorne nuestros datos de prueba
        with patch.object(vigia_mod, 'vigia_opciones_gratis', return_value=test_estado):
            # Mockear Path.mkdir y open para evitar efectos reales en el sistema de archivos
            with patch('vigia_opciones_gratis.Path.mkdir'):
                with patch('builtins.open', unittest.mock.mock_open()) as mock_open:
                    # Ejecutar la función principal - solo verificamos que no lance excepción
                    try:
                        vigia_mod.main()
                    except Exception as e:
                        self.fail(f"vigia_mod.main() lanzó una excepción: {e}")

if __name__ == '__main__':
    unittest.main()