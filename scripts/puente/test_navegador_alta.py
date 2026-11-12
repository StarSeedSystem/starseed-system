#!/usr/bin/env python3
"""Pruebas de navegador_alta sin red (NAV1112D)."""
import os
import sys
import json
import time
from pathlib import Path

# Add current directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import navegador_alta as N


class MockTelegram:
    """Mock para las pruebas del cliente Telegram."""
    def __init__(self):
        self.mensajes = []
    
    def enviar(self, texto, boton_url=None):
        self.mensajes.append(("enviar", texto, boton_url))
        return {"ok": True, "trozos": 1}


class MockSelkies:
    """Mock para las pruebas del cliente Selkies."""
    def __init__(self):
        self.estado = "apagado"
        self.sesiones = {}
    
    def encender(self, sesion):
        self.estado = "encendido"
        self.sesiones[sesion] = "activo"
    
    def apagar(self):
        self.estado = "apagado"
        self.sesiones = {}


class MockChromium:
    """Mock para las pruebas del cliente Chromium."""
    def __init__(self):
        self.estado = "cerrado"
        self.pagina_abierta = None
    
    def abrir_pagina_inicio_sesion(self):
        self.pagina_abierta = "pagina_inicio_sesion"
    
    def cerrar(self):
        self.pagina_abierta = None
        self.estado = "cerrado"


class MockCliente:
    """Mock para las pruebas del cliente de navegador."""
    def __init__(self):
        self.estado_sesion = {"sesion": "google-alex"}
        self.estado_vivo = False
    
    def estado(self):
        return self.estado_sesion


class TestNavegadorAlta:
    """Pruebas para el cliente de alta de navegador."""
    
    def setup_method(self):
        """Configurar el entorno antes de cada prueba."""
        self.telegram_mock = MockTelegram()
        self.selkies_mock = MockSelkies()
        self.chromium_mock = MockChromium()
        self.cliente_mock = MockCliente()
        
        # Reemplazar clientes mock
        N._obtener_telegram = lambda: self.telegram_mock
        N._encender_selkies = lambda sesion: self.selkies_mock.encender(sesion)
        N._apagar_selkies = lambda: self.selkies_mock.apagar()
        N._iniciar_cromium = lambda sesion: self.chromium_mock.iniciar(sesion)
        N._abrir_pagina_inicio_sesion = lambda: self.chromium_mock.abrir_pagina_inicio_sesion()
        N._esperar_hasta_30_minutos = lambda sesion: time.sleep(0.1)
        N._obtener_cliente = lambda: self.cliente_mock
        
        # Limpiar historial de mensajes
        self.telegram_mock.mensajes = []
    
    def test_comando_alta_espera_sesiones_vivas(self):
        """Test: El comando alta espera hasta que una sesión esté viva."""
        # Configurar estado: sesión inicialmente viva
        self.cliente_mock.estado_vivo = True
        
        # Ejecutar alta
        resultado = N.alta("google-alex")
        
        # Verificar resultados
        assert resultado["ok"] is True
        assert len(self.telegram_mock.mensajes) == 1
        assert "MetaGenesis › Apps Linux e inicia sesión en google-alex" in self.telegram_mock.mensajes[0][1]
        assert self.selkies_mock.estado == "apagado"
        assert self.chromium_mock.estado == "cerrado"
    
    def test_comando_alta_notifica_via_telegram(self):
        """Test: El comando alta notifica vía Telegram."""
        # Configurar estado: sesión viva
        self.cliente_mock.estado_vivo = True
        
        # Ejecutar alta
        N.alta("google-alex")
        
        # Verificar notificación
        assert len(self.telegram_mock.mensajes) == 1
        assert "MetaGenesis › Apps Linux e inicia sesión en google-alex" in self.telegram_mock.mensajes[0][1]
    
    def test_comando_alta_apaga_selkies_al_terminar(self):
        """Test: El comando alta apaga Selkies al terminar."""
        # Configurar estado: sesión viva
        self.cliente_mock.estado_vivo = True
        
        # Ejecutar alta
        N.alta("google-alex")
        
        # Verificar que Selkies está apagado
        assert self.selkies_mock.estado == "apagado"
    
    def test_comando_estado_verifica_sesiones(self):
        """Test: El comando estado verifica cada sesión."""
        # Mockear obtener_cliente para devolver diferentes estados
        def obtener_cliente_estado():
            cliente = MockCliente()
            cliente.estado_sesion = {"sesion": "google-alex"}
            return cliente
        
        N._obtener_cliente = obtener_cliente_estado
        
        # Ejecutar estado
        resultado = N.estado()
        
        # Verificar resultados
        assert "sesiones" in resultado
        assert len(resultado["sesiones"]) == 2  # google-alex e instagram-maggasukha
        assert resultado["sesiones"]["google-alex"]["estado"] == "viva"
        assert resultado["sesiones"]["instagram-maggasukha"]["estado"] == "viva"
    
    def test_comando_vigilar_notifica_cuando_expira(self):
        """Test: El comando vigilar notifica cuando una sesión expira."""
        # Configurar estado: sesión inicialmente viva
        self.cliente_mock.estado_vivo = True
        
        # Ejecutar alta (marca como viva)
        N.alta("google-alex")
        
        # Simular que la sesión expira
        self.cliente_mock.estado_vivo = False
        
        # Ejecutar vigilar
        N.vigilar("google-alex")
        
        # Verificar que hubo una notificación
        assert len(self.telegram_mock.mensajes) == 1
        assert "google-alex" in self.telegram_mock.mensajes[0][1]
    
    def test_comando_vigilar_no_reintenta(self):
        """Test: El comando vigilar no reintenta cuando expira."""
        # Configurar estado: sesión inicialmente viva
        self.cliente_mock.estado_vivo = True
        
        # Ejecutar alta (marca como viva)
        N.alta("google-alex")
        
        # Simular que la sesión expira
        self.cliente_mock.estado_vivo = False
        
        # Ejecutar vigilar
        N.vigilar("google-alex")
        
        # Simular expiración de nuevo
        self.cliente_mock.estado_vivo = True
        
        # Ejecutar vigilar nuevamente
        N.vigilar("google-alex")
        
        # Verificar que solo hubo una notificación
        assert len(self.telegram_mock.mensajes) == 1


if __name__ == "__main__":
    print("Ejecutando pruebas para navegador_alta...")
    
    # Crear instancia de prueba y ejecutar pruebas
    test = TestNavegadorAlta()
    
    # Ejecutar todas las pruebas
    test.setup_method()
    test.test_comando_alta_espera_sesiones_vivas()
    print("✓ test_comando_alta_espera_sesiones_vivas")
    
    test.setup_method()
    test.test_comando_alta_notifica_via_telegram()
    print("✓ test_comando_alta_notifica_via_telegram")
    
    test.setup_method()
    test.test_comando_alta_apaga_selkies_al_terminar()
    print("✓ test_comando_alta_apaga_selkies_al_terminar")
    
    test.setup_method()
    test.test_comando_estado_verifica_sesiones()
    print("✓ test_comando_estado_verifica_sesiones")
    
    test.setup_method()
    test.test_comando_vigilar_notifica_cuando_expira()
    print("✓ test_comando_vigilar_notifica_cuando_expira")
    
    test.setup_method()
    test.test_comando_vigilar_no_reintenta()
    print("✓ test_comando_vigilar_no_reintenta")
    
    print("\n¡Todas las pruebas pasaron!")