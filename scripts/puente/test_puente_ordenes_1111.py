# -*- coding: utf-8 -*-
"""(SUP1111B, 2026-11-11) `starseed-puente aprobar|rechazar` no da por escrita una orden que ningún orquestador
va a leer. El 11-11 Hermes «cerró» así cinco tareas (tres sustituidas, una reasignada al A1 y una bloqueante): el
puente dijo «Orden escrita … El vigilante la recoge en menos de 20 s» y ninguna cambió, porque el orquestador solo
atiende aprobar/rechazar de una tarea SUYA que todavía va a decidir."""
import importlib.util
import json
import os
import shutil
import tempfile
import unittest
from unittest import mock

# Por ruta y con otro nombre: con pytest, `import puente` es la carpeta scripts/puente, no puente.py.
_ESPEC = importlib.util.spec_from_file_location(
    "puente_cli_ordenes_1111", os.path.join(os.path.dirname(os.path.abspath(__file__)), "puente.py"))
puente = importlib.util.module_from_spec(_ESPEC)
_ESPEC.loader.exec_module(puente)


class OrdenesDeDecision(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.dir, True)
        self.dichos = []

        def decir(texto, quien=None, tipo="mensaje", tarea=None):
            self.dichos.append((texto, quien, tipo))
            return {}

        for p in (mock.patch.object(puente, "OLAS", self.dir),
                  mock.patch.object(puente, "cola_viva", lambda: ("cola-x.json", {}, 0)),
                  mock.patch.object(puente, "decir", decir),
                  mock.patch.dict(os.environ, {"STARSEED_IDE": "prueba"})):
            p.start()
            self.addCleanup(p.stop)
        self.control = os.path.join(self.dir, "control-cola-x.json")

    def _progreso(self, datos=None, crudo=None):
        with open(os.path.join(self.dir, "progreso.json"), "w", encoding="utf-8") as f:
            f.write(crudo if crudo is not None else json.dumps(datos))

    def _control(self):
        with open(self.control, encoding="utf-8") as f:
            return json.load(f)

    def _avisos(self):
        return [t for t, _, tipo in self.dichos if tipo == "aviso"]

    def test_rechazar_una_reasignada_no_escribe_y_lo_dice(self):
        self._progreso({"T1": {"estado": "reasignada"}})
        self.assertEqual(1, puente.orden("rechazar", ["T1"]))
        self.assertFalse(os.path.exists(self.control))
        self.assertEqual(1, len(self._avisos()))
        self.assertIn("T1", self._avisos()[0])
        self.assertIn("NO escrita", self._avisos()[0])

    def test_solo_escribe_la_que_aun_espera_decision(self):
        self._progreso({"T1": {"estado": "esperando_aprobacion"}, "T2": {"estado": "sustituida"}})
        self.assertEqual(0, puente.orden("rechazar", ["T1", "T2"]))
        d = self._control()
        self.assertEqual(["T1"], list(d))
        self.assertEqual(("rechazar", "prueba"), (d["T1"]["accion"], d["T1"]["quien"]))
        self.assertTrue(any("T2" in t and "NO escrita" in t for t in self._avisos()))
        self.assertFalse(any("T1" in t and "NO escrita" in t for t in self._avisos()))

    def test_aprobar_un_id_que_no_existe_no_escribe(self):
        self._progreso({"OTRA": {"estado": "en_curso"}})
        self.assertEqual(1, puente.orden("aprobar", ["NOEXISTE"]))
        self.assertFalse(os.path.exists(self.control))

    def test_con_progreso_a_medias_escribe_como_antes(self):
        self._progreso(crudo='{"A": {"est')
        with mock.patch.object(puente.time, "sleep"):
            self.assertEqual(0, puente.orden("rechazar", ["A"]))
        self.assertEqual("rechazar", self._control()["A"]["accion"])

    def test_soltar_no_se_filtra(self):
        self._progreso({"T3": {"estado": "bloqueante"}})
        self.assertEqual(0, puente.orden("soltar", ["T3"], {"donde": "agentes-ia"}))
        self.assertEqual(("soltar", "agentes-ia"), (self._control()["T3"]["accion"], self._control()["T3"]["donde"]))

    def test_separar_es_pura_y_no_lanza(self):
        prog = {"A": {"estado": "esperando_aprobacion"}, "B": {"estado": "commit"}, "C": "raro",
                "D": {"estado": "en_curso"}, "E": {"estado": "bloqueante"}}
        self.assertEqual(
            (["A", "C", "D"], [("B", "commit"), ("X", "no está en progreso.json"), ("E", "bloqueante")]),
            puente.separar_ordenes_de_decision(["A", "B", "A", "C", "X", "D", "B", "E"], prog))
        for raro in (None, [], "x"):
            self.assertEqual((["A", "B"], []), puente.separar_ordenes_de_decision(["A", "B", "A"], raro))


if __name__ == "__main__":
    unittest.main()
