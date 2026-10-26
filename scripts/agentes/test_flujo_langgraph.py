# -*- coding: utf-8 -*-
"""Pruebas del flujo LangGraph de MetaGenesis (AGF1023E).

Las reglas puras se prueban siempre. Las pruebas del grafo se saltan con su
motivo cuando la máquina no tiene `langgraph` y su checkpointer SQLite.
"""
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import flujo_langgraph as F  # noqa: E402

HAY = bool(F.HAY_LANGGRAPH and F.HAY_CHECKPOINTER_SQLITE)
MOTIVO = "" if HAY else ("dependencia ausente: " + (F.MOTIVO_SIN_LANGGRAPH or "langgraph"))


class Reglas(unittest.TestCase):
    def test_normaliza_decisiones_escritas_a_mano(self):
        self.assertEqual(F.normalizar_decision({"decision": "ACEPTAR"}), "aceptar")
        self.assertEqual(F.normalizar_decision(" Reintentar "), "reintentar")
        self.assertEqual(F.normalizar_decision({"respuesta": "abortar"}), "abortar")

    def test_decision_desconocida_aborta(self):
        for raro in (None, "", "sí", {"decision": "publicar"}):
            self.assertEqual(F.normalizar_decision(raro), "abortar")

    def test_decidir_tras_verificar(self):
        self.assertEqual(F.decidir_tras_verificar({"veredicto": {"ok": True}}), "fin")
        self.assertEqual(F.decidir_tras_verificar({"veredicto": {"ok": False}}), "escribir")
        self.assertEqual(F.decidir_tras_verificar({"veredicto": {"ok": False}, "intentos": 2}), "persona")

    def test_decidir_tras_persona(self):
        self.assertEqual(F.decidir_tras_persona({"decision": "reintentar"}), "escribir")
        self.assertEqual(F.decidir_tras_persona({"decision": "aceptar"}), "fin")
        self.assertEqual(F.decidir_tras_persona({"decision": "abortar"}), "fin")

    def test_estado_inicial_no_comparte_el_contexto(self):
        contexto = {"ola": "1023A"}
        estado = F.estado_inicial("tarea larga", contexto)
        contexto["ola"] = "otra"
        self.assertEqual(estado["contexto"], {"ola": "1023A"})
        self.assertEqual(estado["intentos"], 0)
        self.assertEqual(estado["historial"], [])

    def test_aplicar_decision(self):
        self.assertEqual(F.aplicar_decision({"borrador": "b"}, "aceptar")["resultado"], "b")
        self.assertEqual(F.aplicar_decision({"intentos": 2}, "reintentar")["intentos"], 0)
        self.assertEqual(F.aplicar_decision({}, "abortar")["estado"], "abortado")


@unittest.skipUnless(HAY, MOTIVO)
class Grafo(unittest.TestCase):
    def _grafo(self, saver, oks):
        pendientes = list(oks)

        def planificar(estado):
            return {"plan": ["analizar", "escribir"]}

        def escribir(estado):
            return {"borrador": "borrador %d" % (int(estado.get("intentos") or 0) + 1)}

        def verificar(estado):
            return {"veredicto": {"ok": pendientes.pop(0), "motivo": "sin visto bueno"}}

        return F.crear_flujo(planificar, escribir, verificar, checkpointer=saver)

    def test_camino_feliz(self):
        with F.abrir_checkpointer(":memory:") as saver:
            grafo = self._grafo(saver, [True])
            estado = F.ejecutar(grafo, "tarea", "feliz")
        self.assertEqual(estado["estado"], "terminado")
        self.assertEqual(estado["resultado"], "borrador 1")
        self.assertEqual(estado["historial"], ["planificar", "escribir", "verificar"])

    def test_dos_fallos_llaman_a_la_persona(self):
        with F.abrir_checkpointer(":memory:") as saver:
            grafo = self._grafo(saver, [False, False, True])
            estado = F.ejecutar(grafo, "tarea", "falla")
            self.assertEqual(estado["intentos"], 2)
            self.assertEqual(F.estado_guardado(grafo, "falla").next, ("persona",))
            final = F.reanudar(grafo, "falla", "reintentar")
        self.assertEqual(final["intentos"], 1)
        self.assertEqual(final["resultado"], "borrador 1")
        self.assertIn("persona", final["historial"])

    def test_se_corta_y_retoma_desde_el_ultimo_punto(self):
        with tempfile.TemporaryDirectory() as carpeta:
            ruta = os.path.join(carpeta, "flujo.sqlite")
            with F.abrir_checkpointer(ruta) as saver:
                grafo = self._grafo(saver, [False, False])
                F.ejecutar(grafo, "tarea larga", "corte")
                self.assertEqual(F.estado_guardado(grafo, "corte").next, ("persona",))
            with F.abrir_checkpointer(ruta) as saver:
                otro = self._grafo(saver, [])
                final = F.reanudar(otro, "corte", {"decision": "aceptar"})
        self.assertEqual(final["estado"], "terminado")
        self.assertEqual(final["decision"], "aceptar")
        self.assertEqual(final["resultado"], "borrador 2")


if __name__ == "__main__":
    unittest.main()
