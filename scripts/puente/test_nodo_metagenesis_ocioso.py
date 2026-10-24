# -*- coding: utf-8 -*-
"""Pruebas de «alimentar la cola viva» (CAP1018Ab, parte 3): el lado del medio.

Regla: UN orquestador por medio. A un medio con orquestador vivo NO se le lanza una segunda
cola: se AÑADEN tareas a la cola viva que ya corre (tmp + os.replace, sin duplicar ids). Aquí
va el lado del medio: el resumen de la tanda viva en el latido (`medir`) y la orden
`repartir` con `modo: «alimentar»` (`ejecutar`). La lógica pura y el plan del líder están
probados en `test_nodo_metagenesis_alimentar.py` (libre, ocupado, compatibilidad, plan).
"""
import json
import os
import shutil
import sys
import tempfile
import unittest
from unittest import mock

DIR = os.path.dirname(os.path.abspath(__file__))
if DIR not in sys.path:
    sys.path.insert(0, DIR)

import nodo_metagenesis_logica as L  # noqa: E402
import nodo_metagenesis_medio as M  # noqa: E402

T = lambda tid: {"id": tid, "titulo": tid, "archivos": [], "prompt": "hazlo"}


def tmp(caso):
    d = tempfile.mkdtemp(prefix="starseed-test-")
    caso.addCleanup(shutil.rmtree, d, ignore_errors=True)
    return d


class LatidoMedio(unittest.TestCase):
    """El latido añade a `salud` el resumen de SU cola viva, leído de `latidos-<cola>.json`."""

    def salud(self, latidos=None, viva=True):
        """Lo que `medir` ve en un aparato neutro, con la cola viva de este test."""
        raiz = tmp(self)
        ruta = os.path.join(raiz, "starseed_memory_root", "olas", "latidos-cola-x.json")
        if latidos is not None:
            os.makedirs(os.path.dirname(ruta))
            with open(ruta, "w", encoding="utf-8") as f:
                json.dump(latidos, f, ensure_ascii=False)
        parches = dict(raiz_repo=lambda: raiz, detectar_medio=lambda: "neurona", lineas_ps=lambda: [],
                       orquestadores=lambda _l: [], sabe_orquestar=lambda _r: True,
                       disco_libre_gb=lambda _r: 50.0, ram_libre_mb=lambda: 2048, servicios_linux=lambda: [],
                       en_curso_de=lambda _r, _c: [], ram_total_mb=lambda: 8192,
                       contenedor_de=lambda _d, _r: None, desconectando_ahora=lambda _a: False,
                       cola_viva=lambda _l=None: "cola-x.json" if viva else None)
        with mock.patch.multiple(M, **parches):
            return M.medir("real", ahora=1000.0)["salud"]

    def test_resume_su_tanda_viva(self):
        tar = {"fase": "escribiendo"}
        s = self.salud({"trabajadores": 4, "tareas": {"A": tar, "B": {"fase": "tsc"}, "C": {"fase": "hecho"},
                                                     "D": {"fase": "esperando proveedor"}}})
        self.assertTrue(s["trabajando"] and s["esperando"])  # trabajo vivo y algo esperando
        self.assertEqual(s["libres"], 1)  # 4 trabajadores - 3 vivas («hecho» no cuenta)
        self.assertEqual(self.salud({"trabajadores": 1, "tareas": {"A": tar, "B": tar, "C": tar}})["libres"], 0)
        # Datos raros o archivo ausente → valores seguros, nunca negativos, sin revienta.
        for latidos in ({"tareas": []}, {"tareas": "chirona"}, None):
            self.assertEqual(self.salud(latidos).get("libres", 0), 0)
        self.assertNotIn("libres", self.salud(viva=False))  # sin cola viva no hay campo nuevo (compatibilidad)
        # Cola viva con un solo trabajador ocupado: deja libres = trabajadores - vivas
        self.assertEqual(self.salud({"trabajadores": 2, "tareas": {"A": {"fase": "tsc"}}})["libres"], 1)


class RepartirAlimentar(unittest.TestCase):
    """La orden `repartir` con `modo: «alimentar»` añade tareas al archivo de SU cola viva."""

    def setUp(self):
        self.raiz = tmp(self)
        self.olas = os.path.join(self.raiz, "starseed_memory_root", "olas")
        os.makedirs(self.olas)
        self.ruta = os.path.join(self.olas, "cola-mg-oracle-1018.json")
        with open(self.ruta, "w", encoding="utf-8") as f:
            json.dump([T(x) for x in ("T1", "T2")], f, ensure_ascii=False)

    def ejecutar(self, *tareas, cola="cola-mg-oracle-1018", seco=False, sin=False):
        args = {} if sin else {"modo": "alimentar", "cola": cola, "tareas": [T(x) for x in tareas]}
        return M.ejecutar({"accion": "repartir", "args": args}, "neurona", self.raiz, seco)

    def ids(self):
        with open(self.ruta, encoding="utf-8") as f:
            return [t["id"] for t in json.load(f)]

    def test_sin_duplicados(self):
        # T2 repetida: solo añade T3 y T4; todas repetidas → nada y cola intacta; tras añadir una,
        # queda SU archivo, atómico: ni segunda cola ni tmp sueltos (UN orquestador por medio).
        self.assertEqual(self.ejecutar("T2", "T3", "T4")[0], "hecha")
        self.assertEqual(self.ids(), ["T1", "T2", "T3", "T4"])
        self.assertEqual(self.ejecutar("T2"), ("nada", "todas las tareas ya están en la cola"))
        self.assertEqual(self.ejecutar("T5"), ("hecha", "1 tarea(s) añadida(s) a cola-mg-oracle-1018"))
        self.assertEqual(self.ids(), ["T1", "T2", "T3", "T4", "T5"])
        self.assertEqual(os.listdir(self.olas), ["cola-mg-oracle-1018.json"])

    def test_fallos_y_compatibilidad(self):
        # Sin tareas o cola (o nombre no válido) → fallo; sin `modo` aquí nada (el reparto normal
        # lo decide el medio con las listas); y en seco no se toca el disco.
        self.assertEqual(self.ejecutar()[0], "fallo")
        self.assertEqual(self.ejecutar("T3", cola="")[0], "fallo")
        self.assertEqual(self.ejecutar("T3", cola=".malo")[0], "fallo")
        self.assertEqual(self.ejecutar("T3", sin=True)[0], "nada")
        self.assertEqual(self.ejecutar("T3", seco=True)[0], "seca")


if __name__ == "__main__":
    unittest.main()
