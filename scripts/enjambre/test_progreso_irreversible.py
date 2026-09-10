# -*- coding: utf-8 -*-
"""Una corrida vieja no puede reabrir trabajo ya cerrado desde el Mando."""
import importlib.util
import os
import sys
import unittest


RUTA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "starseed-enjambre.py")
ESPEC = importlib.util.spec_from_file_location("enjambre_progreso", RUTA)
enjambre = importlib.util.module_from_spec(ESPEC)
sys.modules["enjambre_progreso"] = enjambre
ESPEC.loader.exec_module(enjambre)


class ProgresoIrreversibleTest(unittest.TestCase):
    def test_commit_persistido_no_vuelve_a_en_curso(self):
        memoria = {"T1": {"estado": "en_curso", "nota": "copia vieja"}}
        disco = {"T1": {"estado": "commit", "sha": "abc1234"}}
        fundido = enjambre.fusionar_progreso(memoria, disco, {"T1"})
        self.assertEqual(fundido["T1"], disco["T1"])

    def test_rechazo_persistido_tampoco_se_reabre(self):
        memoria = {"T1": {"estado": "en_curso"}}
        disco = {"T1": {"estado": "rechazada"}}
        self.assertEqual(enjambre.fusionar_progreso(memoria, disco, {"T1"})["T1"], disco["T1"])

    def test_tarea_propia_no_cerrada_conserva_el_avance_nuevo(self):
        memoria = {"T1": {"estado": "revisando"}}
        disco = {"T1": {"estado": "en_curso"}}
        self.assertEqual(enjambre.fusionar_progreso(memoria, disco, {"T1"})["T1"], memoria["T1"])

    def test_tarea_ajena_siempre_toma_la_foto_del_disco(self):
        memoria = {"T2": {"estado": "en_curso"}}
        disco = {"T2": {"estado": "fallo"}}
        self.assertEqual(enjambre.fusionar_progreso(memoria, disco, {"T1"})["T2"], disco["T2"])


if __name__ == "__main__":
    unittest.main()
