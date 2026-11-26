# -*- coding: utf-8 -*-
"""Pruebas de opencode-zen_config: el bloque de Zen se deduce y la clave nunca se escribe.

Solo lo PURO (sin red ni disco): `bloque_zen_completo`, `es_proveedor_zen`,
`bloque_faltante` y `hay_clave_zen` con archivos de mentira.
"""

import importlib.util
import os
import sys
import unittest

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)


def _cargar():
    spec = importlib.util.spec_from_file_location(
        "opencode_zen_config", os.path.join(AQUI, "opencode-zen_config.py"))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


Z = _cargar()


class TestBloqueCompleto(unittest.TestCase):
    def test_completo_con_los_cuatro(self):
        self.assertTrue(Z.bloque_zen_completo(Z.MODELOS_ZEN_GRATIS))

    def test_incompleto_si_falta_uno(self):
        self.assertFalse(Z.bloque_zen_completo(Z.MODELOS_ZEN_GRATIS[:-1]))

    def test_vacio_no_es_completo(self):
        self.assertFalse(Z.bloque_zen_completo(()))
        self.assertFalse(Z.bloque_zen_completo(None))


class TestEsProveedorZen(unittest.TestCase):
    def test_opencode_y_zen_son_zen(self):
        self.assertTrue(Z.es_proveedor_zen("opencode"))
        self.assertTrue(Z.es_proveedor_zen("Zen"))

    def test_otro_proveedor_no(self):
        self.assertFalse(Z.es_proveedor_zen("nvidia"))
        self.assertFalse(Z.es_proveedor_zen(None))


class TestBloqueFaltante(unittest.TestCase):
    def test_sin_config_devuelve_bloque_con_los_cuatro(self):
        nuevo = Z.bloque_faltante({})
        self.assertIsNotNone(nuevo)
        self.assertTrue(Z.bloque_zen_completo(nuevo["provider"]["opencode"]["models"]))

    def test_no_inventa_la_clave_su_valor(self):
        nuevo = Z.bloque_faltante({})
        opciones = nuevo["provider"]["opencode"]["options"]
        self.assertEqual(opciones["apiKey"], "{env:OPENCODE_API_KEY}")

    def test_si_ya_esta_completo_no_devuelve_nada(self):
        cfg = {"provider": {"opencode": {"models": {m: {} for m in Z.MODELOS_ZEN_GRATIS}}}}
        self.assertIsNone(Z.bloque_faltante(cfg))

    def test_añade_sin_borrar_los_modelos_que_haya(self):
        cfg = {"provider": {"opencode": {"models": {"glm-5.3-flash-free": {"name": "x"}}}}}
        nuevo = Z.bloque_faltante(cfg)
        self.assertIn("glm-5.3-flash-free", nuevo["provider"]["opencode"]["models"])
        self.assertTrue(Z.bloque_zen_completo(nuevo["provider"]["opencode"]["models"]))

    def test_no_muta_la_config_recibida(self):
        cfg = {}
        Z.bloque_faltante(cfg)
        self.assertEqual(cfg, {})

    def test_respeta_otros_proveedores(self):
        cfg = {"provider": {"nvidia": {"options": {"apiKey": "{env:NVIDIA_API_KEY}"}}}}
        nuevo = Z.bloque_faltante(cfg)
        self.assertIn("nvidia", nuevo["provider"])
        self.assertIn("opencode", nuevo["provider"])


class TestHayClaveZen(unittest.TestCase):
    def test_clave_en_el_entorno(self):
        self.assertTrue(Z.hay_clave_zen(entorno={"OPENCODE_API_KEY": "x"}, ruta_auth="/no/existe"))

    def test_sin_clave_ni_auth(self):
        self.assertFalse(Z.hay_clave_zen(entorno={}, ruta_auth="/no/existe"))

    def test_proveedor_opencode_en_auth(self):
        import tempfile
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
            f.write('{"opencode": {"type": "api"}}')
            ruta = f.name
        try:
            self.assertTrue(Z.hay_clave_zen(entorno={}, ruta_auth=ruta))
        finally:
            os.unlink(ruta)


if __name__ == "__main__":
    unittest.main()