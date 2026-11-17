#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas del detector de orquestador vivo pero parado (2026-10-08). Sin procesos reales."""
import json
import os
import shutil
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


class TrabajoEnHijos(unittest.TestCase):
    """(2026-10-21) Un orquestador con un hijo trabajando no está parado."""

    FILAS = [(100, 1, "python3 -u starseed-enjambre.py cola-auto.json --workers 3"),
             (200, 100, "npm exec tsc --noEmit --skipLibCheck"),
             (201, 200, "node /x/node_modules/.bin/tsc --noEmit"),
             (300, 100, "/Users/alex/.opencode/bin/opencode run RAIZ…"),
             (400, 1, "opencode run de otra cosa"),
             (500, 100, "sleep 5")]

    def test_cuenta_solo_los_descendientes_que_trabajan(self):
        self.assertEqual(A.trabajo_en_hijos(self.FILAS, 100), [200, 201, 300])

    def test_sin_hijos_no_hay_trabajo(self):
        self.assertEqual(A.trabajo_en_hijos(self.FILAS, 400), [])
        self.assertEqual(A.trabajo_en_hijos([], 100), [])


class FrenoDeDisco(unittest.TestCase):
    """(SUP1117C) Con el freno de disco del enjambre puesto, un orquestador sin tareas no está atascado: el 17-11
    se le reiniciaba en bucle con la Mac entre 0,4 y 6 GB libres. Sin procesos ni disco reales."""

    def setUp(self):
        self.dir = tempfile.mkdtemp()
        self.antes = (A.OLAS, A.RAIZ, A.orquestadores, A._filas_ps, getattr(A, "_freno_disco", None))
        A.OLAS = A.RAIZ = self.dir
        cola = os.path.join(self.dir, "cola-auto-1117-120603.json")
        with open(cola, "w", encoding="utf-8") as f:
            json.dump({"tareas": [{"id": "TU18b", "depende": []}]}, f)
        with open(os.path.join(self.dir, "progreso.json"), "w", encoding="utf-8") as f:
            json.dump({}, f)
        A.orquestadores = lambda: [(27053, 2100, cola)]
        A._filas_ps = lambda: []

    def tearDown(self):
        A.OLAS, A.RAIZ, A.orquestadores, A._filas_ps, A._freno_disco = self.antes
        shutil.rmtree(self.dir, ignore_errors=True)

    def test_con_el_freno_puesto_no_es_un_atasco(self):
        A._freno_disco = lambda: {"retiene_arranques": True, "libre_gb": 5.8, "umbral_aviso_gb": 10}
        m = A.medir()
        self.assertFalse(m["atascado"])
        self.assertEqual(m["listas"], [])
        self.assertIn("frenado por el disco", m["motivo"])
        self.assertIn("5.8", m["motivo"])

    def test_y_curar_no_lo_reinicia(self):
        A._freno_disco = lambda: {"retiene_arranques": True, "libre_gb": 4.8, "umbral_aviso_gb": 10}
        antes_estado = A.ESTADO
        A.ESTADO = os.path.join(self.dir, "atasco.json")
        muertos = []
        try:
            r = A.curar(persiste_s=0, ahora=1000, decir=lambda _t: None, matar=muertos.append, despertar=lambda: True)
        finally:
            A.ESTADO = antes_estado
        self.assertEqual(r["accion"], "trabajando")
        self.assertEqual(muertos, [])

    def test_sin_freno_sigue_siendo_un_atasco(self):
        A._freno_disco = lambda: {"retiene_arranques": False, "libre_gb": 40.0, "umbral_aviso_gb": 10}
        m = A.medir()
        self.assertTrue(m["atascado"])
        self.assertEqual(m["listas"], ["TU18b"])

    def test_sin_el_modulo_no_se_inventa_un_freno(self):
        A._freno_disco = lambda: {}
        self.assertTrue(A.medir()["atascado"])

    def test_frenado_por_disco_es_pura(self):
        self.assertEqual(A.frenado_por_disco(None), "")
        self.assertEqual(A.frenado_por_disco({"retiene_arranques": False, "libre_gb": 3.0}), "")
        self.assertIn("10 GB", A.frenado_por_disco({"retiene_arranques": True, "libre_gb": 4.8, "umbral_aviso_gb": 10}))

    def test_el_freno_de_verdad_se_lee_del_modulo_del_enjambre(self):
        gd = A._guardia_disco()
        antes = os.environ.get("STARSEED_DISCO_ESTADO")
        os.environ["STARSEED_DISCO_ESTADO"] = os.path.join(self.dir, "disco-enjambre.json")
        try:
            e = gd.estado("/", libre_bytes=3 * gd.GB, total_bytes=228 * gd.GB, nivel="sin_pesados")
        finally:
            if antes is None:
                os.environ.pop("STARSEED_DISCO_ESTADO", None)
            else:
                os.environ["STARSEED_DISCO_ESTADO"] = antes
        self.assertTrue(e["retiene_arranques"])
        self.assertIn("frenado por el disco", A.frenado_por_disco(e))


if __name__ == "__main__":
    unittest.main()
