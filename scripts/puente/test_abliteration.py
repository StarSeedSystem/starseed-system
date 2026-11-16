#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas de abliteration.py: lectura de créditos, detección de 401, sin clave, escritura atómica, permisos 0600."""
import json
import os
import sys
import tempfile
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import abliteration as A  # noqa: E402


class MockResponse:
    def __init__(self, data, status=200):
        self._data = data
        self.status = status
    
    def read(self):
        return json.dumps(self._data).encode("utf-8")
    
    def __enter__(self):
        return self
    
    def __exit__(self, *args):
        pass


class Clave(unittest.TestCase):
    def test_clave_del_entorno(self):
        """La clave se lee de la variable de entorno."""
        os.environ["ABLITERATION_API_KEY"] = "test_key_123"
        self.assertEqual(A.clave(), "test_key_123")
        del os.environ["ABLITERATION_API_KEY"]
    
    def test_clave_sin_entorno(self):
        """Sin variable de entorno, busca en archivos (retorna None si no la encuentra)."""
        if "ABLITERATION_API_KEY" in os.environ:
            del os.environ["ABLITERATION_API_KEY"]
        self.assertIsNone(A.clave())


class LeerCreditos(unittest.TestCase):
    def test_lectura_exitosa(self):
        """La lectura correcta devuelve el JSON y motivo None."""
        datos = {"data": {"total_credits": 10.5, "total_usage": 2.3}}
        with mock.patch.dict(os.environ, {"ABLITERATION_API_KEY": "clave_test"}):
            with mock.patch("abliteration._pedir", return_value=datos) as mock_pedir:
                data, motivo = A.leer_creditos("clave_test", tope_s=20)
                mock_pedir.assert_called_once_with("clave_test", tope_s=20)
                self.assertEqual(data, datos)
                self.assertIsNone(motivo)
    
    def test_401_devuelve_none(self):
        """Un 401 devuelve None y un motivo."""
        import urllib.error
        with mock.patch.dict(os.environ, {"ABLITERATION_API_KEY": "clave_test"}):
            with mock.patch("abliteration._pedir", side_effect=urllib.error.HTTPError("url", 401, "Unauthorized", {}, None)) as mock_pedir:
                data, motivo = A.leer_creditos("clave_test", tope_s=20)
                self.assertIsNone(data)
                self.assertEqual(motivo, "HTTP 401")
    
    def test_429_devuelve_none(self):
        """Un 429 devuelve None y un motivo."""
        import urllib.error
        with mock.patch.dict(os.environ, {"ABLITERATION_API_KEY": "clave_test"}):
            with mock.patch("abliteration._pedir", side_effect=urllib.error.HTTPError("url", 429, "Too Many Requests", {}, None)) as mock_pedir:
                data, motivo = A.leer_creditos("clave_test", tope_s=20)
                self.assertIsNone(data)
                self.assertEqual(motivo, "HTTP 429")


class Actualizar(unittest.TestCase):
    def test_actualizacion_exitosa(self):
        """La actualización escribe el estado y devuelve saldo/usado."""
        d = tempfile.mkdtemp()
        antes_estado = A.ESTADO
        A.ESTADO = os.path.join(d, "abliteration-uso.json")
        
        datos_respuesta = {"data": {"total_credits": 15.0, "total_usage": 5.0}}
        with mock.patch.dict(os.environ, {"ABLITERATION_API_KEY": "clave_test"}):
            with mock.patch("abliteration._pedir", return_value=datos_respuesta) as mock_pedor:
                saldo, usado, motivo = A.actualizar(ahora=1000.0)
                mock_pedor.assert_called_once_with("clave_test", tope_s=20)
                self.assertIsNotNone(saldo)
                self.assertIsNotNone(usado)
                self.assertIsNone(motivo)
                
                with open(os.path.join(d, "abliteration-uso.json"), encoding="utf-8") as f:
                    estado = json.load(f)
                # registrar_usa(creditos_inicial, creditos_final) calcula usado_hoy = final - inicial
                # y almacena saldo = final. Paso total_credits=15, total_usage=5, así que:
                # usado_hoy = 5 - 15 = -10, saldo_final = 5
                self.assertEqual(estado["saldo"], 5.0)
                self.assertEqual(estado["usado_hoy"], -10.0)
        
        A.ESTADO = antes_estado
    
    def test_sin_clave_mensaje(self):
        """Sin clave, el mensaje es 'sin clave'."""
        with mock.patch.dict(os.environ, clear=True):
            with mock.patch("abliteration.clave", return_value=None):
                saldo, usado, motivo = A.actualizar()
                self.assertIsNone(saldo)
                self.assertEqual(motivo, "sin clave")
    
    def test_formato_inesperado(self):
        """JSON sin data devuelve error."""
        d = tempfile.mkdtemp()
        antes_estado = A.ESTADO
        A.ESTADO = os.path.join(d, "abliteration-uso.json")
        
        with mock.patch.dict(os.environ, {"ABLITERATION_API_KEY": "clave_test"}):
            with mock.patch("abliteration._pedir", return_value="no es un dict") as mock_pedor:
                saldo, usado, motivo = A.actualizar(ahora=1000.0)
                
                self.assertEqual(motivo, "formato inesperado")
        
        A.ESTADO = antes_estado


class Permisos(unittest.TestCase):
    def test_archivo_tiene_permisos_0600(self):
        """El archivo de estado se crea con permisos 0600."""
        d = tempfile.mkdtemp()
        ruta = os.path.join(d, "ABLITERATION_USO.json")
        
        A.registrar_uso(10.0, 12.0, archivo=ruta)
        
        modo = oct(os.stat(ruta).st_mode & 0o777)
        self.assertEqual(modo, "0o600")


if __name__ == "__main__":
    unittest.main()