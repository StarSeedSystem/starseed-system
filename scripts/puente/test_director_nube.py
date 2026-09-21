# -*- coding: utf-8 -*-
"""La política del director de la nube, sin tocar gh ni la red."""
import importlib.util
import os
import unittest

_ruta = os.path.join(os.path.dirname(os.path.abspath(__file__)), "director-nube.py")
_spec = importlib.util.spec_from_file_location("director_nube", _ruta)
D = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(D)


class PoliticaDeLanzamiento(unittest.TestCase):
    def test_lanza_con_atraso_y_la_nube_libre(self):
        lanzar, motivo = D.decidir_lanzamiento(atraso=4, runs_en_marcha=0, lanzados_hoy=0)
        self.assertTrue(lanzar)
        self.assertIn("4", motivo)

    def test_no_lanza_si_ya_hay_un_run(self):
        lanzar, motivo = D.decidir_lanzamiento(atraso=9, runs_en_marcha=1, lanzados_hoy=0)
        self.assertFalse(lanzar)
        self.assertIn("marcha", motivo)

    def test_no_lanza_sin_atraso(self):
        # El caso normal: la Mac se basta. Un agente sin tarea no es capacidad, es ruido.
        lanzar, motivo = D.decidir_lanzamiento(atraso=0, runs_en_marcha=0, lanzados_hoy=0)
        self.assertFalse(lanzar)
        self.assertIn("atraso", motivo)

    def test_respeta_el_tope_del_dia(self):
        lanzar, motivo = D.decidir_lanzamiento(atraso=5, runs_en_marcha=0, lanzados_hoy=8, tope_dia=8)
        self.assertFalse(lanzar)
        self.assertIn("tope", motivo)

    def test_un_run_en_marcha_manda_sobre_el_atraso(self):
        lanzar, _ = D.decidir_lanzamiento(atraso=100, runs_en_marcha=2, lanzados_hoy=0)
        self.assertFalse(lanzar)


if __name__ == "__main__":
    unittest.main()
