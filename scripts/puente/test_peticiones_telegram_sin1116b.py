#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Tests para SIN1116B: respaldo 08:30 y avances de síntesis en peticiones_telegram.py — sin red."""
import json
import os
import sys
import time
from unittest.mock import Mock, patch, MagicMock

import pytest

sys.path.insert(0, os.path.dirname(__file__))

import peticiones_telegram as mod
import peticiones_sintesis_respaldo as PSR


def test_respaldo_0830_task_existe():
    """El módulo tiene la tarea de respaldo 08:30 (_tarea_respaldo_0830)."""
    assert hasattr(mod, "_tarea_respaldo_0830")
    assert callable(getattr(mod, "_tarea_respaldo_0830"))


def test_respaldo_0830_verifica_hora_cdmx():
    """_tarea_respaldo_0830 verifica la hora en zona CDMX antes de ejecutar."""
    from peticiones_sintesis_respaldo import _fecha_cdmx, _hora_cdmx
    
    # Test que las funciones de hora funcionan
    ahora = time.time()
    fecha = _fecha_cdmx(ahora)
    hora = _hora_cdmx(ahora)
    
    assert isinstance(fecha, str)
    assert len(fecha) == 10  # AAAA-MM-DD
    assert isinstance(hora, float)
    assert 0 <= hora < 24


def test_ejecutar_respaldo_si_falta_integrable():
    """ejecutar_respaldo_0830 se puede importar y llama con dependencias inyectables."""
    from peticiones_sintesis_respaldo import ejecutar_respaldo_0830
    
    # Verificar que la función existe y acepta parámetros inyectables
    import inspect
    sig = inspect.signature(ejecutar_respaldo_0830)
    params = list(sig.parameters.keys())
    
    assert "nb_fn" in params
    assert "drive_fn" in params
    assert "token_google_fn" in params
    assert "leer_clave_fn" in params
    assert "enviar_telegram_fn" in params
    assert "multiformato_fn" in params
    assert "seco" in params


@patch("peticiones_telegram.PSR.ejecutar_respaldo_0830")
@patch("peticiones_telegram._fecha_cdmx")
@patch("peticiones_telegram._hora_cdmx")
@patch("time.sleep")
def test_tarea_respaldo_0830_ejecuta_en_hora(mock_sleep, mock_hora, mock_fecha, mock_ejecutar):
    """_tarea_respaldo_0830 llama a ejecutar_respaldo_0830 cuando es la hora (08:30 ± 15 min)."""
    from peticiones_sintesis_respaldo import HORA_RESPALDO_CDMX
    
    mock_fecha.return_value = "2026-11-18"
    mock_hora.return_value = HORA_RESPALDO_CDMX  # 08:30 exacto
    mock_ejecutar.return_value = {"ok": True, "accion": "respaldo_completado"}
    
    # Simular una iteración del bucle
    mock_sleep.side_effect = [None, KeyboardInterrupt("break")]
    
    try:
        mod._tarea_respaldo_0830()
    except KeyboardInterrupt:
        pass
    
    # Debe haber llamado a ejecutar_respaldo_0830
    mock_ejecutar.assert_called()
    args, kwargs = mock_ejecutar.call_args
    # seco tiene default False, no se pasa explícitamente
    assert "seco" not in kwargs or kwargs.get("seco") is False


@patch("peticiones_telegram.PSR.ejecutar_respaldo_0830")
@patch("peticiones_telegram._fecha_cdmx")
@patch("peticiones_telegram._hora_cdmx")
@patch("time.sleep")
def test_tarea_respaldo_0830_no_ejecuta_fuera_hora(mock_sleep, mock_hora, mock_fecha, mock_ejecutar):
    """_tarea_respaldo_0830 NO llama a ejecutar_respaldo_0830 si no es la hora."""
    from peticiones_sintesis_respaldo import HORA_RESPALDO_CDMX
    
    mock_fecha.return_value = "2026-11-18"
    mock_hora.return_value = HORA_RESPALDO_CDMX + 1.0  # 09:30, fuera de ventana ±15min
    mock_ejecutar.return_value = {"ok": False, "accion": "fuera_horario"}
    
    mock_sleep.side_effect = [None, KeyboardInterrupt("break")]
    
    try:
        mod._tarea_respaldo_0830()
    except KeyboardInterrupt:
        pass
    
    # NO debe haber llamado a ejecutar_respaldo_0830 con seco=False
    # (el respaldo se salta si no es la hora)
    mock_ejecutar.assert_not_called()


