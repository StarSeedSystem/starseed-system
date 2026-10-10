# -*- coding: utf-8 -*-
"""Pruebas de `reaperturas_de_la_tanda` (OPB1011, 2026-10-10): la tanda viva recibe CADA peldaño
de la escalera, no solo el primero.

Medido ese día en la Mac: la tanda `cola-auto-1009-233520.json` llevaba 14 h viva; el vigilante
recordaba en memoria «ya pedí reabrir PM1010F0Bc» y el «2/8» de la escalera se quedó para siempre en
`progreso-correcciones.json`, con 28 tareas de la Protomolécula esperando detrás.
"""
import os
import sys
import time
import unittest

DIR = os.path.dirname(os.path.abspath(__file__))
if DIR not in sys.path:
    sys.path.insert(0, DIR)

from vigilante_logica import (  # noqa: E402
    clave_reapertura,
    es_sucesora,
    reaperturas_de_la_tanda,
    tiene_sucesora_viva,
)

AHORA = time.mktime(time.strptime("2026-10-10 14:00:00", "%Y-%m-%d %H:%M:%S"))


def hora(minutos_antes):
    return time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(AHORA - minutos_antes * 60))


def corr(peldano, minutos_antes=1, **extra):
    c = {"estado": "pendiente", "nota": "director: reintento gratuito %d/8" % peldano,
         "intentos_auto": peldano, "reintentos_medio": 0, "modelo_siguiente": None, "t": hora(minutos_antes)}
    c.update(extra)
    return c


class Sucesoras(unittest.TestCase):
    def test_letras_y_partes(self):
        self.assertTrue(es_sucesora("PM1010F0Bc", "PM1010F0B"))
        self.assertTrue(es_sucesora("S1010-EV-ORACLE-1ab", "S1010-EV-ORACLE-1a"))
        self.assertTrue(es_sucesora("CPA1007Kb-d1b", "CPA1007Kb"))
        self.assertFalse(es_sucesora("XR1010AA", "XR1010A"))  # otra tarea, no un reintento
        self.assertFalse(es_sucesora("PM1010F0B", "PM1010F0Bc"))  # al revés no

    def test_misma_base_no_basta(self):
        # «…-1a» no es un reintento (la «a» nunca lo es): «…-1b» es otra tarea de la ola.
        self.assertFalse(es_sucesora("S1010-EV-ORACLE-1b", "S1010-EV-ORACLE-1a"))
        # Entre eslabones de una cadena (Db → Dc) hace falta que digan lo mismo.
        tareas = {
            "CAMR1005Db": {"titulo": "Radio: medidas", "archivos": ["a.ts"]},
            "CAMR1005Dc": {"titulo": "Radio: otra cosa", "archivos": ["b.ts"]},
        }
        self.assertFalse(es_sucesora("CAMR1005Dc", "CAMR1005Db", tareas))
        tareas["CAMR1005Dc"]["titulo"] = "Radio: medidas"
        self.assertTrue(es_sucesora("CAMR1005Dc", "CAMR1005Db", tareas))

    def test_rechazada_no_cuenta_como_sucesora_viva(self):
        prog = {"XR1010Cb": {"estado": "fallo_tests"}, "XR1010Cc": {"estado": "rechazada"}}
        self.assertIsNone(tiene_sucesora_viva("XR1010Cb", prog))
        self.assertEqual(tiene_sucesora_viva("XR1010C", dict(prog, XR1010C={"estado": "fallo_tsc"})), "XR1010Cb")


