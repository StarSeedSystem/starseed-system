# -*- coding: utf-8 -*-
"""Pruebas de «al volver» (COL1012H): el aparato suelta lo que otro siguió mientras estaba fuera.

Disco y bus falsos: una raíz temporal con sus `latidos-*.json` y las asignaciones en memoria.
Ninguna prueba toca la red, Supabase, un A1 real ni el trabajo de un agente.
"""
import json
import os
import shutil
import sys
import tempfile
import types
import unittest
from unittest.mock import patch

DIR = os.path.dirname(os.path.abspath(__file__))
if DIR not in sys.path:
    sys.path.insert(0, DIR)

import nodo_metagenesis as NM

AHORA = 1_800_000_000.0
COLA = "cola-1012H.json"


def escribir(ruta, datos):
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    with open(ruta, "w", encoding="utf-8") as f:
        json.dump(datos, f)


def leer(ruta):
    with open(ruta, encoding="utf-8") as f:
        return json.load(f)


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="volver-test-")
        self.addCleanup(shutil.rmtree, self.tmp, ignore_errors=True)
        self.raiz = os.path.join(self.tmp, "repo")
        self.olas = os.path.join(self.raiz, "starseed_memory_root", "olas")
        self.cerrojos = os.path.join(self.tmp, "cerrojos")
        os.makedirs(self.olas)

    def latidos(self, tareas, cola=COLA):
        escribir(os.path.join(self.olas, "latidos-" + cola), {"tareas": tareas})

    def control(self, cola=COLA):
        return leer(os.path.join(self.olas, "control-" + cola))

    def nodo(self, enviar_puntos=None):
        n = NM.Nodo(seco=False, sin_red=True, memoria={"hecho": {}, "nonces": {}, "decisiones": []},
                    persistir=False, huella="huella-volver", reloj=lambda: AHORA,
                    enviar_puntos=enviar_puntos)
        n.yo = "mac-1"
        n._medida_salud = {"periodo_s": 300.0}
        return n

    @staticmethod
    def nov(*asignadas):
        """(tid, nodo, t) → lo que el bus trae en `asignaciones` (una por tarea)."""
        return {"latidos": [], "bajas": [], "ordenes": [], "reclamos": [],
                "asignaciones": [{"nodo": a, "ids": [tid], "ts": t} for tid, a, t in asignadas]}


class Ayudas(Base):
    def test_cola_de_la_tarea_por_sus_latidos_o_por_la_unica_cola(self):
        self.latidos({"T1": {"fase": "escribiendo"}}, "cola-a.json")
        self.latidos({"T2": {"fase": "tsc"}}, "cola-b.json")
        self.assertEqual(NM.cola_de_la_tarea(self.raiz, "T1", ["cola-a.json", "cola-b.json"]), "cola-a.json")
        self.assertEqual(NM.cola_de_la_tarea(self.raiz, "T2", ["cola-a.json", "cola-b.json"]), "cola-b.json")
        self.assertIsNone(NM.cola_de_la_tarea(self.raiz, "T3", ["cola-a.json", "cola-b.json"]))
        self.assertEqual(NM.cola_de_la_tarea(self.raiz, "T3", ["cola-a.json"]), "cola-a.json")

    def test_soltar_en_control_conserva_las_otras_ordenes(self):
        escribir(os.path.join(self.olas, "control-" + COLA), {"Z": {"accion": "reabrir"}})
        escritas = NM.soltar_en_control({COLA: ["T1"]}, self.raiz, AHORA, cerrojos=self.cerrojos)
        self.assertEqual(escritas, ["T1"])
        c = self.control()
        self.assertEqual(c["Z"], {"accion": "reabrir"})
        self.assertEqual(c["T1"]["accion"], "soltar")
        self.assertEqual(c["T1"]["quien"], "al-volver")
        self.assertEqual(c["T1"]["donde"], "relevo")

    def test_soltar_en_control_sin_tareas_no_escribe_nada(self):
        self.assertEqual(NM.soltar_en_control({}, self.raiz, AHORA, cerrojos=self.cerrojos), [])
        self.assertFalse(os.path.exists(os.path.join(self.olas, "control-" + COLA)))


