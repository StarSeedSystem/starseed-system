#!/usr/bin/env python3
"""Pruebas de apps_ia: modelo y conocimiento falsos, sin red."""
import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import apps_ia as ia


class AppsIaTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.raiz = self.tmp.name
        self.app = {
            "id": "guia", "prompt_sistema": "Ayuda a {{nombre}}.",
            "base_conocimiento": "manuales", "modelo": "auto",
            "temperatura": 0.3, "limite_salida": 240,
            "clave_env": "GUIA_API_KEY",
        }
        with open(os.path.join(self.raiz, "guia.json"), "w", encoding="utf-8") as archivo:
            json.dump(self.app, archivo)

    def tearDown(self):
        self.tmp.cleanup()

    def modelo(self, mensajes, **opciones):
        self.mensajes = mensajes
        self.opciones = opciones
        return {"answer": "Respuesta propia", "usage": {"prompt_tokens": 8, "completion_tokens": 2}}

    def recuperar(self, base, consulta, top=3):
        self.recuperacion = (base, consulta, top)
        return {"records": [{"segment": {"content": "El manual dice que sí."}, "score": 1.2}]}

    def test_renderizar_exige_variables(self):
        self.assertEqual(ia.renderizar_prompt("Hola {{ nombre }}", {"nombre": "Alex"}), "Hola Alex")
        with self.assertRaises(ValueError):
            ia.renderizar_prompt("Hola {{nombre}}", {})

    def test_responder_recupera_llama_y_registra(self):
        salida = ia.responder("guia", {"nombre": "Alex"}, "¿Cómo?", self.modelo,
                              self.recuperar, self.raiz, "conv-1")
        self.assertEqual(salida["answer"], "Respuesta propia")
        self.assertEqual(salida["conversation_id"], "conv-1")
        self.assertEqual(salida["metadata"]["usage"]["total_tokens"], 10)
        self.assertEqual(self.recuperacion, ("manuales", "¿Cómo?", 3))
        self.assertEqual(self.opciones, {"modelo": "auto", "temperatura": 0.3, "limite_salida": 240})
        todo = "\n".join(m["content"] for m in self.mensajes)
        self.assertIn("Ayuda a Alex.", todo)
        self.assertIn("El manual dice que sí.", todo)
        with open(os.path.join(self.raiz, "guia", "registro.jsonl"), encoding="utf-8") as archivo:
            registro = json.loads(archivo.readline())
        self.assertEqual(registro["answer"], "Respuesta propia")
        self.registro_id = registro["id"]

    def test_anotacion_alimenta_respuesta_siguiente(self):
        primera = ia.responder("guia", {"nombre": "Ana"}, "Pregunta", self.modelo,
                               self.recuperar, self.raiz)
        ia.anotar(primera["message_id"], "Respuesta revisada", self.raiz)
        ia.responder("guia", {"nombre": "Ana"}, "Otra", self.modelo, self.recuperar, self.raiz)
        contenido = "\n".join(m["content"] for m in self.mensajes)
        self.assertIn("Pregunta", contenido)
        self.assertIn("Respuesta revisada", contenido)


if __name__ == "__main__":
    unittest.main()
