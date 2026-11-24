# -*- coding: utf-8 -*-
"""Pruebas de opencode-zen_config: configura Zen sin pisar nada ni escribir claves."""

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
    def test_anade_el_proveedor_con_sus_modelos(self):
        cfg = Z.configurar({})
        self.assertIn("opencode", cfg["provider"])
        bloque = cfg["provider"]["opencode"]
        self.assertIn("opencode.ai", bloque["options"]["baseURL"])
        self.assertEqual(sorted(bloque["models"]), sorted(Z.MODELOS_GRATIS))

    def test_solo_modelos_gratuitos(self):
        for modelo in Z.MODELOS_GRATIS:
            self.assertTrue(modelo.endswith("-free") or modelo == "big-pickle", modelo)
        self.assertNotIn("claude-opus-5-5", json.dumps(Z.configurar({})))
        self.assertNotIn("gpt-6-astra", json.dumps(Z.configurar({})))

    def test_conserva_los_otros_proveedores_y_sus_modelos(self):
        original = {
            "provider": {
                "nvidia": {"options": {"apiKey": "{env:NVIDIA_API_KEY}"}},
                "opencode": {"models": {"mio-propio": {"name": "Mío"}}},
            },
            "model": "nvidia/kimi-k3",
        }
        cfg = Z.configurar(original)
        self.assertIn("nvidia", cfg["provider"])
        self.assertEqual(cfg["model"], "nvidia/kimi-k3")
        self.assertIn("mio-propio", cfg["provider"]["opencode"]["models"])
        self.assertIn("big-pickle", cfg["provider"]["opencode"]["models"])

    def test_no_muta_la_entrada(self):
        original = {"provider": {"nvidia": {"options": {}}}}
        copia = json.loads(json.dumps(original))
        Z.configurar(original)
        self.assertEqual(original, copia)

    def test_es_idempotente(self):
        una = Z.configurar({})
        self.assertEqual(Z.configurar(una), una)

    def test_nunca_escribe_una_clave(self):
        texto = json.dumps(Z.configurar({}))
        self.assertIn("{env:OPENCODE_API_KEY}", texto)
        self.assertNotIn("sk-", texto)


class TestDeteccion(unittest.TestCase):
    def test_tiene_zen(self):
        self.assertFalse(Z.tiene_zen({}))
        self.assertTrue(Z.tiene_zen(Z.configurar({})))
        self.assertTrue(Z.tiene_zen({"provider": {"zen": {}}}))

    def test_hay_clave_en_el_entorno(self):
        sin_archivos = {"auth": "/no/existe", "archivos": ()}
        self.assertTrue(Z.hay_clave({"OPENCODE_API_KEY": "x"}, **sin_archivos))
        self.assertFalse(Z.hay_clave({"OPENCODE_API_KEY": "  "}, **sin_archivos))
        self.assertFalse(Z.hay_clave({}, **sin_archivos))

    def test_hay_clave_en_auth_y_archivo(self):
        with tempfile.TemporaryDirectory() as d:
            auth = os.path.join(d, "auth.json")
            env = os.path.join(d, "env")
            with open(auth, "w") as f:
                json.dump({"opencode": {"type": "api"}}, f)
            with open(env, "w") as f:
                f.write("OTRA=1\nOPENCODE_API_KEY=secreta\n")
            self.assertTrue(Z.hay_clave({}, auth=auth))
            self.assertTrue(Z.hay_clave({}, auth=os.path.join(d, "no-existe"), archivos=(env,)))
            self.assertFalse(Z.hay_clave({}, auth=os.path.join(d, "no-existe"), archivos=()))


class TestAplicar(unittest.TestCase):
    def test_crea_el_archivo_y_no_lo_reescribe_dos_veces(self):
        with tempfile.TemporaryDirectory() as d:
            ruta = os.path.join(d, "opencode.json")
            primera = Z.aplicar(ruta)
            self.assertTrue(primera["cambiado"])
            self.assertTrue(os.path.exists(ruta))
            segunda = Z.aplicar(ruta)
            self.assertFalse(segunda["cambiado"])
            with open(ruta) as f:
                self.assertIn("opencode", json.load(f)["provider"])

    def test_no_destruye_un_json_roto(self):
        with tempfile.TemporaryDirectory() as d:
            ruta = os.path.join(d, "opencode.json")
            with open(ruta, "w") as f:
                f.write("{roto")
            resultado = Z.aplicar(ruta)
            self.assertFalse(resultado["cambiado"])
            self.assertEqual(resultado["error"], "json-ilegible")
            with open(ruta) as f:
                self.assertEqual(f.read(), "{roto")


if __name__ == "__main__":
    unittest.main()
