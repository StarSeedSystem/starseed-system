"""Pruebas del importador n8n."""
import json
import tempfile
import unittest
from pathlib import Path

from scripts.puente.flujos.importar_n8n import importar, normalizar_expresion


class ImportarN8nTest(unittest.TestCase):
    def test_importacion_basica(self):
        flujo_json = {
            "name": "Ejemplo básico",
            "nodes": [
                {"id": "w1", "name": "Webhook", "type": "n8n-nodes-base.webhook",
                 "parameters": {"path": "ejemplo", "httpMethod": "POST"}},
                {"id": "i1", "name": "If", "type": "n8n-nodes-base.if",
                 "parameters": {"conditions": {"mode": "and", "conditions": [
                     {"leftValue": "={{ $json.tipo }}", "operator": "equal", "rightValue": "alerta"}
                 ]}}},
                {"id": "h1", "name": "HTTP", "type": "n8n-nodes-base.httpRequest",
                 "parameters": {"url": "={{ $json.url }}", "method": "GET"}},
                {"id": "s1", "name": "Set", "type": "n8n-nodes-base.set",
                 "parameters": {"assignments": {"assignments": [
                     {"name": "procesado", "value": "true"}
                 ]}}},
                {"id": "r1", "name": "Respond", "type": "n8n-nodes-base.respondToWebhook",
                 "parameters": {}},
            ],
            "connections": {
                "Webhook": {"main": [[{"node": "If", "type": "main", "index": 0}]]},
                "If": {"main": [[{"node": "HTTP", "type": "main", "index": 0}]]},
                "HTTP": {"main": [[{"node": "Set", "type": "main", "index": 0}]]},
                "Set": {"main": [[{"node": "Respond", "type": "main", "index": 0}]]},
            }
        }
        flujo, informe = importar(flujo_json)
        self.assertEqual(flujo.nombre, "Ejemplo básico")
        self.assertEqual(len(flujo.nodos), 5)
        tipos = {n.id: n.tipo for n in flujo.nodos}
        self.assertEqual(tipos["w1"], "webhook")
        self.assertEqual(tipos["i1"], "si")
        self.assertEqual(tipos["h1"], "http")
        self.assertEqual(tipos["s1"], "set")
        # respondToWebhook se mapea a set
        self.assertEqual(tipos["r1"], "set")
        self.assertEqual(informe["resumen"]["traducidos"], 4)
        self.assertEqual(informe["resumen"]["aproximados"], 1)
        self.assertEqual(len(flujo.conexiones), 4)

    def test_nodo_pendiente(self):
        flujo_json = {
            "name": "Pendiente",
            "nodes": [
                {"id": "c1", "name": "Code", "type": "n8n-nodes-base.code",
                 "parameters": {"jsCode": "return items"}}
            ],
            "connections": {}
        }
        flujo, informe = importar(flujo_json)
        self.assertEqual(flujo.nodos[0].tipo, "pendiente")
        self.assertEqual(informe["resumen"]["no_traducidos"], 1)

    def test_normalizar_expresion(self):
        # Test string without leading '='
        self.assertEqual(normalizar_expresion("hola"), "hola")
        # Test string with leading '='
        self.assertEqual(normalizar_expresion("=hola"), "hola")
        # Test string with multiple leading '=' (only remove the first)
        self.assertEqual(normalizar_expresion("==hola"), "=hola")
        # Test empty string
        self.assertEqual(normalizar_expresion(""), "")
        # Test string that is just '='
        self.assertEqual(normalizar_expresion("="), "")
        # Test list
        self.assertEqual(normalizar_expresion(["=a", "b"]), ["a", "b"])
        # Test nested list
        self.assertEqual(normalizar_expresion([["=a", "b"], "c"]), [["a", "b"], "c"])
        # Test dict
        self.assertEqual(normalizar_expresion({"a": "=b", "c": "d"}), {"a": "b", "c": "d"})
        # Test nested dict
        self.assertEqual(normalizar_expresion({"a": {"b": "=c"}}), {"a": {"b": "c"}})
        # Test mixed
        self.assertEqual(normalizar_expresion({"a": ["=b", {"c": "=d"}]}), {"a": ["b", {"c": "d"}]})
        # Test non-string, non-list, non-dict (should return as is)
        self.assertEqual(normalizar_expresion(123), 123)
        self.assertEqual(normalizar_expresion(True), True)
        self.assertEqual(normalizar_expresion(None), None)

    def test_stickyNote(self):
        flujo_json = {
            "name": "Flujo con nota",
            "nodes": [
                {"id": "n1", "name": "Nota", "type": "n8n-nodes-base.stickyNote",
                 "parameters": {"text": "Esta es una nota"}},
                {"id": "w1", "name": "Webhook", "type": "n8n-nodes-base.webhook",
                 "parameters": {"path": "webhook"}}
            ],
            "connections": {
                "Nota": {"main": [[{"node": "Webhook", "type": "main", "index": 0}]]},
                "Webhook": {"main": []}
            }
        }
        flujo, informe = importar(flujo_json)
        # Check that the description is set
        self.assertEqual(flujo.descripcion, "Esta es una nota")
        # Check that only one node was created (the webhook)
        self.assertEqual(len(flujo.nodos), 1)
        self.assertEqual(flujo.nodos[0].id, "w1")
        self.assertEqual(flujo.nodos[0].tipo, "webhook")
        # Check the informe: one nota_descripcion, one traducido
        self.assertEqual(len(informe["notas_descripcion"]), 1)
        self.assertEqual(informe["notas_descripcion"][0]["id"], "n1")
        self.assertEqual(informe["notas_descripcion"][0]["nombre"], "Nota")
        self.assertEqual(informe["notas_descripcion"][0]["tipo_n8n"], "n8n-nodes-base.stickyNote")
        self.assertEqual(informe["resumen"]["traducidos"], 1)
        self.assertEqual(informe["resumen"]["notas_descripcion"], 1)
        # Check that there are no no_traducidos or approximados
        self.assertEqual(informe["resumen"]["no_traducidos"], 0)
        self.assertEqual(informe["resumen"]["aproximados"], 0)

    def test_webhook_forma(self):
        flujo_json = {
            "name": "Webhook con forma",
            "nodes": [
                {"id": "w1", "name": "Webhook", "type": "n8n-nodes-base.webhook",
                 "parameters": {"path": "mi/ruta", "httpMethod": "POST"}}
            ],
            "connections": {
                "Webhook": {"main": []}
            }
        }
        flujo, informe = importar(flujo_json)
        self.assertEqual(len(flujo.nodos), 1)
        nodo = flujo.nodos[0]
        self.assertEqual(nodo.tipo, "webhook")
        self.assertEqual(nodo.configuracion.get("ruta"), "mi/ruta")
        self.assertEqual(nodo.configuracion.get("metodo"), "POST")
        # Check the forma
        self.assertEqual(nodo.configuracion.get("forma"), "n8n")
        self.assertEqual(informe["resumen"]["traducidos"], 1)

    def test_set_node_options(self):
        # Test includeOtherFields
        flujo_json = {
            "name": "Set con includeOtherFields",
            "nodes": [
                {"id": "s1", "name": "Set", "type": "n8n-nodes-base.set",
                 "parameters": {
                     "assignments": {"assignments": [
                         {"name": "campo1", "value": "valor1"}
                     ]},
                     "includeOtherFields": True
                 }}
            ],
            "connections": {}
        }
        flujo, informe = importar(flujo_json)
        self.assertEqual(len(flujo.nodos), 1)
        nodo = flujo.nodos[0]
        self.assertEqual(nodo.tipo, "set")
        self.assertEqual(nodo.configuracion.get("campos"), {"campo1": "valor1"})
        self.assertEqual(nodo.configuracion.get("conservar"), True)
        self.assertEqual(informe["resumen"]["traducidos"], 1)

        # Test keepOnlySet
        flujo_json = {
            "name": "Set con keepOnlySet",
            "nodes": [
                {"id": "s1", "name": "Set", "type": "n8n-nodes-base.set",
                 "parameters": {
                     "assignments": {"assignments": [
                         {"name": "campo1", "value": "valor1"}
                     ]},
                     "keepOnlySet": True
                 }}
            ],
            "connections": {}
        }
        flujo, informe = importar(flujo_json)
        self.assertEqual(len(flujo.nodos), 1)
        nodo = flujo.nodos[0]
        self.assertEqual(nodo.tipo, "set")
        self.assertEqual(nodo.configuracion.get("campos"), {"campo1": "valor1"})
        self.assertEqual(nodo.configuracion.get("conservar"), False)  # opposite of keepOnlySet
        self.assertEqual(informe["resumen"]["traducidos"], 1)

        # Test typeVersion >= 3 -> conservar = False
        flujo_json = {
            "name": "Set con typeVersion 3",
            "nodes": [
                {"id": "s1", "name": "Set", "type": "n8n-nodes-base.set",
                 "typeVersion": 3,
                 "parameters": {
                     "assignments": {"assignments": [
                         {"name": "campo1", "value": "valor1"}
                     ]}
                 }}
            ],
            "connections": {}
        }
        flujo, informe = importar(flujo_json)
        self.assertEqual(len(flujo.nodos), 1)
        nodo = flujo.nodos[0]
        self.assertEqual(nodo.tipo, "set")
        self.assertEqual(nodo.configuracion.get("campos"), {"campo1": "valor1"})
        self.assertEqual(nodo.configuracion.get("conservar"), False)
        self.assertEqual(informe["resumen"]["traducidos"], 1)

        # Test typeVersion < 3 -> conservar = True
        flujo_json = {
            "name": "Set con typeVersion 2",
            "nodes": [
                {"id": "s1", "name": "Set", "type": "n8n-nodes-base.set",
                 "typeVersion": 2,
                 "parameters": {
                     "assignments": {"assignments": [
                         {"name": "campo1", "value": "valor1"}
                     ]}
                 }}
            ],
            "connections": {}
        }
        flujo, informe = importar(flujo_json)
        self.assertEqual(len(flujo.nodos), 1)
        nodo = flujo.nodos[0]
        self.assertEqual(nodo.tipo, "set")
        self.assertEqual(nodo.configuracion.get("campos"), {"campo1": "valor1"})
        self.assertEqual(nodo.configuracion.get("conservar"), True)
        self.assertEqual(informe["resumen"]["traducidos"], 1)

if __name__ == "__main__":
    unittest.main()
