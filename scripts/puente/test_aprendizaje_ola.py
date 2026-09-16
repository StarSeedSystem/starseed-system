# -*- coding: utf-8 -*-
"""Pruebas del destilado de aprendizaje: hechos con su número, nunca opiniones."""

import os
import sys
import unittest

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
if DIRECTORIO not in sys.path:
    sys.path.insert(0, DIRECTORIO)

import aprendizaje_ola as A


class PruebaCausa(unittest.TestCase):
    def test_el_cerrojo_gana_al_fallo_generico(self):
        # Un index.lock dentro de un mensaje de commit fallido ES un cerrojo.
        # Agruparlo como «fallo» es lo que hacía que el mismo problema pareciera
        # cinco problemas distintos cinco días seguidos.
        self.assertEqual(
            A.causa_de("commit: ...index.lock... a git process may have crashed", "fallo"),
            "cerrojo de git",
        )

    def test_reconoce_las_familias_habituales(self):
        self.assertEqual(A.causa_de("alcance incompleto: faltan x.test.ts"), "se quedó sin alcance")
        self.assertEqual(A.causa_de("", "sin_cambios"), "no escribió nada")
        self.assertEqual(A.causa_de("", "fallo_tsc"), "los tipos no compilan")
        self.assertEqual(A.causa_de("vitest sigue fallando"), "pruebas en rojo")
        self.assertEqual(A.causa_de("HTTP 402 sin cupo"), "el proveedor dijo que no")
        self.assertEqual(A.causa_de("se pasó de 300 s"), "se colgó")

    def test_lo_que_no_encaja_no_se_inventa(self):
        self.assertEqual(A.causa_de("pasó algo rarísimo"), "otra cosa")


def prog(**kw):
    return {k: v for k, v in kw.items()}


class PruebaResumen(unittest.TestCase):
    def setUp(self):
        self.tareas = [{"id": t} for t in ("A1", "A2", "A3", "A4")]

    def test_cuenta_dentro_y_fuera(self):
        r = A.resumir_ola(
            "325-x",
            self.tareas,
            prog(
                A1={"estado": "commit", "modelo": "kimi"},
                A2={"estado": "hecho", "modelo": "kimi"},
                A3={"estado": "fallo", "modelo": "glm", "nota": "index.lock"},
                A4={"estado": "rechazada", "modelo": "glm", "nota": "revisión bloqueante"},
            ),
        )
        self.assertEqual(len(r["dentro"]), 2)
        self.assertEqual(len(r["fuera"]), 2)
        self.assertEqual(r["por_modelo"]["kimi"], {"dentro": 2, "fuera": 0})
        self.assertEqual(r["por_modelo"]["glm"], {"dentro": 0, "fuera": 2})

    def test_una_tarea_sin_entrada_en_progreso_cuenta_como_fuera(self):
        r = A.resumir_ola("325-x", [{"id": "Z9"}], {})
        self.assertEqual(r["dentro"], [])
        self.assertEqual(r["fuera"][0]["causa"], "otra cosa")


    def test_el_guion_del_orquestador_no_es_un_modelo(self):
        # El orquestador escribe «-» cuando la tarea murió antes de elegir
        # modelo. Contarlo como nombre daba «- no integró ninguna de sus 4».
        r = A.resumir_ola(
            "325-x",
            [{"id": "A1"}, {"id": "A2"}],
            prog(A1={"estado": "fallo", "modelo": "-"}, A2={"estado": "fallo", "modelo": ""}),
        )
        self.assertIn("sin modelo anotado", r["por_modelo"])
        self.assertNotIn("-", r["por_modelo"])
        self.assertEqual(r["por_modelo"]["sin modelo anotado"]["fuera"], 2)

    def test_sin_tareas_no_revienta(self):
        r = A.resumir_ola("vacia", [], {})
        self.assertEqual(r["total"], 0)
        self.assertEqual(A.observaciones(r), [])


class PruebaObservaciones(unittest.TestCase):
    def test_una_causa_repetida_se_nombra_con_su_porcentaje(self):
        r = A.resumir_ola(
            "325-x",
            [{"id": t} for t in ("A1", "A2", "A3", "A4")],
            prog(
                A1={"estado": "fallo", "nota": "index.lock"},
                A2={"estado": "fallo", "nota": "index.lock"},
                A3={"estado": "commit"},
                A4={"estado": "commit"},
            ),
        )
        texto = " ".join(A.observaciones(r))
        self.assertIn("cerrojo de git", texto)
        self.assertIn("50 %", texto)

    def test_un_caso_suelto_no_se_convierte_en_regla(self):
        r = A.resumir_ola(
            "325-x",
            [{"id": "A1"}, {"id": "A2"}],
            prog(A1={"estado": "fallo", "nota": "index.lock"}, A2={"estado": "commit"}),
        )
        self.assertEqual([o for o in A.observaciones(r) if "cerrojo" in o], [])

    def test_se_dice_quien_no_integro_nada_y_quien_no_fallo_ninguna(self):
        r = A.resumir_ola(
            "325-x",
            [{"id": t} for t in ("A1", "A2", "A3", "A4")],
            prog(
                A1={"estado": "fallo", "modelo": "glm", "nota": "x"},
                A2={"estado": "fallo", "modelo": "glm", "nota": "y"},
                A3={"estado": "commit", "modelo": "kimi"},
                A4={"estado": "commit", "modelo": "kimi"},
            ),
        )
        texto = " ".join(A.observaciones(r))
        self.assertIn("glm no integró ninguna de sus 2 tareas", texto)
        self.assertIn("kimi integró 2 tareas sin fallar una", texto)


class PruebaEntrada(unittest.TestCase):
    def test_la_seccion_lleva_fecha_ola_resultado_y_cada_fallo(self):
        r = A.resumir_ola(
            "325-panorama",
            [{"id": "PS1"}, {"id": "PS2"}],
            prog(PS1={"estado": "commit"}, PS2={"estado": "fallo", "nota": "index.lock aquí"}),
        )
        t = A.entrada(r, "2026-09-16", pedido="La pestaña Panorama Sociocultural.")
        self.assertIn("## 2026-09-16 · 325-panorama", t)
        self.assertIn("1 de 2 integradas", t)
        self.assertIn("`PS2` — cerrojo de git", t)
        self.assertIn("Panorama Sociocultural", t)
        self.assertTrue(t.endswith("\n"))

    def test_una_ola_limpia_no_llena_de_ruido(self):
        r = A.resumir_ola("326-x", [{"id": "A1"}], prog(A1={"estado": "commit"}))
        t = A.entrada(r, "2026-09-16")
        self.assertIn("1 de 1 integradas", t)
        self.assertNotIn("quedó fuera", t)

    def test_las_notas_humanas_se_conservan(self):
        r = A.resumir_ola("326-x", [{"id": "A1"}], prog(A1={"estado": "commit"}))
        t = A.entrada(r, "2026-09-16", notas_humanas=["Alex pidió no tocar /network."])
        self.assertIn("Alex pidió no tocar /network.", t)


if __name__ == "__main__":
    unittest.main()
