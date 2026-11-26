# -*- coding: utf-8 -*-
"""Pruebas de opencode-zen_config: el proveedor Zen se añade sin romper lo demás.

El módulo lleva guion en el nombre (como `renovador-pasarelas.py`), así que se carga
por ruta. Son pruebas de comportamiento: qué queda en la configuración y qué no se pisa.
"""

import copy
import importlib.util
import json
import os
import sys
import tempfile
import unittest

AQUI = os.path.dirname(os.path.abspath(__file__))
RUTA_MOD = os.path.join(AQUI, "opencode-zen_config.py")
ESPEC = importlib.util.spec_from_file_location("opencode_zen_config", RUTA_MOD)
assert ESPEC and ESPEC.loader
Z = importlib.util.module_from_spec(ESPEC)
sys.modules["opencode_zen_config"] = Z
ESPEC.loader.exec_module(Z)


class BloqueZen(unittest.TestCase):
    def test_el_proveedor_es_opencode(self):
        self.assertEqual(Z.PROVEEDOR, "opencode")

    def test_solo_declara_modelos_gratuitos(self):
        for modelo in Z.MODELOS:
            self.assertTrue(modelo.endswith("-free") or modelo == "big-pickle", modelo)

    def test_el_bloque_lleva_todos_los_modelos(self):
        bloque = Z.bloque_zen()
        self.assertEqual(set(bloque["models"]), set(Z.MODELOS))


class Fusionar(unittest.TestCase):
    def test_no_toca_otros_proveedores(self):
        cfg = {"provider": {"nvidia": {"models": {"x": {"name": "x"}}}}}
        salida = Z.fusionar(cfg)
        self.assertIn("nvidia", salida["provider"])
        self.assertIn("opencode", salida["provider"])

    def test_no_muta_la_entrada(self):
        cfg = {"provider": {"nvidia": {"models": {}}}}
        antes = copy.deepcopy(cfg)
        Z.fusionar(cfg)
        self.assertEqual(cfg, antes)

    def test_anade_modelos_sin_borrar_los_que_ya_habia(self):
        cfg = {"provider": {"opencode": {"models": {"mio": {"name": "mio"}}}}}
        modelos = Z.fusionar(cfg)["provider"]["opencode"]["models"]
        self.assertIn("mio", modelos)
        for modelo in Z.MODELOS:
            self.assertIn(modelo, modelos)

    def test_aguanta_config_vacia_o_rara(self):
        self.assertIn("opencode", Z.fusionar({})["provider"])
        self.assertIn("opencode", Z.fusionar(None)["provider"])
        self.assertIn("opencode", Z.fusionar({"provider": "roto"})["provider"])

    def test_es_idempotente(self):
        una = Z.fusionar({})
        self.assertEqual(una, Z.fusionar(una))


class YaConfigurado(unittest.TestCase):
    def test_falso_sin_proveedor(self):
        self.assertFalse(Z.ya_configurado({}))

    def test_verdadero_tras_fusionar(self):
        self.assertTrue(Z.ya_configurado(Z.fusionar({})))

    def test_falso_si_falta_un_modelo(self):
        cfg = Z.fusionar({})
        del cfg["provider"]["opencode"]["models"][Z.MODELOS[0]]
        self.assertFalse(Z.ya_configurado(cfg))


class ConfigurarArchivo(unittest.TestCase):
    def setUp(self):
        self.carpeta = tempfile.mkdtemp()
        self.ruta = os.path.join(self.carpeta, "opencode.json")

    def test_crea_el_archivo_si_no_existe(self):
        resultado = Z.configurar(self.ruta)
        self.assertTrue(resultado["cambiado"])
        with open(self.ruta, encoding="utf-8") as f:
            self.assertTrue(Z.ya_configurado(json.load(f)))

    def test_la_segunda_vez_no_cambia(self):
        Z.configurar(self.ruta)
        self.assertFalse(Z.configurar(self.ruta)["cambiado"])

    def test_conserva_lo_que_ya_habia(self):
        with open(self.ruta, "w", encoding="utf-8") as f:
            json.dump({"provider": {"nvidia": {"models": {}}},
                       "lsp": {"typescript": {"disabled": True}}}, f)
        Z.configurar(self.ruta)
        with open(self.ruta, encoding="utf-8") as f:
            datos = json.load(f)
        self.assertIn("nvidia", datos["provider"])
        self.assertTrue(datos["lsp"]["typescript"]["disabled"])

    def test_json_roto_no_se_pisa(self):
        with open(self.ruta, "w", encoding="utf-8") as f:
            f.write("{ roto")
        resultado = Z.configurar(self.ruta)
        self.assertFalse(resultado["cambiado"])
        self.assertIn("error", resultado)
        with open(self.ruta, encoding="utf-8") as f:
            self.assertEqual(f.read(), "{ roto")


if __name__ == "__main__":
    unittest.main()
