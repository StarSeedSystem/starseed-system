# -*- coding: utf-8 -*-
"""Pruebas de `reparaciones_superadas` (MGB1021Ab): las reparaciones de UNA PUERTA DE PUBLICACIÓN
EN ROJO se cierran solas cuando la puerta vuelve a verde.

Caso real del 21-10: MGP1014-C715AA y su cadena -d1b…d1d/d2d/d3 siguieron reintentándose una semana
después de que la autopublicación ya hubiera publicado (MGP1015-B2E850 lo arregló). Sin red, sin
procesos, sin disco: todo entra por argumento, como el resto del criterio del nodo.
"""
import os
import sys
import unittest

DIR = os.path.dirname(os.path.abspath(__file__))
if DIR not in sys.path:
    sys.path.insert(0, DIR)

import nodo_metagenesis_logica as L  # noqa: E402

SHA_ROJO = "f0e1d2c3a4b5"
SHA_PUBLI = "9a8b7c6d5e4f0112deadbeef"  # distinto del rojo: publicó un commit nuevo

PROMPT = ("NOTA DE METAGENESIS (2026-10-14): la autopublicación lleva más de 60 min frenada en %s por "
          "«pureza de astraura-bots» y ningún commit nuevo lo ha arreglado." % SHA_ROJO[:8])

ORIGINAL = {"id": "MGP1014-C715AA", "origen": "metagenesis",
            "titulo": "Puerta de publicación en rojo: pureza de astraura-bots", "prompt": PROMPT}


def cadena() -> list:
    """La cadena entera como quedó en la realidad: la original y sus sucesoras con sufijos."""
    d1b = dict(ORIGINAL, id="MGP1014-C715AA-d1b", origen="nube-reparar")  # la nube la siguió, mismo caso
    d2d = dict(ORIGINAL, id="MGP1014-C715AA-d2d")
    return [ORIGINAL, d1b, d2d]


pub_verde = {"fase": "publicado", "sha": SHA_PUBLI, "sin_publicar": 0}
pub_roja_mismo_sha = {"fase": "bloqueado", "sha": SHA_ROJO, "sin_publicar": 3}
pub_publico_otro_sha = {"fase": "bloqueado", "sha": SHA_PUBLI, "sin_publicar": 0}


class ReparacionesSuperadas(unittest.TestCase):
    def test_puerta_en_verde_cierra_la_cadena_entera(self):
        res = L.reparaciones_superadas(cadena(), {}, pub_verde)
        self.assertEqual([tid for tid, _ in res], [t["id"] for t in cadena()])
        for _, nota in res:
            self.assertTrue(nota.startswith("NO APLICA: la puerta de publicación volvió a verde"))
            self.assertIn(SHA_PUBLI[:12], nota)

    def test_puerta_verde_por_sha_nuevo_aunque_la_fase_sigua_bloqueada(self):
        res = L.reparaciones_superadas(cadena(), {}, pub_publico_otro_sha)
        self.assertEqual([tid for tid, _ in res], [t["id"] for t in cadena()])

    def test_puerta_roja_con_el_mismo_sha_no_cierra_nada(self):
        self.assertEqual(L.reparaciones_superadas(cadena(), {}, pub_roja_mismo_sha), [])
        # Sin sha publicado ni fase verde, tampoco se cierra nada.
        self.assertEqual(L.reparaciones_superadas(cadena(), {}, {}), [])

    def test_tareas_ya_cerradas_no_se_tocan(self):
        progreso = {
            "MGP1014-C715AA": {"estado": "integrada", "t": 1.0},
            "MGP1014-C715AA-d1b": {"estado": "sustituida", "t": 1.0},
        }
        res = L.reparaciones_superadas(cadena(), progreso, pub_verde)
        self.assertEqual([tid for tid, _ in res], ["MGP1014-C715AA-d2d"])

    def test_solo_cadena_de_reparacion_y_nada_ajeno(self):
        """Otro origen, otro título o sin título no se tocan; UNA segunda cadena de reparación
        independiente SÍ se cierra: también se quedó sin sentido con la puerta en verde."""
        otras = [{"id": "RTC1026-X1", "origen": "metagenesis", "titulo": "Otra cosa", "prompt": PROMPT},
                 {"id": "RAIZ1026-X2", "origen": "usuario", "titulo": "Puerta de publicación en rojo"},
                 {"id": "MGP1015-B2E850", "origen": "metagenesis",
                  "titulo": "Puerta de publicación en rojo: sin-node-en-cliente",
                  "prompt": "…frenada en %s por «otra cosa»…" % SHA_PUBLI[:8]},  # su rojo ES el de hoy
                 {"id": "MGP1016-Z9"}]
        res = L.reparaciones_superadas(cadena() + otras, {}, pub_verde)
        ids_cadena = [x["id"] for x in cadena()]
        fuera = [tid for tid, _ in res if tid not in ids_cadena]
        self.assertEqual(fuera, ["MGP1015-B2E850"])  # la segunda cadena: también se cierra
        ids_cerradas = [tid for tid, _ in res]
        self.assertEqual(sorted(tid for tid in ids_cerradas if tid in ids_cadena),
                         sorted(ids_cadena))
        ids_ajenos = [x["id"] for x in otras if x["id"] != "MGP1015-B2E850"]
        self.assertEqual([tid for tid in ids_cerradas if tid in ids_ajenos], [])

    def test_prompt_sin_sha_rojo_solo_fase_verde_cierra(self):
        """Un prompt sin sha rojo anotado: solo cierra si la FASE está en verde (no da la suya por id)."""
        sin_sha = [dict(ORIGINAL, prompt="sin números")]
        verde = L.reparaciones_superadas(sin_sha, {}, pub_verde)
        self.assertEqual([tid for tid, _ in verde], ["MGP1014-C715AA"])
        self.assertEqual(L.reparaciones_superadas(sin_sha, {}, pub_publico_otro_sha), [])


if __name__ == "__main__":
    unittest.main()
