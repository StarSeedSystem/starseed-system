#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas de scripts/sociales/metageminis_plan.py (unittest, sin red, sin reloj real).

  cd scripts/sociales && python3 -m unittest test_metageminis_plan -v
"""
import unittest
import sys
import os

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)

import metageminis_plan as mp


class TestEnEnfriamiento(unittest.TestCase):
    AHORA = "2026-11-07T12:00:00Z"
    DIAS = mp.DIAS_ENFRIAMIENTO

    def fila_para_aprobar(self, sitio_id, dias_atras):
        return {
            "sitio_id": sitio_id,
            "estado": mp.ESTADO_PARA_APROBAR,
            "creado_en": f"2026-11-{7-dias_atras:02d}T12:00:00Z",
        }

    def fila_enviado(self, sitio_id, dias_atras):
        return {
            "sitio_id": sitio_id,
            "estado": mp.ESTADO_ENVIADO,
            "enviado_en": f"2026-11-{7-dias_atras:02d}T12:00:00Z",
        }

    def fila_descartado(self, sitio_id, dias_atras):
        return {
            "sitio_id": sitio_id,
            "estado": mp.ESTADO_DESCARTADO,
            "creado_en": f"2026-11-{7-dias_atras:02d}T12:00:00Z",
        }

    def test_para_aprobar_no_enfria(self):
        """Un borrador para_aprobar NO enfría (se gestiona con en_espera en ciclo())."""
        filas = [self.fila_para_aprobar("goteo", 3)]
        en_frio, motivo = mp.en_enfriamiento("goteo", filas, self.AHORA, self.DIAS)
        self.assertFalse(en_frio)
        self.assertEqual(motivo, "")

    def test_dentro_de_plazo_enviado(self):
        """Un borrador enviado dentro de los 14 días enfría."""
        filas = [self.fila_enviado("bluesky", 5)]
        en_frio, motivo = mp.en_enfriamiento("bluesky", filas, self.AHORA, self.DIAS)
        self.assertTrue(en_frio)
        self.assertIn("vuelve en 9", motivo)  # 14 - 5 = 9

    def test_fuera_de_plazo_no_enfria(self):
        """Un borrador enviado hace 15 días NO enfría."""
        filas = [self.fila_enviado("mastodon", 15)]
        en_frio, motivo = mp.en_enfriamiento("mastodon", filas, self.AHORA, self.DIAS)
        self.assertFalse(en_frio)
        self.assertEqual(motivo, "")

    def test_descartado_no_enfria(self):
        """Un borrador descartado NO enfría, aunque sea reciente."""
        filas = [self.fila_descartado("goteo", 1)]
        en_frio, motivo = mp.en_enfriamiento("goteo", filas, self.AHORA, self.DIAS)
        self.assertFalse(en_frio)
        self.assertEqual(motivo, "")

    def test_otro_sitio_no_cuenta(self):
        """Un borrador de otro sitio no afecta."""
        filas = [self.fila_para_aprobar("bluesky", 1)]
        en_frio, motivo = mp.en_enfriamiento("goteo", filas, self.AHORA, self.DIAS)
        self.assertFalse(en_frio)
        self.assertEqual(motivo, "")

    def test_sin_fecha_legible_no_enfria(self):
        """Una fila sin fecha legible no enfría."""
        filas = [{"sitio_id": "goteo", "estado": mp.ESTADO_PARA_APROBAR, "creado_en": "no-fecha"}]
        en_frio, motivo = mp.en_enfriamiento("goteo", filas, self.AHORA, self.DIAS)
        self.assertFalse(en_frio)
        self.assertEqual(motivo, "")

    def test_varias_filas_toma_la_mas_reciente(self):
        """Si hay varias filas enviadas, toma la más reciente para calcular el enfriamiento."""
        filas = [
            self.fila_enviado("goteo", 10),  # hace 10 días
            self.fila_enviado("goteo", 2),   # hace 2 días (más reciente)
        ]
        en_frio, motivo = mp.en_enfriamiento("goteo", filas, self.AHORA, self.DIAS)
        self.assertTrue(en_frio)
        self.assertIn("vuelve en 12", motivo)  # 14 - 2 = 12

    def test_ahora_invalido_no_enfria(self):
        """Si la fecha 'ahora' no es legible, no hay enfriamiento."""
        filas = [self.fila_para_aprobar("goteo", 1)]
        en_frio, motivo = mp.en_enfriamiento("goteo", filas, "no-fecha", self.DIAS)
        self.assertFalse(en_frio)
        self.assertEqual(motivo, "")


class TestRepartirIntentos(unittest.TestCase):
    def test_reparto_igual_con_menos_de_10_enviados(self):
        """Si alguna clave tiene < 10 envíos, reparto igual ('sin conclusión')."""
        stats = {
            "redactora-1": {"enviados": 5, "respondidos": 2},
            "redactora-2": {"enviados": 20, "respondidos": 10},
        }
        r = mp.repartir_intentos(stats, 10)
        self.assertEqual(r, {"redactora-1": 5, "redactora-2": 5})
        self.assertEqual(mp.motivo_reparto(stats), "sin conclusión: redactora-1 con menos de 10 envíos")

    def test_reparto_igual_todas_con_menos_de_10(self):
        stats = {
            "a": {"enviados": 3, "respondidos": 1},
            "b": {"enviados": 4, "respondidos": 2},
        }
        r = mp.repartir_intentos(stats, 7)
        self.assertEqual(r, {"a": 4, "b": 3})  # 7 // 2 = 3, resto 1 -> a
        self.assertEqual(sum(r.values()), 7)

    def test_reparto_por_tasa_con_minimo_garantizado(self):
        """Con todas >= 10 envíos, reparto por tasa suavizada, mínimo 1."""
        stats = {
            "alta": {"enviados": 20, "respondidos": 15},  # tasa ~16/22 = 0.727
            "baja": {"enviados": 20, "respondidos": 2},   # tasa ~3/22 = 0.136
        }
        r = mp.repartir_intentos(stats, 10, minimo=1)
        self.assertEqual(sum(r.values()), 10)
        self.assertGreaterEqual(r["alta"], r["baja"])
        self.assertGreaterEqual(r["alta"], 1)
        self.assertGreaterEqual(r["baja"], 1)
        self.assertEqual(mp.motivo_reparto(stats), "por tasa de respuesta")

    def test_suma_exacta_total(self):
        """La suma siempre es exactamente total."""
        for total in range(1, 50):
            stats = {
                "a": {"enviados": 15, "respondidos": 10},
                "b": {"enviados": 20, "respondidos": 5},
                "c": {"enviados": 25, "respondidos": 15},
            }
            r = mp.repartir_intentos(stats, total, minimo=1)
            self.assertEqual(sum(r.values()), total, f"total={total}, r={r}")

    def test_mismo_resultado_dos_veces_deterministico(self):
        """Mismo input → mismo output (determinista)."""
        stats = {
            "x": {"enviados": 12, "respondidos": 8},
            "y": {"enviados": 15, "respondidos": 10},
            "z": {"enviados": 18, "respondidos": 5},
        }
        r1 = mp.repartir_intentos(stats, 20, minimo=2)
        r2 = mp.repartir_intentos(stats, 20, minimo=2)
        self.assertEqual(r1, r2)

    def test_total_no_llega_para_minimo_todos_reparto_igual(self):
        """Si total < minimo * n, reparto igual sin mínimo."""
        stats = {
            "a": {"enviados": 20, "respondidos": 10},
            "b": {"enviados": 20, "respondidos": 10},
            "c": {"enviados": 20, "respondidos": 10},
        }
        r = mp.repartir_intentos(stats, 2, minimo=2)  # 2 < 3*2=6
        self.assertEqual(sum(r.values()), 2)
        # Reparto igual: 2 // 3 = 0, resto 2 -> a:1, b:1, c:0
        self.assertIn(r["a"], (0, 1))
        self.assertIn(r["b"], (0, 1))
        self.assertIn(r["c"], (0, 1))

    def test_motivo_reparto_sin_conclusion(self):
        stats = {"a": {"enviados": 5, "respondidos": 1}, "b": {"enviados": 20, "respondidos": 10}}
        self.assertTrue(mp.motivo_reparto(stats).startswith("sin conclusión"))

    def test_motivo_reparto_por_tasa(self):
        stats = {"a": {"enviados": 20, "respondidos": 10}, "b": {"enviados": 20, "respondidos": 10}}
        self.assertEqual(mp.motivo_reparto(stats), "por tasa de respuesta")

    def test_motivo_reparto_vacio(self):
        self.assertEqual(mp.motivo_reparto({}), "sin conclusión: sin estadísticas")


class TestIntegracionPlan(unittest.TestCase):
    """Pruebas de que plan() usa las nuevas funciones (se ejecutan tras modificar metageminis.py)."""

    def test_plan_con_cola_excluye_enfriamiento(self):
        # Esta prueba se habilitará tras modificar metageminis.py
        pass


if __name__ == "__main__":
    unittest.main(verbosity=2)