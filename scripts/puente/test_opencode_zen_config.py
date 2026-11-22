#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas de opencode-zen_config (CAP1119): configurar y comprobar Zen sin red."""

import importlib.util
import json
import os
import sys
import tempfile
import unittest

CARPETA = os.path.dirname(os.path.abspath(__file__))
RUTA = os.path.join(CARPETA, "opencode-zen_config.py")
ESPEC = importlib.util.spec_from_file_location("opencode_zen_config", RUTA)
assert ESPEC is not None and ESPEC.loader is not None
zen = importlib.util.module_from_spec(ESPEC)
sys.modules["opencode_zen_config"] = zen
ESPEC.loader.exec_module(zen)


class ConfiguracionZenTest(unittest.TestCase):
    def test_nuevo_agrega_proveedor_y_modelos(self):
        nuevo, cambiado = zen.config_con_zen({})
        self.assertTrue(cambiado)
        bloque = nuevo["provider"]["zen"]
        self.assertEqual(bloque["options"]["baseURL"], "https://opencode.ai/zen/v1")
        self.assertEqual(bloque["options"]["apiKey"], "{env:OPENCODE_API_KEY}")
        for modelo in (
            "glm-5.3-flash-free", "deepseek-v4.1-flash-free",
            "minimax-m3.1-flash-free", "big-pickle",
        ):
            self.assertIn(modelo, bloque["models"])

    def test_no_muta_y_segunda_pasada_no_cambia(self):
        original = {"provider": {"nvidia": {"options": {"apiKey": "{env:NVIDIA_API_KEY}"}}}}
        primero, cambiado = zen.config_con_zen(original)
        self.assertTrue(cambiado)
        self.assertNotIn("zen", original["provider"])
        segundo, cambiado = zen.config_con_zen(primero)
        self.assertFalse(cambiado)
        self.assertEqual(segundo, primero)

    def test_repara_bloque_viejo_sin_tocar_otros_proveedores(self):
        viejo = {"provider": {"zen": {"options": {"apiKey": "valor-en-claro"}},
                              "nvidia": {"models": {"kimi": {"name": "Kimi"}}}}}
        nuevo, cambiado = zen.config_con_zen(viejo)
        self.assertTrue(cambiado)
        self.assertEqual(nuevo["provider"]["zen"]["options"]["apiKey"], "{env:OPENCODE_API_KEY}")
        self.assertEqual(nuevo["provider"]["nvidia"], viejo["provider"]["nvidia"])

    def test_proveedor_roto_no_tumba_nada(self):
        nuevo, _ = zen.config_con_zen({"provider": "roto"})
        self.assertIn("zen", nuevo["provider"])
        self.assertFalse(zen.comprobar({"provider": "roto"}, True)["listo"])


class ComprobacionZenTest(unittest.TestCase):
    def test_clave_por_entorno_o_auth(self):
        self.assertTrue(zen.tiene_clave({"OPENCODE_API_KEY": "valor"}, {}))
        self.assertTrue(zen.tiene_clave({}, {"opencode": {"type": "api"}}))
        self.assertFalse(zen.tiene_clave({}, {}))

    def test_listo_con_clave_y_config_correcta(self):
        cfg, _ = zen.config_con_zen({})
        resultado = zen.comprobar(cfg, True)
        self.assertTrue(resultado["listo"])
        self.assertEqual(resultado["problemas"], [])
        self.assertEqual(resultado["faltan"], [])

    def test_sin_clave_no_listo(self):
        cfg, _ = zen.config_con_zen({})
        resultado = zen.comprobar(cfg, False)
        self.assertFalse(resultado["listo"])
        self.assertTrue(any("clave" in p for p in resultado["problemas"]))

    def test_config_vieja_dice_que_falta(self):
        cfg = {"provider": {"zen": {
            "options": {"baseURL": "https://ejemplo.invalid/v1", "apiKey": "valor-en-claro"},
            "models": {"big-pickle": {"name": "Big Pickle"}},
        }}}
        resultado = zen.comprobar(cfg, True)
        self.assertFalse(resultado["listo"])
        self.assertIn("glm-5.3-flash-free", resultado["faltan"])
        self.assertTrue(any("apiKey" in p for p in resultado["problemas"]))

    def test_config_vacia_no_listo(self):
        self.assertFalse(zen.comprobar({}, True)["listo"])


class LineaDeOrdenesTest(unittest.TestCase):
    def test_seco_no_escribe(self):
        with tempfile.TemporaryDirectory() as d:
            ruta = os.path.join(d, "opencode.json")
            self.assertEqual(zen.main([ruta, "--seco"], clave=True), 0)
            self.assertFalse(os.path.exists(ruta))

    def test_configura_y_deja_json_legible(self):
        with tempfile.TemporaryDirectory() as d:
            ruta = os.path.join(d, "opencode.json")
            with open(ruta, "w", encoding="utf-8") as f:
                json.dump({"provider": {"nvidia": {"models": {}}}}, f)
            self.assertEqual(zen.main([ruta], clave=True), 0)
            with open(ruta, encoding="utf-8") as f:
                cfg = json.load(f)
            self.assertIn("nvidia", cfg["provider"])
            self.assertTrue(zen.comprobar(cfg, True)["listo"])

    def test_probar_no_toca_nada_y_avisa_sin_clave(self):
        with tempfile.TemporaryDirectory() as d:
            ruta = os.path.join(d, "opencode.json")
            cfg, _ = zen.config_con_zen({})
            with open(ruta, "w", encoding="utf-8") as f:
                json.dump(cfg, f)
            antes = os.path.getmtime(ruta)
            self.assertEqual(zen.main([ruta, "--probar"], clave=False), 1)
            self.assertEqual(os.path.getmtime(ruta), antes)


if __name__ == "__main__":
    unittest.main()
