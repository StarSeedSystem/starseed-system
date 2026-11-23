# -*- coding: utf-8 -*-
"""Pruebas de opencode-zen_config: deja el proveedor Zen listo sin tocar nada más.

CAP1119. El medio «opencode-zen» salía «usable» con el siguiente paso «configurar
proveedor zen»: opencode instalado, pero sin los modelos gratuitos declarados. Estas
pruebas fijan el contrato público (dict entra, dict sale) sin tocar la configuración
real de la máquina.
"""

import importlib.util
import json
import os
import tempfile
import unittest

AQUI = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location(
    "opencode_zen_config", os.path.join(AQUI, "opencode-zen_config.py"))
Z = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(Z)


class TestConfigurar(unittest.TestCase):
    def test_deja_los_gratuitos_declarados(self):
        nuevo, cambiado = Z.configurar({})
        self.assertTrue(cambiado)
        self.assertTrue(Z.esta_configurado(nuevo))
        self.assertEqual(Z.modelos_faltantes(nuevo), [])
        modelos = nuevo["provider"]["opencode"]["models"]
        for mid in ("glm-5.3-flash-free", "deepseek-v4.1-flash-free",
                    "minimax-m3.1-flash-free", "big-pickle"):
            self.assertIn(mid, modelos)

    def test_es_idempotente(self):
        una, _ = Z.configurar({})
        dos, cambiado = Z.configurar(una)
        self.assertFalse(cambiado)
        self.assertEqual(una, dos)

    def test_no_pisa_lo_ajeno(self):
        cfg = {"provider": {"nvidia": {"options": {"apiKey": "{env:NVIDIA_API_KEY}"}},
                            "opencode": {"models": {"mio-propio": {"name": "Mío"}}}}}
        nuevo, _ = Z.configurar(cfg)
        self.assertIn("nvidia", nuevo["provider"])
        self.assertIn("mio-propio", nuevo["provider"]["opencode"]["models"])
        self.assertIn("glm-5.3-flash-free", nuevo["provider"]["opencode"]["models"])

    def test_no_muta_la_entrada(self):
        cfg = {}
        Z.configurar(cfg)
        self.assertEqual(cfg, {})

    def test_solo_modelos_gratuitos(self):
        nuevo, _ = Z.configurar({})
        for mid in nuevo["provider"]["opencode"]["models"]:
            self.assertTrue(mid.endswith("-free") or mid == "big-pickle", mid)

    def test_sin_claves_en_el_bloque(self):
        nuevo, _ = Z.configurar({})
        texto = json.dumps(nuevo)
        self.assertNotIn("apiKey", texto)
        self.assertNotIn("{env:", texto)

    def test_aguanta_formas_raras(self):
        for raro in (None, {"provider": []}, {"provider": {"opencode": "x"}}):
            nuevo, _ = Z.configurar(raro)
            self.assertTrue(Z.esta_configurado(nuevo), raro)


class TestConsultas(unittest.TestCase):
    def test_faltantes_de_una_config_vacia(self):
        self.assertEqual(len(Z.modelos_faltantes({})), 4)
        self.assertFalse(Z.esta_configurado({}))
        self.assertFalse(Z.esta_configurado(None))

    def test_detecta_el_que_falta(self):
        nuevo, _ = Z.configurar({})
        del nuevo["provider"]["opencode"]["models"]["big-pickle"]
        self.assertEqual(Z.modelos_faltantes(nuevo), ["big-pickle"])
        self.assertFalse(Z.esta_configurado(nuevo))

    def test_resumen_dice_lo_que_hay(self):
        datos = Z.resumen(Z.configurar({})[0])
        self.assertTrue(datos["listo"])
        self.assertEqual(datos["proveedor"], "opencode")
        self.assertEqual(datos["faltantes"], [])


class TestDisco(unittest.TestCase):
    def test_archivo_ausente_es_config_vacia(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.assertEqual(Z.leer_config(os.path.join(tmp, "no.json")), {})

    def test_json_roto_no_se_sobrescribe(self):
        with tempfile.TemporaryDirectory() as tmp:
            ruta = os.path.join(tmp, "opencode.json")
            with open(ruta, "w", encoding="utf-8") as f:
                f.write("{roto")
            self.assertIsNone(Z.leer_config(ruta))
            self.assertEqual(Z.main(["--ruta", ruta, "--escribir"]), 2)
            with open(ruta, encoding="utf-8") as f:
                self.assertEqual(f.read(), "{roto")

    def test_escribir_y_leer_conserva_lo_demas(self):
        with tempfile.TemporaryDirectory() as tmp:
            ruta = os.path.join(tmp, "sub", "opencode.json")
            Z.escribir_config(ruta, {"provider": {"otro": {}}})
            self.assertIn("otro", Z.leer_config(ruta)["provider"])

    def test_main_en_seco_no_escribe(self):
        with tempfile.TemporaryDirectory() as tmp:
            ruta = os.path.join(tmp, "opencode.json")
            self.assertEqual(Z.main(["--ruta", ruta, "--json"]), 1)
            self.assertFalse(os.path.exists(ruta))

    def test_main_con_escribir_deja_listo(self):
        with tempfile.TemporaryDirectory() as tmp:
            ruta = os.path.join(tmp, "opencode.json")
            self.assertEqual(Z.main(["--ruta", ruta, "--escribir", "--json"]), 0)
            self.assertTrue(Z.esta_configurado(Z.leer_config(ruta)))
