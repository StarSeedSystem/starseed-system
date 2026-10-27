#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""test_equipo_poligenesis: roles inyectados con openai-agents SDK y modelo falso (AGF1023A).

Si falta openai-agents, toda la batería dependiente se salta indicando el motivo; las
pruebas puras (texto, resumen, reglas) corren siempre y nunca llaman a un
modelo ni a la red.
"""
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import equipo_poligenesis as E  # noqa: E402


class Piezas(unittest.TestCase):
    def test_extrae_respuestas(self):
        self.assertEqual(E.extraer_respuesta("texto"), "texto")
        self.assertEqual(E.extraer_respuesta(None), "")
        self.assertEqual(E.extraer_respuesta({"contenido": "a"}), "a")
        self.assertEqual(E.extraer_respuesta({"content": "b"}), "b")
        self.assertEqual(E.extraer_respuesta(type("R", (), {"content": "c"})()), "c")

    def test_resumen_equipo(self):
        resumen = E.resumen_equipo("saludo", {"moderador": "hola", "redactor": "propuesta ✓", "revisor": "aprobado ✓"})
        self.assertIn("Tarea: saludo", resumen)
        self.assertIn("[moderador] hola", resumen)
        self.assertIn("[redactor] propuesta ✓", resumen)
        self.assertIn("[revisor] aprobado ✓", resumen)
        vacio = E.resumen_equipo("  ", {"moderador": None, "redactor": "", "revisor": None})
        self.assertIn("Tarea: (sin asunto)", vacio)
        self.assertIn("[moderador] (sin respuesta)", vacio)

    def test_respuesta_por_rol(self):
        roles = {"moderador": lambda t: "prefijo " + t,
                 "redactor": lambda t: {"contenido": "borro " + t},
                 "revisor": lambda t: {"content": "ok " + t}}
        salidas = E.responder_por_rol(roles)("prueba")
        self.assertEqual(salidas, {"moderador": "prefijo prueba", "redactor": "borro prueba", "revisor": "ok prueba"})

    def test_reglas_y_miembros(self):
        self.assertEqual(E.MIEMBROS, ("moderador", "redactor", "revisor"))
        self.assertTrue(any("handoff" in r or "terceros" in r for r in E.REGLAS_EQUIPO))


@unittest.skipUnless(E.OPEN_AI_AGENTS_DISPONIBLE, E.MOTIVO_SIN_OPEN_AI_AGENTS)
class MemoriaYEquipo(unittest.TestCase):
    def test_construir_agente(self):
        modelo = E.modelo_desde_enrutador(E.ClienteOpenAI(
            base_url="http://127.0.0.1:4480/v1", modelo="modelo-falso", clave="", origen="servidor-propio"))
        agente = E.construir_agente("moderador", "enumera", modelo=modelo)
        self.assertEqual(agente.name, "moderador")

    def test_construir_equipo(self):
        modelo = E.modelo_desde_enrutador(E.ClienteOpenAI(
            base_url="http://127.0.0.1:4480/v1", modelo="modelo-falso", clave="", origen="servidor-propio"))
        agentes = [E.construir_agente(n, f"rol {n}", modelo=modelo) for n in E.MIEMBROS]
        equipo = E.construir_equipo(agentes)
        self.assertEqual(len(equipo.members), 3)

    def test_equipo_de_tarea_con_modelo_falso(self):
        roles = E.ROL({"moderador": "enumera", "redactor": "redacta", "revisor": "revisa"})
        equipo, modelo = E.equipo_de_tarea(roles, cliente="falso")
        self.assertEqual(modelo, "falso")
        self.assertEqual(len(equipo.members), 3)


if __name__ == "__main__":
    unittest.main()