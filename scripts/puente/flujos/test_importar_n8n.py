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
        # Check that the webhook has forma: "n8n"
        webhook_nodo = next(n for n in flujo.nodos if n.id == "w1")
        self.assertEqual(webhook_nodo.configuracion.get("forma"), "n8n")
        # Check that the HTTP URL is normalized (removed leading '=')
        http_nodo = next(n for n in flujo.nodos if n.id == "h1")
        self.assertEqual(http_nodo.configuracion.get("url"), "{{ $json.url }}")

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

    def test_stickyNote(self):
        flujo_json = {
            "name": "Flujo con nota",
            "nodes": [
                {"id": "n1", "name": "Nota", "type": "n8n-nodes-base.stickyNote",
                 "parameters": {"text": "Esta es una nota"}},
                {"id": "w1", "name": "Webhook", "type": "n8n-nodes-base.webhook",
                 "parameters": {"path": "ejemplo"}},
            ],
            "connections": {
                "Nota": {"main": [[{"node": "Webhook", "type": "main", "index": 0}]]},
            }
        }
        flujo, informe = importar(flujo_json)
        # The stickyNote should not create a node
        self.assertEqual(len(flujo.nodos), 1)
        self.assertEqual(flujo.nodos[0].id, "w1")
        self.assertEqual(flujo.nodos[0].tipo, "webhook")
        # The description should be set
        self.assertEqual(flujo.descripcion, "Esta es una nota")
        # The informe should have a descripciones entry
        self.assertEqual(len(informe["descripciones"]), 1)
        self.assertEqual(informe["descripciones"][0]["id"], "n1")
        self.assertEqual(informe["descripciones"][0]["nombre"], "Nota")
        self.assertEqual(informe["descripciones"][0]["tipo_n8n"], "n8n-nodes-base.stickyNote")
        # The informe should not have the stickyNote in no_traducidos
        self.assertEqual(informe["resumen"]["no_traducidos"], 0)

    def test_webhook_forma(self):
        flujo_json = {
            "name": "Webhook forma",
            "nodes": [
                {"id": "w1", "name": "Webhook", "type": "n8n-nodes-base.webhook",
                 "parameters": {"path": "ejemplo", "httpMethod": "POST"}},
            ],
            "connections": {}
        }
        flujo, informe = importar(flujo_json)
        self.assertEqual(len(flujo.nodos), 1)
        nodo = flujo.nodos[0]
        self.assertEqual(nodo.tipo, "webhook")
        self.assertIn("forma", nodo.configuracion)
        self.assertEqual(nodo.configuracion["forma"], "n8n")
        # Also check that the path and metodo are normalized (though they don't have '=')
        self.assertEqual(nodo.configuracion.get("ruta"), "ejemplo")
        self.assertEqual(nodo.configuracion.get("metodo"), "POST")

    def test_set_conservar(self):
        # Case 1: includeOtherFields present
        flujo_json = {
            "name": "Set con includeOtherFields",
            "nodes": [
                {"id": "s1", "name": "Set", "type": "n8n-nodes-base.set",
                 "parameters": {
                     "assignments": {"assignments": [{"name": "campo1", "value": "valor1"}]},
                     "includeOtherFields": True
                 }},
            ],
            "connections": {}
        }
        flujo, informe = importar(flujo_json)
        self.assertEqual(len(flujo.nodos), 1)
        nodo = flujo.nodos[0]
        self.assertEqual(nodo.tipo, "set")
        self.assertTrue(nodo.configuracion["conservar"])
        self.assertEqual(nodo.configuracion["campos"], {"campo1": "valor1"})

        # Case 2: keepOnlySet present
        flujo_json = {
            "name": "Set con keepOnlySet",
            "nodes": [
                {"id": "s1", "name": "Set", "type": "n8n-nodes-base.set",
                 "parameters": {
                     "assignments": {"assignments": [{"name": "campo1", "value": "valor1"}]},
                     "keepOnlySet": True
                 }},
            ],
            "connections": {}
        }
        flujo, informe = importar(flujo_json)
        self.assertEqual(len(flujo.nodos), 1)
        nodo = flujo.nodos[0]
        self.assertEqual(nodo.tipo, "set")
        self.assertFalse(nodo.configuracion["conservar"])  # opposite of keepOnlySet
        self.assertEqual(nodo.configuracion["campos"], {"campo1": "valor1"})

        # Case 3: neither present, typeVersion >= 3 -> no conserva
        flujo_json = {
            "name": "Set typeVersion 3",
            "nodes": [
                {"id": "s1", "name": "Set", "type": "n8n-nodes-base.set",
                 "typeVersion": 3,
                 "parameters": {
                     "assignments": {"assignments": [{"name": "campo1", "value": "valor1"}]}
                 }},
            ],
            "connections": {}
        }
        flujo, informe = importar(flujo_json)
        self.assertEqual(len(flujo.nodos), 1)
        nodo = flujo.nodos[0]
        self.assertEqual(nodo.tipo, "set")
        self.assertFalse(nodo.configuracion["conservar"])  # typeVersion >= 3 -> no conserva
        self.assertEqual(nodo.configuracion["campos"], {"campo1": "valor1"})

        # Case 4: neither present, typeVersion < 3 -> conserva
        flujo_json = {
            "name": "Set typeVersion 2",
            "nodes": [
                {"id": "s1", "name": "Set", "type": "n8n-nodes-base.set",
                 "typeVersion": 2,
                 "parameters": {
                     "assignments": {"assignments": [{"name": "campo1", "value": "valor1"}]}
                 }},
            ],
            "connections": {}
        }
        flujo, informe = importar(flujo_json)
        self.assertEqual(len(flujo.nodos), 1)
        nodo = flujo.nodos[0]
        self.assertEqual(nodo.tipo, "set")
        self.assertTrue(nodo.configuracion["conservar"])  # typeVersion < 3 -> conserva
        self.assertEqual(nodo.configuracion["campos"], {"campo1": "valor1"})

    def test_normalizar_expresion(self):
        # String starting with '='
        self.assertEqual(normalizar_expresion("=texto"), "texto")
        self.assertEqual(normalizar_expresion("={{ $json.body }}"), "{{ $json.body }}")
        # String not starting with '='
        self.assertEqual(normalizar_expresion("texto"), "texto")
        self.assertEqual(normalizar_expresion(""), "")
        # Dict
        self.assertEqual(
            normalizar_expresion({"a": "=valor", "b": "normal"}),
            {"a": "valor", "b": "normal"}
        )
        # List
        self.assertEqual(
            normalizar_expresion(["=valor", "normal"]),
            ["valor", "normal"]
        )
        # Nested
        self.assertEqual(
            normalizar_expresion({"a": ["=valor", {"b": "=otro"}]}),
            {"a": ["valor", {"b": "otro"}]}
        )
        # Non-string values remain unchanged
        self.assertEqual(normalizar_expresion(123), 123)
        self.assertEqual(normalizar_expresion(True), True)
        self.assertEqual(normalizar_expresion(None), None)


if __name__ == "__main__":
    unittest.main()