# -*- coding: utf-8 -*-
"""Pruebas sin disco, procesos ni red de la selección para la nube."""

import os
import sys
import unittest


DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
if DIRECTORIO not in sys.path:
    sys.path.insert(0, DIRECTORIO)

from cola_nube import modo_publicacion, seleccionar  # noqa: E402


class ColaNubeTest(unittest.TestCase):
    def test_deduplica_por_id_y_respeta_el_orden(self):
        colas = [
            ("cola-a.json", [{"id": "A1"}, {"id": "A2"}]),
            ("cola-b.json", [{"id": "A1", "titulo": "vieja"}, {"id": "A3"}]),
        ]
        self.assertEqual(
            seleccionar(colas, []),
            [{"id": "A1"}, {"id": "A2"}, {"id": "A3"}],
        )

    def test_excluye_ids_ya_integrados_en_main_como_token(self):
        colas = [("cola-a.json", [{"id": "R1"}, {"id": "R10"}])]
        asuntos = ["Ola 228 · R1: corrección integrada"]
        self.assertEqual(seleccionar(colas, asuntos), [{"id": "R10"}])

    def test_reserva_el_tope_de_tareas(self):
        colas = [("cola-a.json", [{"id": "T%d" % i} for i in range(30)])]
        salida = seleccionar(colas, [], tope=20)
        self.assertEqual(len(salida), 20)
        self.assertEqual(salida[0]["id"], "T0")

    def test_modo_publicacion_push_o_parchen_segun_dry_run(self):
        self.assertEqual(modo_publicacion("Everything up-to-date"), "push")
        self.assertEqual(
            modo_publicacion("remote: Permission denied (403)"),
            "parche",
        )
        self.assertEqual(modo_publicacion("access denied to repo"), "parche")


if __name__ == "__main__":
    unittest.main()
