"""Test del registro de nodos y disparadores de Flujos."""
from __future__ import annotations

import tempfile
from pathlib import Path
from unittest import mock

from .modelo import (Conexion, Ejecucion, Flujo, Nodo, RAIZ_FLUJOS,
                     cargar_flujo, guardar_flujo, orden_topologico, validar_flujo)
from .motor import ejecutar, REGISTRO


def test_registro_tiene_todos_los_nodos_y_disparadores():
    """El registro contiene todos los tipos de NODOS y los cuatro disparadores."""
    from .nodos import NODOS
    esperados = set(NODOS.keys()) | {"webhook", "cron", "bus", "chat"}
    print("REGISTRO keys:", set(REGISTRO.keys()))
    print("Esperados:", esperados)
    assert set(REGISTRO.keys()) == esperados
    print("test_registro_tiene_todos_los_nodos_y_disparadores: OK")


def test_flujo_webhook_set():
    """Un flujo webhook->set funciona tanto con forma n8n como sin ella."""
    with tempfile.TemporaryDirectory() as tmpdir:
        # Parcheamos RAIZ_FLUJOS para usar un directorio temporal
        with mock.patch('scripts.puente.flujos.modelo.RAIZ_FLUJOS', Path(tmpdir)):
            # Creamos un flujo simple: webhook -> set
            flujo_id = "flujo_prueba"
            webhook = Nodo(
                id="webhook1",
                tipo="webhook",
                configuracion={},  # caso sin forma n8n
                reintentos=0,
                espera_ms=0
            )
            set_nodo = Nodo(
                id="set1",
                tipo="set",
                configuracion={
                    "campos": {"campo": "{{ $json.campo }}"},
                    "conservar": False
                },
                reintentos=0,
                espera_ms=0
            )
            conexion = Conexion(
                origen="webhook1",
                destino="set1"
            )
            flujo = Flujo(
                id=flujo_id,
                nombre=flujo_id,
                nodos=[webhook, set_nodo],
                conexiones=[conexion]
            )
            # Guardamos el flujo para que el motor lo pueda cargar
            guardar_flujo(flujo, Path(tmpdir))

            # Entrada: un ítem con el campo "campo"
            entrada = [{"campo": "valor"}]

            # Ejecutamos el flujo
            ejecucion = ejecutar(flujo, entrada)

            # Verificamos que se completó exitosamente
            assert ejecucion.estado == "completa"
            # La salida debe ser un ítem con el campo "campo" establecido a "valor"
            assert ejecucion.salida == [{"campo": "valor"}]

            # Ahora probamos con forma n8n en el webhook
            webhook_n8n = Nodo(
                id="webhook1",
                tipo="webhook",
                configuracion={"forma": "n8n"},
                reintentos=0,
                espera_ms=0
            )
            # El set nodo ahora debe usar $json.body.campo
            set_nodo_n8n = Nodo(
                id="set1",
                tipo="set",
                configuracion={
                    "campos": {"campo": "{{ $json.body.campo }}"},
                    "conservar": False
                },
                reintentos=0,
                espera_ms=0
            )
            flujo_n8n = Flujo(
                id=flujo_id + "_n8n",
                nombre=flujo_id + "_n8n",
                nodos=[webhook_n8n, set_nodo_n8n],
                conexiones=[conexion]
            )
            guardar_flujo(flujo_n8n, Path(tmpdir))

            ejecucion_n8n = ejecutar(flujo_n8n, entrada)
            assert ejecucion_n8n.estado == "completa"
            assert ejecucion_n8n.salida == [{"campo": "valor"}]
    print("test_flujo_webhook_set: OK")


if __name__ == "__main__":
    test_registro_tiene_todos_los_nodos_y_disparadores()
    test_flujo_webhook_set()
    print("All tests passed")