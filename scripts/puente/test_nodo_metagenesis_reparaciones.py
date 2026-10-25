# -*- coding: utf-8 -*-
"""Pruebas PURAS del cierre de reparaciones superadas (MGB1021B).

Caso real (2026-10-21): la puerta de publicación volvió a verde cuando otra tarea arregló la
causa (MGP1015-B2E850), pero la cadena MGP1014-C715AA-d1…d3 siguió reintentándose una semana
hasta quedar «sin salida». Lo que se prueba: verde cierra la cadena ENTRE sucesoras; roja con
el MISMO sha no cierra nada; lo ya cerrado no se toca. Sin red, sin procesos, sin disco.
"""
import unittest
import sys
import os

DIR = os.path.dirname(os.path.abspath(__file__))
if DIR not in sys.path:
    sys.path.insert(0, DIR)

import nodo_metagenesis_logica as L  # noqa: E402

T = "Puerta de publicación en rojo: pureza de astraura-bots"


def reparacion(tid: str, sha_rojo: str = "a4b1c2d3", titulo: str = T, con_sha: bool = True) -> dict:
    prompt = ("NOTA DE METAGENESIS: la autopublicación lleva más de 60 min frenada en %s por "
              "«pureza de astraura-bots»" % sha_rojo)
    return {"id": tid, "origen": "metagenesis", "titulo": titulo,
            "prompt": prompt if con_sha else prompt.replace(sha_rojo, "×××××××")}


class TestReparacionesSuperadas(unittest.TestCase):
    def setUp(self) -> None:
        # El caso real: toda la cadena guardó EL MISMO sha rojo (el CI siguió rojo sin cambiar de sha).
        self.cadena = [
            reparacion("MGP1014-C715AA"),
            reparacion("MGP1014-C715AA-d1b"),
            reparacion("MGP1014-C715AA-d2d"),
            reparacion("MGP1014-C715AA-d3"),
            {"id": "MGP1014-X99999", "origen": "metagenesis", "titulo": "Otra reparación", "prompt": "sin puerta"},
        ]
        self.progreso = {"MGP1014-C715AA": {"estado": "fallo_tsc"},
                         "MGP1014-C715AA-d1b": {"estado": "pendiente"},
                         "MGP1014-C715AA-d2d": {"estado": "pendiente"},
                         "MGP1014-X99999": {"estado": "sustituida"}}

    def test_verde_por_fase_cierra_la_cadena_entera(self) -> None:
        """La puerta en verde (fase publicada) cierra la reparación y TODAS sus sucesoras."""
        pub = {"fase": "publicada", "sha": "f5cc8f4ff", "sin_publicar": 0}
        salida = L.reparaciones_superadas(self.cadena, self.progreso, pub)
        ids = [tid for tid, _ in salida]
        self.assertEqual(ids, ["MGP1014-C715AA", "MGP1014-C715AA-d1b", "MGP1014-C715AA-d2d",
                               "MGP1014-C715AA-d3"])
        for tid, nota in salida:
            self.assertTrue(nota.startswith("NO APLICA: la puerta de publicación volvió a verde"), nota)
        self.assertNotIn("MGP1014-X99999", ids)  # ajena a la puerta: no se toca

    def test_verde_por_sha_distinto_cierra_la_cadena(self) -> None:
        """Roja de fase, pero ya se PUBLICÓ un sha distinto del que guardó la cadena: su caso pasó."""
        pubs = {"fase": "bloqueado", "sha": "f5cc8f4ff", "sin_publicar": 0}
        salida = L.reparaciones_superadas(self.cadena, self.progreso, pubs)
        self.assertEqual({tid for tid, _ in salida}, {
            "MGP1014-C715AA", "MGP1014-C715AA-d1b", "MGP1014-C715AA-d2d", "MGP1014-C715AA-d3"})
        self.assertIn("publicado f5cc8f4ff", dict(salida)["MGP1014-C715AA"])

    def test_sin_mudanza_de_sha_y_roja_no_cierra_la_nueva(self) -> None:
        """El sha publicado ES el rojo de esa tarea: la suya sigue mandando y no se cierra."""
        nueva = reparacion("MGP1014-C715AA-d4", "0e1f2a3b")
        progreso = {"MGP1014-C715AA-d4": {"estado": "pendiente"}}
        pubs = {"fase": "bloqueado", "sha": "0e1f2a3b", "sin_publicar": 2}
        self.assertEqual(L.reparaciones_superadas([nueva], progreso, pubs), [])

    def test_roja_con_el_mismo_sha_no_cierra_nada(self) -> None:
        """La puerta sigue roja por el MISMO sha que guardó toda la cadena: la reparación manda."""
        pub = {"fase": "bloqueado", "sha": "a4b1c2d3", "sin_publicar": 5,
               "detalle": "CI en rojo · espero a que llegue"}
        self.assertEqual(L.reparaciones_superadas(self.cadena, self.progreso, pub), [])
        pub["detalle"] = "pruebas del puente en rojo"
        self.assertEqual(L.reparaciones_superadas(self.cadena, self.progreso, pub), [])

    def test_lo_ya_cerrado_no_se_toca(self) -> None:
        """Estados de CERRADAS no salen nunca, ni con la puerta en verde."""
        progreso = {tid: {"estado": est} for tid, est in (
            ("MGP1014-C715AA", "hecho"), ("MGP1014-C715AA-d1b", "integrada"),
            ("MGP1014-C715AA-d2d", "sustituida"), ("MGP1014-C715AA-d3", "rechazada"))}
        pub = {"fase": "publicada", "sha": "f5cc8f4ff", "sin_publicar": 0}
        self.assertEqual(L.reparaciones_superadas(self.cadena, progreso, pub), [])

    def test_sin_prompt_con_sha_y_puerta_seca_no_cierra_por_sha(self) -> None:
        """Sin rastro del sha rojo legible y puerta roja: nada se cierra por adivinar."""
        tarea = reparacion("MGP1014-C715AA", con_sha=False)
        progreso = {"MGP1014-C715AA": {"estado": "pendiente"}}
        self.assertEqual(L.reparaciones_superadas(
            [tarea], progreso, {"fase": "bloqueado", "sha": "aaabbbccc", "sin_publicar": 1}), [])

    def test_ignora_lo_que_no_es_reparacion_de_metagenesis(self) -> None:
        """Otro origen u otro título no entra jamás, aunque el ojo diga que parece de la puerta."""
        ajenas = [{"id": "OL1010A", "origen": "usuario", "titulo": T, "prompt": "frenada en a4b1c2d3 por x"},
                  {"id": "OL1010B", "origen": "metagenesis", "titulo": "Cuidado de la voz", "prompt": "x"}]
        progreso = {"OL1010A": {"estado": "pendiente"}, "OL1010B": {"estado": "pendiente"}}
        self.assertEqual(L.reparaciones_superadas(
            ajenas, progreso, {"fase": "publicada", "sha": "a4b1c2d3"}), [])


if __name__ == "__main__":
    unittest.main()
