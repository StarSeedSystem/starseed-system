# -*- coding: utf-8 -*-
"""Pruebas de cupo_codex.py, con la salida real del 17/09."""

import json
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import cupo_codex as C

#: Literal del log de CU3b, RS3b, RS1p y las dos del Dream.
REAL = ("ERROR: You've hit your usage limit. Upgrade to Pro "
        "(https://chatgpt.com/explore/pro), visit https://chatgpt.com/codex/settings/usage")

AHORA = 1_700_000_000.0


class TestDeteccion(unittest.TestCase):
    def test_la_salida_real_de_hoy(self):
        self.assertTrue(C.agotado_en(REAL))

    def test_no_confunde_otros_errores(self):
        # Mismo código de salida, reacción opuesta: aquí hay que cambiar de
        # modelo, no esperar tres horas.
        self.assertFalse(C.agotado_en("ERROR: model 'gpt-9' does not exist"))
        self.assertFalse(C.agotado_en("error: the argument '--sandbox' cannot be used"))

    def test_vacio_no_es_agotamiento(self):
        self.assertFalse(C.agotado_en(""))
        self.assertFalse(C.agotado_en(None))

    def test_da_igual_como_lo_escriban(self):
        for t in ("Usage limit reached for your plan", "QUOTA EXCEEDED", "Upgrade to Pro"):
            self.assertTrue(C.agotado_en(t), t)


class TestVigencia(unittest.TestCase):
    def test_recien_anotado_sigue_agotado(self):
        marca = {"hasta": C.hasta_cuando(AHORA)}
        self.assertTrue(C.sigue_agotado(marca, AHORA))

    def test_pasadas_las_horas_vuelve(self):
        marca = {"hasta": C.hasta_cuando(AHORA)}
        self.assertFalse(C.sigue_agotado(marca, AHORA + C.HORAS * 3600 + 1))

    def test_marca_ilegible_deja_intentar(self):
        # Ante la duda se intenta: perder un turno es más barato que renunciar a
        # la suscripción entera por un archivo corrupto.
        for mala in ({}, None, {"hasta": "ayer"}, {"otra": 1}, "texto"):
            self.assertFalse(C.sigue_agotado(mala, AHORA))

    def test_los_minutos_se_pueden_decir_sin_mentir(self):
        marca = {"hasta": AHORA + 90 * 60}
        self.assertEqual(C.minutos_restantes(marca, AHORA), 90)
        self.assertEqual(C.minutos_restantes({}, AHORA), 0)


#: Literal de ~/.codex/sessions desde el 2026-10-23 20:55 (206 sesiones).
SIN_MODELO = ('{"status":400,"error":{"type":"invalid_request_error","message":'
              '"The \'gpt-5.6-sol\' model is not supported when using Codex with a '
              'ChatGPT account.","code":"model_not_found"}}')


class TestSinModelo(unittest.TestCase):
    def test_la_salida_real_del_23_10(self):
        self.assertTrue(C.sin_modelo_en(SIN_MODELO))

    def test_solo_el_codigo_tambien(self):
        self.assertTrue(C.sin_modelo_en('{"code":"MODEL_NOT_FOUND"}'))

    def test_no_es_cuota_ni_al_reves(self):
        self.assertFalse(C.agotado_en(SIN_MODELO))
        self.assertFalse(C.sin_modelo_en(REAL))
        self.assertTrue(C.agotado_en(REAL))

    def test_vacio(self):
        self.assertFalse(C.sin_modelo_en(""))
        self.assertFalse(C.sin_modelo_en(None))

    def test_se_aparta_24_horas(self):
        import tempfile
        ruta = os.path.join(tempfile.mkdtemp(), "codex-cupo.json")
        C.anotar("cuenta de ChatGPT sin Codex", ruta=ruta, ahora=AHORA,
                 horas=C.HORAS_SIN_MODELO)
        self.assertEqual(C.HORAS_SIN_MODELO, 24)
        self.assertFalse(C.puede_escribir(ruta, ahora=AHORA + 23 * 3600))
        self.assertTrue(C.puede_escribir(ruta, ahora=AHORA + 25 * 3600))


class TestVentana(unittest.TestCase):
    def test_tres_horas_por_defecto(self):
        self.assertAlmostEqual(C.hasta_cuando(AHORA) - AHORA, 3 * 3600, places=3)

    def test_se_puede_ajustar(self):
        self.assertAlmostEqual(C.hasta_cuando(AHORA, horas=0.5) - AHORA, 1800, places=3)


