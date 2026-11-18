# -*- coding: utf-8 -*-
"""Reglas de ritmo y contrapresión del Maggabit (MAG1117).

Herméticas: no tocan /Volumes, la red, ~/.starseed ni el disco real.
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import maggabit_ritmo as A  # noqa: E402

AHORA = 1_000_000.0
LISTO = {"estado": "listo", "boveda": "abierta"}


def base(**cambios):
    medio = dict(LISTO)
    medio.update(cambios)
    return medio


def al_dia(**atrasos):
    """Todos los ritmos recién servidos, salvo los atrasos que se piden."""
    ultimas = {t: AHORA for t in A.RITMOS_S}
    ultimas.update(atrasos)
    return ultimas


class DiscoAusente(unittest.TestCase):
    def test_si_el_medio_no_esta_listo_no_hay_trabajo(self):
        r = A.siguiente(AHORA, base(estado="ausente"), 100.0, 0, {}, None)
        self.assertIsNone(r["trabajo"])
        self.assertIn("disco", r["motivo"])

    def test_un_medio_sin_respuesta_tampoco_arranca(self):
        r = A.siguiente(AHORA, base(estado="sin-respuesta"), 100.0, 0, {}, None)
        self.assertIsNone(r["trabajo"])


class LimiteDeAncho(unittest.TestCase):
    def test_presion_cero_sin_limite(self):
        self.assertIsNone(A.limite_kbps(0))

class TrabajoEnMarcha(unittest.TestCase):
    def test_con_un_trabajo_en_marcha_no_arranca_otro(self):
        r = A.siguiente(AHORA, base(), 100.0, 0, {}, "memoria")
        self.assertIsNone(r["trabajo"])
        self.assertIn("memoria", r["motivo"])


class Contrapresion(unittest.TestCase):
    def test_disco_interno_bajo_3_gb_para(self):
        r = A.siguiente(AHORA, base(), 2.9, 0, {}, None)
        self.assertIsNone(r["trabajo"])
        self.assertIn("GB libres", r["motivo"])

    def test_presion_dos_para_con_motivo_claro(self):
        r = A.siguiente(AHORA, base(), 100.0, 2, {}, None)
        self.assertIsNone(r["trabajo"])
        self.assertIn("presión", r["motivo"])

    def test_con_presion_una_se_puede_seguir(self):
        r = A.siguiente(AHORA, base(), 100.0, 1, al_dia(verificar=0.0), None)
        self.assertEqual("verificar", r["trabajo"])


class Orden(unittest.TestCase):
    def test_el_mas_atrasado_gana_aunque_haya_varios(self):
        ultimas = al_dia(memoria=AHORA - 10000.0)
        ultimas["repos-github"] = AHORA - 5000.0
        r = A.siguiente(AHORA, base(), 100.0, 0, ultimas, None)
        self.assertEqual("memoria", r["trabajo"])

    def test_nunca_copiado_sale_por_delante_del_reciente(self):
        ultimas = {"memoria": AHORA - 10.0}
        r = A.siguiente(AHORA, base(), 100.0, 0, ultimas, None)
        self.assertEqual("repos-locales", r["trabajo"])

    def test_el_motivo_nombra_al_trabajo_y_su_atraso(self):
        r = A.siguiente(AHORA, base(), 100.0, 0, al_dia(verificar=0.0), None)
        self.assertEqual("verificar", r["trabajo"])
        self.assertIn("verificar", r["motivo"])

    def test_atraso_menor_al_ritmo_no_copia(self):
        ultimas = {t: AHORA for t in A.RITMOS_S}
        r = A.siguiente(AHORA, base(), 100.0, 0, ultimas, None)
        self.assertIsNone(r["trabajo"])
        self.assertIn("al día", r["motivo"])


class Boveda(unittest.TestCase):
    def test_boveda_cerrada_no_se_elige(self):
        medio = base(boveda="cerrada")
        r = A.siguiente(AHORA, medio, 100.0, 0, al_dia(boveda=0.0, verificar=0.0), None)
        self.assertEqual("verificar", r["trabajo"])

    def test_boveda_abierta_puede_ganar(self):
        ultimas = al_dia(boveda=0.0, verificar=AHORA - 100.0)
        r = A.siguiente(AHORA, base(), 100.0, 0, ultimas, None)
        self.assertEqual("boveda", r["trabajo"])

    def test_boveda_cerrada_no_bloquea_a_los_demas(self):
        r = A.siguiente(AHORA, base(boveda="cerrada"), 100.0, 0, al_dia(memoria=0.0), None)
        self.assertEqual("memoria", r["trabajo"])


if __name__ == "__main__":
    unittest.main()
