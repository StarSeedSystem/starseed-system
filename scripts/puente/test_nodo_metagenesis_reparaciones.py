# -*- coding: utf-8 -*-
"""MGB1021Ab · las reparaciones de una puerta en rojo se cierran solas cuando vuelve a verde."""
import json
import os
import sys
import tempfile
import unittest

DIR = os.path.dirname(os.path.abspath(__file__))
if DIR not in sys.path:
    sys.path.insert(0, DIR)

import nodo_metagenesis as N  # noqa: E402
import nodo_metagenesis_logica as L  # noqa: E402

T0 = 1_791_640_000.0
TITULO = "Puerta de publicación en rojo: pruebas del puente en rojo"
SHA_ROJO = "5fe1a51da1234"
SHA_NUEVO = "f5cc8f4ff5678"


def tarea(tid, titulo=TITULO, origen="metagenesis", sha_rojo=SHA_ROJO, prompt=None, **mas):
    t = {"id": tid, "titulo": titulo, "origen": origen,
         "prompt": prompt if prompt is not None else (
             "NOTA: la autopublicación lleva 60 min frenada en %s por «pruebas»." % (sha_rojo or SHA_ROJO))}
    if sha_rojo:
        t["sha_rojo"] = sha_rojo
    t.update(mas)
    return t


def verde(sha=SHA_NUEVO, fase="publicado"):
    return {"fase": fase, "sha": sha}


def roja(sha=SHA_ROJO):
    return {"fase": "bloqueado", "sha": sha}


def nodo_falso(modo="real"):
    dichos = []
    n = N.Nodo(seco=(modo == "seco"), env={}, medir=lambda m, t: {}, ejecutar=lambda *a, **k: ("hecha", ""),
               http=lambda *a, **k: (0, ""), reloj=lambda: T0,
               memoria={"hecho": {}, "nonces": {}, "decisiones": [], "autonomia": True},
               persistir=False, huella="huella-prueba", chat=dichos.append)
    return n, dichos


class TestReparacionesSuperadas(unittest.TestCase):
    def test_verde_cierra_la_cadena_entera(self):
        tareas = [tarea("MGP1014-C715AA"), tarea("MGP1014-C715AA-d1b", sha_rojo=""),
                  tarea("MGP1014-C715AA-d2d", sha_rojo=""),
                  tarea("MGP1015-B2E850", titulo="arreglar la pureza"), tarea("X-1", origen="usuario")]
        progreso = {"MGP1014-C715AA": {"estado": "fallo"}, "MGP1014-C715AA-d1b": {"estado": "pendiente"},
                    "MGP1014-C715AA-d2d": {"estado": "bloqueada"}, "MGP1014-C715AA-d3": {"estado": "pendiente"}}
        self.assertEqual([tid for tid, _ in L.reparaciones_superadas(tareas, progreso, verde())],
                         ["MGP1014-C715AA", "MGP1014-C715AA-d1b", "MGP1014-C715AA-d2d", "MGP1014-C715AA-d3"])

    def test_roja_con_el_mismo_sha_no_cierra_nada(self):
        tareas = [tarea("MGP1014-C715AA"), tarea("MGP1014-C715AA-d1b", sha_rojo="")]
        progreso = {"MGP1014-C715AA": {"estado": "fallo"}, "MGP1014-C715AA-d1b": {"estado": "pendiente"}}
        self.assertEqual(L.reparaciones_superadas(tareas, progreso, roja()), [])
        self.assertEqual(L.reparaciones_superadas(tareas, progreso, roja("5fe1a51da123")), [])

    def test_ya_cerradas_no_se_tocan(self):
        tareas = [tarea("MGP1014-C715AA"), tarea("MGP1014-C715AA-d1b", sha_rojo="")]
        progreso = {"MGP1014-C715AA": {"estado": "integrada", "nota": "ya"},
                    "MGP1014-C715AA-d1b": {"estado": "sustituida", "nota": "antes"}}
        self.assertEqual(L.reparaciones_superadas(tareas, progreso, verde()), [])

    def test_verde_por_sha_distinto_y_nota(self):
        cierres = L.reparaciones_superadas([tarea("MGP1014-C715AA", sha_rojo="")],
                                           {"MGP1014-C715AA": {"estado": "pendiente"}}, roja(SHA_NUEVO))
        self.assertEqual(cierres[0][1], "NO APLICA: la puerta de publicación volvió a verde (publicado %s)"
                         % SHA_NUEVO[:12])
        self.assertEqual(L.reparaciones_superadas([tarea("MGP1014-C715AA", sha_rojo="", prompt="")], {}, roja()), [])
        self.assertEqual(L.reparaciones_superadas([tarea("MGP1014-C715AA")], {}, {}), [])

    def test_tarea_de_reparacion_guarda_el_sha_rojo(self):
        pub = {"detalle": "pruebas del puente en rojo",
               "evidencia": {"sha": SHA_ROJO, "motivo": "pruebas", "texto": "FAIL"}}
        t = L.tarea_de_reparacion(pub, ["scripts/puente/test_x.py"], T0)
        self.assertIsNotNone(t)
        assert t is not None
        self.assertEqual(t["sha_rojo"], SHA_ROJO)
        self.assertTrue(t["titulo"].startswith("Puerta de publicación en rojo"))


class TestCierreEnProgreso(unittest.TestCase):
    def test_cierra_con_cerrojo_sin_borrar_y_lo_dice_una_vez(self):
        raiz = tempfile.mkdtemp()
        olas = os.path.join(raiz, "starseed_memory_root", "olas")
        os.makedirs(olas)
        ruta = os.path.join(olas, "progreso.json")
        progreso = {"MGP1014-C715AA": {"estado": "fallo", "modelo": "gratis", "nota": "la cadena vieja"},
                    "MGP1014-C715AA-d1b": {"estado": "bloqueada"}, "OTRA-1": {"estado": "pendiente"}}
        with open(ruta, "w", encoding="utf-8") as f:
            json.dump(progreso, f, ensure_ascii=False)
        with open(os.path.join(olas, "cola-metagenesis-20261021.json"), "w", encoding="utf-8") as f:
            json.dump([tarea("MGP1014-C715AA"), tarea("MGP1014-C715AA-d1b", sha_rojo="")], f)
        falso, dichos = nodo_falso()
        informe = {"acciones": []}
        N.Nodo._cerrar_reparaciones(falso, raiz, verde(), informe, T0)
        with open(ruta, encoding="utf-8") as f:
            despues = json.load(f)
        self.assertEqual(despues["MGP1014-C715AA"]["estado"], "sustituida")
        self.assertEqual(despues["MGP1014-C715AA"]["modelo"], "gratis")
        self.assertIn("NO APLICA", despues["MGP1014-C715AA"]["nota"])
        self.assertEqual(despues["MGP1014-C715AA-d1b"]["estado"], "sustituida")
        self.assertEqual(despues["OTRA-1"], progreso["OTRA-1"])
        self.assertEqual(len(dichos), 1)
        self.assertEqual(informe["acciones"][-1]["accion"], "cerrar_reparaciones")
        N.Nodo._cerrar_reparaciones(falso, raiz, verde(), informe, T0 + 120)
        self.assertEqual(len(dichos), 1)


if __name__ == "__main__":
    unittest.main()
