"""Pruebas del importador n8n."""
import json
import tempfile
import unittest
from pathlib import Path

from scripts.puente.flujos.importar_n8n import importar


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


if __name__ == "__main__":
    unittest.main()
