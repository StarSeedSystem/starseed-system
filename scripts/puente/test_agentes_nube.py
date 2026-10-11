# -*- coding: utf-8 -*-
"""El lector de agentes de la nube: contar, y sobre todo NO borrar lo que hace contar."""
import time
import unittest

import agentes_nube as AN


class Contar(unittest.TestCase):
    def test_solo_cuentan_los_runs_vivos(self):
        runs = [
            {"databaseId": 1, "status": "in_progress", "inputs": {"trabajadores": "4"}},
            {"databaseId": 2, "status": "completed", "inputs": {"trabajadores": "4"}},
            {"databaseId": 3, "status": "queued", "inputs": {"trabajadores": "3"}},
        ]
        d = AN.resumir(runs, time.time())
        self.assertEqual(d["agentes"], 7)
        self.assertEqual(len(d["runs"]), 2)

    def test_sin_inputs_legibles_cuenta_uno_no_tres(self):
        # Quedarse corto antes que mentir hacia arriba.
        self.assertEqual(AN.trabajadores_de(None), 1)
        self.assertEqual(AN.trabajadores_de({"trabajadores": "ni idea"}), 1)
        self.assertEqual(AN.trabajadores_de({"trabajadores": "4"}), 4)


class NoBorrarLosLanzamientos(unittest.TestCase):
    """La regresión del 22: medir borraba la anotación que dice cuántos agentes hay.

    `resumir()` no sabe nada de lanzamientos. Si su salida se escribe a pelo en el bus,
    el run de 4 agentes vuelve a contarse como 1 en la siguiente medición.
    """

    def test_se_conservan_al_escribir_una_medicion(self):
        previo = {"lanzamientos": [{"run": 9, "trabajadores": "4"}]}
        d = AN.conservar_lanzamientos({"agentes": 0, "runs": []}, previo)
        self.assertEqual(d["lanzamientos"], [{"run": 9, "trabajadores": "4"}])

    def test_sin_archivo_previo_la_lista_queda_vacia_no_ausente(self):
        d = AN.conservar_lanzamientos({"agentes": 0, "runs": []}, None)
        self.assertEqual(d["lanzamientos"], [])

    def test_la_medicion_no_se_altera_por_conservar(self):
        d = AN.conservar_lanzamientos({"agentes": 4, "runs": [{"run": 9}]},
                                      {"lanzamientos": [{"run": 9, "trabajadores": "4"}]})
        self.assertEqual(d["agentes"], 4)
        self.assertEqual(d["runs"], [{"run": 9}])

    def test_solo_se_guardan_los_ultimos_treinta(self):
        previo = {"lanzamientos": [{"run": i} for i in range(50)]}
        d = AN.conservar_lanzamientos({}, previo)
        self.assertEqual(len(d["lanzamientos"]), 30)
        self.assertEqual(d["lanzamientos"][0]["run"], 20)




class TestPasoActual(unittest.TestCase):
    """(PDA1012) El paso real del job, para que Genesis no diga «undefined»."""

    def test_paso_en_curso(self):
        jobs = [{"estado": "in_progress", "pasos": [
            {"nombre": "Set up job", "estado": "completed", "inicio": "a"},
            {"nombre": "Enjambre", "estado": "in_progress", "inicio": "2026-10-11T01:05:00Z"},
            {"nombre": "Entregar", "estado": "queued", "inicio": None}]}]
        p = AN.paso_actual(jobs)
        self.assertEqual(p["nombre"], "Enjambre")
        self.assertEqual((p["hechos"], p["total"]), (1, 3))

    def test_sin_jobs_espera_maquina(self):
        self.assertEqual(AN.paso_actual([])["nombre"], "esperando máquina")

    def test_resumir_lleva_el_paso(self):
        runs = [{"databaseId": 7, "status": "in_progress", "createdAt": "2026-10-11T01:00:00Z", "url": "u",
                 "inputs": {"trabajadores": "3", "cola": "c.json"},
                 "paso": {"nombre": "Entregar (rama nube/<run>, nunca main)", "desde": "x", "hechos": 9, "total": 12}}]
        r = AN.resumir(runs, 1791682000)["runs"][0]
        self.assertTrue(r["paso"].startswith("Entregar"))
        self.assertEqual(r["pasos_hechos"], 9)

if __name__ == "__main__":
    unittest.main()
