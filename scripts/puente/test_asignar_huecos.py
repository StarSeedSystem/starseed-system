# -*- coding: utf-8 -*-
"""Comprobar y asignar desde el Mando (2026-09-23): la decisión, sin disco ni procesos."""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import asignar_huecos as A
import prioridad_logica


def estado(**cambios):
    base = {
        "tanda": {"cola": "cola-auto-x.json", "workers": 3, "solo": False, "ids": ["A", "B"], "pendientes": []},
        "ocupados": ["A", "B"],
        "tope": 3,
        "motivo_tope": "máximo (máquina libre)",
        "listas": ["C", "D"],
        "progreso": {"A": {"estado": "en_curso"}, "B": {"estado": "en_curso"}},
        "tareas_por_id": {"C": {"id": "C"}, "D": {"id": "D"}, "E": {"id": "E", "depende": ["A"]}},
        "pausado": False,
        "conversando": False,
        "disco_gb": 40.0,
    }
    base.update(cambios)
    return base


class TandaDeProcesos(unittest.TestCase):
    def test_lee_cola_y_trabajadores(self):
        t = A.tanda_de_procesos(
            ["/usr/bin/python3 -u /Users/a/.local/bin/starseed-enjambre.py starseed_memory_root/olas/cola-auto-0923-1.json --workers 4"]
        )
        self.assertEqual(t, {"cola": "cola-auto-0923-1.json", "workers": 4, "solo": False})

    def test_no_confunde_un_grep_ni_un_prompt(self):
        self.assertIsNone(A.tanda_de_procesos(["grep starseed-enjambre.py", "opencode run lee starseed-enjambre.py"]))

    def test_solo(self):
        t = A.tanda_de_procesos(["python3 -u starseed-enjambre.py cola-x.json --solo A,B"])
        self.assertTrue(t["solo"])
        self.assertEqual(t["workers"], A.WORKERS_POR_DEFECTO)


class TopeEfectivo(unittest.TestCase):
    def test_el_gobernador_solo_baja(self):
        self.assertEqual(A.tope_efectivo(3, {"trabajadores": 1, "motivo": "RAM", "_mtime": 100}, 200)[0], 1)
        self.assertEqual(A.tope_efectivo(3, {"trabajadores": 5, "_mtime": 100}, 200)[0], 3)

    def test_gobernador_muerto_no_frena(self):
        tope, motivo = A.tope_efectivo(3, {"trabajadores": 1, "_mtime": 0}, 10_000)
        self.assertEqual(tope, 3)
        self.assertIn("15 min", motivo)


class Decidir(unittest.TestCase):
    def test_hueco_libre_mete_las_listas(self):
        d = A.decidir(estado())
        self.assertTrue(d["puede"])
        self.assertEqual(d["huecos"], 1)
        self.assertEqual(d["meter"], ["C", "D"])
        self.assertIn("libre", d["resumen"])

    def test_sin_huecos_las_mete_igual_y_explica_la_espera(self):
        d = A.decidir(estado(ocupados=["A", "B", "Z"]))
        self.assertTrue(d["puede"])
        self.assertEqual(d["huecos"], 0)
        self.assertIn("ocupados", d["resumen"])

    def test_pausa_no_toca_nada(self):
        d = A.decidir(estado(pausado=True))
        self.assertFalse(d["puede"])
        self.assertEqual(d["meter"], [])
        self.assertIn("PAUSA", d["resumen"])

    def test_disco_lleno_no_toca_nada(self):
        d = A.decidir(estado(disco_gb=1.2))
        self.assertFalse(d["puede"])
        self.assertIn("disco", d["resumen"])

    def test_sin_tanda_despierta_al_vigilante_y_nunca_lanza(self):
        d = A.decidir(estado(tanda=None, ocupados=[]))
        self.assertTrue(d["despertar_vigilante"])
        self.assertEqual(d["meter"], [])

    def test_sin_tanda_ni_trabajo_no_hace_nada(self):
        d = A.decidir(estado(tanda=None, ocupados=[], listas=[]))
        self.assertFalse(d["puede"])
        self.assertFalse(d["despertar_vigilante"])

    def test_tanda_manual_no_admite_nuevas(self):
        t = dict(estado()["tanda"], solo=True)
        d = A.decidir(estado(tanda=t))
        self.assertFalse(d["puede"])
        self.assertIn("--solo", d["resumen"])

    def test_pedida_que_espera_dice_a_quien(self):
        d = A.decidir(estado(), pedida="E")
        self.assertFalse(d["puede"])
        self.assertIn("espera a A", d["resumen"])

    def test_pedida_en_curso(self):
        d = A.decidir(estado(), pedida="A")
        self.assertIn("ya está en curso", d["resumen"])

    def test_pedida_lista_se_adelanta(self):
        d = A.decidir(estado(), pedida="D")
        self.assertTrue(d["puede"])
        self.assertEqual(d["adelantar"], "D")
        self.assertIn("D pasa la primera", d["resumen"])

    def test_conversacion_se_avisa(self):
        d = A.decidir(estado(conversando=True))
        self.assertTrue(any("Astraura" in m for m in d["motivos"]))


