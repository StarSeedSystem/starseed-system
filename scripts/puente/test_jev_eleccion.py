# -*- coding: utf-8 -*-
"""Pruebas puras de la regla que decide el medio final (HAL10).

La regla solo deja que Jev cambie el medio cuando una persona ha encendido el
interruptor y el medio elegido está sano, libre y en la cola actual."""

from __future__ import annotations

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from jev_eleccion import activo_por_entorno, medio_final  # noqa: E402


class TestMedioFinal(unittest.TestCase):
    """La elección de Jev solo manda cuando es segura."""

    def test_inactivo_mantiene_el_plan(self):
        medio, motivo = medio_final(
            "nvidia/kimi",
            "xkiro/qwen",
            ["nvidia/kimi", "xkiro/qwen"],
            {"nvidia/kimi": "cola-a", "xkiro/qwen": "cola-a"},
            "cola-a",
            False,
        )
        self.assertEqual(medio, "nvidia/kimi")
        self.assertEqual(motivo, "plan")

    def test_jev_igual_al_plan_mantiene_el_plan(self):
        medio, motivo = medio_final(
            "nvidia/kimi",
            "nvidia/kimi",
            ["nvidia/kimi"],
            {"nvidia/kimi": "cola-a"},
            "cola-a",
            True,
        )
        self.assertEqual(medio, "nvidia/kimi")
        self.assertEqual(motivo, "plan")

    def test_jev_libre_y_sano_de_la_misma_cola_manda(self):
        medio, motivo = medio_final(
            "nvidia/kimi",
            "xkiro/qwen",
            ["xkiro/qwen", "nvidia/kimi"],
            {"xkiro/qwen": "cola-a", "nvidia/kimi": "cola-a"},
            "cola-a",
            True,
        )
        self.assertEqual(medio, "xkiro/qwen")
        self.assertEqual(motivo, "Jev")

    def test_jev_ocupado_se_queda_con_el_plan(self):
        medio, motivo = medio_final(
            "nvidia/kimi",
            "xkiro/qwen",
            ["nvidia/kimi"],
            {"xkiro/qwen": "cola-a"},
            "cola-a",
            True,
        )
        self.assertEqual(medio, "nvidia/kimi")
        self.assertIn("Jev eligió xkiro/qwen", motivo)
        self.assertIn("no está", motivo)

    def test_jev_de_otra_cola_se_queda_con_el_plan(self):
        medio, motivo = medio_final(
            "nvidia/kimi",
            "xkiro/qwen",
            ["xkiro/qwen", "nvidia/kimi"],
            {"xkiro/qwen": "cola-b", "nvidia/kimi": "cola-a"},
            "cola-a",
            True,
        )
        self.assertEqual(medio, "nvidia/kimi")
        self.assertIn("Jev eligió xkiro/qwen", motivo)
        self.assertIn("cola", motivo)

    def test_cadenas_vacias_se_quedan_con_el_plan(self):
        medio, motivo = medio_final("", "", [], {}, "", True)
        self.assertEqual(medio, "")
        self.assertEqual(motivo, "plan")

    def test_elegir_vacio_se_queda_con_el_plan(self):
        medio, motivo = medio_final(
            "nvidia/kimi", "   ", ["nvidia/kimi"], {}, "cola-a", True
        )
        self.assertEqual(medio, "nvidia/kimi")
        self.assertEqual(motivo, "plan")


class TestActivoPorEntorno(unittest.TestCase):
    """El interruptor lo enciende una persona; por defecto está apagado."""

    def test_valores_que_lo_encienden(self):
        for valor in ("1", "true", "si", "sí"):
            with self.subTest(valor=valor):
                self.assertTrue(
                    activo_por_entorno({"STARSEED_JEV_ELIGE_MEDIO": valor})
                )

    def test_valores_que_lo_dejan_apagado(self):
        for valor in ("0", "false", "no", ""):
            with self.subTest(valor=valor):
                self.assertFalse(
                    activo_por_entorno({"STARSEED_JEV_ELIGE_MEDIO": valor})
                )

    def test_sin_variable_esta_apagado(self):
        self.assertFalse(activo_por_entorno({}))


class TestAplicacionArriendo(unittest.TestCase):
    """Lógica de aplicar medio_final sobre un arriendo (HAL1116A)."""

    def _simular_aplicar(self, arriendo, medio_jev, sanos, cola_actual, activo):
        """Simula la lógica de aplicar medio_final sobre un arriendo."""
        if not activo:
            return arriendo.copy()
        sanos_libres = [mid for mid, m in sanos.items() if m.get("libres", 0) > 0]
        cola_de = {mid: m.get("cola", "") for mid, m in sanos.items()}
        medio_f, motivo = medio_final(
            arriendo["medio"], medio_jev, sanos_libres, cola_de, cola_actual, activo
        )
        result = arriendo.copy()
        result["medio"], result["motivo"] = medio_f, motivo
        return result

    def test_apagado_deja_arriendo_igual(self):
        arriendo = {"medio": "nvidia/kimi", "motivo": "plan"}
        sanos = {"nvidia/kimi": {"libres": 1, "cola": "cola-a"},
                 "xkiro/qwen": {"libres": 2, "cola": "cola-a"}}
        result = self._simular_aplicar(arriendo, "xkiro/qwen", sanos, "cola-a", False)
        self.assertEqual(result["medio"], "nvidia/kimi")
        self.assertEqual(result["motivo"], "plan")

    def test_activo_valido_cambia_medio_y_motivo(self):
        arriendo = {"medio": "nvidia/kimi", "motivo": "plan"}
        sanos = {"nvidia/kimi": {"libres": 1, "cola": "cola-a"},
                 "xkiro/qwen": {"libres": 2, "cola": "cola-a"}}
        result = self._simular_aplicar(arriendo, "xkiro/qwen", sanos, "cola-a", True)
        self.assertEqual(result["medio"], "xkiro/qwen")
        self.assertEqual(result["motivo"], "Jev")

    def test_elegir_medio_que_lanza_no_cambia_nada(self):
        arriendo = {"medio": "nvidia/kimi", "motivo": "plan"}
        sanos = {"nvidia/kimi": {"libres": 1, "cola": "cola-a"}}
        result = self._simular_aplicar(arriendo, "xkiro/qwen", sanos, "cola-a", True)
        self.assertEqual(result["medio"], "nvidia/kimi")
        self.assertIn("Jev eligió xkiro/qwen", result["motivo"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
