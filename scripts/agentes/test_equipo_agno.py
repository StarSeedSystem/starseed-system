# -*- coding: utf-8 -*-
"""equipo_agno: roles inyectados con modelo falso y memoria local (AGF1023G).

Si falta agno, toda la batería dependiente se salta indicando el motivo; las
pruebas puras (texto, resumen, reglas) corren siempre y nunca llaman a un
modelo ni a la red.
"""
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import equipo_agno as E  # noqa: E402


class Piezas(unittest.TestCase):
    def test_extrae_respuestas(self):
        self.assertEqual(E.extraer_respuesta("texto"), "texto")
        self.assertEqual(E.extraer_respuesta(None), "")
        self.assertEqual(E.extraer_respuesta({"contenido": "a"}), "a")
        self.assertEqual(E.extraer_respuesta({"content": "b"}), "b")
        self.assertEqual(E.extraer_respuesta(type("R", (), {"content": "c"})()), "c")

    def test_resumen_equipo(self):
        resumen = E.resumen_equipo("saludo", {"redactor": "hola", "revisor": "hola ✓"})
        self.assertIn("Tarea: saludo", resumen)
        self.assertIn("[redactor] hola", resumen)
        self.assertIn("[revisor] hola ✓", resumen)
        vacio = E.resumen_equipo("  ", {"redactor": None, "revisor": ""})
        self.assertIn("Tarea: (sin asunto)", vacio)
        self.assertIn("[redactor] (sin respuesta)", vacio)

    def test_respuesta_por_rol(self):
        roles = {"redactor": lambda t: "borro " + t,
                 "revisor": lambda t: {"content": "ok " + t}}
        salidas = E.responder_por_rol(roles)("prueba")
        self.assertEqual(salidas, {"redactor": "borro prueba", "revisor": "ok prueba"})

    def test_reglas_y_miembros(self):
        self.assertEqual(E.MIEMBROS, ("redactor", "revisor"))
        self.assertTrue(any("agno.com" in r or "nube" in r for r in E.REGLAS_EQUIPO))

    def test_sin_agent_os_de_nube(self):
        self.assertFalse(hasattr(E, "AgentOS"))


@unittest.skipUnless(E.AGNO_DISPONIBLE, E.MOTIVO_SIN_AGNO)
class MemoriaYEquipo(unittest.TestCase):
    def test_memoria_y_construcciones(self):
        with tempfile.TemporaryDirectory() as tmp:
            ruta = os.path.join(tmp, "memoria.sqlite")
            db = E.memoria_sqlite(ruta)
            modelo = E.modelo_desde_enrutador(E.ClienteOpenAI(
                base_url="http://127.0.0.1:4480/v1", modelo="modelo-falso",
                clave="", origen="servidor-propio"))
            agente = E.construir_agente("redactor", "escribe", modelo, db=db)
            self.assertEqual(agente.name, "redactor")
            equipo = E.construir_equipo(
                [agente, E.construir_agente("revisor", "revisa", modelo, db=db)], db)
            self.assertEqual(len(equipo.members), 2)

    def test_dos_roles_con_memoria_compartida_y_trazas_apagadas(self):
        with tempfile.TemporaryDirectory() as tmp:
            roles = E.ROL({"redactor": "escribe", "revisor": "revisa"})
            modelo = E.modelo_desde_enrutador(E.ClienteOpenAI(
                base_url="http://127.0.0.1:4480/v1", modelo="modelo-falso",
                clave="", origen="servidor-propio"))
            ruta_db = os.path.join(tmp, "memoria.sqlite")
            equipo, cliente = E.equipo_de_tarea(
                roles, ruta_db=ruta_db, cliente=modelo)
            self.assertIs(cliente, modelo)
            self.assertEqual(len(equipo.members), 2)
            nombres = [m.name for m in equipo.members]
            self.assertEqual(nombres, list(E.MIEMBROS))
            self.assertNotEqual(nombres[0], nombres[1])
            self.assertEqual([m.role for m in equipo.members], list(E.MIEMBROS))
            self.assertTrue(all(m.db is equipo.db for m in equipo.members))
            self.assertFalse(equipo.telemetry)
            self.assertTrue(all(not getattr(m, "telemetry", False) for m in equipo.members))
            self.assertFalse(getattr(equipo.db, "db_file", "").startswith("nube"))
            self.assertEqual(equipo.db.db_file, ruta_db)


if __name__ == "__main__":
    unittest.main()
