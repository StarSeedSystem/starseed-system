# -*- coding: utf-8 -*-
"""Pruebas de la regla de rescates hermanos (MGB1021B).

Caso real (2026-10-21): RTCOL1012Ae se cerró «NO APLICA: los 9 casos ya están en main» y su
hermana RTCOL1012Ad —misma rama archivada (`refs/archivo/nube/a1-20261012-114650`) y mismo
archivo de prueba— siguió UN día entero pidiendo atención. La regla: una hermana así hereda el
cierre (`sustituida`), salvo que esté en curso.
"""
import os
import sys
import time
import unittest

DIR = os.path.dirname(os.path.abspath(__file__))
if DIR not in sys.path:
    sys.path.insert(0, DIR)

import revisor_bloqueadas_logica as L  # noqa: E402

AHORA = 1792000000.0
RAMA = "nube/a1-20261012-114650"
ARCHIVOS = ("scripts/puente/test_dream_logica.py",)


def prompt_rescate(rama=RAMA, archivos=ARCHIVOS, tid="RTCOL1012Ad"):
    return (
        "ORIGEN: revisión automática de las ramas de la nube (revisar_ramas_nube.py). La tarea "
        "COL1012A («Sueños») se hizo en main por otro camino; su rama %s queda archivada en "
        "`refs/archivo/%s` y traía casos de prueba que main no tiene con ese nombre.\n\n"
        "TU TAREA (%s · solo estos archivos: %s):"
        % (rama, rama, tid, ", ".join(archivos))
    )


def rescate(tid, rama=RAMA, archivos=ARCHIVOS, **extra):
    t = {"id": tid, "titulo": "Rescate de pruebas · COL1012A", "archivos": list(archivos),
         "depende": [], "prompt": prompt_rescate(rama, archivos, tid), "origen": "revisar_ramas_nube"}
    t.update(extra)
    return t


def tareas_de(*ts):
    return {t["id"]: t for t in ts}


def foto(tareas, progreso=None, **extra):
    f = {"tareas": tareas, "colas": {"cola-x.json": list(tareas)}, "cola_viva": None,
         "progreso": progreso or {}, "asuntos": [], "fallos": {}, "memoria": {},
         "ahora": AHORA, "head": "abc1234"}
    f.update(extra)
    return f


def entrada(estado, nota="", hace_s=600):
    return {"estado": estado, "nota": nota, "t": time.strftime(
        "%Y-%m-%d %H:%M:%S", time.localtime(AHORA - hace_s))}


def acciones_de(dec, tid):
    return [a for a in dec["acciones"] if a["tid"] == tid]


class HermanaCerrada(unittest.TestCase):
    def test_hereda_el_cierre_no_aplica(self):
        # Caso real: id A1 tio a114, id A2
        tareas = tareas_de(rescate("RTCOL1012Ae"), rescate("RTCOL1012Ad"))
        prog = {"RTCOL1012Ae": entrada("no_aplica", "NO APLICA: los 9 casos ya están en main"),
                "RTCOL1012Ad": entrada("bloqueada", "te necesitan")}
        dec = L.decidir(foto(tareas, prog))
        a = acciones_de(dec, "RTCOL1012Ad")
        self.assertEqual(len(a), 1)
        self.assertEqual(a[0]["accion"], "ya_hecha")
        self.assertEqual(a[0]["datos"]["estado"], "sustituida")
        self.assertEqual(a[0]["datos"]["por"], "RTCOL1012Ae")
        self.assertIn("NO APLICA por su hermana RTCOL1012Ae", a[0]["motivo"])
        self.assertIn("los 9 casos ya están en main", a[0]["motivo"])

    def test_hereda_tambien_cuando_la_hermana_se_integro(self):
        tareas = tareas_de(rescate("RU1e"), rescate("RU1d"))
        prog = {"RU1e": entrada("commit"), "RU1d": entrada("fallo", "tsc")}
        dec = L.decidir(foto(tareas, prog))
        a = acciones_de(dec, "RU1d")
        self.assertEqual(a[0]["accion"], "ya_hecha")
        self.assertEqual(a[0]["datos"]["por"], "RU1e")
        self.assertIn("RU1e", a[0]["motivo"])

    def test_cierre_no_aplica_que_dice_la_nota(self):
        # La cerrada no lleva el estado exacto: el «NO APLICA» está en su nota.
        tareas = tareas_de(rescate("RV1e"), rescate("RV1d"))
        prog = {"RV1e": entrada("sin_cambios", "NO APLICA: main ya cubre los casos"),
                "RV1d": entrada("bloqueada", "te necesitan")}
        dec = L.decidir(foto(tareas, prog))
        self.assertEqual(acciones_de(dec, "RV1d")[0]["datos"]["por"], "RV1e")

    def test_helper_directo_devuelve_id_y_motivo(self):
        tareas = tareas_de(rescate("RX1e"), rescate("RX1d"))
        prog = {"RX1e": entrada("no_aplica", "NO APLICA: nada nuevo", 3600)}
        h = L.hermana_de_rescate("RX1d", tareas["RX1d"], tareas, prog)
        self.assertEqual(h, ("RX1e", "NO APLICA: nada nuevo"))


