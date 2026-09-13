# -*- coding: utf-8 -*-
"""Puertas de higiene_colas: qué cola se mueve, cuál se queda y cuál se ignora."""

import os
import sys
import tempfile
import time
import unittest

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
if DIRECTORIO not in sys.path:
    sys.path.insert(0, DIRECTORIO)

from higiene_colas import colas_auto_viejas, colas_cerradas  # noqa: E402

MAIN = ["Ola 315 · zN1: higiene de colas integrada"]


class ColasCerradasTest(unittest.TestCase):
    def test_cola_con_todas_sus_tareas_cerradas_sale(self):
        tareas = [{"id": "zN1"}, {"id": "zN2"}]
        progreso = {"zN1": {"estado": "commit"}, "zN2": {"estado": "rechazada"}}
        self.assertEqual(
            colas_cerradas([("cola-315.json", tareas)], progreso, MAIN),
            ["cola-315.json"],
        )

    def test_una_sola_tarea_viva_la_sostiene(self):
        tareas = [{"id": "zN1"}, {"id": "zN3"}]
        progreso = {"zN1": {"estado": "commit"}, "zN3": {"estado": "pendiente"}}
        self.assertEqual(
            colas_cerradas([("cola-315.json", tareas)], progreso, MAIN), []
        )

    def test_id_ya_en_main_cuenta_como_cerrado(self):
        # zN1 no figura en progreso, pero su id ya vive en un asunto de main.
        self.assertEqual(
            colas_cerradas([("cola-314.json", [{"id": "zN1"}])], {}, MAIN),
            ["cola-314.json"],
        )

    def test_cola_ilegible_se_ignora(self):
        self.assertEqual(colas_cerradas([("cola-315.json", None)], {}, []), [])

    def test_copias_auto_no_cuentan_como_fuente(self):
        # Aunque estén todas cerradas, las copias de ejecución no se mueven aquí.
        self.assertEqual(
            colas_cerradas([("cola-auto-0912.json", [{"id": "zN1"}])], {}, []), []
        )


class ColasAutoViejasTest(unittest.TestCase):
    def setUp(self):
        self.olas = tempfile.mkdtemp()

    def _tocar(self, nombre, hace):
        ruta = os.path.join(self.olas, nombre)
        with open(ruta, "w") as f:
            f.write("{}")
        os.utime(ruta, (hace, hace))  # noqa: days in the past are fine

    def test_auto_vieja_y_orquestador_muerto_sale(self):
        self._tocar("cola-auto-0901.json", time.time() - 30 * 3600)
        self._tocar("cola-auto-hoy.json", time.time() - 3600)
        self.assertEqual(
            colas_auto_viejas(self.olas, vivo=False), ["cola-auto-0901.json"]
        )

    def test_con_orquestador_vivo_ninguna_auto_sale(self):
        self._tocar("cola-auto-0901.json", time.time() - 30 * 3600)
        self.assertEqual(colas_auto_viejas(self.olas, vivo=True), [])

    def test_auto_reciente_no_sale(self):
        self._tocar("cola-auto-hoy.json", time.time() - 3600)
        self.assertEqual(colas_auto_viejas(self.olas, vivo=False), [])


if __name__ == "__main__":
    unittest.main()
