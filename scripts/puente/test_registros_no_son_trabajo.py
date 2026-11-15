#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Un aviso de algo ya hecho no es trabajo: ni lo reparte la nube ni lo ofrece el vigilante.

(2026-11-15, SIN1114-1794718054) El bot del A1 registró la síntesis del 2026-11-14 en la
cola SIN1114 con `hechos` y sin archivos. El reparto a la nube la tomó por pendiente y
abrió un job para nada. Aquí se fija que un registro se lee y no se ejecuta.
"""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(__file__))
import repartir_nube as RN
import vigilante_logica as V

REGISTRO = {
    "id": "SIN1114-1794718054",
    "ola": "SIN1114",
    "titulo": "Síntesis de producción StarSeed 2026-11-14",
    "archivos": [],
    "prompt": "Síntesis diaria completada por el A1 y enviada al bot",
    "origen": "telegram_a1",
    "hechos": ["síntesis_generada", "enviada_telegram"],
}


class RegistroNoEsTrabajo(unittest.TestCase):
    def test_es_registro_solo_con_hechos(self):
        self.assertTrue(V.es_registro(REGISTRO))
        self.assertFalse(V.es_registro({"id": "A", "archivos": []}))
        self.assertFalse(V.es_registro(None))

    def test_la_nube_no_reparte_un_registro(self):
        self.assertEqual(RN.motivo_fuera(REGISTRO, {}, [], None), "registro")
        salida = RN.elegir([("cola-sin1114.json", [REGISTRO])], {}, [], None)
        self.assertEqual([t["id"] for t in salida], [])

    def test_el_vigilante_no_ofrece_un_registro(self):
        tareas = [
            REGISTRO,
            {"id": "TRABAJO", "ola": "SIN1114", "archivos": ["x.ts"]},
        ]
        salida = V.seleccionar_pendientes([("cola-sin1114.json", tareas)], {}, [])
        self.assertEqual([t["id"] for t in salida], ["TRABAJO"])
