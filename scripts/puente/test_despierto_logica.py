# -*- coding: utf-8 -*-
"""Pruebas PURAS de `despierto_logica` y de su consumo en el latido (KAL1101B).

Nada toca `pmset`, disco ni procesos: las salidas reales van como texto y el ajuste, como JSON.
"""
import os
import sys
import unittest

DIR = os.path.dirname(os.path.abspath(__file__))
if DIR not in sys.path:
    sys.path.insert(0, DIR)

import despierto_logica as D  # noqa: E402
import nodo_metagenesis_logica as L  # noqa: E402

T0 = 1_793_520_000.0

G_NORMAL = " displaysleep 10\n sleep 1 (sleep prevented by powerd, caffeinate)\n SleepDisabled 0\n"
G_SIN_CAFFEINATE = " displaysleep 10\n sleep 1\n SleepDisabled 0\n"
G_DESACTIVADA = " sleep 0\n SleepDisabled 1\n"
BATT_BATERIA = ("Now drawing from 'Battery Power'\n"
                " -InternalBattery-0 (id=1)\t23%; discharging; 4:12 remaining present: true\n")
BATT_AC = ("Now drawing from 'AC Power'\n"
           " -InternalBattery-0 (id=1)\t100%; charged; 0:00 remaining present: true\n")
BATT_SOBREMESA = "Now drawing from 'AC Power'\n"
A_CAFFEINATE = """Assertion status system-wide:
   PreventUserIdleSystemSleep     1
Listed by owning process:
   pid 456(caffeinate): [0x1] 00:00:00 PreventUserIdleSystemSleep named: "caffeinate"
   pid 123(powerd): [0x2] 00:00:00 PreventUserIdleDisplaySleep named: "Prevent sleep while display is on"
"""
A_NADA = "Assertion status system-wide:\n   PreventUserIdleSystemSleep 0\n"


class TestEstadoDespierto(unittest.TestCase):
    def test_portatil_con_bateria_y_sin_herramienta(self):
        e = D.estado_despierto(G_SIN_CAFFEINATE, BATT_BATERIA, A_NADA)
        self.assertFalse(e["despierta"])
        self.assertEqual(e["herramienta"], "")
        self.assertEqual(e["bateria"], 23)
        self.assertFalse(e["enchufada"])
        self.assertEqual(e["tapa"], "duerme")

    def test_caffeinate_impide_el_reposo_del_sistema(self):
        e = D.estado_despierto(G_NORMAL, BATT_AC, A_CAFFEINATE)
        self.assertTrue(e["despierta"])
        self.assertEqual(e["herramienta"], "caffeinate")
        self.assertTrue(e["enchufada"])

    def test_powerd_solo_no_cuenta_como_despierta(self):
        e = D.estado_despierto(
            G_SIN_CAFFEINATE, BATT_BATERIA,
            'pid 123(powerd): [0x1] 00:00:00 PreventUserIdleDisplaySleep named: "Prevent sleep while display is on"\n')
        self.assertFalse(e["despierta"])

    def test_ajuste_declara_la_herramienta(self):
        e = D.estado_despierto(G_SIN_CAFFEINATE, BATT_BATERIA, A_NADA,
                               '{"modo": "sistema", "herramienta": "keepalive", "pid": 9}')
        self.assertEqual(e["herramienta"], "keepalive")

    def test_ajuste_roto_no_revienta(self):
        e = D.estado_despierto(G_SIN_CAFFEINATE, BATT_BATERIA, A_CAFFEINATE, "{roto")
        self.assertEqual(e["herramienta"], "caffeinate")

    def test_sleep_disabled_desactiva_la_tapa(self):
        e = D.estado_despierto(G_DESACTIVADA, BATT_BATERIA, A_NADA)
        self.assertEqual(e["tapa"], "desactivada")
        self.assertTrue(e["despierta"])

    def test_sobremesa_sin_tapa(self):
        e = D.estado_despierto(G_SIN_CAFFEINATE, BATT_SOBREMESA, A_NADA)
        self.assertEqual(e["tapa"], "sin-tapa")
        self.assertIsNone(e["bateria"])

    def test_clamshell_exige_corriente_y_pantalla_externa(self):
        con = D.estado_despierto(G_SIN_CAFFEINATE, BATT_AC, A_NADA, pantalla_externa=True)
        sin = D.estado_despierto(G_SIN_CAFFEINATE, BATT_AC, A_NADA)
        self.assertEqual(con["tapa"], "clamshell")
        self.assertEqual(sin["tapa"], "duerme")

    def test_bateria_baja_que_duerme_se_anuncia(self):
        baja = D.estado_despierto(G_SIN_CAFFEINATE, BATT_BATERIA, A_NADA)
        self.assertEqual(baja["bateria"], 23)
        self.assertFalse(D.dormira(baja, umbral=20))
        self.assertTrue(D.dormira(baja, umbral=25))
        self.assertFalse(D.dormira(baja))


class TestConsumoEnElLatido(unittest.TestCase):
    def test_latido_que_se_duerme(self):
        e = D.estado_despierto(G_SIN_CAFFEINATE, BATT_BATERIA, A_NADA)
        latido = {"nodo": "neurona-abc123", "salud": {"despierto": e}}
        self.assertTrue(L.se_va_a_dormir(latido, umbral=25))
        self.assertFalse(L.se_va_a_dormir(latido))

    def test_insomne_que_se_duerme_no_suma_puntos(self):
        dormida = {"medio": "neurona", "modo": "real", "repo": True, "orquestador": True,
                   "insomne": {"activo": True, "hasta": T0 + 3600},
                   "despierto": {"tapa": "duerme", "bateria": 8}}
        despierta = dict(dormida, despierto={"tapa": "duerme", "bateria": 80})
        self.assertEqual(L.puntos_nodo(despierta, T0) - L.puntos_nodo(dormida, T0), L.PUNTOS_INSOMNE)

    def test_no_recibe_prestamos_si_se_duerme(self):
        l = {"modo": "real", "secreto": True, "salud": {
            "repo": True, "orquestador": True, "disco_gb": 30, "ram_libre_mb": 8000,
            "despierto": {"tapa": "duerme", "bateria": 9}}}
        self.assertFalse(L.medio_ocioso("neurona-abc123", l)[0])
        self.assertIn("dormir", L.medio_ocioso("neurona-abc123", l)[1])

    def test_planificar_manda_desconectar_al_que_se_duerme(self):
        latido = {"nodo": "neurona-abc123", "modo": "real",
                  "salud": {"despierto": {"tapa": "duerme", "bateria": 9}}}
        mundo = {"nodos": {"neurona-abc123": latido}, "yo": "mac-aaaaaa", "autonomia": True}
        plan = L.planificar(mundo, {}, T0)
        self.assertEqual([a["accion"] for a in plan], ["desconectar"])
        self.assertEqual(plan[0]["nodo"], "neurona-abc123")


if __name__ == "__main__":
    unittest.main()
