#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas COL1012H · al volver, el aparato suelta lo que otro siguió mientras estaba fuera.

Contrato: architecture/colmena-relevo-contenedores.md. Usa colmena_logica (puro) y un disco / bus
falsos: nunca toca los archivos vivos del orquestador.
"""
import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import colmena_logica as C  # noqa: E402


class AlVolverConDiscoYBusFalsos(unittest.TestCase):
    """COL1012H · al arrancar o al recuperar la conexión, el nodo suelta lo ya seguido."""

    def test_al_volver_calcula_soltar_y_seguir(self):
        # Bus falso: asignaciones del bus con tareas ya seguidas por otro medio.
        asig = {
            "AV1": {"a": "oracle-a1-y", "t": 1_800_000_000.0 - 100},
            "AV2": {"a": "mac-1", "t": 1_800_000_000.0 - 100},
            "AV4": {"a": "oracle-a1-y", "t": 1_800_000_000.0 - 5000},
        }
        soltar, seguir = C.al_volver(
            "mac-1",
            ["AV1", "AV2", "AV3", "AV4"],
            asig,
            1_800_000_000.0 - 1000,
        )
        self.assertEqual(soltar, ["AV1"])
        self.assertEqual(seguir, ["AV2", "AV3", "AV4"])

    def test_al_volver_sin_asignaciones_sigue_todo(self):
        soltar, seguir = C.al_volver(
            "mac-1", ["X"], {}, 1_800_000_000.0
        )
        self.assertEqual(soltar, [])
        self.assertEqual(seguir, ["X"])

    def test_volver_escribe_soltar_en_control_relevo_json(self):
        # Disco falso: carpeta temporal que simula olas/
        with tempfile.TemporaryDirectory() as tmp_olas:
            # Importamos la función de escribir del reparto; no tocamos archivos vivos.
            import repartir_nube as RN  # noqa: E402
            ordenes = {
                "relevo": {
                    "AV1": {"accion": "soltar", "donde": "oracle-a1-y", "quien": "mac-1", "t": 1_800_000_000.0},
                }
            }
            hechos = RN.soltar_en_la_mac(
                ordenes,
                tmp_olas,
                cerrojos=os.path.join(tmp_olas, "cerrojos"),
            )
            self.assertIn("AV1", hechos)
            ruta = os.path.join(tmp_olas, "control-relevo.json")
            self.assertTrue(os.path.isfile(ruta))
            with open(ruta, encoding="utf-8") as f:
                contenido = json.load(f)
            self.assertIn("AV1", contenido)
            self.assertEqual(contenido["AV1"]["accion"], "soltar")


if __name__ == "__main__":
    unittest.main()
