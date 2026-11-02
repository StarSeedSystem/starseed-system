# -*- coding: utf-8 -*-
"""Pruebas PURAS del «¿sigo despierto con la tapa cerrada?» (KAL1101B).

Todo entra por argumentos (`pmset -g`, `pmset -g batt`, `pmset -g assertions` y el contenido de
`~/.starseed/despierto.json`): nada toca disco ni procesos. VERDAD a respetar: cerrar la tapa
DUERME el sistema aunque haya aserciones; solo sigue despierto en clamshell (corriente + pantalla
externa) o con `pmset -a disablesleep 1`.
"""
import os
import sys
import unittest

DIR = os.path.dirname(os.path.abspath(__file__))
if DIR not in sys.path:
    sys.path.insert(0, DIR)

import despierto_logica as D  # noqa: E402
import nodo_metagenesis_logica as L  # noqa: E402

PMSET_LAPTOP = "System-wide power settings:\n SleepDisabled         0\nCurrently in use:\n lidwake              1"
PMSET_DESACTIVADA = "System-wide power settings:\n SleepDisabled         1"
BATT_AC = "Now drawing from 'AC Power'\n -InternalBattery-0 (id=17044777)\t 92%; discharging; 1:23 remaining present: true"
BATT_BAJA = "Now drawing from 'Battery Power'\n -InternalBattery-0 (id=17044777)\t 18%; discharging; 0:39 remaining present: true"
BATT_DESKTOP = "Now drawing from 'AC Power'"
ASSER_NADA = "2026-11-01 22:00:00 +0200 Assertion status system-wide:\n   BackgroundTask                    0"
ASSER_CAFFEINATE = (
    "   PreventSystemSleep                1\n"
    "Listing owners:\n"
    '   pid 30504(Claude): [0x0006a59100018a12] 23:22:37 NoIdleSleepAssertion named: "Electron"\n'
    '   pid 1(launchd): [0x0006a59100018900] 22:00:00 PreventSystemSleep named: "caffeinate-command-line"'
)
ASSER_PANTALLA = (
    "   PreventUserIdleSystemSleep        0\n"
    "Listing owners:\n"
    '   pid 411(powerd): [0x0006a5910001891a] 23:10:00 PreventUserIdleDisplaySleep named: "Prevent sleep while display is on"'
)


class TestParsearBateria(unittest.TestCase):
    def test_ac_con_porcentaje(self):
        r = D.parsear_bateria(BATT_AC)
        self.assertEqual(r, {"porcentaje": 92, "enchufada": True, "portatil": True})

    def test_bateria_sin_corriente(self):
        r = D.parsear_bateria(BATT_BAJA)
        self.assertFalse(r["enchufada"])
        self.assertEqual(r["porcentaje"], 18)
        self.assertTrue(r["portatil"])

    def test_escritorio_sin_interna(self):
        r = D.parsear_bateria(BATT_DESKTOP)
        self.assertTrue(r["enchufada"])
        self.assertFalse(r["portatil"])

    def test_texto_vacio_o_raro(self):
        self.assertIsNone(D.parsear_bateria("")["porcentaje"])
        self.assertFalse(D.parsear_bateria("nada que ver")["portatil"])
        self.assertIsNone(D.parsear_bateria(None)["porcentaje"])

    def test_porcentaje_no_pilla_otra_cifra(self):
        # «92%; discharging; 1:23» → el % va pegado al número de batería, no a «1:23».
        self.assertEqual(D.parsear_bateria(" 92% ; discharging; 1:23 remaining")["porcentaje"], 92)


class TestPmset(unittest.TestCase):
    def test_sleep_desactivado(self):
        self.assertTrue(D.desactivada_pmset(PMSET_DESACTIVADA))
        self.assertFalse(D.desactivada_pmset(PMSET_LAPTOP))
        self.assertFalse(D.desactivada_pmset(None))


