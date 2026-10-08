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

    def test_ola_cerrada_no_se_reabre_para_morir_huerfana(self):
        # (2026-10-08) 10 de 34 reabiertas murieron al momento como «huérfanas».
        prog = {"JV8": {"estado": "bloqueante", "nota": "(libre×8)"}, "JV8b": {"estado": "commit"},
                "FLU1005H": {"estado": "bloqueante", "nota": "(libre×8)"}, "FLU1005Hb": {"estado": "sustituida"},
                "RM3": {"estado": "bloqueante", "nota": "(libre×8)"}}
        corr, inf, _ = R.recomprobar(prog, {}, [], AHORA, {}, jev=lambda c, t: {}, fuentes={"RM3"})
        self.assertEqual(corr["JV8"]["estado"], "sustituida")
        self.assertIn("JV8b", corr["JV8"]["nota"])
        self.assertNotIn("FLU1005H", corr)
        self.assertTrue(any(s["id"] == "FLU1005H" and "ola está cerrada" in s["motivo"] for s in inf["siguen"]))
        self.assertEqual(corr["RM3"]["estado"], "pendiente")

    def test_resumen_dice_cuantas(self):
        _, inf, _ = R.recomprobar(self.progreso(), TAREAS, ASUNTOS, AHORA, {}, jev=lambda c, t: {})
        texto = R.resumen(inf)
        self.assertIn("4 bloqueadas recomprobadas", texto)
        self.assertIn("1 ya estaban en main (AGR2c)", texto)


class Borrar(unittest.TestCase):
    """(2026-10-08) «pon uno para borrarlas, antes revisa que no sean reaplicables»."""

    def test_borra_solo_lo_que_no_se_puede_reaplicar(self):
        prog = {
            "MAL": {"estado": "bloqueada", "nota": "no toco NINGUNO de los 2 archivos"},
            "MEDIO": {"estado": "bloqueante", "nota": "(libre×8)"},
            "HOY": {"estado": "bloqueante", "nota": "(libre×8)"},
            "HIJA": {"estado": "pendiente"},       # espera a MAL, que se borra
            "NIETA": {"estado": "pendiente"},      # espera a HIJA: cae en cascada
            "VIVA": {"estado": "pendiente"},       # espera a MEDIO, que vuelve a la cola
            "NUEVA": {"estado": "pendiente"},      # espera a D1b, recién definida y sin empezar
            "D1": {"estado": "rechazada"},
        }
        tareas = {"HIJA": {"depende": ["MAL"]}, "NIETA": {"depende": ["HIJA"]},
                  "VIVA": {"depende": ["MEDIO"]}, "NUEVA": {"depende": ["D1b"]}}
        _, inf, _ = R.recomprobar(prog, tareas, [], AHORA, {"HOY": AHORA - 3600}, jev=lambda c, t: {})
        borrar, quedan = R.borrables(prog, tareas, [], inf, {"MAL", "MEDIO", "HOY", "HIJA", "NIETA", "VIVA", "NUEVA"},
                                     definidas={"D1b"})
        self.assertEqual(sorted(borrar), ["HIJA", "MAL", "NIETA"])
        self.assertIn("MAL", borrar["HIJA"])
        self.assertEqual(sorted(quedan), ["HOY", "MEDIO", "NUEVA", "VIVA"])

    def test_una_dependencia_rechazada_con_sucesora_viva_no_mata(self):
        prog = {"A": {"estado": "rechazada"}, "Ab": {"estado": "pendiente"}, "B": {"estado": "pendiente"},
                "C": {"estado": "pendiente"}}
        tareas = {"B": {"depende": ["A"]}, "C": {"depende": ["Z"]}}
        inf = {"integradas": [], "sustituidas": [], "reabiertas": [], "siguen": []}
        borrar, quedan = R.borrables(prog, tareas, [], inf, {"B", "C"})
        self.assertEqual(list(borrar), ["C"])  # Z no existe en ninguna parte
        self.assertIn("B", quedan)

    def test_resumen_de_borrado(self):
        inf = {"integradas": [], "sustituidas": [], "reabiertas": ["R"], "siguen": [],
               "borradas": [{"id": "X", "motivo": "m"}], "quedan": [{"id": "R", "motivo": "m"}]}
        texto = R.resumen(inf)
        self.assertIn("Borré 1 que no se pueden reaplicar (X)", texto)
        self.assertIn("1 se quedan porque sí se pueden reaplicar", texto)


class ColaDeSuenos(unittest.TestCase):
    def test_una_reabierta_que_solo_vive_en_suenos_pasa_a_una_cola_de_codigo(self):
        import json
        import tempfile
        with tempfile.TemporaryDirectory() as d:
            antes = R.OLAS
            R.OLAS = d
            try:
                with open(os.path.join(d, "cola-suenos-ola1.json"), "w") as f:
                    json.dump([{"id": "TK1c", "titulo": "t"}], f)
                with open(os.path.join(d, "cola-otra.json"), "w") as f:
                    json.dump([{"id": "RM3", "titulo": "r"}], f)
                codigo = R.ids_de_colas_de_codigo(d)
                self.assertEqual(codigo, {"RM3"})
                ruta = R.encolar_para_codigo(["TK1c", "RM3"], {"TK1c": {"id": "TK1c", "titulo": "t", "estado": "x"},
                                                              "RM3": {"id": "RM3"}}, codigo, AHORA)
                self.assertTrue(os.path.basename(ruta).startswith("cola-recomprobadas-"))
                with open(ruta) as f:
                    self.assertEqual(json.load(f), [{"id": "TK1c", "titulo": "t"}])
                self.assertIsNone(R.encolar_para_codigo(["RM3"], {"RM3": {"id": "RM3"}}, codigo, AHORA))
            finally:
                R.OLAS = antes


if __name__ == "__main__":
    unittest.main()
