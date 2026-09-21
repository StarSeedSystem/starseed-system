# -*- coding: utf-8 -*-
"""Las reglas del guardia de memoria, sin tocar ningun proceso.

Nacen de un fallo real (2026-09-20): con CINCO `llama-server` a la vez, el guardia
vigilaba al ultimo de la lista —que no era el que servia el puerto— y el motor de
Astraura se quedo congelado cuatro horas mientras `verificar-neurona` decia
«bitnet apagado». Aqui se fija lo que debe pasar en cada caso.
"""
import importlib.util
import os
import unittest

_ruta = os.path.join(os.path.dirname(os.path.abspath(__file__)), "guardia-memoria.py")
_spec = importlib.util.spec_from_file_location("guardia_memoria", _ruta)
G = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(G)


class ReglasDelGuardia(unittest.TestCase):
    def test_sin_medida_de_memoria_no_se_toca_nada(self):
        motores = [(1, "S"), (2, "T")]
        congelar, reanudar = G.decidir(motores, True, None, {2}, {2: 0}, 10_000)
        self.assertEqual(([], []), (congelar, reanudar))

    def test_con_enjambre_y_poca_memoria_se_congelan_todos_los_sueltos(self):
        motores = [(1, "S"), (2, "S"), (3, "T")]
        congelar, _ = G.decidir(motores, True, G.CONGELAR_BAJO_MB - 1, {3}, {3: 0}, 10_000)
        self.assertEqual([1, 2], congelar)

    def test_con_holgura_no_se_congela_aunque_el_enjambre_trabaje(self):
        congelar, _ = G.decidir([(1, "S")], True, G.CONGELAR_BAJO_MB + 1, set(), {}, 10_000)
        self.assertEqual([], congelar)

    def test_se_reanuda_al_parar_el_enjambre_si_hay_holgura(self):
        _, reanudar = G.decidir([(7, "T")], False, G.REANUDAR_SOBRE_MB + 1, {7}, {7: 9_990}, 10_000)
        self.assertEqual([7], reanudar)

    def test_sin_holgura_pero_harto_de_esperar_tambien_se_reanuda(self):
        # El caso de las cuatro horas: 2.148 MB libres nunca llegan a 2.600.
        _, reanudar = G.decidir([(7, "T")], False, G.REANUDAR_SOBRE_MB - 400, {7}, {7: 0},
                                10_000, espera_s=600)
        self.assertEqual([7], reanudar)

    def test_sin_holgura_y_recien_congelado_se_espera(self):
        _, reanudar = G.decidir([(7, "T")], False, G.REANUDAR_SOBRE_MB - 400, {7}, {7: 9_700},
                                10_000, espera_s=600)
        self.assertEqual([], reanudar)

    def test_nunca_se_reanuda_lo_que_paro_su_dueno(self):
        _, reanudar = G.decidir([(7, "T")], False, G.REANUDAR_SOBRE_MB + 1, set(), {}, 10_000)
        self.assertEqual([], reanudar)

    def test_con_el_enjambre_vivo_no_se_reanuda_nada(self):
        _, reanudar = G.decidir([(7, "T")], True, G.REANUDAR_SOBRE_MB + 1, {7}, {7: 0}, 10_000)
        self.assertEqual([], reanudar)

    def test_varios_motores_a_la_vez_el_caso_de_los_cinco(self):
        motores = [(2880, "T"), (5406, "T"), (28957, "T"), (76309, "T"), (99, "S")]
        marcados = {2880, 5406, 28957, 76309}
        desde = {p: 0 for p in marcados}
        _, reanudar = G.decidir(motores, False, G.REANUDAR_SOBRE_MB - 400, marcados, desde,
                                10_000, espera_s=600)
        self.assertEqual([2880, 5406, 28957, 76309], reanudar)


if __name__ == "__main__":
    unittest.main()