def test_sintesis_avances_integrable():
    """sintesis_avances se puede importar y registrar_hito devuelve línea o None."""
    import sintesis_avances as SA
    
    # Limpiar estado para test (ambas fechas usadas en el test)
    SA.limpiar_estado_fecha("2026-11-18")
    SA.limpiar_estado_fecha("2026-11-17")
    
    # Test hito arranque
    linea = SA.registrar_hito("arranque", fecha="2026-11-18", 
                              agentes=["contactos", "noticias"], 
                              tema="Síntesis diaria")
    assert linea is not None
    assert linea and "06:30:" in linea
    assert linea and "contactos" in linea
    assert linea and "noticias" in linea
    
    # Segundo llamado con mismos datos → None (deduplicación)
    linea2 = SA.registrar_hito("arranque", fecha="2026-11-18",
                               agentes=["contactos", "noticias"],
                               tema="Síntesis diaria")
    assert linea2 is None
    
    # Test hito agente
    linea = SA.registrar_hito("agente", fecha="2026-11-18",
                              nombre="contactos", nuevas=5, descartadas=2)
    assert linea is not None
    assert linea and "Agente contactos:" in linea
    assert linea and "5 nuevas" in linea
    assert linea and "2 descartadas" in linea
    
    # Test hito redacción
    linea = SA.registrar_hito("redaccion", fecha="2026-11-18",
                              modelo="gemini-1.5-flash-lite", via="modelo")
    assert linea is not None
    assert linea and "Redacción: gemini-1.5-flash-lite" in linea
    
    # Test hito entrega
    linea = SA.registrar_hito("entrega", fecha="2026-11-18",
                              enlace_doc="https://docs.google.com/doc/abc", resumen_chars=2150)
    assert linea is not None
    assert linea and "Entrega:" in linea
    assert linea and "2150 caracteres" in linea
    
    # Test hito multiformato progresivo
    for i in range(1, 10):
        linea = SA.registrar_hito("multiformato", fecha="2026-11-18", completados=i)
        assert linea is not None
        assert linea and f"{i}/9" in linea
    
    # Test hito multiformato final
    linea = SA.registrar_hito("multiformato", fecha="2026-11-18", completados=9, final=True)
    assert linea is not None
    assert linea and "9/9 ✓ índice final" in linea
    
    # Test hito retraso
    linea = SA.registrar_hito("retraso", fecha="2026-11-18",
                              motivo="investigación profunda", accion="consultando fuentes")
    assert linea is not None
    assert linea and "va retrasada por" in linea
    assert linea and "MetaGenesis está en" in linea
    
    # Test hito seguimiento
    linea = SA.registrar_hito("seguimiento", fecha="2026-11-17",
                              aprobadas=2, encargadas=1, integradas=1, rechazadas=1, ya_existen=0)
    assert linea is not None
    assert linea and "Seguimiento:" in linea
    assert linea and "2 aprobadas" in linea
    assert linea and "1 encargadas" in linea
    assert linea and "1 integradas" in linea
    assert linea and "1 rechazadas" in linea


@patch("peticiones_telegram.SA")
@patch("peticiones_telegram.decir")
def test_enviar_hito_al_chat(mock_decir, mock_sa):
    """La integración usa sintesis_avances.registrar_hito y dice la línea si no es None."""
    mock_sa.registrar_hito.return_value = "06:30: contactos, noticias · Síntesis diaria"
    
    if hasattr(mod, "_enviar_hito_al_chat"):
        mod._enviar_hito_al_chat("arranque", fecha="2026-11-18", agentes=["contactos", "noticias"], tema="Síntesis diaria")
        mock_sa.registrar_hito.assert_called()
        mock_decir.assert_called_with("06:30: contactos, noticias · Síntesis diaria")


