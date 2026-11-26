# -*- coding: utf-8 -*-
"""Pruebas de las decisiones puras del lado Mac de la Maggabox (oracle_maggabox.py, ALM1125B)."""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import oracle_maggabox as M  # noqa: E402


class DecidirLanzar(unittest.TestCase):
    VIVO = {"latido": 1000.0, "fase": "espera"}

    def test_lanza_con_la_maggabox_libre(self):
        self.assertEqual(M.decidir_lanzar_maggabox(self.VIVO, 1100, None, []), (True, "Maggabox libre"))

    def test_no_sin_latido(self):
        ok, motivo = M.decidir_lanzar_maggabox({"latido": 0}, 5000, None, [])
        self.assertFalse(ok)
        self.assertIn("no late", motivo)

    def test_no_con_cola_en_marcha_ni_sin_tomar_ni_seguido(self):
        self.assertFalse(M.decidir_lanzar_maggabox(dict(self.VIVO, fase="cola", cola="c"), 1100, None, [])[0])
        self.assertFalse(M.decidir_lanzar_maggabox(self.VIVO, 1100, None, ["colas/maggabox-1"])[0])
        self.assertFalse(M.decidir_lanzar_maggabox(self.VIVO, 1100, 1000, [])[0])
        self.assertTrue(M.decidir_lanzar_maggabox(dict(self.VIVO, latido=2300.0), 2300, 1000, [])[0])


class RamaDeCola(unittest.TestCase):
    def test_formato_colas_maggabox(self):
        import calendar
        ts = calendar.timegm((2026, 11, 25, 20, 18, 0, 0, 0, 0))
        self.assertEqual(M.rama_de_cola(ts), "colas/maggabox-20261125-201800")


class Devolver(unittest.TestCase):
    def test_marcar_y_devolver(self):
        # Se construye el progreso a mano (no hay marcar_*: la nota lleva la rama).
        progreso = {"T1": {"estado": "reasignada", "medio": "maggabox",
                           "nota": "reasignada a la Maggabox (colas/maggabox-20261010-120000)"},
                    "T2": {"estado": "pendiente", "medio": "maggabox"}}
        lanz = [{"rama": "colas/maggabox-20261010-120000", "ids": ["T1", "T2"], "t": 0}]
        self.assertEqual(M.devolver_de_maggabox(progreso, lanz, {}, True, 100), [])
        progreso["T2"]["estado"] = "commit"
        self.assertEqual(M.devolver_de_maggabox(progreso, lanz, {"colas/maggabox-20261010-120000": {}},
                                              True, 100), ["T1"])
        self.assertEqual(M.devolver_de_maggabox(progreso, lanz, {}, False, 4 * 3600,
                                              gracia_s=3 * 3600), ["T1"])

    def test_no_toca_lo_prestado_a_otro_medio(self):
        p = {"T": {"estado": "reasignada", "medio": "nube"}}
        self.assertEqual(M.devolver_de_maggabox(p, [{"rama": "r", "ids": ["T"], "t": 0}],
                                              {"r": {}}, True, 1), [])

    def test_movida_desde_genesis_vuelve_sin_estar_en_lanzamientos(self):
        import calendar
        nacida = calendar.timegm((2026, 10, 18, 23, 12, 46, 0, 0, 0))
        p = {"T": {"estado": "reasignada", "medio": "maggabox",
                   "nota": "movida a maggabox (colas/maggabox-20261018-231246) desde Genesis"}}
        self.assertEqual(M.devolver_de_maggabox(p, [], {}, True, nacida + 3 * 3600 + 60), ["T"])

    def test_movida_desde_genesis_no_vuelve_si_la_cola_vive_o_dentro_de_gracia(self):
        import calendar
        nacida = calendar.timegm((2026, 10, 18, 23, 12, 46, 0, 0, 0))
        p = {"T": {"estado": "reasignada", "medio": "maggabox",
                   "nota": "movida a maggabox (colas/maggabox-20261018-231246) desde Genesis"}}
        self.assertEqual(M.devolver_de_maggabox(p, [], {}, True, nacida + 3 * 3600 + 60,
                                              colas_vivas=("colas/maggabox-20261018-231246",)), [])
        self.assertEqual(M.devolver_de_maggabox(p, [], {}, True, nacida + 3600), [])
        self.assertEqual(M.devolver_de_maggabox(p, [], {"colas/maggabox-20261018-231246": {}},
                                              True, nacida + 60), ["T"])

    def test_nota_sin_rama_y_lo_que_no_es_prestamo_de_maggabox(self):
        import calendar
        nacida = calendar.timegm((2026, 10, 18, 23, 12, 46, 0, 0, 0))
        rama = "colas/maggabox-20261018-231246"
        p = {"U": {"estado": "reasignada", "medio": "maggabox", "nota": "sin rama"},
             "V": {"estado": "commit", "medio": "maggabox",
                   "nota": "movida a maggabox (%s) desde Genesis" % rama},
             "W": {"estado": "reasignada", "medio": "nube",
                   "nota": "movida a maggabox (%s) desde Genesis" % rama},
             "X": "basura"}
        self.assertEqual(M.devolver_de_maggabox(p, [], {}, True, nacida + 3 * 3600 + 60), [])


class DebePrestar(unittest.TestCase):
    def test_presta_con_disco_bajo_y_maggabox_libre(self):
        estado = {"fase": "espera", "disco_libre_gb": 405, "ram_libre_mb": 8192}
        ok, motivo = M.debe_prestar("sin_tareas", estado, 1000)
        self.assertTrue(ok)
        self.assertIn("se presta", motivo)

    def test_no_presta_con_disco_libre(self):
        self.assertFalse(M.debe_prestar("libre", {"fase": "espera", "disco_libre_gb": 405, "ram_libre_mb": 8192}, 1)[0])

    def test_no_presta_si_la_maggabox_tiene_cola(self):
        self.assertFalse(M.debe_prestar("sin_tareas", {"fase": "cola", "cola": "c", "disco_libre_gb": 405,
                                                       "ram_libre_mb": 8192}, 1)[0])

    def test_no_presta_si_la_maggabox_tiene_poco_disco(self):
        self.assertFalse(M.debe_prestar("sin_tareas", {"fase": "espera", "disco_libre_gb": 10,
                                                       "ram_libre_mb": 8192}, 1)[0])

    def test_no_presta_si_la_maggabox_tiene_poca_ram(self):
        self.assertFalse(M.debe_prestar("sin_tareas", {"fase": "espera", "disco_libre_gb": 405,
                                                       "ram_libre_mb": 100}, 1)[0])


if __name__ == "__main__":
    unittest.main()
