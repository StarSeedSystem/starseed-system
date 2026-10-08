#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas de la recomprobación de bloqueadas (sin git, sin Jev real, sin archivos de la casa)."""
import os
import sys
import time
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import recomprobar_bloqueadas as R  # noqa: E402

AHORA = time.mktime(time.strptime("2026-10-08 12:00:00", "%Y-%m-%d %H:%M:%S"))
ASUNTOS = [
    "Ola 334 · Agregador de APIs · AGR2c: La ruta que recibe una clave",
    "salvavidas · RM3: trabajo del agente antes de las puertas (tsc / vitest)",
]
TAREAS = {"AGR2c": {"id": "AGR2c", "ola": "Ola 334 · Agregador de APIs", "titulo": "La ruta"},
          "RM3": {"id": "RM3", "ola": "Ola 330 · Radar", "titulo": "Radar de memoria"}}


class Clasificar(unittest.TestCase):
    def test_ya_en_main_se_cierra_como_commit(self):
        d, _ = R.clasificar("AGR2c", {"nota": "escalada agotada (libre×8)"}, TAREAS["AGR2c"], ASUNTOS, AHORA)
        self.assertEqual(d, "commit")

    def test_un_salvavidas_no_cuenta_como_integrada(self):
        d, _ = R.clasificar("RM3", {"nota": "director: escalada agotada tras 8 intentos (libre×8)"},
                            TAREAS["RM3"], ASUNTOS, AHORA)
        self.assertEqual(d, "reabrir")

    def test_la_nube_sin_cambios_es_fallo_del_medio(self):
        nota = "la nube la intentó 3 veces sin integrarla · la nube dijo «sin_cambios»."
        self.assertEqual(R.clasificar("X1", {"nota": nota}, None, [], AHORA)[0], "reabrir")

    def test_no_tocar_sus_archivos_es_fallo_de_la_tarea(self):
        nota = "la nube la intentó 82 veces · la nube dijo «rechazada»: no toco NINGUNO de los 2 archivos"
        d, motivo = R.clasificar("CU3br", {"nota": nota}, None, [], AHORA)
        self.assertEqual(d, "sigue")
        self.assertIn("propia tarea", motivo)

    def test_sin_causa_clara_no_se_toca(self):
        self.assertEqual(R.clasificar("Y", {"nota": "algo raro"}, None, [], AHORA)[0], "sigue")

    def test_una_vez_cada_24_h(self):
        d, _ = R.clasificar("RM3", {"nota": "(libre×8)"}, None, [], AHORA, ultima_reapertura=AHORA - 3600)
        self.assertEqual(d, "sigue")


class Recomprobar(unittest.TestCase):
    def progreso(self):
        return {
            "AGR2c": {"estado": "bloqueante", "nota": "escalada agotada (libre×8)", "t": "2026-09-22 16:21:00"},
            "RM3": {"estado": "bloqueante", "nota": "escalada agotada (libre×8)", "t": "2026-09-22 16:21:00"},
            "RM4": {"estado": "bloqueante", "nota": "escalada agotada (libre×8)", "t": "2026-10-08 10:00:00"},
            "CU3br": {"estado": "bloqueada", "nota": "no toco NINGUNO de los 2 archivos"},
            "OK1": {"estado": "commit"},
        }

    def test_decide_cada_una_y_no_toca_lo_demas(self):
        corr, inf, mem = R.recomprobar(self.progreso(), TAREAS, ASUNTOS, AHORA, {}, jev=lambda c, t: {})
        self.assertEqual(corr["AGR2c"]["estado"], "commit")
        self.assertEqual(corr["RM3"]["estado"], "pendiente")
        self.assertEqual(corr["RM3"]["medio"], "mac")
        self.assertNotIn("CU3br", corr)
        self.assertNotIn("OK1", corr)
        self.assertEqual(inf["total"], 4)
        self.assertEqual(sorted(inf["reabiertas"]), ["RM3", "RM4"])
        self.assertIn("RM3", mem)

    def test_jev_solo_opina_de_las_viejas_y_solo_frena_con_certeza(self):
        vistas = []

        def jev(candidatas, titulos):
            vistas.extend(candidatas)
            return {"RM3": 0.95}

        corr, inf, _ = R.recomprobar(self.progreso(), TAREAS, ASUNTOS, AHORA, {}, jev=jev)
        self.assertEqual(vistas, ["RM3"])  # RM4 es de hoy
        self.assertNotIn("RM3", corr)
        self.assertTrue(any(s["id"] == "RM3" and "Jev" in s["motivo"] for s in inf["siguen"]))
        corr, _, _ = R.recomprobar(self.progreso(), TAREAS, ASUNTOS, AHORA, {}, jev=lambda c, t: {"RM3": 0.85})
        self.assertEqual(corr["RM3"]["estado"], "pendiente")

    def test_resumen_dice_cuantas(self):
        _, inf, _ = R.recomprobar(self.progreso(), TAREAS, ASUNTOS, AHORA, {}, jev=lambda c, t: {})
        texto = R.resumen(inf)
        self.assertIn("4 bloqueadas recomprobadas", texto)
        self.assertIn("1 ya estaban en main (AGR2c)", texto)


if __name__ == "__main__":
    unittest.main()
