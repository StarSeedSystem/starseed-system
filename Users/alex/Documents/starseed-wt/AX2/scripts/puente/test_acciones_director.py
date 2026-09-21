# -*- coding: utf-8 -*-
"""Qué es una novedad para el director de acciones de Alex, y qué NO.

La función pura `novedades(antes, ahora)` decide solo con el id. Una acción
que cambia de urgencia pero no de id NO es nueva: es la misma acción, con las
mismas razones. El id es lo que identifica una acción de Alex; el resto es
detalle y no la convierte en otra.
"""

import importlib.util
import os
import unittest

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
if DIRECTORIO not in __import__("sys").path:
    __import__("sys").path.insert(0, DIRECTORIO)

_ruta = os.path.join(DIRECTORIO, "acciones-director-logic.py")
_spec = importlib.util.spec_from_file_location("acciones_director_logic", _ruta)
A = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(A)


def _accion(id, urgencia="alta"):
    return {
        "id": id,
        "titulo": "t-" + id,
        "urgencia": urgencia,
        "por_que": "p",
        "enlace": "",
        "comando": "",
        "detalle": "d",
    }


class NovedadesTest(unittest.TestCase):
    def test_primera_pasada_dos_acciones_son_nuevas(self):
        n = A.novedades([], [_accion("a"), _accion("b")])
        self.assertEqual({a["id"] for a in n["nuevas"]}, {"a", "b"})
        self.assertEqual(n["resueltas"], [])

    def test_pasada_iguual_no_hay_nada(self):
        antes = [_accion("a"), _accion("b")]
        n = A.novedades(antes, list(antes))
        self.assertEqual(n["nuevas"], [])
        self.assertEqual(n["resueltas"], [])

    def test_una_que_desaparece_es_resuelta(self):
        antes = [_accion("a"), _accion("b")]
        n = A.novedades(antes, [_accion("a")])
        self.assertEqual([x["id"] for x in n["resueltas"]], ["b"])
        self.assertEqual([x["id"] for x in n["nuevas"]], [])

    def test_una_que_cambia_de_urgencia_NO_es_nueva(self):
        # Cambia de urgencia pero no de id: es la misma acción, con las mismas
        # razones. No se anuncia como si fuera otra.
        antes = [_accion("a", "baja")]
        n = A.novedades(antes, [_accion("a", "alta")])
        self.assertEqual(n["nuevas"], [])
        self.assertEqual(n["resueltas"], [])

    def test_el_resto_del_dict_no_contamina_la_decision(self):
        # Un id que reaparece con título, enlace y comando distintos NO es
        # nueva: el id es lo único que identifica una acción de Alex.
        antes = [
            {"id": "x", "titulo": "viejo", "enlace": "", "comando": "", "detalle": ""}
        ]
        ahora = [
            {
                "id": "x",
                "titulo": "nuevo",
                "enlace": "http://x",
                "comando": "x",
                "detalle": "d",
            }
        ]
        n = A.novedades(antes, ahora)
        self.assertEqual(n["nuevas"], [])
        self.assertEqual(n["resueltas"], [])

    def test_antes_vacio_y_ahora_vacio(self):
        n = A.novedades([], [])
        self.assertEqual(n, {"nuevas": [], "resueltas": []})

    def test_ids_devuelve_solo_los_id(self):
        self.assertEqual(A.ids([{"id": "a"}, {"id": "b"}, {"otro": 1}]), {"a", "b"})
        self.assertEqual(A.ids(None), set())
        self.assertEqual(A.ids([]), set())


class ParaAnunciarTest(unittest.TestCase):
    def test_no_repite_lo_ya_dicho(self):
        n = {"nuevas": [_accion("a")], "resueltas": [_accion("b")]}
        out = A.para_anunciar(n, {"a", "b"})
        self.assertEqual(out, [])

    def test_solo_lo_nuevo_no_dicho(self):
        n = {"nuevas": [_accion("a"), _accion("b")], "resueltas": [_accion("c")]}
        out = A.para_anunciar(n, {"a"})
        ids = [(x["id"], t) for x, t in out]
        self.assertIn(("b", "nueva"), ids)
        self.assertIn(("c", "resuelta"), ids)
        self.assertNotIn(("a", "nueva"), ids)

    def test_sin_avisados_anuncia_todo(self):
        n = {"nuevas": [_accion("a")], "resueltas": [_accion("b")]}
        out = A.para_anunciar(n, set())
        self.assertEqual(len(out), 2)


if __name__ == "__main__":
    unittest.main()