class ReordenarCola(unittest.TestCase):
    def test_nuevas_al_final_y_adelantada_delante(self):
        lista = [{"id": "A"}, {"id": "B"}, {"id": "C"}]
        nueva = A.reordenar_cola(lista, [{"id": "D"}, {"id": "B"}], "C")
        self.assertEqual([t["id"] for t in nueva], ["C", "A", "B", "D"])

    def test_sin_cambios(self):
        lista = [{"id": "A"}]
        self.assertEqual(A.reordenar_cola(lista, [], None), lista)


class PrioridadAdelantada(unittest.TestCase):
    def test_la_adelantada_va_delante_incluso_de_capacidad(self):
        tareas = [
            {"id": "CAP", "importancia": "capacidad"},
            {"id": "NORMAL"},
        ]
        progreso = {"NORMAL": {"estado": "pendiente", "adelantar": "2026-09-23 11:00:00"}}
        listas, _ = prioridad_logica.ordenar(tareas, progreso, None)
        self.assertEqual([t["id"] for t, _p, _r in listas], ["NORMAL", "CAP"])
        self.assertIn("Alex la pidió primero desde el Mando", listas[0][2])


class DependenciasMuertas(unittest.TestCase):
    """JF2 esperaba a JF1, «sustituida»: el Mando decía «se puede coger» y el vigilante
    «bloqueada». Al asignarla se le quita la dependencia que no llegará."""

    TAREAS = {
        "JF2": {"id": "JF2", "depende": ["JF1"]},
        "JF3": {"id": "JF3", "depende": ["JF1", "VIVA"]},
        "JF4": {"id": "JF4", "depende": ["HECHA"]},
    }
    PROG = {
        "JF1": {"estado": "sustituida"},
        "VIVA": {"estado": "en_curso"},
        "HECHA": {"estado": "commit"},
    }

    def test_solo_las_que_esperan_a_muertas(self):
        self.assertEqual(A.desatascables(self.TAREAS, self.PROG), {"JF2": ["JF1"]})

    def test_ya_quitada_no_se_repite(self):
        prog = dict(self.PROG, JF2={"estado": "pendiente", "quitar_dependencias": ["JF1"]})
        self.assertEqual(A.desatascables(self.TAREAS, prog), {})

    def test_asignar_la_pedida_quita_y_mete(self):
        e = estado(listas=[], desatascables={"JF2": ["JF1"]}, progreso=dict(self.PROG))
        d = A.decidir(e, pedida="JF2")
        self.assertTrue(d["puede"])
        self.assertEqual(d["quitar"], {"JF2": ["JF1"]})
        self.assertIn("JF2", d["meter"])
        self.assertTrue(any("no llegará nunca" in m for m in d["motivos"]))

    def test_general_tambien_las_desatasca(self):
        e = estado(listas=["C"], desatascables={"JF2": ["JF1"]}, progreso=dict(self.PROG))
        d = A.decidir(e)
        self.assertEqual(d["meter"], ["C", "JF2"])


class Aplicar(unittest.TestCase):
    """Los efectos, sobre archivos temporales: la cola viva y progreso.json."""

    def setUp(self):
        import json, tempfile
        self.dir = tempfile.mkdtemp()
        self.cola = os.path.join(self.dir, "cola-auto-x.json")
        self.prog = os.path.join(self.dir, "progreso.json")
        json.dump([{"id": "A"}, {"id": "B"}], open(self.cola, "w"))
        json.dump({"A": {"estado": "en_curso"}, "D": {"estado": "pendiente"}}, open(self.prog, "w"))
        self.antes = A.PROGRESO
        A.PROGRESO = self.prog

    def tearDown(self):
        A.PROGRESO = self.antes

    def test_mete_y_adelanta_en_la_cola_viva(self):
        import json
        e = estado()
        e["tanda"] = dict(e["tanda"], ruta=self.cola)
        e["listas_tareas"] = [{"id": "C", "titulo": "c"}, {"id": "D", "titulo": "d"}]
        d = A.decidir(e, pedida="D")
        hechas = A.aplicar(e, d)
        cola = json.load(open(self.cola))
        self.assertEqual([t["id"] for t in cola], ["D", "A", "B", "C"])
        self.assertTrue(json.load(open(self.prog))["D"]["adelantar"])
        self.assertTrue(any("cola viva" in h for h in hechas))

    def test_comprobar_no_toca_nada(self):
        import json
        e = estado()
        e["tanda"] = dict(e["tanda"], ruta=self.cola)
        d = A.decidir(e)
        d["puede"] = False  # lo que haría `comprobar`: decidir sin aplicar
        self.assertEqual(A.aplicar(e, d), [])
        self.assertEqual([t["id"] for t in json.load(open(self.cola))], ["A", "B"])


if __name__ == "__main__":
    unittest.main()