class AlVolver(Base):
    def test_suelta_lo_que_otro_siguio_y_lo_demas_lo_sigue(self):
        self.latidos({"T1": {"fase": "escribiendo"}, "T2": {"fase": "tsc"}})
        llamadas = []

        def enviar(raiz, ids, t):
            # El punto se fuerza y se envía ANTES de que exista el `soltar`.
            llamadas.append((raiz, list(ids), t))
            self.assertFalse(os.path.exists(os.path.join(self.olas, "control-" + COLA)))

        informe = {"acciones": [], "ordenes": [], "avisos": []}
        d = self.nodo(enviar)._soltar_al_volver(
            self.raiz, self.nov(("T1", "a1-x", AHORA - 100)), informe, AHORA, AHORA - 3600,
            colas=[COLA], cerrojos=self.cerrojos)
        self.assertEqual(d["soltar"], ["T1"])
        self.assertEqual(d["seguir"], ["T2"])
        self.assertEqual(d["puntos"], {"T1": "enviado"})
        self.assertEqual(llamadas, [(self.raiz, ["T1"], AHORA)])
        self.assertEqual(informe["volver"], d)
        c = self.control()
        self.assertEqual(c["T1"]["accion"], "soltar")
        self.assertNotIn("T2", c)

    def test_un_latido_reciente_no_es_una_vuelta_y_no_suelta_nada(self):
        self.latidos({"T1": {"fase": "escribiendo"}})
        llamadas = []
        informe = {"acciones": [], "ordenes": [], "avisos": []}
        d = self.nodo(lambda *a: llamadas.append(a))._soltar_al_volver(
            self.raiz, self.nov(("T1", "a1-x", AHORA - 100)), informe, AHORA, AHORA - 60,
            colas=[COLA], cerrojos=self.cerrojos)
        self.assertIsNone(d)
        self.assertEqual(llamadas, [])
        self.assertFalse(os.path.exists(os.path.join(self.olas, "control-" + COLA)))
        self.assertNotIn("volver", informe)

    def test_la_vuelta_solo_se_procesa_una_vez(self):
        self.latidos({"T1": {"fase": "escribiendo"}})
        llamadas = []
        n = self.nodo(lambda *a: llamadas.append(a))
        informe = {"acciones": [], "ordenes": [], "avisos": []}
        nov = self.nov(("T1", "a1-x", AHORA - 100))
        n._soltar_al_volver(self.raiz, nov, informe, AHORA, AHORA - 3600,
                            colas=[COLA], cerrojos=self.cerrojos)
        self.assertEqual(len(llamadas), 1)
        # Sigue sin latir, pero ya no es «la primera vuelta»: no se repite el corte.
        d = n._soltar_al_volver(self.raiz, nov, informe, AHORA + 60, AHORA - 3600,
                                colas=[COLA], cerrojos=self.cerrojos)
        self.assertIsNone(d)
        self.assertEqual(len(llamadas), 1)

    def test_cada_tarea_se_suelta_en_el_control_de_su_cola(self):
        self.latidos({"T1": {"fase": "escribiendo"}}, "cola-a.json")
        self.latidos({"T2": {"fase": "completando"}}, "cola-b.json")
        llamadas = []
        informe = {"acciones": [], "ordenes": [], "avisos": []}
        d = self.nodo(lambda r, ids, t: llamadas.append(ids[0]))._soltar_al_volver(
            self.raiz, self.nov(("T1", "a1-x", AHORA - 100), ("T2", "a1-y", AHORA - 100)),
            informe, AHORA, AHORA - 3600, colas=["cola-a.json", "cola-b.json"],
            cerrojos=self.cerrojos)
        self.assertEqual(sorted(d["soltar"]), ["T1", "T2"])
        self.assertEqual(llamadas, ["T1", "T2"])
        self.assertEqual(self.control("cola-a.json")["T1"]["accion"], "soltar")
        self.assertEqual(self.control("cola-b.json")["T2"]["accion"], "soltar")

    def test_si_el_punto_no_se_puede_enviar_la_tarea_se_suelta_igual(self):
        self.latidos({"T1": {"fase": "escribiendo"}})

        def romper(*_a):
            raise RuntimeError("sin A1")

        informe = {"acciones": [], "ordenes": [], "avisos": []}
        d = self.nodo(romper)._soltar_al_volver(
            self.raiz, self.nov(("T1", "a1-x", AHORA - 100)), informe, AHORA, AHORA - 3600,
            colas=[COLA], cerrojos=self.cerrojos)
        self.assertEqual(d["puntos"], {"T1": "fallo: RuntimeError"})
        self.assertEqual(self.control()["T1"]["accion"], "soltar")

    def test_sin_enviador_lo_dice_y_sigue(self):
        self.latidos({"T1": {"fase": "escribiendo"}})
        informe = {"acciones": [], "ordenes": [], "avisos": []}
        with patch.dict(sys.modules, {"oracle_nodo": types.SimpleNamespace()}):
            d = self.nodo()._soltar_al_volver(
                self.raiz, self.nov(("T1", "a1-x", AHORA - 100)), informe, AHORA, AHORA - 3600,
                colas=[COLA], cerrojos=self.cerrojos)
        self.assertEqual(d["puntos"], {"T1": "sin enviador (COL1012E pendiente)"})
        self.assertEqual(self.control()["T1"]["accion"], "soltar")

    def test_usa_a_oracle_enviar_puntos_cuando_no_se_inyecta(self):
        self.latidos({"T1": {"fase": "escribiendo"}})
        llamadas = []
        falso = types.SimpleNamespace(
            enviar_puntos=lambda raiz, ids, t: llamadas.append((raiz, ids, t)))
        informe = {"acciones": [], "ordenes": [], "avisos": []}
        with patch.dict(sys.modules, {"oracle_nodo": falso}):
            d = self.nodo()._soltar_al_volver(
                self.raiz, self.nov(("T1", "a1-x", AHORA - 100)), informe, AHORA, AHORA - 3600,
                colas=[COLA], cerrojos=self.cerrojos)
        self.assertEqual(d["puntos"], {"T1": "enviado"})
        self.assertEqual(llamadas, [(self.raiz, ["T1"], AHORA)])

    def test_lo_asignado_a_este_aparato_o_antes_de_su_latido_se_sigue(self):
        self.latidos({"T1": {"fase": "escribiendo"}, "T2": {"fase": "escribiendo"},
                      "T3": {"fase": "escribiendo"}})
        nov = self.nov(("T1", "mac-1", AHORA - 100), ("T2", "a1-x", AHORA - 5000),
                       ("T3", "a1-x", AHORA - 100))
        informe = {"acciones": [], "ordenes": [], "avisos": []}
        d = self.nodo()._soltar_al_volver(self.raiz, nov, informe, AHORA, AHORA - 1000,
                                          colas=[COLA], cerrojos=self.cerrojos)
        self.assertEqual(d["soltar"], ["T3"])
        self.assertEqual(d["seguir"], ["T1", "T2"])
        self.assertNotIn("T1", self.control())
        self.assertNotIn("T2", self.control())

    def test_sin_trabajo_local_no_hay_nada_que_soltar(self):
        llamadas = []
        informe = {"acciones": [], "ordenes": [], "avisos": []}
        d = self.nodo(lambda *a: llamadas.append(a))._soltar_al_volver(
            self.raiz, self.nov(("T1", "a1-x", AHORA - 100)), informe, AHORA, AHORA - 3600,
            colas=[COLA], cerrojos=self.cerrojos)
        self.assertIsNone(d)
        self.assertEqual(llamadas, [])

    def test_sin_saber_la_cola_no_se_suelta_a_ciegas(self):
        self.latidos({"T1": {"fase": "escribiendo"}}, "cola-a.json")
        self.latidos({"T2": {"fase": "escribiendo"}}, "cola-b.json")
        informe = {"acciones": [], "ordenes": [], "avisos": []}
        with patch.object(NM.M, "en_curso_de", return_value=[{"id": "X9"}]):
            d = self.nodo()._soltar_al_volver(
                self.raiz, self.nov(("X9", "a1-x", AHORA - 100)), informe, AHORA, AHORA - 3600,
                colas=["cola-a.json", "cola-b.json"], cerrojos=self.cerrojos)
        self.assertEqual(d["soltar"], [])
        self.assertTrue(any("X9" in a for a in informe["avisos"]))

    def test_la_vuelta_lo_llama_con_el_ultimo_latido_de_antes(self):
        llamadas = []
        salud = {"periodo_s": 300.0, "orquestadores": [], "autoritativo": False}
        n = NM.Nodo(
            seco=False, sin_red=True,
            medir=lambda modo, t: {"medio": "mac", "raiz": self.raiz, "salud": salud, "cap": {}},
            ejecutar=lambda *a: ("nada", ""), reloj=lambda: AHORA,
            memoria={"hecho": {}, "nonces": {}, "decisiones": [], "autonomia": True,
                     "ultimo_latido": AHORA - 3600},
            persistir=False, huella="huella-volver")
        n.yo = "mac-1"
        n._soltar_al_volver = lambda raiz, nov, informe, t, ultimo: llamadas.append(ultimo)
        n.vuelta()
        self.assertEqual(llamadas, [AHORA - 3600])


if __name__ == "__main__":
    unittest.main()
