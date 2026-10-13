#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas del vigía de runs de la nube (2026-10-13): duplicados, sin máquina, preparación atascada,
pasados de tope y «sin dato del paso» (solo aviso). Lo puro, sin red ni GitHub."""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import vigia_runs_nube as VR  # noqa: E402

AHORA = 1791929400.0  # 2026-10-13 22:10 UTC


def fila(**k):
    base = {"run": 1, "estado": "in_progress", "cola": "enjambre/colas/c.json", "minutos": 5}
    base.update(k)
    return base


class Diagnosticar(unittest.TestCase):
    def test_escribiendo_no_es_atasco(self):
        f = fila(paso="Enjambre", paso_desde="2026-10-13T21:40:09Z", minutos=30, minutos_tope="45")
        self.assertIsNone(VR.diagnosticar(f, [f], AHORA))

    def test_preparacion_de_30_min_se_cancela_y_devuelve(self):
        f = fila(paso="Dependencias y orquestador", paso_desde="2026-10-13T21:39:25Z", minutos=31)
        a = VR.diagnosticar(f, [f], AHORA)
        self.assertEqual(a["tipo"], "preparacion-atascada")
        self.assertTrue(a["cancelar"] and a["devolver"])
        self.assertIn("30 min", a["motivo"])

    def test_preparacion_reciente_no(self):
        f = fila(paso="Dependencias y orquestador", paso_desde="2026-10-13T22:08:00Z")
        self.assertIsNone(VR.diagnosticar(f, [f], AHORA))

    def test_duplicado_de_una_cola_en_marcha(self):
        vivo = fila(run=1)
        dup = fila(run=2, estado="pending", minutos=2)
        a = VR.diagnosticar(dup, [vivo, dup], AHORA)
        self.assertEqual(a["tipo"], "duplicado")
        self.assertTrue(a["cancelar"])
        self.assertFalse(a["devolver"])
        self.assertIsNone(VR.diagnosticar(vivo, [vivo, dup], AHORA))

    def test_sin_maquina_media_hora(self):
        f = fila(estado="queued", minutos=35, cola="otra.json")
        self.assertEqual(VR.diagnosticar(f, [f], AHORA)["tipo"], "sin-maquina")
        self.assertIsNone(VR.diagnosticar(fila(estado="queued", minutos=10), [], AHORA))

    def test_pasado_de_su_tope(self):
        f = fila(paso="Enjambre", minutos=70, minutos_tope="45")
        self.assertEqual(VR.diagnosticar(f, [f], AHORA)["tipo"], "pasado-de-tope")

    def test_sin_dato_del_paso_solo_avisa(self):
        f = fila(paso="sin dato del paso", minutos=26)
        a = VR.diagnosticar(f, [f], AHORA)
        self.assertEqual(a["tipo"], "sin-pasos")
        self.assertFalse(a["cancelar"])
        self.assertIsNone(VR.diagnosticar(fila(paso="sin dato del paso", minutos=10), [], AHORA))

    def test_que_es_preparacion(self):
        self.assertTrue(VR.es_preparacion("Run actions/setup-node@v4"))
        self.assertTrue(VR.es_preparacion("Set up job"))
        for p in ("Enjambre", "Entregar (rama nube/<run>, nunca main)", "Post Run actions/checkout@v4",
                  "sin dato del paso", "esperando máquina", "", None):
            self.assertFalse(VR.es_preparacion(p), p)


class Devolver(unittest.TestCase):
    def test_solo_las_que_siguen_en_la_nube(self):
        prog = {"A": {"estado": "reasignada", "medio": "nube"}, "B": {"estado": "commit"},
                "C": {"estado": "reasignada", "medio": "oracle"}}
        nuevo, hechas = VR.devolver(prog, ["A", "B", "C", "D"], 9, "se atascó", "20261013")
        self.assertEqual(hechas, ["A"])
        self.assertEqual(nuevo["A"]["estado"], "pendiente")
        self.assertIn("no cuenta como envío", nuevo["A"]["nota"])
        self.assertEqual(nuevo["B"], {"estado": "commit"})
        self.assertEqual(prog["A"]["estado"], "reasignada")  # no muta la entrada

    def test_ids_de_cola(self):
        self.assertEqual(VR.ids_de_cola({"tareas": [{"id": "X"}, {"id": "Y"}, {}]}), ["X", "Y"])
        self.assertEqual(VR.ids_de_cola([{"id": "Z"}]), ["Z"])
        self.assertEqual(VR.ids_de_cola(None), [])


if __name__ == "__main__":
    unittest.main()
