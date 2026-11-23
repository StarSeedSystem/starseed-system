#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas de `cloudroom_config`: carga, validación, fusión y prueba de configuración.

Todo puro: sin room-cli, sin red, sin disco real salvo tmp.
"""
import json
import os
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import cloudroom_config as CC
from cloudroom_config import DEFAULTS, PROVEEDORES_VALIDOS, cargar, validar, fusionar, probar_configuracion


def _tmp(contenido=None, nombre="cloudroom-config.json"):
    tmp = tempfile.mkdtemp()
    ruta = os.path.join(tmp, nombre)
    if contenido is not None:
        with open(ruta, "w", encoding="utf-8") as fh:
            json.dump(contenido, fh)
    return ruta


class CargarConfig(unittest.TestCase):
    def test_falta_el_archivo_usa_defaults(self):
        cfg, avisos = cargar(_tmp())
        self.assertEqual(cfg, DEFAULTS)
        self.assertEqual(avisos, [])

    def test_json_roto_usa_defaults(self):
        tmp = tempfile.mkdtemp()
        ruta = os.path.join(tmp, "cloudroom-config.json")
        with open(ruta, "w", encoding="utf-8") as fh:
            fh.write("{ esto no es json")
        cfg, avisos = cargar(ruta)
        self.assertEqual(cfg, DEFAULTS)
        self.assertEqual(avisos, [])

    def test_valor_fuera_de_rango_se_descarta(self):
        cfg, avisos = cargar(_tmp({"tope_dia": -5, "proveedores_apartados": 7}))
        self.assertEqual(cfg["tope_dia"], DEFAULTS["tope_dia"])
        self.assertEqual(cfg["proveedores_apartados"], DEFAULTS["proveedores_apartados"])

    def test_clave_desconocida_se_ignora(self):
        cfg, _ = cargar(_tmp({"no_existe": 42}))
        self.assertNotIn("no_existe", cfg)
        self.assertEqual(cfg, DEFAULTS)

    def test_fusion_parcial(self):
        cfg, _ = cargar(_tmp({
            "proyecto_id": "prj-123",
            "tope_dia": 8,
            "proveedores_apartados": ["apinex"],
            "simultaneos_por_proveedor": {"nvidia": 3},
        }))
        self.assertEqual(cfg["proyecto_id"], "prj-123")
        self.assertEqual(cfg["tope_dia"], 8)
        self.assertEqual(cfg["proveedores_apartados"], ["apinex"])
        self.assertEqual(cfg["simultaneos_por_proveedor"]["nvidia"], 3)
        self.assertEqual(cfg["simultaneos_por_proveedor"]["xkiro"], 1)  # el resto intacto
        self.assertEqual(cfg["max_vivos"], DEFAULTS["max_vivos"])


class ValidarConfig(unittest.TestCase):
    def test_dict_limpio_sin_errores(self):
        ok, errores = validar(DEFAULTS)
        self.assertTrue(ok)
        self.assertEqual(errores, [])

    def test_detecta_enteros_y_listas_y_bool(self):
        ok, errores = validar({
            "tope_dia": "6",
            "proveedores_apartados": [1, 2],
            "pausado": "sí",
            "simultaneos_por_proveedor": {"nvidia": "mucho"},
        })
        self.assertFalse(ok)
        self.assertTrue(any("tope_dia" in e for e in errores))
        self.assertTrue(any("proveedores_apartados" in e for e in errores))
        self.assertTrue(any("pausado" in e for e in errores))
        self.assertTrue(any("simultaneos_por_proveedor" in e for e in errores))

    def test_proveedor_desconocido_en_apartados(self):
        ok, errores = validar({"proveedores_apartados": ["inventado"]})
        self.assertFalse(ok)
        self.assertTrue(any("inventado" in e for e in errores))

    def test_proveedor_desconocido_en_simultaneos(self):
        ok, errores = validar({"simultaneos_por_proveedor": {"inventado": 5}})
        self.assertFalse(ok)
        self.assertTrue(any("inventado" in e for e in errores))

    def test_valores_fuera_de_rango_en_simultaneos(self):
        ok, errores = validar({"simultaneos_por_proveedor": {"nvidia": -1, "xkiro": 15}})
        self.assertFalse(ok)
        self.assertTrue(any("nvidia" in e for e in errores))
        self.assertTrue(any("xkiro" in e for e in errores))


class FusionarConfig(unittest.TestCase):
    def test_parcial_valido(self):
        cfg, avisos = fusionar(DEFAULTS, {
            "proyecto_id": "prj-abc",
            "modelo_preferido": "codex/gpt-6-luna",
            "tope_dia": 10,
        })
        self.assertEqual(cfg["proyecto_id"], "prj-abc")
        self.assertEqual(cfg["modelo_preferido"], "codex/gpt-6-luna")
        self.assertEqual(cfg["tope_dia"], 10)
        self.assertEqual(avisos, [])

    def test_valor_invalido_se_descarta_con_aviso(self):
        cfg, avisos = fusionar(DEFAULTS, {"tope_dia": -1})
        self.assertEqual(cfg["tope_dia"], DEFAULTS["tope_dia"])
        self.assertTrue(any("tope_dia" in a for a in avisos))

    def test_proveedores_apartados_filtran_desconocidos(self):
        cfg, avisos = fusionar(DEFAULTS, {"proveedores_apartados": ["nvidia", "inventado"]})
        self.assertEqual(cfg["proveedores_apartados"], ["nvidia"])
        self.assertTrue(any("desconocidos" in a for a in avisos))

    def test_simultaneos_por_proveedor_normaliza_claves_minusculas(self):
        cfg, avisos = fusionar(DEFAULTS, {"simultaneos_por_proveedor": {"NVIDIA": 4, "XKIRO": 2}})
        self.assertEqual(cfg["simultaneos_por_proveedor"]["nvidia"], 4)
        self.assertEqual(cfg["simultaneos_por_proveedor"]["xkiro"], 2)

    def test_modelos_fijados_se_copian(self):
        cfg, avisos = fusionar(DEFAULTS, {"modelos_fijados": {"TG1": "codex/gpt-6-luna"}})
        self.assertEqual(cfg["modelos_fijados"], {"TG1": "codex/gpt-6-luna"})
        self.assertEqual(avisos, [])


class ProbarConfiguracion(unittest.TestCase):
    """Pruebas puras de la función `probar_configuracion`."""

    AHORA = 1_800_000_000.0

    def test_ok_con_proyecto_y_modelo(self):
        cfg = {**DEFAULTS, "proyecto_id": "prj-123", "modelo_preferido": "codex/gpt-6-luna"}
        with patch.dict(os.environ, {}, clear=True):
            with patch("os.path.isfile", return_value=True):
                r = probar_configuracion(cfg, self.AHORA)
        self.assertTrue(r["ok"])
        self.assertTrue(r["proyecto_valido"])
        self.assertTrue(r["modelo_preferido_valido"])
        self.assertEqual(r["tope_dia"], 6)
        self.assertEqual(r["max_vivos"], 3)

    def test_aviso_si_falta_proyecto(self):
        cfg = {**DEFAULTS, "modelo_preferido": "codex/gpt-6-luna"}
        with patch.dict(os.environ, {}, clear=True):
            with patch("os.path.isfile", return_value=True):
                r = probar_configuracion(cfg, self.AHORA)
        self.assertFalse(r["proyecto_valido"])
        self.assertIn("proyecto_valido", str(r))

    def test_error_si_tope_dia_excesivo(self):
        cfg = {**DEFAULTS, "proyecto_id": "prj-123", "tope_dia": 100}
        with patch.dict(os.environ, {}, clear=True):
            with patch("os.path.isfile", return_value=True):
                r = probar_configuracion(cfg, self.AHORA)
        self.assertFalse(r["ok"])
        self.assertTrue(any("tope_dia" in e for e in r["errores"]))

    def test_error_si_max_vivos_excesivo(self):
        cfg = {**DEFAULTS, "proyecto_id": "prj-123", "max_vivos": 50}
        with patch.dict(os.environ, {}, clear=True):
            with patch("os.path.isfile", return_value=True):
                r = probar_configuracion(cfg, self.AHORA)
        self.assertFalse(r["ok"])
        self.assertTrue(any("max_vivos" in e for e in r["errores"]))

    def test_aviso_si_cli_no_encontrado(self):
        cfg = {**DEFAULTS, "proyecto_id": "prj-123"}
        with patch.dict(os.environ, {}, clear=True):
            with patch("os.path.isfile", return_value=False):
                r = probar_configuracion(cfg, self.AHORA)
        self.assertFalse(r["cli_disponible"])
        self.assertTrue(any("room-cli no encontrado" in a for a in r["avisos"]))

    def test_cli_en_variable_de_entorno(self):
        cfg = {**DEFAULTS, "proyecto_id": "prj-123"}
        with patch.dict(os.environ, {"CLOUDROOM_CLI": "/opt/room-cli"}):
            with patch("os.path.isfile", lambda p: p == "/opt/room-cli"):
                r = probar_configuracion(cfg, self.AHORA)
        self.assertTrue(r["cli_disponible"])


class GuardarConfig(unittest.TestCase):
    def test_guarda_atomicamente_y_normaliza(self):
        with tempfile.TemporaryDirectory() as tmp:
            ruta = os.path.join(tmp, "cloudroom-config.json")
            cfg = {**DEFAULTS, "proyecto_id": "prj-new", "tope_dia": 12, "pausado": True}
            guardada = CC.guardar(cfg, ruta)
            self.assertEqual(guardada["proyecto_id"], "prj-new")
            self.assertEqual(guardada["tope_dia"], 12)
            self.assertTrue(guardada["pausado"])
            # Verificar que el archivo existe y es JSON válido
            with open(ruta, encoding="utf-8") as fh:
                datos = json.load(fh)
            self.assertEqual(datos["proyecto_id"], "prj-new")
            self.assertEqual(datos["tope_dia"], 12)
            self.assertTrue(datos["pausado"])


if __name__ == "__main__":
    unittest.main()