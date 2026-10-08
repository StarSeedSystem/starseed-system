#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas del detector de orquestador vivo pero parado (2026-10-08). Sin procesos reales."""
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import atasco_orquestador as A  # noqa: E402

COLA = [{"id": "CAMR1005Db", "depende": ["CAMR1005A"]}, {"id": "PT1009Cb", "depende": ["PT1009A"]},
        {"id": "CPA1007Kb", "depende": ["CPA1007A", "CPA1007Jb"]}]
PROGRESO = {"CAMR1005A": {"estado": "commit"}, "CPA1007A": {"estado": "commit"},
            "CPA1007Jb": {"estado": "commit"}, "PT1009A": {"estado": "pendiente"}}


class Decidir(unittest.TestCase):
    def test_el_caso_del_8_de_octubre_es_un_atasco(self):
        atascado, motivo, listas = A.decidir({}, COLA, PROGRESO)
        self.assertTrue(atascado)
        self.assertEqual(listas, ["CAMR1005Db", "CPA1007Kb"])  # PT1009Cb espera a PT1009A
        self.assertIn("2 lista(s)", motivo)

    def test_con_una_tarea_en_marcha_no_lo_es(self):
        atascado, motivo, _ = A.decidir({"CAMR1005Db": {"fase": "escribiendo"}}, COLA, PROGRESO)
        self.assertFalse(atascado)
        self.assertIn("CAMR1005Db", motivo)

    def test_esperando_pasarela_cuenta_como_en_marcha(self):
        self.assertFalse(A.decidir({"X": {"fase": "esperando pasarela"}}, COLA, PROGRESO)[0])

    def test_si_todo_espera_a_otra_no_lo_es(self):
        prog = dict(PROGRESO, CAMR1005A={"estado": "pendiente"}, CPA1007Jb={"estado": "pendiente"})
        self.assertFalse(A.decidir({}, COLA, prog)[0])

    def test_una_dependencia_ya_en_main_por_asunto_cuenta(self):
        prog = dict(PROGRESO, CAMR1005A={"estado": "pendiente"})
        asuntos = ["Ola 1005C · CAMR · CAMR1005A: núcleo"]
        self.assertIn("CAMR1005Db", A.decidir({}, COLA, prog, asuntos)[2])

    def test_las_ya_cerradas_no_cuentan_como_listas(self):
        prog = dict(PROGRESO, CAMR1005Db={"estado": "commit"}, CPA1007Kb={"estado": "rechazada"})
        self.assertFalse(A.decidir({}, COLA, prog)[0])


class Curar(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        self.antes = (A.ESTADO, A.medir)
        A.ESTADO = os.path.join(self.dir, "atasco.json")
        self.muertos, self.dichos = [], []
        A.medir = lambda: {"pid": 4242, "edad_s": 2100, "cola": "cola-auto-1008-160157.json",
                           "atascado": True, "motivo": "orquestador vivo sin ninguna tarea", "listas": ["A"]}

    def tearDown(self):
        A.ESTADO, A.medir = self.antes

    def curar(self, **kw):
        return A.curar(decir=self.dichos.append, matar=self.muertos.append, despertar=lambda: True, **kw)

    def test_primero_vigila_y_si_dura_reinicia(self):
        self.assertEqual(self.curar(ahora=1000)["accion"], "vigilando")
        self.assertEqual(self.muertos, [])
        r = self.curar(ahora=1000 + A.PERSISTE_S)
        self.assertEqual(r["accion"], "reiniciado")
        self.assertEqual(self.muertos, [4242])
        self.assertIn("Reinicio el orquestador 4242", self.dichos[0])

    def test_el_boton_actua_sin_esperar(self):
        self.assertEqual(self.curar(ahora=1000, persiste_s=0)["accion"], "reiniciado")

    def test_recien_lanzado_no_se_toca(self):
        A.medir = lambda: {"pid": 1, "edad_s": 60, "cola": "c", "atascado": True, "motivo": "m", "listas": ["A"]}
        self.assertEqual(self.curar(ahora=1000, persiste_s=0)["accion"], "trabajando")
        self.assertEqual(self.muertos, [])

    def test_sin_orquestador_no_hace_nada(self):
        A.medir = lambda: {"pid": None}
        self.assertEqual(self.curar(ahora=1000)["accion"], "sin_orquestador")

    def test_segundos_de_etime(self):
        self.assertEqual(A._segundos("35:02"), 2102)
        self.assertEqual(A._segundos("01-01:07:49"), 86400 + 3600 + 469)


if __name__ == "__main__":
    unittest.main()
