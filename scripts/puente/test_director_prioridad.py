# -*- coding: utf-8 -*-
"""Pruebas del orden por prioridad en el director de orquestación.

El director debe reencolar las N tareas de MÁS puntos (no las N primeras que
encuentra), anunciar el orden con su porqué en el parte y dejar orden-tareas.json
en disco para auditarlo sin ejecutar nada.
"""

import importlib.util
import json
import os
import sys
import tempfile
import unittest
from unittest import mock

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
if DIRECTORIO not in sys.path:
    sys.path.insert(0, DIRECTORIO)

_spec = importlib.util.spec_from_file_location(
    "director_orquestacion", os.path.join(DIRECTORIO, "director-orquestacion.py")
)
director = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(director)


class Base(unittest.TestCase):
    """Monta un starseed_memory_root falso en un directorio temporal."""

    CORTAS = ("tA", "tB")  # 1 archivo: las de más puntos
    LARGAS = ("tC", "tD", "tE")  # 9 archivos: se quedan fuera del tope

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.raiz = self.tmp.name
        self.olas = os.path.join(self.raiz, "starseed_memory_root", "olas")
        os.makedirs(self.olas)

        tareas = [
            {"id": tid, "archivos": ["src/%s.ts" % tid], "t": "2026-09-10T00:00:00"}
            for tid in self.CORTAS
        ] + [
            {
                "id": tid,
                "archivos": ["src/%s%d.ts" % (tid, i) for i in range(9)],
                "t": "2026-09-10T00:00:00",
            }
            for tid in self.LARGAS
        ]
        with open(
            os.path.join(self.olas, "cola-prueba.json"), "w", encoding="utf-8"
        ) as f:
            json.dump({"tareas": tareas}, f)
        progreso = {tid: {"estado": "fallo_tsc"} for tid in self.CORTAS + self.LARGAS}
        with open(os.path.join(self.olas, "progreso.json"), "w", encoding="utf-8") as f:
            json.dump(progreso, f)

        self.parches = [
            mock.patch.object(director, "RAIZ", self.raiz),
            mock.patch.object(director, "OLAS", self.olas),
            mock.patch.object(director, "orquestador_vivo", return_value=False),
            mock.patch.object(director, "cargar_config", return_value=({}, [])),
            mock.patch.object(director, "_p"),
            mock.patch.object(
                director.subprocess,
                "run",
                return_value=mock.Mock(stdout=""),
            ),
        ]
        for p in self.parches:
            p.start()
        self.addCleanup(self._parar)

    def _parar(self):
        for p in self.parches:
            p.stop()
        self.tmp.cleanup()


class ReencoloPorPrioridad(Base):
    def test_con_tope_reencola_las_de_mas_puntos(self):
        tocadas = director.continuar_estancadas(tope=2)
        self.assertEqual(sorted(tocadas), sorted(self.CORTAS))

    def test_las_que_quedan_fuera_no_se_tocan(self):
        director.continuar_estancadas(tope=2)
        with open(os.path.join(self.olas, "progreso.json"), encoding="utf-8") as fh:
            p = json.load(fh)
        for tid in self.LARGAS:
            self.assertEqual(p[tid]["estado"], "fallo_tsc")


class LineaOrden(Base):
    def test_linea_con_las_tres_primeras_y_su_porque(self):
        linea = director.linea_orden()
        self.assertIn("ORDEN", linea)
        self.assertIn("1º tA", linea)
        self.assertIn("2º tB", linea)
        self.assertIn("3º", linea)
        self.assertIn("corta", linea)

    def test_sin_pendientes_no_hay_linea(self):
        # «Sin pendientes» es que no quede NADA que hacer, y eso se consigue vaciando la
        # COLA. Vaciar progreso.json hacía lo contrario: una tarea de la cola sin estado
        # es pendiente —nunca se intentó—, así que el director sí debía dar el orden.
        with open(
            os.path.join(self.olas, "cola-prueba.json"), "w", encoding="utf-8"
        ) as f:
            json.dump({"tareas": []}, f)
        with open(os.path.join(self.olas, "progreso.json"), "w", encoding="utf-8") as f:
            json.dump({}, f)
        self.assertEqual(director.linea_orden(), "")

    def test_tarea_sin_estado_cuenta_como_pendiente(self):
        """Lo que la prueba anterior afirmaba al revés, fijado a propósito."""
        with open(os.path.join(self.olas, "progreso.json"), "w", encoding="utf-8") as f:
            json.dump({}, f)
        linea = director.linea_orden()
        self.assertIn("ORDEN", linea)
        self.assertIn("1º", linea)


class OrdenJson(Base):
    def _revisar(self):
        with (
            mock.patch.object(director, "reconciliar_estados", return_value=[]),
            mock.patch.object(director, "continuar_estancadas", return_value=[]),
            mock.patch.object(director._desatascar, "desatascar", return_value=[]),
            mock.patch.object(director, "cola_viva", return_value=({}, {}, None)),
            mock.patch.object(director, "disco_gb", return_value=99),
        ):
            return director.revisar()

    def test_orden_json_se_escribe_y_es_valido(self):
        self._revisar()
        ruta = os.path.join(
            self.raiz, "starseed_memory_root", "mando", "orden-tareas.json"
        )
        self.assertTrue(os.path.exists(ruta))
        with open(ruta, encoding="utf-8") as fh:
            datos = json.load(fh)
        self.assertIn("t", datos)
        self.assertEqual([e["id"] for e in datos["listas"]][:2], list(self.CORTAS))
        self.assertIn("razones", datos["listas"][0])
        self.assertIn("bloqueadas", datos)

    def test_si_el_disco_falla_la_pasada_sigue(self):
        with mock.patch.object(
            director.os, "replace", side_effect=OSError("disco lleno")
        ):
            hecho = self._revisar()  # no revienta
        self.assertIsInstance(hecho, list)


if __name__ == "__main__":
    unittest.main()
