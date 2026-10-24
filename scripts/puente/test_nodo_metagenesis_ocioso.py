# -*- coding: utf-8 -*-
"""Pruebas de «alimentar la cola viva» sin lanzar una segunda cola (CAP1018Ab-d3, parte 3).

La lógica es pura; el latido del medio y el añadido a su propia cola viva usan un repo temporal y
medidas parcheadas: ni red, ni el disco de la Mac, ni ~/.starseed. La regla que se vigila es la del
proyecto: UN orquestador por medio; si ya hay uno vivo, se le añaden tareas a SU cola.
"""
import json
import os
import sys
import tempfile
import unittest
from unittest import mock

DIR = os.path.dirname(os.path.abspath(__file__))
if DIR not in sys.path:
    sys.path.insert(0, DIR)

import nodo_metagenesis_logica as L  # noqa: E402
import nodo_metagenesis_medio as M  # noqa: E402


def medio(libres=2, quieta=900, orquestadores=True, cola_viva=True, **extra):
    """Un latido de un medio con orquestador vivo (salvo que se pida lo contrario)."""
    salud = {"repo": True, "orquestador": True, "modo": "real",
             "orquestadores": [{"pid": 7, "cola": "cola-mg-1"}] if orquestadores else []}
    if cola_viva:
        salud["cola_viva"] = {"trabajando": 1, "esperando": 1, "libres": libres, "sin_nuevas_s": quieta}
    salud.update(extra)
    return {"modo": "real", "secreto": True, "salud": salud}


class Alimentable(unittest.TestCase):
    def test_libre(self):
        self.assertEqual(L.medio_alimentable("a1", medio()), (True, ""))

    def test_ocupado_sin_libres(self):
        ok, motivo = L.medio_alimentable("a1", medio(libres=0))
        self.assertFalse(ok)
        self.assertIn("libres", motivo)

    def test_sin_campo_nuevo_no_revienta(self):
        # Compatibilidad: un latido del código viejo no trae `cola_viva`; no se alimenta ni falla.
        self.assertFalse(L.medio_alimentable("a1", medio(cola_viva=False))[0])
        self.assertFalse(L.medio_alimentable("a1", {})[0])

    def test_nunca_sin_orquestador_vivo(self):
        # Sin orquestador vivo NO se alimenta: se le lanzaría una cola (lo decide `medio_ocioso`).
        ok, motivo = L.medio_alimentable("a1", medio(orquestadores=False))
        self.assertFalse(ok)
        self.assertIn("orquestador", motivo)


class Plan(unittest.TestCase):
    def plan(self, nodos, listas=8, **s):
        return L.planificar_resultados("mac", dict({"trabajo": {"listas": listas}}, **s), nodos, "mac", 1e9)

    def repartos(self, plan):
        return [a for a in plan if a["accion"] == "repartir"]

    def test_alimenta_con_tope_libres_por_dos(self):
        (a,) = self.repartos(self.plan({"a1": medio(libres=3)}))
        self.assertEqual(a["args"], {"destino": "a1", "tope": 6, "modo": "alimentar"})

    def test_nunca_dos_orquestadores(self):
        # Un medio que ya tiene orquestador vivo jamás recibe una cola nueva: solo alimentación.
        for a in self.repartos(self.plan({"a1": medio()})):
            self.assertEqual(a["args"].get("modo"), "alimentar")
        # Sin trabajadores libres tampoco se le manda nada.
        self.assertEqual(self.repartos(self.plan({"a1": medio(libres=0)})), [])


class Latido(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.raiz = os.path.join(self.tmp.name, "repo")
        os.makedirs(os.path.join(self.raiz, "starseed_memory_root", "olas"))

    def salud(self, latidos, viva=True):
        parches = dict(
            raiz_repo=lambda: self.raiz, detectar_medio=lambda: "neurona", lineas_ps=lambda: [],
            orquestadores=lambda _l: [], sabe_orquestar=lambda _r: True, disco_libre_gb=lambda _r: 50.0,
            ram_libre_mb=lambda: 2048, servicios_linux=lambda: [], ram_total_mb=lambda: 8192,
            en_curso_de=lambda _r, _c: [], colas_vivas=lambda _l=None: ["cola-x.json"] if viva else [],
            cola_viva=lambda _l=None: "cola-x.json" if viva else None, desconectando_ahora=lambda _a: False,
            leer_json=lambda ruta, defecto: latidos if "latidos-" in ruta else defecto)
        with mock.patch.multiple(M, **parches):
            return M.medir("real", ahora=1000.0)["salud"]

    def test_resumen_de_la_cola_viva(self):
        s = self.salud({"trabajadores": 4, "tareas": {
            "A": {"fase": "escribiendo"}, "B": {"fase": "tsc"}, "C": {"fase": "esperando_proveedor"},
            "D": {"fase": "hecho"}}})
        self.assertTrue(s["trabajando"])
        self.assertTrue(s["esperando"])
        self.assertEqual(s["libres"], 1)
        self.assertEqual(self.salud({"trabajadores": 2, "tareas": {"A": {"fase": "tsc"}}})["libres"], 1)
        self.assertNotIn("libres", self.salud({}, viva=False))


class SinDuplicados(unittest.TestCase):
    def test_no_duplica_en_la_tanda_viva(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        raiz = tmp.name
        olas = os.path.join(raiz, "starseed_memory_root", "olas")
        os.makedirs(olas)
        tarea = {"id": "R1", "titulo": "reparar", "archivos": ["a.py"], "prompt": "hazlo"}
        ruta = os.path.join(olas, "cola-x.json")
        with open(ruta, "w", encoding="utf-8") as f:
            json.dump([tarea], f)
        with mock.patch.object(M, "cola_viva", lambda _l=None: "cola-x.json"), \
                mock.patch.object(M, "colas_de_codigo_vivas", lambda _r: []):
            estado, _ = M.enlistar_reparacion(raiz, tarea, True, 1000.0)
        self.assertEqual(estado, "hecha")
        with open(ruta, encoding="utf-8") as f:
            viva = json.load(f)
        self.assertEqual([t["id"] for t in viva], ["R1"])
        self.assertEqual(os.listdir(olas), ["cola-metagenesis-19700101.json", "cola-x.json"])
