# -*- coding: utf-8 -*-
"""Las reglas del guardia de memoria, sin tocar ningun proceso.

La decision es una funcion pura: decidir(orquestador_vivo, libre_mb, congelados,
motores) -> [(motor, 'congelar'|'descongelar')]. Aqui se fija lo que debe pasar en
cada caso, umbrales e histeresis incluidos.
"""

import importlib.util
import os
import unittest

_ruta = os.path.join(os.path.dirname(os.path.abspath(__file__)), "guardia-memoria.py")
_spec = importlib.util.spec_from_file_location("guardia_memoria", _ruta)
G = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(G)

BAJO, SOBRE = G.CONGELAR_BAJO_MB, G.REANUDAR_SOBRE_MB


class ReglasDelGuardia(unittest.TestCase):
    def test_sin_medida_de_memoria_no_se_toca_nada(self):
        self.assertEqual([], G.decidir(True, None, set(), ["llama-server"]))

    def test_con_enjambre_y_poca_memoria_se_congelan_los_sueltos(self):
        acciones = G.decidir(True, BAJO - 1, set(), ["llama-server", "tts-server"])
        self.assertEqual(
            [("llama-server", "congelar"), ("tts-server", "congelar")], acciones
        )

    def test_lo_ya_congelado_no_se_repite(self):
        acciones = G.decidir(
            True, BAJO - 1, {"llama-server"}, ["llama-server", "tts-server"]
        )
        self.assertEqual([("tts-server", "congelar")], acciones)

    def test_con_holgura_no_se_congela_aunque_el_enjambre_trabaje(self):
        self.assertEqual([], G.decidir(True, BAJO + 1, set(), ["llama-server"]))

    def test_se_descongela_sin_enjambre_y_con_holgura(self):
        acciones = G.decidir(False, SOBRE + 1, {"tts-server"}, ["tts-server"])
        self.assertEqual([("tts-server", "descongelar")], acciones)

    def test_histeresis_entre_los_umbrales_no_se_hace_nada(self):
        # Sin holgura de verdad tampoco se reanuda: nada de ir y volver cada ciclo.
        self.assertEqual(
            [], G.decidir(False, SOBRE - 1, {"tts-server"}, ["tts-server"])
        )

    def test_con_el_enjambre_vivo_no_se_descongela_nada(self):
        self.assertEqual([], G.decidir(True, SOBRE + 1, {"tts-server"}, ["tts-server"]))

    def test_sin_motores_vivos_no_hay_accion_aunque_queden_marcadores(self):
        # El zombi revisado: un marcador viejo sin proceso no descongela a nadie.
        self.assertEqual([], G.decidir(False, SOBRE + 1, {"tts-server"}, []))


if __name__ == "__main__":
    unittest.main()
