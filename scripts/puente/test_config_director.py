#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Casos de config_director: qué carga bien, qué se ignora y qué se valida."""

import json, os, sys, tempfile, unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import config_director
from config_director import DEFAULTS, PESOS, cargar, validar


def _tmp(contenido=None, nombre="director-config.json"):
    tmp = tempfile.mkdtemp()
    ruta = os.path.join(tmp, nombre)
    if contenido is not None:
        with open(ruta, "w", encoding="utf-8") as fh:
            json.dump(contenido, fh)
    return ruta


class CargarDirector(unittest.TestCase):
    def test_falta_el_archivo_usa_defaults(self):
        cfg, avisos = cargar(_tmp())
        self.assertEqual(cfg, DEFAULTS)
        self.assertEqual(avisos, [])

    def test_json_roto_usa_defaults(self):
        tmp = tempfile.mkdtemp()
        ruta = os.path.join(tmp, "director-config.json")
        with open(ruta, "w", encoding="utf-8") as fh:
            fh.write("{ esto no es json")
        cfg, avisos = cargar(ruta)
        self.assertEqual(cfg, DEFAULTS)
        self.assertEqual(avisos, [])

    def test_valor_fuera_de_rango_se_descarta(self):
        cfg, avisos = cargar(
            _tmp({"espera_aprobacion_min": -5, "proveedores_apartados": 7})
        )
        self.assertEqual(cfg["espera_aprobacion_min"], 10)
        self.assertEqual(cfg["proveedores_apartados"], [])

    def test_clave_desconocida_se_ignora(self):
        cfg, _ = cargar(_tmp({"no_existe": 42}))
        self.assertNotIn("no_existe", cfg)
        self.assertEqual(cfg, DEFAULTS)

    def test_fusion_parcial(self):
        cfg, _ = cargar(
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

    def test_tope_negativo_queda_default_con_aviso(self):
        cfg, avisos = cargar(_tmp({"escalada": {"tope_haiku_dia": -5}}))
        self.assertEqual(cfg["escalada"]["tope_haiku_dia"], 20)
        self.assertTrue(any("tope_haiku_dia" in a for a in avisos))


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


class TestEscaleraConfigurable(unittest.TestCase):
    """La escalera de niveles se puede fijar desde el fichero de ajustes."""

    def _cargar(self, contenido):
        import json, tempfile, os

        fd, ruta = tempfile.mkstemp(suffix=".json")
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            json.dump(contenido, fh)
        try:
            return config_director.cargar(ruta)
        finally:
            os.unlink(ruta)

    def test_niveles_validos_se_guardan(self):
        cfg, avisos = self._cargar({"escalada": {"niveles": ["libre"] * 8}})
        self.assertEqual(cfg["escalada"]["niveles"], ["libre"] * 8)
        self.assertEqual(avisos, [])

    def test_niveles_invalidos_se_descartan_con_aviso(self):
        cfg, avisos = self._cargar({"escalada": {"niveles": ["opus"]}})
        self.assertNotIn("niveles", cfg["escalada"])
        self.assertTrue(any("niveles" in a for a in avisos))

    def test_niveles_vacios_se_descartan(self):
        cfg, _ = self._cargar({"escalada": {"niveles": []}})
        self.assertNotIn("niveles", cfg["escalada"])

    def test_validar_avisa_de_niveles_malos(self):
        e = config_director.validar({"escalada": {"niveles": "libre"}})
        self.assertTrue(any("niveles" in m for m in e))


class PrioridadConfigurable(unittest.TestCase):
    """Los pesos de la prioridad se ajustan desde el JSON del Mando."""

    def _alguna_clave(self):
        return next(iter(PESOS))

    def test_pesos_validos_se_conservan(self):
        k = self._alguna_clave()
        cfg, avisos = cargar(_tmp({"prioridad": {k: -3.5}}))
        self.assertEqual(cfg["prioridad"][k], -3.5)
        self.assertEqual(avisos, [])

    def test_clave_desconocida_se_descarta_y_el_resto_queda(self):
        k = self._alguna_clave()
        cfg, avisos = cargar(_tmp({"prioridad": {"inventada": 9, k: 7}}))
        self.assertNotIn("inventada", cfg["prioridad"])
        self.assertEqual(cfg["prioridad"][k], 7)
        self.assertTrue(any("inventada" in a for a in avisos))

    def test_valor_de_texto_se_descarta_con_aviso(self):
        k = self._alguna_clave()
        cfg, avisos = cargar(_tmp({"prioridad": {k: "mucho"}}))
        self.assertEqual(cfg["prioridad"][k], PESOS[k])
        self.assertTrue(any(k in a for a in avisos))

    def test_sin_bloque_prioridad_quedan_los_defectos(self):
        cfg, avisos = cargar(_tmp({"disco_min_gb": 9}))
        self.assertEqual(cfg["prioridad"], PESOS)
        self.assertEqual(avisos, [])

    def test_validar_avisa_de_bloque_no_objeto(self):
        e = validar({"prioridad": [1, 2]})
        self.assertTrue(any("prioridad" in m for m in e))

    def test_defaults_son_validos(self):
        self.assertEqual(validar(DEFAULTS), [])


if __name__ == "__main__":
    unittest.main()
