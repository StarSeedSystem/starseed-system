# -*- coding: utf-8 -*-
"""Pruebas de despierto_logica (KAL1101B): tapa, herramienta, batería y anuncio «se va a dormir».

Nada toca el sistema: los textos de `pmset` entran por argumento y el ajuste es un dict.
"""
import os
import sys
import unittest

DIR = os.path.dirname(os.path.abspath(__file__))
if DIR not in sys.path:
    sys.path.insert(0, DIR)

import despierto_logica as D  # noqa: E402
import nodo_metagenesis_logica as L  # noqa: E402

PMSET_G = """System-wide power settings:
 SleepDisabled = 0
Currently in use:
 disablesleep 0"""
PMSET_DESACTIVADA = PMSET_G.replace(" disablesleep 0", " disablesleep 1")
BATT_AC = "Now drawing from 'AC Power' - InternalBattery-0 92% (Charging)"
BATT_BAT = "Now drawing from 'Battery Power' - InternalBattery-0 18% (Battery Power)"
BATT_SOBREMESA = "Currently drawing from 'AC Power' -Healthy"
ASSERT_CAFFEINATE = 'PreventUserIdleSystemSleep named: "caffeinate-command-line" 1'
ASSERT_KEEPALIVE = 'PreventUserIdleSystemSleep named: "keepalive" 1'


class Tapa(unittest.TestCase):
    def test_cerrando_se_duerme_aunque_haya_asercion(self):
        e = D.estado_de(PMSET_G, BATT_BAT, ASSERT_CAFFEINATE, {"portatil": True})
        self.assertEqual(e["tapa"], "duerme")
        self.assertTrue(e["despierta"], "abierta, con aserción, sí está despierta")

    def test_desactivada_por_pmset(self):
        e = D.estado_de(PMSET_DESACTIVADA, BATT_SOBREMESA, "", {})
        self.assertEqual(e["tapa"], "desactivada")
        self.assertTrue(e["despierta"])

    def test_sobremesa_sin_tapa_y_declarada_manda(self):
        self.assertEqual(D.estado_de(PMSET_G, BATT_SOBREMESA, "", {"portatil": False})["tapa"], "sin-tapa")
        self.assertEqual(D.estado_de(PMSET_G, BATT_SOBREMESA, "", {"tapa": "sin-tapa"})["tapa"], "sin-tapa")
        self.assertEqual(D.estado_de(PMSET_G, BATT_AC, "", {"portatil": True, "pantalla_externa": True})["tapa"],
                         "clamshell")


class Bateria(unittest.TestCase):
    def test_en_corriente(self):
        e = D.estado_de(PMSET_G, BATT_AC, "", {})
        self.assertEqual(e["bateria"], 0.92)
        self.assertTrue(e["enchufada"])

    def test_en_bateria(self):
        e = D.estado_de(PMSET_G, BATT_BAT, "", {})
        self.assertAlmostEqual(e["bateria"], 0.18)
        self.assertFalse(e["enchufada"])

    def test_sin_bateria_es_sobremesa_enchufada(self):
        e = D.estado_de(PMSET_G, BATT_SOBREMESA, "", {})
        self.assertIsNone(e["bateria"])
        self.assertTrue(e["enchufada"])


class Herramienta(unittest.TestCase):
    def test_desde_assertions(self):
        for texto, esperado in ((ASSERT_KEEPALIVE, "keepalive"), (ASSERT_CAFFEINATE, "caffeinate")):
            self.assertEqual(D.estado_de(PMSET_G, "", texto, {})["herramienta"], esperado)

    def test_ajuste_manda_y_ninguna(self):
        self.assertEqual(D.estado_de(PMSET_G, "", ASSERT_CAFFEINATE, {"herramienta": "keepalive"})["herramienta"],
                         "keepalive")
        self.assertEqual(D.estado_de(PMSET_G, "", "sin aserciones", {})["herramienta"], "ninguna")


class Anuncio(unittest.TestCase):
    def test_baja_y_con_tapa_que_duerme(self):
        e = D.estado_de(PMSET_G, BATT_BAT, ASSERT_CAFFEINATE, {"portatil": True})
        self.assertTrue(D.anuncio_de_dormir(e))
        self.assertTrue(D.anuncio_de_dormir(e, 0.20), "umbral configurable: aquí 18 % < 20 %")

    def test_no_anuncia_sobre_el_umbral(self):
        self.assertFalse(D.anuncio_de_dormir({"tapa": "duerme", "enchufada": False, "bateria": 0.5}))

    def test_no_anuncia_enchufada_o_con_tapa_segura(self):
        base = {"bateria": 0.1, "enchufada": False}
        for tapa in ("clamshell", "sin-tapa", "desactivada"):
            self.assertFalse(D.anuncio_de_dormir(dict(base, tapa=tapa)))
        self.assertFalse(D.anuncio_de_dormir(dict(base, tapa="duerme", enchufada=True)))
        self.assertFalse(D.anuncio_de_dormir(dict(base, tapa="duerme", bateria=None)))

    def test_ajuste_de_basura_no_tumba_el_estado(self):
        for ajuste in (None, [], "texto"):
            e = D.estado_de(PMSET_G, BATT_AC, "", ajuste)
            self.assertEqual(e, {"despierta": False, "herramienta": "ninguna",
                                 "bateria": 0.92, "enchufada": True, "tapa": "duerme"})

class Colmena(unittest.TestCase):
    A = {"medio": "neurona", "modo": "real", "repo": True, "orquestador": True, "autoritativo": False}
    DORMIDA = {"tapa": "duerme", "enchufada": False, "bateria": 0.08}

    def test_la_dormida_sube_puntos_en_negativo(self):
        sin = L.puntos_nodo(dict(self.A))
        con = L.puntos_nodo(dict(self.A, despierto=self.DORMIDA))
        self.assertEqual(con, sin - L.CASTIGO_DORMIDA)

    def test_el_lider_no_da_trabajo_a_una_dormida(self):
        viva = {"nodo": "mac-1", "medio": "mac", "modo": "real",
                "salud": {"repo": True, "orquestador": True, "disco_gb": 20, "despierto": self.DORMIDA}}
        self.assertFalse(L.mejor_medio_libre({"mac-1": viva}))
        self.assertFalse(L.medio_para_vigia({"mac-1": viva}))

    def test_sin_anuncio_todo_queda_como_estaba(self):
        viva = {"nodo": "mac-1", "medio": "mac", "modo": "real",
                "salud": {"repo": True, "orquestador": True, "disco_gb": 20}}
        self.assertEqual(L.mejor_medio_libre({"mac-1": viva}), "mac-1")
        self.assertEqual(L.medio_para_vigia({"mac-1": viva}), "mac-1")


if __name__ == "__main__":
    unittest.main()
