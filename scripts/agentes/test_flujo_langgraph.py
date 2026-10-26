# -*- coding: utf-8 -*-
"""flujo_langgraph: nodos inyectados, persona tras dos fallos y reanudación local."""
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import flujo_langgraph as F  # noqa: E402

if F.SQLITE_DISPONIBLE:
    from langgraph.checkpoint.sqlite import SqliteSaver
else:  # pragma: no cover - depende del entorno
    SqliteSaver = None


class Piezas(unittest.TestCase):
    def test_normaliza_aprobaciones(self):
        self.assertTrue(F.normalizar_aprobacion({"aprobado": True}))
        self.assertTrue(F.normalizar_aprobacion("válido"))
        self.assertFalse(F.normalizar_aprobacion({"ok": False}))
        self.assertFalse(F.normalizar_aprobacion(None))

    def test_decision_de_persona(self):
        self.assertTrue(F.decision_de_persona(True, "borrador")["aprobado"])
        self.assertEqual(F.decision_de_persona("otra cosa", "b")["borrador"], "otra cosa")
        editado = F.decision_de_persona(
            {"aceptar": True, "texto": "final", "motivo": "vale"}, "b")
        self.assertEqual((editado["borrador"], editado["motivo"]), ("final", "vale"))
        self.assertFalse(F.decision_de_persona(None, "b")["aprobado"])
    def test_siguiente_paso(self):
        self.assertEqual(F.siguiente_paso({"aprobado": True, "intentos": 0}), "terminar")
        self.assertEqual(F.siguiente_paso({"aprobado": False, "intentos": 1}), "escribir")
        self.assertEqual(F.siguiente_paso({"aprobado": False, "intentos": 2}), "persona")
        self.assertEqual(
            F.siguiente_paso({"aprobado": False, "intentos": 1}, max_intentos=1), "persona")


@unittest.skipUnless(F.DISPONIBLE, F.MOTIVO_NO_DISPONIBLE)
class Grafo(unittest.TestCase):
    def setUp(self):
        self.cuenta = {"plan": 0, "escribir": 0, "verificar": 0, "persona": 0}

    def _funciones(self, aprobaciones, decision=True, fallar_en=None):
        def planificar(estado):
            self.cuenta["plan"] += 1
            return "plan para " + estado["tarea"]

        def escribir(estado):
            self.cuenta["escribir"] += 1
            return "borrador %d de %s" % (self.cuenta["escribir"], estado["tarea"])

        def verificar(estado):
            self.cuenta["verificar"] += 1
            if fallar_en is not None and self.cuenta["verificar"] == fallar_en:
                raise RuntimeError("corte simulado")
            return {"aprobado": self.cuenta["verificar"] in aprobaciones,
                    "motivo": "intento %d" % self.cuenta["verificar"]}

        def persona(estado):
            self.cuenta["persona"] += 1
            return {"aprobado": True, "texto": "revisado por persona"} if decision is True else decision

        return planificar, escribir, verificar, persona

    def _grafo(self, funciones, saver):
        return F.construir_grafo(*funciones, checkpointer=saver)

    def test_aprueba_al_segundo_intento_sin_persona(self):
        with SqliteSaver.from_conn_string(":memory:") as saver:
            estado = F.ejecutar(self._grafo(self._funciones({2}), saver), "tarea larga", thread_id="h1")
        self.assertTrue(estado["aprobado"])
        self.assertEqual(estado["intentos"], 2)
        self.assertEqual(self.cuenta, {"plan": 1, "escribir": 2, "verificar": 2, "persona": 0})
        self.assertIn("plan para tarea larga", estado["plan"])

    def test_dos_fallos_llaman_a_la_persona(self):
        with SqliteSaver.from_conn_string(":memory:") as saver:
            estado = F.ejecutar(self._grafo(self._funciones(set()), saver), "t", thread_id="h2")
        self.assertEqual(self.cuenta["persona"], 1)
        self.assertEqual((estado["aprobado"], estado["revisor"]), (True, "persona"))
        self.assertEqual(estado["borrador"], "revisado por persona")

    def test_persona_puede_rechazar(self):
        decision = {"aprobado": False, "motivo": "no vale"}
        with SqliteSaver.from_conn_string(":memory:") as saver:
            estado = F.ejecutar(self._grafo(self._funciones(set(), decision), saver), "t", thread_id="h3")
        self.assertFalse(estado["aprobado"])
        self.assertEqual(estado["motivo"], "no vale")

    def test_reanuda_en_el_mismo_grafo_tras_un_corte(self):
        with SqliteSaver.from_conn_string(":memory:") as saver:
            grafo = self._grafo(self._funciones({2}, fallar_en=1), saver)
            with self.assertRaises(RuntimeError):
                F.ejecutar(grafo, "t", thread_id="h4")
            parcial = F.leer_estado(grafo, "h4")
            estado = F.reanudar(grafo, thread_id="h4")
        self.assertIn("borrador 1", parcial["borrador"])
        self.assertTrue(estado["aprobado"])
        self.assertEqual((self.cuenta["plan"], self.cuenta["escribir"]), (1, 1))

    def test_reanuda_con_la_base_cerrada_y_otro_grafo(self):
        carpeta = tempfile.mkdtemp()
        ruta = os.path.join(carpeta, "metagenesis.sqlite")
        try:
            with SqliteSaver.from_conn_string(ruta) as saver:
                with self.assertRaises(RuntimeError):
                    F.ejecutar(self._grafo(self._funciones({2}, fallar_en=1), saver), "t", thread_id="h5")
            with SqliteSaver.from_conn_string(ruta) as saver:
                estado = F.reanudar(self._grafo(self._funciones({2}), saver), thread_id="h5")
        finally:
            for nombre in os.listdir(carpeta):
                os.remove(os.path.join(carpeta, nombre))
            os.rmdir(carpeta)
        self.assertTrue(estado["aprobado"])
        self.assertEqual((self.cuenta["plan"], self.cuenta["escribir"]), (1, 1))


if __name__ == "__main__":
    unittest.main()
