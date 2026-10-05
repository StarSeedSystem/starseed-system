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


class OptimizadorConfigurable(unittest.TestCase):
    """El bloque optimizador (§9 del contrato) se valida, carga y conserva."""

    def test_defecto_completo(self):
        cfg, avisos = cargar(_tmp({}))
        self.assertEqual(cfg["optimizador"], DEFAULTS["optimizador"])
        self.assertEqual(avisos, [])

    def test_valido_completo(self):
        cfg, avisos = cargar(_tmp({
            "optimizador": {
                "activo": False,
                "modo": "proponer",
                "intervalo_s": 120,
                "max_cambios_dia": 0,
                "max_tareas_dia": 20,
                "enfriamiento_min": 1440,
                "max_runs_nube_dia": 0,
            }
        }))
        self.assertEqual(cfg["optimizador"]["activo"], False)
        self.assertEqual(cfg["optimizador"]["modo"], "proponer")
        self.assertEqual(cfg["optimizador"]["intervalo_s"], 120)
        self.assertEqual(avisos, [])

    def test_invalido_modo(self):
        cfg, avisos = cargar(_tmp({"optimizador": {"modo": "detener"}}))
        self.assertEqual(cfg["optimizador"]["modo"], "actuar")
        self.assertTrue(any("modo" in a for a in avisos))

    def test_invalido_intervalo_fuera_de_rango(self):
        cfg, avisos = cargar(_tmp({"optimizador": {"intervalo_s": 50}}))
        self.assertEqual(cfg["optimizador"]["intervalo_s"], 600)
        self.assertTrue(any("intervalo_s" in a for a in avisos))

    def test_invalido_max_cambios_negativo(self):
        cfg, avisos = cargar(_tmp({"optimizador": {"max_cambios_dia": -1}}))
        self.assertEqual(cfg["optimizador"]["max_cambios_dia"], 12)
        self.assertTrue(any("max_cambios_dia" in a for a in avisos))

    def test_invalido_max_tareas_muy_alto(self):
        cfg, avisos = cargar(_tmp({"optimizador": {"max_tareas_dia": 99}}))
        self.assertEqual(cfg["optimizador"]["max_tareas_dia"], 6)
        self.assertTrue(any("max_tareas_dia" in a for a in avisos))

    def test_invalido_enfriamiento_bajisimo(self):
        cfg, avisos = cargar(_tmp({"optimizador": {"enfriamiento_min": 5}}))
        self.assertEqual(cfg["optimizador"]["enfriamiento_min"], 60)
        self.assertTrue(any("enfriamiento_min" in a for a in avisos))

    def test_guardado_conserva_bloque(self):
        # "guardado" = cargar con archivo que trae el bloque: conserva valores válidos.
        cfg, avisos = cargar(_tmp({
            "optimizador": {
                "activo": True,
                "modo": "actuar",
                "intervalo_s": 300,
            }
        }))
        self.assertEqual(cfg["optimizador"]["activo"], True)
        self.assertEqual(cfg["optimizador"]["modo"], "actuar")
        self.assertEqual(cfg["optimizador"]["intervalo_s"], 300)
        # El resto queda con los valores por defecto del bloque.
        self.assertEqual(cfg["optimizador"]["max_cambios_dia"], 12)
        self.assertEqual(cfg["optimizador"]["max_tareas_dia"], 6)
        self.assertEqual(cfg["optimizador"]["enfriamiento_min"], 60)
        self.assertEqual(cfg["optimizador"]["max_runs_nube_dia"], 12)

    def test_validar_rechaza_bloque_invalido(self):
        errores = validar({"optimizador": {"modo": "detener", "intervalo_s": -5}})
        self.assertTrue(any("modo" in e for e in errores))
        self.assertTrue(any("intervalo_s" in e for e in errores))