class TestAssertions(unittest.TestCase):
    def test_despierta_con_caffeinate_y_herramienta(self):
        r = D.parsear_assertions(ASSER_CAFFEINATE)
        self.assertTrue(r["despierta"])
        self.assertEqual(r["herramienta"], "caffeinate-command-line")

    def test_despierta_por_estado_system_wide(self):
        # «PreventUserIdleSystemSleep 1» sin sección de dueños: aun sin dueño cuenta como despierto.
        self.assertTrue(D.parsear_assertions("   PreventUserIdleSystemSleep      1\n   ExternalMedia            0")["despierta"])

    def test_dormido_con_solo_pantalla(self):
        r = D.parsear_assertions(ASSER_PANTALLA)
        self.assertFalse(r["despierta"])
        self.assertIsNone(r["herramienta"])

    def test_dormido_sin_nada(self):
        r = D.parsear_assertions(ASSER_NADA)
        self.assertFalse(r["despierta"])
        self.assertIsNone(r["herramienta"])

    def test_keepalive_como_herramienta(self):
        t = 'Listing owners:\n   pid 900(keepalive): [0x0000000000000001] 00:00:01 PreventSystemSleep named: "keepalive"'
        r = D.parsear_assertions(t)
        self.assertTrue(r["despierta"])
        self.assertEqual(r["herramienta"], "keepalive")


class TestTapa(unittest.TestCase):
    def test_desactivada_antes_que_nada(self):
        self.assertEqual(D.tapa_de(True, True, False, {}), "desactivada")
        self.assertEqual(D.tapa_de(True, False, True, {}), "desactivada")

    def test_sin_tapa_si_no_hay_interna(self):
        self.assertEqual(D.tapa_de(False, False, True, {}), "sin-tapa")

    def test_clamshell_requiere_corriente_y_pantalla_externa(self):
        j = {"pantalla_externa": True}
        self.assertEqual(D.tapa_de(False, True, True, j), "clamshell")
        self.assertEqual(D.tapa_de(False, True, False, j), "duerme")
        self.assertEqual(D.tapa_de(False, True, True, {}), "duerme")

    def test_json_roto_no_revienta(self):
        # VERDAD a respetar: con la tapa abierta y sin aserciones, cierra y duerme.
        self.assertEqual(D.tapa_de(False, True, False, None), "duerme")
        self.assertEqual(D.tapa_de(False, True, True, "no es un dict"), "duerme")

    def test_va_a_dormir_solo_duerme(self):
        self.assertTrue(D.va_a_dormir("duerme"))
        for t in ("clamshell", "sin-tapa", "desactivada"):
            self.assertFalse(D.va_a_dormir(t))


class TestAnuncioSeVaADormir(unittest.TestCase):
    def test_tapa_duerme_y_bateria_baja(self):
        self.assertTrue(D.se_va_a_dormir("duerme", 18, D.UMBRAL_BATERIA))

    def test_bateria_sobre_el_umbral_no_avisa(self):
        self.assertFalse(D.se_va_a_dormir("duerme", 40, D.UMBRAL_BATERIA))

    def test_sin_dato_de_bateria_no_avisa(self):
        self.assertFalse(D.se_va_a_dormir("duerme", None, D.UMBRAL_BATERIA))

    def test_otra_tapa_no_avisa_aunque_le_quede_poco(self):
        self.assertFalse(D.se_va_a_dormir("clamshell", 5, D.UMBRAL_BATERIA))
        self.assertFalse(D.se_va_a_dormir("desactivada", 5, D.UMBRAL_BATERIA))

    def test_umbral_ajustado_y_valor_defecto(self):
        self.assertFalse(D.se_va_a_dormir("duerme", 20, umbral=15))
        self.assertEqual(D.UMBRAL_BATERIA, 25)