class NoEsHermana(unittest.TestCase):
    def test_distinta_rama_archivada(self):
        tareas = tareas_de(rescate("RW1e", rama="nube/b2-20261013-100000"),
                           rescate("RW1d"))
        prog = {"RW1e": entrada("no_aplica", "NO APLICA: nada", 3600),
                "RW1d": entrada("bloqueada", "te necesitan")}
        self.assertIsNone(L.hermana_de_rescate("RW1d", tareas["RW1d"], tareas, prog))
        self.assertFalse(acciones_de(L.decidir(foto(tareas, prog)), "RW1d"))

    def test_distintos_archivos(self):
        tareas = tareas_de(rescate("RZ1e", archivos=("a.py", "b.py", "c.py")),
                           rescate("RZ1d"))
        prog = {"RZ1e": entrada("no_aplica", "NO APLICA: nada", 3600),
                "RZ1d": entrada("bloqueada", "te necesitan")}
        self.assertIsNone(L.hermana_de_rescate("RZ1d", tareas["RZ1d"], tareas, prog))
        self.assertFalse(acciones_de(L.decidir(foto(tareas, prog)), "RZ1d"))

    def test_hermana_en_curso_no_cierra(self):
        # Triplos sin base común (RM1/RM7): solo cuenta lo que dice esta regla.
        tareas = tareas_de(rescate("RM1e"), rescate("RM7d"))
        prog = {"RM1e": entrada("en_curso", "escribiendo", 0),
                "RM7d": entrada("bloqueada", "te necesitan")}
        self.assertIsNone(L.hermana_de_rescate("RM7d", tareas["RM7d"], tareas, prog))
        self.assertFalse(acciones_de(L.decidir(foto(tareas, prog)), "RM7d"))

    def test_la_propia_en_curso_no_se_toca(self):
        tareas = tareas_de(rescate("RP1e"), rescate("RP1d"))
        prog = {"RP1e": entrada("no_aplica", "NO APLICA: nada", 3600),
                "RP1d": entrada("en_curso", "escribiendo", 0)}
        self.assertFalse(acciones_de(L.decidir(foto(tareas, prog)), "RP1d"))

    def test_que_no_sea_rescate_no_se_toca(self):
        normal = {"id": "RN1", "titulo": "normal", "archivos": list(ARCHIVOS), "depende": [],
                  "prompt": "haz cosas normales (la ref %s sale por si acaso)" % RAMA}
        tareas = tareas_de(rescate("RT1e"), normal)
        prog = {"RT1e": entrada("no_aplica", "NO APLICA: nada", 3600),
                "RN1": entrada("bloqueada", "te necesitan")}
        self.assertFalse(acciones_de(L.decidir(foto(tareas, prog)), "RN1"))


if __name__ == "__main__":
    unittest.main()
