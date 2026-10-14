"""Pruebas del registro de ejecutores de flujos."""

import os
import tempfile
from pathlib import Path
import unittest
from unittest.mock import patch

from scripts.puente.flujos import (Conexion, Flujo, Nodo, ejecutar,
                                   guardar_flujo, validar_flujo)
from scripts.puente.flujos import nodos
from scripts.puente.flujos.motor import RAIZ_FLUJOS


class RegistroTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temporal = tempfile.TemporaryDirectory()
        self.cwd_patch = patch("os.getcwd", return_value=self.temporal.name)
        self.anterior = os.getcwd()
        os.chdir(self.temporal.name)
        temporal_raiz = Path(self.temporal.name) / "starseed_memory_root" / "flujos"
        self.raiz_patch = patch("scripts.puente.flujos.motor.RAIZ_FLUJOS",
                                temporal_raiz)
        self.raiz_patch.start()

    def tearDown(self) -> None:
        self.raiz_patch.stop()
        os.chdir(self.anterior)
        self.temporal.cleanup()

    def test_registro_contiene_todos_los_nodos_y_disparadores(self) -> None:
        """El registro contiene todos los tipos de NODOS y los cuatro disparadores."""
        from scripts.puente.flujos.motor import REGISTRO

        # Comprobar que todos los nodos de NODOS están en el registro
        for nombre in nodos.NODOS:
            self.assertIn(nombre, REGISTRO,
                          f"El nodo {nombre} no está en el registro")
            # Comprobar que es una función que acepta (items, params)
            self.assertTrue(callable(REGISTRO[nombre]))

        # Comprobar los cuatro disparadores
        for disparador in ("webhook", "cron", "bus", "chat"):
            self.assertIn(disparador, REGISTRO,
                          f"El disparador {disparador} no está en el registro")
            self.assertTrue(callable(REGISTRO[disparador]))

    def test_flujo_webhook_set_predeterminado(self) -> None:
        """Un flujo webhook->set con la plantilla {{$json.campo}} funciona con el registro por defecto."""
        # Definir un flujo simple: webhook que recibe un objeto y un set que copia un campo
        flujo = Flujo(
            id="webhook_set",
            nombre="Webhook a Set",
            nodos=[
                Nodo("entrada", "webhook", {}),  # nodo de entrada (webhook)
                Nodo("procesar", "set", {
                    "campos": {"resultado": "{{ $json.campo }}"},
                    "conservar": True
                })
            ],
            conexiones=[
                Conexion("entrada", "procesar")
            ]
        )
        guardar_flujo(flujo)

        # Entrada: un objeto con un campo "campo" cuyo valor es "valor de prueba"
        entrada = [{"campo": "valor de prueba"}]

        # Ejecutar el flujo con el registro por defecto (que ahora incluye nuestros adaptadores)
        resultado = ejecutar(flujo, entrada)

        # Comprobar que la ejecución fue completa
        self.assertEqual(resultado.estado, "completa")
        # La salida debe ser un objeto que contiene el campo original y el nuevo campo "resultado"
        self.assertEqual(len(resultado.salida), 1)
        self.assertEqual(resultado.salida[0]["campo"], "valor de prueba")
        self.assertEqual(resultado.salida[0]["resultado"], "valor de prueba")

    def test_flujo_webhook_set_n8n(self) -> None:
        """Un flujo webhook->set con la plantilla {{$json.body.campo}} funciona cuando el webhook tiene forma n8n."""
        # Definir el mismo flujo pero ahora el webhook tiene configuracion.forma = "n8n"
        flujo = Flujo(
            id="webhook_set_n8n",
            nombre="Webhook (n8n) a Set",
            nodos=[
                Nodo("entrada", "webhook", {
                    "configuracion": {
                        "forma": "n8n"
                    }
                }),  # nodo de entrada (webhook con forma n8n)
                Nodo("procesar", "set", {
                    "campos": {"resultado": "{{ $json.body.campo }}"},
                    "conservar": True
                })
            ],
            conexiones=[
                Conexion("entrada", "procesar")
            ]
        )
        guardar_flujo(flujo)

        # Entrada: un objeto que simula lo que enviaría n8n: incluye claves internas y los campos de datos
        entrada = [{
            "_id": "interno",
            "disparador": "webhook",
            "ruta": "/ruta",
            "campo": "valor de prueba"
        }]

        # Ejecutar el flujo con el registro por defecto
        resultado = ejecutar(flujo, entrada)

        # Comprobar que la ejecución fue completa
        self.assertEqual(resultado.estado, "completa")
        # La salida debe ser un objeto que contiene el cuerpoTransformado y el nuevo campo "resultado"
        self.assertEqual(len(resultado.salida), 1)
        item = resultado.salida[0]
        # El webhook con forma n8n debe haber dejado el cuerpo en $json.body y eliminado claves internas
        self.assertIn("body", item)
        self.assertEqual(item["body"]["campo"], "valor de prueba")
        # El set ha copiado $json.body.campo a resultado
        self.assertEqual(item["resultado"], "valor de prueba")
        # Además, el item debe contener los campos headers, query, params (vacíos)
        self.assertEqual(item["headers"], {})
        self.assertEqual(item["query"], {})
        self.assertEqual(item["params"], {})
        # No debe contener las claves internas del objeto original
        self.assertNotIn("_id", item)
        self.assertNotIn("disparador", item)
        self.assertNotIn("ruta", item)


if __name__ == "__main__":
    unittest.main()