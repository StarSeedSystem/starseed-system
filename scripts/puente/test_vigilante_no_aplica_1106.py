# -*- coding: utf-8 -*-
"""(2026-11-06) «No aplica» es una tarea cerrada: el vigilante no la relanza.

Desde las 07:32 del 06-11 el vigilante lanzaba cada 3 minutos una ola `cola-auto-*` con
RPO1104M-d2 y VER1105Db-d3, las dos «no_aplica» (su propósito ya estaba en main). El enjambre
(ENJ1106N) y el revisor (REV1106N) ya las daban por cerradas: el orquestador salía sin hacer
nada y el vigilante, que no conocía ese estado, volvía a lanzarlas (~80 olas y dos commits de
memoria por ola). Sin red, disco ni procesos.
"""

import os
import sys
import unittest
from datetime import datetime

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
if DIRECTORIO not in sys.path:
    sys.path.insert(0, DIRECTORIO)

import vigilante_logica as V  # noqa: E402

COLA = "cola-revisor-20261105.json"


class NoAplicaNoSeRelanza(unittest.TestCase):
    def test_no_aplica_no_es_pendiente(self):
        colas = [(COLA, [{"id": "RPO1104M-d2"}, {"id": "VER1105Db-d3"}, {"id": "X1"}])]
        progreso = {"RPO1104M-d2": {"estado": "no_aplica"}, "VER1105Db-d3": {"estado": "no-aplica"}}
        ids = [t["id"] for t in V.seleccionar_pendientes(colas, progreso, [])]
        self.assertEqual(ids, ["X1"])

    def test_el_caso_del_06_11_ya_no_relanza(self):
        colas = [(COLA, [{"id": "RPO1104M-d2"}, {"id": "VER1105Db-d3"}])]
        progreso = {
            "RPO1104M-d2": {"estado": "no_aplica", "t": "2026-11-06 07:33:30"},
            "VER1105Db-d3": {"estado": "no_aplica", "t": "2026-11-06 07:31:44"},
        }
        # la llamada real del vigilante lleva la hora
        cola = V.seleccionar_pendientes(colas, progreso, [], ahora=datetime(2026, 11, 6, 11, 40))
        self.assertEqual(cola, [])
        relanzar, _trabajadores, _tope = V.decidir_relanzamiento({}, False, len(cola))
        self.assertFalse(relanzar)


class NoAplicaCumpleLaDependencia(unittest.TestCase):
    def test_quien_esperaba_a_una_no_aplica_sale(self):
        colas = [("cola-x.json", [{"id": "B", "depende": ["A", "VIVA"]}])]
        progreso = {"A": {"estado": "no_aplica"}, "VIVA": {"estado": "en_curso"}}
        t = V.seleccionar_pendientes(colas, progreso, [])[0]
        self.assertEqual(t["depende"], ["VIVA"])
        self.assertEqual(t["dependencias_ya_en_main"], ["A"])

    def test_una_sucesora_no_aplica_cumple_la_dependencia(self):
        colas = [("cola-camr.json", [{"id": "CAMR1005F", "depende": ["CAMR1005Db"]}])]
        progreso = {"CAMR1005Db": {"estado": "fallo_tsc"}, "CAMR1005Dc": {"estado": "no_aplica"}}
        t = V.seleccionar_pendientes(colas, progreso, [])[0]
        self.assertEqual(t["depende"], [])


class CorreccionViejaNoReabreNoAplica(unittest.TestCase):
    def test_una_correccion_anterior_a_la_marca_no_la_reabre(self):
        prog = {"VER1105Db-d3": {"estado": "no_aplica", "t": "2026-11-06 07:31:44"}}
        vieja = {"VER1105Db-d3": {"estado": "pendiente", "nota": "director: escalera",
                                  "t": "2026-11-06 06:50:00"}}
        nuevo, aplicadas = V.aplicar_correcciones(prog, vieja)
        self.assertEqual(aplicadas, [])
        self.assertEqual(nuevo["VER1105Db-d3"]["estado"], "no_aplica")
        # una posterior (alguien la reabre a propósito) sí manda
        nueva = {"VER1105Db-d3": {"estado": "pendiente", "t": "2026-11-06 12:00:00"}}
        self.assertEqual(V.aplicar_correcciones(prog, nueva)[1], ["VER1105Db-d3"])


if __name__ == "__main__":
    unittest.main()
