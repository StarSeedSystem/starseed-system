# -*- coding: utf-8 -*-
"""Pruebas del flujo LangGraph de MetaGenesis (AGF1023E), sin modelos ni red.
Las rutas y normalizadores se prueban siempre; el grafo, el checkpointer SQLite y
la persona en el bucle se saltan con motivo si falta langgraph o su checkpointer.
"""
import os
import sys
import tempfile
import unittest
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import flujo_langgraph as F  # noqa: E402
try:
    import langgraph  # noqa: F401
    import langgraph.checkpoint.sqlite  # noqa: F401
    HAY_LANGGRAPH = True
except ImportError:
    HAY_LANGGRAPH = False

class Nodos:
    """Funciones inyectadas de mentira: apuntan las llamadas y devuelven lo pactado."""
    def __init__(self, verificaciones):
        self.verificaciones = list(verificaciones)
        self.llamadas = []
        self.planes = 0
    def planificar(self, estado):
        self.planes += 1
        self.llamadas.append("planificar")
        return ["revisar", "escribir"]
    def escribir(self, estado):
        self.llamadas.append("escribir")
        return "borrador %d" % self.llamadas.count("escribir")
    def verificar(self, estado):
        self.llamadas.append("verificar")
        return self.verificaciones.pop(0) if self.verificaciones else True

class Puro(unittest.TestCase):
    def test_estado_inicial(self):
        estado = F.estado_inicial({"id": "MG1", "objetivo": "ola"})
        self.assertEqual(estado["intentos"], 0)
        self.assertEqual(estado["max_intentos"], F.MAX_INTENTOS)
        self.assertEqual(estado["tarea"]["id"], "MG1")
    def test_normalizadores(self):
        self.assertEqual(F.normalizar_verificacion({"ok": True}), {"ok": True, "motivos": []})
        self.assertEqual(F.normalizar_verificacion({"valido": False, "errores": "falla"}),
                         {"ok": False, "motivos": ["falla"]})
        self.assertEqual(F.normalizar_aprobacion({"aprobado": False, "comentario": "no"}),
                         {"aprobado": False, "comentario": "no"})
        self.assertEqual(F.normalizar_aprobacion(False), {"aprobado": False, "comentario": ""})
    def test_rutas(self):
        bien = {"verificacion": {"ok": True}, "intentos": 2, "max_intentos": 2}
        fallo_uno = {"verificacion": {"ok": False}, "intentos": 1, "max_intentos": 2}
        fallo_dos = {"verificacion": {"ok": False}, "intentos": 2, "max_intentos": 2}
        self.assertEqual(F.decidir_tras_verificar(bien), "listo")
        self.assertEqual(F.decidir_tras_verificar(fallo_uno), "escribir")
        self.assertEqual(F.decidir_tras_verificar(fallo_dos), "persona")
        self.assertEqual(F.decidir_tras_persona({"aprobacion": {"aprobado": True}}), "listo")
        self.assertEqual(F.decidir_tras_persona({"aprobacion": {"aprobado": False}}), "escribir")
@unittest.skipUnless(HAY_LANGGRAPH, "falta langgraph o langgraph-checkpoint-sqlite")
class Grafo(unittest.TestCase):
    def _config(self, hilo="hilo"):
        return {"configurable": {"thread_id": hilo}}
    def _grafo(self, saver, nodos, persona=None):
        return F.construir_grafo(planificar=nodos.planificar, escribir=nodos.escribir,
                                 verificar=nodos.verificar, persona=persona, checkpointer=saver)
    def test_feliz_y_checkpoint(self):
        with tempfile.TemporaryDirectory() as d:
            ruta = os.path.join(d, "checkpoints.sqlite")
            with F.checkpointer_sqlite(ruta) as saver:
                n = Nodos([{"ok": True}])
                grafo, cfg = self._grafo(saver, n), self._config()
                fin = grafo.invoke(F.estado_inicial({"id": "MG1"}), cfg)
                self.assertEqual(fin["resultado"], "verificado")
                self.assertEqual(n.llamadas, ["planificar", "escribir", "verificar"])
                self.assertEqual(grafo.get_state(cfg).values["plan"], ["revisar", "escribir"])
            self.assertGreater(os.path.getsize(ruta), 0)
    def test_reintenta_y_luego_verifica(self):
        with F.checkpointer_sqlite(":memory:") as saver:
            n = Nodos([{"ok": False, "motivos": ["falta prueba"]}, {"ok": True}])
            grafo = self._grafo(saver, n)
            fin = grafo.invoke(F.estado_inicial({"id": "MG2"}), self._config())
            self.assertEqual(fin["resultado"], "verificado")
            self.assertEqual(n.llamadas, ["planificar", "escribir", "verificar",
                                          "escribir", "verificar"])
            self.assertEqual(fin["intentos"], 2)
    def test_persona_tras_dos_fallos_y_reanudar(self):
        with F.checkpointer_sqlite(":memory:") as saver:
            n = Nodos([{"ok": False, "motivos": ["uno"]}, {"ok": False, "motivos": ["dos"]}])
            grafo, cfg = self._grafo(saver, n), self._config()
            parado = grafo.invoke(F.estado_inicial({"id": "MG3"}), cfg)
            self.assertIn("__interrupt__", parado)
            self.assertEqual(n.llamadas, ["planificar", "escribir", "verificar",
                                          "escribir", "verificar"])
            fin = F.reanudar(grafo, cfg, {"aprobado": True, "comentario": "vale"})
            self.assertEqual(fin["resultado"], "aprobado-por-persona")
            self.assertEqual(fin["aprobacion"], {"aprobado": True, "comentario": "vale"})
    def test_corte_y_retoma_desde_el_ultimo_punto(self):
        with tempfile.TemporaryDirectory() as d:
            ruta = os.path.join(d, "c.sqlite")
            n = Nodos([{"ok": True}])
            def escribir(estado):
                if "corte" not in n.llamadas:
                    n.llamadas.append("corte")
                    raise RuntimeError("proceso interrumpido")
                return n.escribir(estado)
            with F.checkpointer_sqlite(ruta) as saver:
                grafo = F.construir_grafo(planificar=n.planificar, escribir=escribir,
                                          verificar=n.verificar, checkpointer=saver)
                cfg = self._config()
                with self.assertRaises(RuntimeError):
                    grafo.invoke(F.estado_inicial({"id": "MG4"}), cfg)
                self.assertEqual(n.planes, 1)
            with F.checkpointer_sqlite(ruta) as saver:
                otro = F.construir_grafo(planificar=n.planificar, escribir=escribir,
                                         verificar=n.verificar, checkpointer=saver)
                fin = otro.invoke(None, cfg)
            self.assertEqual(fin["resultado"], "verificado")
            self.assertEqual(n.planes, 1)
            self.assertEqual(n.llamadas.count("verificar"), 1)
if __name__ == "__main__":
    unittest.main()
