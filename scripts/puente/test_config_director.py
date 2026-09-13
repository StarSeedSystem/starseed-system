#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Casos de config_director: qué carga bien, qué se ignora y qué se valida."""

import json, os, sys, tempfile, unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from config_director import DEFAULTS, cargar, validar


def _tmp(contenido=None, nombre="director-config.json"):
    tmp = tempfile.mkdtemp()
    ruta = os.path.join(tmp, nombre)
    if contenido is not None:
        json.dump(contenido, open(ruta, "w", encoding="utf-8"))
    return ruta


class CargarDirector(unittest.TestCase):
    def test_falta_el_archivo_usa_defaults(self):
        cfg = cargar(_tmp())
        self.assertEqual(cfg, DEFAULTS)

    def test_json_roto_usa_defaults(self):
        tmp = tempfile.mkdtemp()
        ruta = os.path.join(tmp, "director-config.json")
        open(ruta, "w", encoding="utf-8").write("{ esto no es json")
        self.assertEqual(cargar(ruta), DEFAULTS)

    def test_valor_fuera_de_rango_se_descarta(self):
        cfg = cargar(_tmp({"espera_aprobacion_min": -5, "proveedores_apartados": 7}))
        self.assertEqual(cfg["espera_aprobacion_min"], 10)
        self.assertEqual(cfg["proveedores_apartados"], [])

    def test_clave_desconocida_se_ignora(self):
        cfg = cargar(_tmp({"no_existe": 42}))
        self.assertNotIn("no_existe", cfg)
        self.assertEqual(cfg, DEFAULTS)

    def test_fusion_parcial(self):
        cfg = cargar(
            _tmp(
                {
                    "espera_aprobacion_min": 25,
                    "disco_min_gb": 8,
                    "proveedores_apartados": ["apinex"],
                    "escalada": {"tope_haiku_dia": 15},
                }
            )
        )
        self.assertEqual(cfg["espera_aprobacion_min"], 25)
        self.assertEqual(cfg["disco_min_gb"], 8)
        self.assertEqual(cfg["proveedores_apartados"], ["apinex"])
        self.assertEqual(cfg["escalada"]["tope_haiku_dia"], 15)
        self.assertEqual(cfg["escalada"]["tope_sonnet_dia"], 5)  # el resto intacto
        self.assertEqual(cfg["intervalo_s"], 180)


class ValidarDirector(unittest.TestCase):
    def test_dict_limpio_sin_errores(self):
        self.assertEqual(validar(DEFAULTS), [])

    def test_detecta_enteros_y_listas(self):
        e = validar(
            {
                "espera_aprobacion_min": "10",
                "proveedores_apartados": [1, 2],
                "aviso_checkin": "sí",
                "escalada": {"tope_haiku_dia": -1},
            }
        )
        self.assertTrue(any("espera_aprobacion_min" in m for m in e))
        self.assertTrue(any("proveedores_apartados" in m for m in e))
        self.assertTrue(any("aviso_checkin" in m for m in e))
        self.assertTrue(any("tope_haiku_dia" in m for m in e))


if __name__ == "__main__":
    unittest.main()