class TestEstadoDespierto(unittest.TestCase):
    def _estado(self, **anade):
        return D.estado_despierto(anade.get("pmset", PMSET_LAPTOP), anade.get("batt", BATT_AC),
                                  anade.get("assertions", ASSER_CAFFEINATE), anade.get("json", None))

    def test_portatil_despierto_con_tapa_que_duerme(self):
        e = self._estado()
        self.assertEqual(e["despierta"], True)
        self.assertEqual(e["herramienta"], "caffeinate-command-line")
        self.assertEqual(e["bateria"], 92)
        self.assertTrue(e["enchufada"])
        self.assertEqual(e["tapa"], "duerme")
        self.assertTrue(e["va_a_dormir"])
        # VERDAD: con la tapa cerrada el sistema duerme; aunque esté despierto YENDO y enchufada.
        self.assertFalse(e["se_va_a_dormir"])

    def test_se_va_a_dormir_con_bateria_baja_y_umbral_del_json(self):
        e = self._estado(batt=BATT_BAJA, json={"umbral_bateria": 15})
        self.assertFalse(e["se_va_a_dormir"])
        self.assertEqual(e["umbral_bateria"], 15)

    def test_igual_bateria_con_umbral_defecto(self):
        e = self._estado(batt=BATT_BAJA, json=None)
        self.assertTrue(e["se_va_a_dormir"])
        self.assertEqual(e["umbral_bateria"], D.UMBRAL_BATERIA)
        self.assertFalse(e["enchufada"])

    def test_escritorio_y_desactivada(self):
        e = self._estado(batt=BATT_DESKTOP)
        self.assertEqual(e["tapa"], "sin-tapa")
        self.assertFalse(e["va_a_dormir"])
        e = self._estado(pmset=PMSET_DESACTIVADA)
        self.assertEqual(e["tapa"], "desactivada")
        self.assertFalse(e["va_a_dormir"])

    def test_todo_vacio_no_revienta(self):
        e = D.estado_despierto(None, None, None, None)
        self.assertFalse(e["despierta"])
        self.assertIsNone(e["herramienta"])
        self.assertFalse(e["enchufada"])
        self.assertEqual(e["tapa"], "sin-tapa")
        self.assertFalse(e["se_va_a_dormir"])


DESPIERTO_DUERME = {"tapa": "duerme", "despierta": True, "bateria": 18, "enchufada": False,
                    "se_va_a_dormir": True, "va_a_dormir": True, "herramienta": None}


class TestPlanificarDespierto(unittest.TestCase):
    def test_despierto_de_latido_lee_salud(self):
        self.assertEqual(L.despierto_de_latido({"salud": {"despierto": DESPIERTO_DUERME}}), DESPIERTO_DUERME)
        self.assertIsNone(L.despierto_de_latido({}))
        self.assertIsNone(L.despierto_de_latido({"salud": {"despierto": "raro"}}))
        self.assertIsNone(L.despierto_de_latido({"salud": {"despierto": {"tapa": "cualquiera"}}}))

    def test_planifica_desconectar_para_la_que_anuncia(self):
        nodos = {"neurona-a1b2c3": {"modo": "real", "salud": {"despierto": DESPIERTO_DUERME}},
                 "mac-99abc0": {"modo": "real", "salud": {}}}
        plan = L.planificar_despierto(nodos, 100.0)
        self.assertEqual(len(plan), 1)
        a = plan[0]
        self.assertEqual(a["accion"], "desconectar")
        self.assertEqual(a["nodo"], "neurona-a1b2c3")
        self.assertEqual(a["args"], {})
        self.assertIsNone(L.args_validos("desconectar", a["args"]))

    def test_no_planifica_sin_bateria_baja_ni_tapa_otra(self):
        viva = dict(DESPIERTO_DUERME, bateria=60, se_va_a_dormir=False)
        seguro = {"tapa": "desactivada", "se_va_a_dormir": False, "bateria": 10, "va_a_dormir": False}
        nodos = {"neurona-a1b2c3": {"salud": {"despierto": viva}},
                 "neurona-d4e5f6": {"salud": {"despierto": seguro}}}
        self.assertEqual(L.planificar_despierto(nodos, 100.0), [])


if __name__ == "__main__":
    unittest.main()
