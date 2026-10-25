# -*- coding: utf-8 -*-
"""Hermanas de rescate: si una ya cerró como NO APLICA o integrada, la otra hereda el cierre.

Caso real (2026-10-21): RTCOL1012Ae se cerró «NO APLICA: los 9 casos ya están en main» el 20-10
y su hermana RTCOL1012Ad —misma rama archivada y mismo archivo de prueba— siguió un día en
«te necesitan», pidiendo a Alex lo que su hermana ya había respondido.
"""
import os
import sys
import unittest

DIR = os.path.dirname(os.path.abspath(__file__))
if DIR not in sys.path:
    sys.path.insert(0, DIR)

import revisor_bloqueadas_logica as L  # noqa: E402

AHORA = 1800000000.0
RAMA = "nube/a1-20261012-114650"
ARCHIVOS = ["src/lib/__tests__/col-1012.test.ts"]
PREFIJO = "ORIGEN: revisión automática de las ramas de la nube (revisar_ramas_nube.py)."


def rescate(tid, rama=RAMA, archivos=None):
    archivos = list(ARCHIVOS if archivos is None else archivos)
    return {
        "id": tid,
        "titulo": "Rescate de pruebas · COL1012A",
        "archivos": archivos,
        "depende": [],
        "prompt": "%s La rama queda archivada en `refs/archivo/%s` y traía casos de prueba."
                  % (PREFIJO, rama),
    }


def foto(tareas, progreso):
    por_id = {t["id"]: t for t in tareas}
    return {
        "tareas": por_id,
        "colas": {"cola-x.json": list(por_id)},
        "cola_viva": None,
        "progreso": progreso,
        "asuntos": [],
        "fallos": {},
        "memoria": {},
        "ahora": AHORA,
    }


def acciones_de(dec, tid):
    return [a for a in dec["acciones"] if a["tid"] == tid]


class HermanasDeRescate(unittest.TestCase):
    def test_rescate_de_lee_la_rama_archivada(self):
        self.assertEqual(L.rescate_de(rescate("RTX1")), (RAMA, ARCHIVOS))
        self.assertIsNone(L.rescate_de({"id": "X1", "archivos": ARCHIVOS, "prompt": "haz X1"}))
        self.assertIsNone(L.rescate_de({"id": "RTX1", "archivos": [], "prompt": PREFIJO}))

    def test_hermana_no_aplica_herencia_el_cierre(self):
        tareas = [rescate("RTCOL1012Ae"), rescate("RTCOL1012Ad")]
        prog = {
            "RTCOL1012Ae": {"estado": "sustituida", "nota": "revisor: NO APLICA: los 9 casos ya están en main"},
            "RTCOL1012Ad": {"estado": "bloqueante", "nota": "pedir_a_alex", "t": AHORA - 3600},
        }
        self.assertEqual(L.hermana_cerrada("RTCOL1012Ad", {t["id"]: t for t in tareas}, prog),
                         ("RTCOL1012Ae", "los 9 casos ya están en main"))
        dec = L.decidir(foto(tareas, prog))
        accion = acciones_de(dec, "RTCOL1012Ad")[0]
        self.assertEqual(accion["accion"], "ya_hecha")
        self.assertEqual(accion["datos"]["estado"], "sustituida")
        self.assertEqual(accion["datos"]["por"], "RTCOL1012Ae")
        self.assertEqual(accion["motivo"],
                         "NO APLICA por su hermana RTCOL1012Ae: los 9 casos ya están en main")

    def test_hermana_integrada_tambien_cierra(self):
        tareas = [rescate("RTCOL1012Ae"), rescate("RTCOL1012Ad")]
        prog = {"RTCOL1012Ae": {"estado": "integrada"}, "RTCOL1012Ad": {"estado": "pendiente"}}
        dec = L.decidir(foto(tareas, prog))
        accion = acciones_de(dec, "RTCOL1012Ad")[0]
        self.assertEqual(accion["accion"], "ya_hecha")
        self.assertEqual(accion["motivo"], "NO APLICA por su hermana RTCOL1012Ae: integrada en main")

    def test_distinta_rama_no_hereda(self):
        tareas = [rescate("RTCOL1012Ae", rama="nube/otra-rama"), rescate("RTCOL1012Ad")]
        prog = {"RTCOL1012Ae": {"estado": "sustituida", "nota": "NO APLICA: ya estaba"},
                "RTCOL1012Ad": {"estado": "pendiente"}}
        self.assertIsNone(L.hermana_cerrada("RTCOL1012Ad", {t["id"]: t for t in tareas}, prog))
        self.assertEqual(acciones_de(L.decidir(foto(tareas, prog)), "RTCOL1012Ad"), [])

    def test_distintos_archivos_no_hereda(self):
        tareas = [rescate("RTCOL1012Ae", archivos=["src/lib/__tests__/otra.test.ts"]),
                  rescate("RTCOL1012Ad")]
        prog = {"RTCOL1012Ae": {"estado": "sustituida", "nota": "NO APLICA: ya estaba"},
                "RTCOL1012Ad": {"estado": "pendiente"}}
        self.assertIsNone(L.hermana_cerrada("RTCOL1012Ad", {t["id"]: t for t in tareas}, prog))
        self.assertEqual(acciones_de(L.decidir(foto(tareas, prog)), "RTCOL1012Ad"), [])

    def test_en_curso_no_hereda_nada(self):
        tareas = [rescate("RTCOL1012Ae"), rescate("RTCOL1012Ad")]
        prog = {"RTCOL1012Ae": {"estado": "sustituida", "nota": "NO APLICA: ya estaba"},
                "RTCOL1012Ad": {"estado": "en_curso"}}
        self.assertIsNone(L.hermana_cerrada("RTCOL1012Ad", {t["id"]: t for t in tareas}, prog))
        prog["RTCOL1012Ad"] = {"estado": "pendiente"}
        prog["RTCOL1012Ae"] = {"estado": "en_curso"}
        self.assertIsNone(L.hermana_cerrada("RTCOL1012Ad", {t["id"]: t for t in tareas}, prog))

    def test_tarea_normal_no_es_rescate(self):
        normal = {"id": "COL1012A", "archivos": list(ARCHIVOS), "prompt": "haz COL1012A"}
        tareas = [normal, rescate("RTCOL1012Ad")]
        prog = {"COL1012A": {"estado": "sustituida", "nota": "NO APLICA: ya estaba"},
                "RTCOL1012Ad": {"estado": "pendiente"}}
        self.assertIsNone(L.hermana_cerrada("RTCOL1012Ad", {t["id"]: t for t in tareas}, prog))


if __name__ == "__main__":
    unittest.main()
