"""Prueba del registro de nodos y disparadores de Flujos."""

import os
import tempfile
import sys
from pathlib import Path

# Añadir la raíz del proyecto al path para poder importar los módulos
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../..")))

from scripts.puente.flujos.motor import REGISTRO, ejecutar
from scripts.puente.flujos.modelo import Flujo, Nodo, Conexion


def test_registro_tiene_todos_los_nodos_y_disparadores():
    """El registro contiene todos los tipos de NODOS y los 4 disparadores."""
    from scripts.puente.flujos.nodos import NODOS
    esperado = set(NODOS.keys()) | {"webhook", "cron", "bus", "chat"}
    actual = set(REGISTRO.keys())
    # El registro puede tener más entradas (por ejemplo, de otras pruebas), pero al menos debe contener estos.
    assert esperado.issubset(actual), f"Faltan: {esperado - actual}"


def test_flujo_webhook_set():
    """Un flujo webhook->set procesa correctamente los campos."""
    # Guardar el valor original de RAIZ_FLUJOS y cambiarlo a un directorio temporal
    from scripts.puente.flujos.modelo import RAIZ_FLUJOS
    original_raiz = RAIZ_FLUJOS
    with tempfile.TemporaryDirectory() as tmpdir:
        temporal_raiz = Path(tmpdir)
        # Parcheamos RAIZ_FLUJOS en el módulo modelo
        import scripts.puente.flujos.modelo as modelo
        modelo.RAIZ_FLUJOS = temporal_raiz
        try:
            # Crear un flujo simple: webhook -> set
            webhook = Nodo(id="webhook", tipo="webhook", configuracion={})
            set_nodo = Nodo(id="set", tipo="set", configuracion={
                "campos": {"campo": "{{ $json.campo }}"},
                "conservar": False
            })
            flujo = Flujo(
                id="test",
                nombre="test",
                nodos=[webhook, set_nodo],
                conexiones=[Conexion(origen="webhook", destino="set")]
            )

            # Entrada: un ítem con el campo "campo"
            entrada = [{"campo": "valor"}]

            # Ejecutar el flujo
            ejecucion = ejecutar(flujo, entrada)

            # Comprobar que la ejecución finalizó correctamente
            assert ejecucion.estado == "completa", f"Error en ejecución: {ejecucion.error}"
            # La salida debe ser un lista con un ítem que tenga el campo "campo" con valor "valor"
            assert len(ejecucion.salida) == 1
            assert ejecucion.salida[0] == {"campo": "valor"}

            # Ahora probar con forma n8n
            # Cambiar la configuración del webhook para que tenga forma n8n
            webhook.configuracion["forma"] = "n8n"
            # Cambiar la configuración del set para que use $json.body.campo
            set_nodo.configuracion["campos"] = {"campo": "{{ $json.body.campo }}"}
            # Volver a guardar el flujo (porque el ejecutar lo guarda de nuevo, pero cambiamos los nodos en memoria)
            # Nota: el ejecutar llama a guardar_flujo, así que no es necesario guardar explícitamente aquí.

            # Ejecutar de nuevo
            ejecucion2 = ejecutar(flujo, entrada)

            assert ejecucion2.estado == "completa", f"Error en ejecución: {ejecucion2.error}"
            assert len(ejecucion2.salida) == 1
            # Esperamos el mismo valor
            assert ejecucion2.salida[0] == {"campo": "valor"}
        finally:
            # Restaurar el valor original
            modelo.RAIZ_FLUJOS = original_raiz


if __name__ == "__main__":
    test_registro_tiene_todos_los_nodos_y_disparadores()
    test_flujo_webhook_set()
    print("Todas las pruebas pasaron")