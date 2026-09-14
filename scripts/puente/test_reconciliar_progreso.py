#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Puertas de reconciliar_progreso: cada mentira del 2026-09-12, medida."""
import os, sys, unittest
sys.path.insert(0, os.path.dirname(__file__))
from reconciliar_progreso import reconciliar, en_main

MAIN = ["Ola 226 · QW3: Retirar la fuente NVIDIA duplicada", "Ola 223 · I4F: Corrección de I4 (55e6)",
        "fix: Tokens reales en Astraura"]


class Reconciliar(unittest.TestCase):
    def test_en_curso_rancio_que_ya_esta_en_main_se_cierra(self):
        p, c = reconciliar({"QW3": {"estado": "en_curso"}}, MAIN, orquestador_vivo=False)
        self.assertEqual(p["QW3"]["estado"], "commit"); self.assertEqual(c, ["QW3 en_curso→commit"])

    def test_en_curso_rancio_sin_rastro_en_main_queda_interrumpida(self):
        p, _ = reconciliar({"Z9": {"estado": "en_curso"}}, MAIN, orquestador_vivo=False)
        self.assertEqual(p["Z9"]["estado"], "interrumpida")

    def test_con_orquestador_vivo_no_toca_los_en_curso(self):
        p, c = reconciliar({"QW3": {"estado": "en_curso"}}, MAIN, orquestador_vivo=True)
        self.assertEqual(p["QW3"]["estado"], "en_curso"); self.assertEqual(c, [])

    def test_sin_cambios_ya_en_main_pasa_a_commit_y_desbloquea_al_dependiente(self):
        prog = {"QW3": {"estado": "sin_cambios"},
                "QW4": {"estado": "bloqueada", "nota": "dependencia no integrada: QW3 (sin_cambios)"}}
        p, c = reconciliar(prog, MAIN, orquestador_vivo=False)
        self.assertEqual(p["QW3"]["estado"], "commit")
        self.assertEqual(p["QW4"]["estado"], "pendiente"); self.assertIn("QW3", p["QW4"]["nota"])

    def test_bloqueada_por_dependencia_de_verdad_pendiente_sigue_bloqueada(self):
        prog = {"O2": {"estado": "fallo"}, "O3": {"estado": "bloqueada", "nota": "dependencia no integrada: O2 (fallo)"}}
        p, c = reconciliar(prog, MAIN, orquestador_vivo=False)
        self.assertEqual(p["O3"]["estado"], "bloqueada"); self.assertEqual(c, [])

    def test_el_id_debe_ser_token_entero(self):
        self.assertTrue(en_main("I4F", MAIN)); self.assertTrue(en_main("I4", MAIN))
        self.assertFalse(en_main("I", MAIN)); self.assertFalse(en_main("4F", MAIN))

    def test_no_muta_el_original_ni_pierde_campos(self):
        prog = {"QW3": {"estado": "en_curso", "modelo": "x", "cola": "c.json"}}
        p, _ = reconciliar(prog, MAIN, orquestador_vivo=False)
        self.assertEqual(prog["QW3"]["estado"], "en_curso"); self.assertEqual(p["QW3"]["modelo"], "x")

class ReconciliarAmplio(unittest.TestCase):
    def test_pendiente_o_fallo_cuyo_id_ya_esta_en_main_se_cierra(self):
        p, c = reconciliar({"QW3": {"estado": "pendiente"}, "I4": {"estado": "fallo_tests"}}, MAIN, False)
        self.assertEqual(p["QW3"]["estado"], "commit"); self.assertEqual(p["I4"]["estado"], "commit")

    def test_la_puerta_de_aprobacion_no_se_toca_aunque_este_en_main(self):
        p, c = reconciliar({"QW3": {"estado": "esperando_aprobacion"}}, MAIN, False)
        self.assertEqual(p["QW3"]["estado"], "esperando_aprobacion"); self.assertEqual(c, [])

    def test_rechazada_no_revive(self):
        p, c = reconciliar({"QW3": {"estado": "rechazada"}}, MAIN, False)
        self.assertEqual(p["QW3"]["estado"], "rechazada"); self.assertEqual(c, [])


class Huerfanas(unittest.TestCase):
    """2026-09-14: 8 «pendientes» que ninguna cola definía ya. El medidor las contaba
    y el vigilante no podía ejecutarlas: dos verdades distintas sobre la misma tarea."""

    def test_pendiente_sin_cola_se_cierra_como_sustituida(self):
        p, c = reconciliar({"A7": {"estado": "pendiente"}}, MAIN, False, ids_en_colas={"OTRA"})
        self.assertEqual(p["A7"]["estado"], "sustituida")
        self.assertIn("huérfana", p["A7"]["nota"])
        self.assertEqual(c, ["A7 pendiente→sustituida (huérfana)"])

    def test_pendiente_que_si_tiene_cola_no_se_toca(self):
        p, c = reconciliar({"A7": {"estado": "pendiente"}}, MAIN, False, ids_en_colas={"A7"})
        self.assertEqual(p["A7"]["estado"], "pendiente"); self.assertEqual(c, [])

    def test_sin_ids_en_colas_no_cierra_nada(self):
        """`None` es «no sé», y ante la duda no se cierra trabajo de nadie."""
        p, c = reconciliar({"A7": {"estado": "pendiente"}}, MAIN, False)
        self.assertEqual(p["A7"]["estado"], "pendiente"); self.assertEqual(c, [])

    def test_conjunto_vacio_tampoco_cierra_nada(self):
        p, c = reconciliar({"A7": {"estado": "pendiente"}}, MAIN, False, ids_en_colas=set())
        self.assertEqual(p["A7"]["estado"], "pendiente"); self.assertEqual(c, [])

    def test_bloqueada_huerfana_tambien_se_cierra(self):
        p, _ = reconciliar({"O4": {"estado": "bloqueada"}}, MAIN, False, ids_en_colas={"X"})
        self.assertEqual(p["O4"]["estado"], "sustituida")

    def test_en_curso_huerfana_la_decide_la_primera_pasada_no_esta(self):
        """Un `en_curso` es del orquestador: lo cierra la pasada de rancios, no esta."""
        p, _ = reconciliar({"A7": {"estado": "en_curso"}}, MAIN, True, ids_en_colas={"X"})
        self.assertEqual(p["A7"]["estado"], "en_curso")

    def test_bloqueante_huerfana_se_respeta(self):
        """Espera a una persona: que su ola se archivara no borra esa espera."""
        p, c = reconciliar({"zD1": {"estado": "bloqueante"}}, MAIN, False, ids_en_colas={"X"})
        self.assertEqual(p["zD1"]["estado"], "bloqueante"); self.assertEqual(c, [])

    def test_huerfana_que_ya_esta_en_main_se_cierra_como_commit_no_como_huerfana(self):
        p, c = reconciliar({"QW3": {"estado": "pendiente"}}, MAIN, False, ids_en_colas={"X"})
        self.assertEqual(p["QW3"]["estado"], "commit")
        self.assertEqual(c, ["QW3 pendiente→commit"])


if __name__ == "__main__":
    unittest.main()