class TestDisco(unittest.TestCase):
    def setUp(self):
        import tempfile
        self.dir = tempfile.mkdtemp()
        self.ruta = os.path.join(self.dir, "codex-cupo.json")

    def test_ida_y_vuelta(self):
        self.assertTrue(C.puede_escribir(self.ruta))          # sin archivo: adelante
        C.anotar("prueba", ruta=self.ruta)
        self.assertFalse(C.puede_escribir(self.ruta))         # anotado: se aparta
        self.assertTrue(C.puede_escribir(self.ruta, ahora=__import__("time").time() + 4 * 3600))

    def test_anotar_dice_cuanto(self):
        self.assertGreater(C.anotar("prueba", ruta=self.ruta), 100)

    def test_archivo_roto_no_revienta(self):
        with open(self.ruta, "w", encoding="utf-8") as f:
            f.write("{ esto no es json")
        self.assertEqual(C.leer(self.ruta), {})
        self.assertTrue(C.puede_escribir(self.ruta))


class TestRutaAlLlamar(unittest.TestCase):
    """(SUP0411I) Cambiar `RUTA` lleva leer, anotar y puede_escribir a la ruta nueva.

    Con `ruta=RUTA` de valor por defecto, la ruta quedaba fijada al cargar el módulo y las
    pruebas que cambiaban `RUTA` escribían en ~/.starseed de la Mac. Esta copia del módulo se
    carga con HOME en un temporal: ni sin el arreglo toca la marca de verdad.
    """

    def test_cambiar_RUTA_cambia_donde_lee_y_escribe(self):
        import importlib.util
        import tempfile
        from unittest import mock
        casa = tempfile.mkdtemp(prefix="casa-")
        with mock.patch.dict(os.environ, {"HOME": casa}):
            spec = importlib.util.spec_from_file_location(
                "cupo_codex_aislado", os.path.join(os.path.dirname(os.path.abspath(__file__)), "cupo_codex.py"))
            c = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(c)
        nueva = os.path.join(tempfile.mkdtemp(prefix="cupo-"), "codex-cupo.json")
        c.RUTA = nueva
        c.anotar("cuenta de ChatGPT sin Codex: prueba", ahora=AHORA, horas=24)
        self.assertTrue(os.path.exists(nueva))
        self.assertFalse(os.path.exists(os.path.join(casa, ".starseed", "codex-cupo.json")))
        self.assertEqual("cuenta de ChatGPT sin Codex: prueba", c.leer()["motivo"])
        self.assertFalse(c.puede_escribir(ahora=AHORA + 3600))


class TestModeloVigente(unittest.TestCase):
    CACHE = {"models": [
        {"slug": "gpt-reserve", "visibility": "hide", "priority": 1},
        {"slug": "gpt-5.6-luna", "visibility": "list", "priority": 3},
        {"slug": "gpt-5.6-terra", "visibility": "list", "priority": 2},
        {"slug": "codex-auto-review", "visibility": "hide", "priority": 4},
    ]}

    def test_admitidos_por_prioridad_y_sin_ocultos(self):
        self.assertEqual(["gpt-5.6-terra", "gpt-5.6-luna"], C.modelos_admitidos(self.CACHE))
        self.assertEqual([], C.modelos_admitidos(None))
        self.assertEqual([], C.modelos_admitidos({"models": "roto"}))

    def test_el_retirado_pasa_al_mejor_admitido(self):
        adm = C.modelos_admitidos(self.CACHE)
        self.assertEqual("gpt-5.6-terra", C.elegir_modelo("codex/gpt-5.6-sol", adm))
        self.assertEqual("gpt-5.6-luna", C.elegir_modelo("codex/gpt-5.6-luna", adm))
        self.assertEqual("gpt-5.6-terra", C.elegir_modelo("gpt-reserve", adm))

    def test_sin_cache_el_pedido_tal_cual(self):
        self.assertEqual("gpt-5.6-sol", C.elegir_modelo("codex/gpt-5.6-sol", []))
        self.assertEqual("gpt-5.6-sol", C.modelo_vigente("codex/gpt-5.6-sol", ruta="/no/existe.json"))

    def test_lee_el_cache_de_un_archivo(self):
        import tempfile
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
            json.dump(self.CACHE, f)
        try:
            self.assertEqual("gpt-5.6-terra", C.modelo_vigente("codex/gpt-5.6-sol", ruta=f.name))
        finally:
            os.remove(f.name)


if __name__ == "__main__":
    unittest.main()
