# -*- coding: utf-8 -*-
"""Pruebas de `presidente_config.py` (espejo de `src/lib/mando/presidente-config.ts`)."""
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import presidente_config as PC


class TestPresidenteConfig(unittest.TestCase):
    def test_defaults_validos(self):
        ok, errores = PC.validar(PC.DEFAULTS)
        self.assertTrue(ok, errores)
        self.assertEqual(PC.DEFAULTS["orden_proveedores"], ["claude", "hermes", "agy", "chatgpt"])
        self.assertTrue(PC.DEFAULTS["respaldo_flota_gratis"])

    def test_rechaza_valores_invalidos(self):
        ok, errs = PC.validar({
            "orden_proveedores": [],
            "timeouts_reintento_s": [5, 99999],
            "respaldo_flota_gratis": "si",
            "max_opus_dia": -1,
            "sincronizar_canales": {"desconocido": True},
        })
        self.assertFalse(ok)
        self.assertGreaterEqual(len(errs), 5)

    def test_fusionar_completa_orden_sin_duplicados_y_salva_invalidos(self):
        cfg, avisos = PC.fusionar(
            PC.DEFAULTS,
            {"orden_proveedores": ["hermes", "hermes", "agy"], "timeouts_reintento_s": "mal"},
        )
        self.assertEqual(cfg["orden_proveedores"], ["hermes", "agy", "claude", "chatgpt"])
        self.assertEqual(cfg["timeouts_reintento_s"], [120, 300, 600])
        self.assertGreaterEqual(len(avisos), 1)

    def test_guardar_y_cargar_en_ruta_temporal(self):
        with tempfile.TemporaryDirectory() as d:
            ruta = os.path.join(d, "pres.json")
            PC.guardar({"respaldo_flota_gratis": False, "max_opus_dia": 12}, ruta=ruta)
            cargada, avisos = PC.cargar(ruta)
            self.assertEqual([], avisos)
            self.assertFalse(cargada["respaldo_flota_gratis"])
            self.assertEqual(12, cargada["max_opus_dia"])


if __name__ == "__main__":
    unittest.main()
