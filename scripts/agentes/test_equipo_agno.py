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

    def test_el_equipo_no_monta_agentos_en_la_nube(self):
        """La memoria es el SQLite de la máquina: nada de AgentOS ni servicios de agno.com."""
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

    def test_equipo_comparte_memoria_y_apaga_trazas(self):
        """Los dos miembros ven la misma SQLite y nadie manda telemetría a terceros."""
        with tempfile.TemporaryDirectory() as tmp:
            db = E.memoria_sqlite(os.path.join(tmp, "memoria.sqlite"))
            modelo = E.modelo_desde_enrutador(E.ClienteOpenAI(
                base_url="http://127.0.0.1:4480/v1", modelo="modelo-falso",
                clave="", origen="servidor-propio"))
            miembros = [E.construir_agente(nombre, "rol", modelo, db=db)
                        for nombre in E.MIEMBROS]
            equipo = E.construir_equipo(miembros, db)
            self.assertEqual(len(equipo.members), 2)
            self.assertTrue(all(m.db is db for m in equipo.members))
            self.assertFalse(equipo.telemetry)
            self.assertTrue(all(not m.telemetry for m in equipo.members))

    def test_equipo_de_tarea_con_modelo_falso(self):
        roles = E.ROL({"redactor": "escribe", "revisor": "revisa"})
        equipo, modelo = E.equipo_de_tarea(roles, ruta_db=":memory:", cliente="falso")
        self.assertEqual(modelo, "falso")
        self.assertEqual(len(equipo.members), 2)


if __name__ == "__main__":
    unittest.main()