class Reaperturas(unittest.TestCase):
    def setUp(self):
        self.prog = {"PM1010F0Bc": {"estado": "fallo_tsc", "t": hora(300), "intentos_auto": 1}}
        self.cola = ["PM1010F0Bc"]

    def test_peldano_nuevo_se_pide_aunque_ya_se_pidiera_otro(self):
        pedidas = {"PM1010F0Bc": {"clave": clave_reapertura(corr(1)), "t": AHORA - 7 * 3600}}
        r = reaperturas_de_la_tanda({"PM1010F0Bc": corr(2)}, self.prog, self.cola, pedidas, AHORA)
        self.assertEqual(r, {"PM1010F0Bc": "2|0|"})

    def test_mismo_peldano_reciente_no_se_repite(self):
        pedidas = {"PM1010F0Bc": {"clave": "2|0|", "t": AHORA - 120}}
        self.assertEqual(reaperturas_de_la_tanda({"PM1010F0Bc": corr(2)}, self.prog, self.cola, pedidas, AHORA), {})

    def test_mismo_peldano_perdido_se_vuelve_a_pedir(self):
        # Se pidió hace 40 min y la tarea no se movió desde entonces (su fallo es de hace 5 h).
        pedidas = {"PM1010F0Bc": {"clave": "2|0|", "t": AHORA - 40 * 60}}
        r = reaperturas_de_la_tanda({"PM1010F0Bc": corr(2)}, self.prog, self.cola, pedidas, AHORA)
        self.assertIn("PM1010F0Bc", r)

    def test_si_ya_volvio_o_trabaja_no_se_pide(self):
        for estado in ("pendiente", "en_curso", "commit", "sustituida"):
            prog = {"PM1010F0Bc": {"estado": estado, "t": hora(10)}}
            self.assertEqual(reaperturas_de_la_tanda({"PM1010F0Bc": corr(2)}, prog, self.cola, {}, AHORA), {}, estado)

    def test_correccion_anterior_al_fallo_no_responde_a_este_fallo(self):
        prog = {"PM1010F0Bc": {"estado": "fallo_tsc", "t": hora(5)}}
        c = corr(2, minutos_antes=60)
        self.assertEqual(reaperturas_de_la_tanda({"PM1010F0Bc": c}, prog, self.cola, {}, AHORA), {})

    def test_fuera_de_la_tanda_no_es_cosa_suya(self):
        self.assertEqual(reaperturas_de_la_tanda({"PM1010F0Bc": corr(2)}, self.prog, [], {}, AHORA), {})

    def test_con_sucesora_viva_no_se_reabre_la_vieja(self):
        prog = {"PM1010F0B": {"estado": "fallo_tsc", "t": hora(400)},
                "PM1010F0Bc": {"estado": "fallo_tsc", "t": hora(300)}}
        r = reaperturas_de_la_tanda({"PM1010F0B": corr(2, minutos_antes=390)}, prog,
                                    ["PM1010F0B", "PM1010F0Bc"], {}, AHORA)
        self.assertEqual(r, {})

    def test_sucesora_rechazada_no_tapa_a_la_que_falla(self):
        prog = {"XR1010Cb": {"estado": "fallo_tests", "t": hora(300)}, "XR1010Cc": {"estado": "rechazada"}}
        r = reaperturas_de_la_tanda({"XR1010Cb": corr(1)}, prog, ["XR1010Cb", "XR1010Cc"], {}, AHORA)
        self.assertEqual(list(r), ["XR1010Cb"])

    def test_dependiente_con_la_misma_base_no_cuenta_como_sucesora(self):
        tareas = {"S1010-EV-ORACLE-1a": {"titulo": "núcleo", "archivos": ["a.ts"]},
                  "S1010-EV-ORACLE-1b": {"titulo": "servidor", "archivos": ["b.ts"], "depende": ["S1010-EV-ORACLE-1a"]}}
        prog = {"S1010-EV-ORACLE-1a": {"estado": "fallo_tsc", "t": hora(60)},
                "S1010-EV-ORACLE-1b": {"estado": "pendiente"}}
        r = reaperturas_de_la_tanda({"S1010-EV-ORACLE-1a": corr(2)}, prog, list(tareas), {}, AHORA, tareas=tareas)
        self.assertEqual(list(r), ["S1010-EV-ORACLE-1a"])


if __name__ == "__main__":
    unittest.main()