class DisenoConfigurable(unittest.TestCase):
    """El bloque diseno (§8 del contrato) se valida, carga y conserva."""

    def test_defecto_completo(self):
        cfg, avisos = cargar(_tmp({}))
        self.assertEqual(cfg["diseno"], {
            "activo": True,
            "umbral": 75,
            "juez_visual": True,
            "max_capturas_tarea": 14,
            "intervalo_s": 120,
        })
        self.assertEqual(avisos, [])

    def test_valido_completo(self):
        cfg, avisos = cargar(_tmp({
            "diseno": {
                "activo": False,
                "umbral": 100,
                "juez_visual": False,
                "max_capturas_tarea": 60,
                "intervalo_s": 3600,
            }
        }))
        self.assertEqual(cfg["diseno"]["activo"], False)
        self.assertEqual(cfg["diseno"]["umbral"], 100)
        self.assertEqual(cfg["diseno"]["juez_visual"], False)
        self.assertEqual(avisos, [])

    def test_umbral_en_los_bordes(self):
        cfg, _ = cargar(_tmp({"diseno": {"umbral": 0}}))
        self.assertEqual(cfg["diseno"]["umbral"], 0)
        cfg, _ = cargar(_tmp({"diseno": {"umbral": 100}}))
        self.assertEqual(cfg["diseno"]["umbral"], 100)

    def test_umbral_fuera_de_rango_se_descarta(self):
        for malo in (-1, 101, 1.5, "75", True):
            cfg, avisos = cargar(_tmp({"diseno": {"umbral": malo}}))
            self.assertEqual(cfg["diseno"]["umbral"], 75)
            self.assertTrue(any("umbral" in a for a in avisos), malo)

    def test_max_capturas_fuera_de_rango_se_descarta(self):
        for malo in (0, 61, -3, 2.5, "14"):
            cfg, avisos = cargar(_tmp({"diseno": {"max_capturas_tarea": malo}}))
            self.assertEqual(cfg["diseno"]["max_capturas_tarea"], 14)
            self.assertTrue(any("max_capturas_tarea" in a for a in avisos), malo)

    def test_intervalo_fuera_de_rango_se_descarta(self):
        for malo in (29, 3601, 0):
            cfg, avisos = cargar(_tmp({"diseno": {"intervalo_s": malo}}))
            self.assertEqual(cfg["diseno"]["intervalo_s"], 120)
            self.assertTrue(any("intervalo_s" in a for a in avisos), malo)
        cfg, avisos = cargar(_tmp({"diseno": {"intervalo_s": 30}}))
        self.assertEqual(cfg["diseno"]["intervalo_s"], 30)
        self.assertEqual(avisos, [])

    def test_booleanos_invalidos_se_descartan(self):
        cfg, avisos = cargar(_tmp({"diseno": {"activo": 1, "juez_visual": "sí"}}))
        self.assertEqual(cfg["diseno"]["activo"], True)
        self.assertEqual(cfg["diseno"]["juez_visual"], True)
        self.assertTrue(any("activo" in a for a in avisos))
        self.assertTrue(any("juez_visual" in a for a in avisos))

    def test_valido_parcial_conserva_el_resto(self):
        cfg, avisos = cargar(_tmp({"diseno": {"umbral": 80}}))
        self.assertEqual(cfg["diseno"]["umbral"], 80)
        self.assertEqual(cfg["diseno"]["max_capturas_tarea"], 14)
        self.assertEqual(cfg["diseno"]["intervalo_s"], 120)
        self.assertEqual(avisos, [])

    def test_validar_avisa_de_bloque_invalido(self):
        errores = validar({
            "diseno": {"umbral": 120, "max_capturas_tarea": 0, "intervalo_s": 10, "activo": "sí"}
        })
        self.assertTrue(any("diseno.umbral" in e for e in errores))
        self.assertTrue(any("diseno.max_capturas_tarea" in e for e in errores))
        self.assertTrue(any("diseno.intervalo_s" in e for e in errores))
        self.assertTrue(any("diseno.activo" in e for e in errores))

    def test_validar_bloque_no_objeto(self):
        errores = validar({"diseno": 42})
        self.assertIn("'diseno' debe ser un objeto", errores)

    def test_defaults_son_validos(self):
        self.assertEqual(validar(DEFAULTS), [])


if __name__ == "__main__":
    unittest.main()