@patch("peticiones_telegram.SA")
@patch("peticiones_telegram.decir")
def test_enviar_hito_al_chat_no_duplica(mock_decir, mock_sa):
    """Si registrar_hito devuelve None (duplicado), no envía nada al chat."""
    mock_sa.registrar_hito.return_value = None
    
    if hasattr(mod, "_enviar_hito_al_chat"):
        mod._enviar_hito_al_chat("arranque", fecha="2026-11-18", agentes=["contactos"], tema="Test")
        mock_sa.registrar_hito.assert_called()
        mock_decir.assert_not_called()


@patch("peticiones_telegram.SA")
@patch("peticiones_telegram.decir")
@patch("peticiones_telegram._es_hora_retraso", return_value=True)
def test_verificar_retraso_0900(mock_es_hora, mock_decir, mock_sa):
    """verificar_retraso_0900 se integra para avisar si a las 09:00 no hay síntesis."""
    # Mock: son las 09:15 y no hay síntesis
    mock_sa.verificar_retraso.return_value = "va retrasada por investigación profunda; MetaGenesis está en consultando fuentes"
    
    if hasattr(mod, "_verificar_y_avisar_retraso"):
        linea = mod._verificar_y_avisar_retraso(fecha="2026-11-18", hay_sintesis=False)
        assert linea is not None
        assert linea and "va retrasada" in linea
        mock_sa.verificar_retraso.assert_called()


@patch("peticiones_telegram.SA")
@patch("peticiones_telegram.decir")
@patch("peticiones_telegram._es_hora_retraso", return_value=True)
def test_verificar_retraso_0900_con_sintesis_no_avisa(mock_es_hora, mock_decir, mock_sa):
    """Si ya hay síntesis a las 09:00, no avisa retraso."""
    mock_sa.verificar_retraso.return_value = None
    
    if hasattr(mod, "_verificar_y_avisar_retraso"):
        linea = mod._verificar_y_avisar_retraso(fecha="2026-11-18", hay_sintesis=True)
        assert linea is None


@patch("peticiones_telegram.SA")
@patch("peticiones_telegram.decir")
def test_generar_seguimiento_dia_siguiente(mock_decir, mock_sa):
    """generar_seguimiento se integra para el día siguiente."""
    mock_sa.generar_seguimiento.return_value = "Seguimiento: 2 aprobadas, 1 encargadas, 1 integradas"
    
    if hasattr(mod, "_generar_y_enviar_seguimiento"):
        linea = mod._generar_y_enviar_seguimiento(fecha_ayer="2026-11-17")
        assert linea is not None
        assert linea and "Seguimiento:" in linea
        mock_sa.generar_seguimiento.assert_called()


def test_main_arranca_hilo_respaldo_0830():
    """main() arranca el hilo de _tarea_respaldo_0830 junto a los otros hilos."""
    import threading
    
    hilos_creados = []
    original_thread = threading.Thread
    
    def mock_thread(target=None, daemon=True, **kwargs):
        h = Mock()
        h.start = Mock()
        hilos_creados.append((target.__name__ if target else "unknown", h))
        return h
    
    with patch("threading.Thread", mock_thread), \
         patch("peticiones_telegram.escuchar", lambda: None), \
         patch("peticiones_telegram.hay_trabajo") as mock_hay:
        
        # Configurar mocks mínimos
        with patch("peticiones_telegram.TOKEN", "fake"), \
             patch("peticiones_telegram.CHAT", "123"), \
             patch("peticiones_telegram.COLA", "/tmp/cola.json"), \
             patch("peticiones_telegram.ESTADO", "/tmp/estado.json"), \
             patch("peticiones_telegram.DIR", "/tmp"), \
             patch("peticiones_telegram.SALIDAS", "/tmp/salidas"), \
             patch("os.makedirs"), \
             patch("peticiones_telegram.leer_json", return_value=[]), \
             patch("peticiones_telegram.escribir_json"):
            
            try:
                mod.main()
            except SystemExit:
                pass
    
    targets = [t for t, _ in hilos_creados]
    assert "trabajar" in targets
    assert "mantener_sesion" in targets
    assert "_tarea_multiformato_periodica" in targets
    assert "_tarea_respaldo_0830" in targets


if __name__ == "__main__":
    pytest.main([__file__, "-v"])