"""Pruebas de pasarelas.py: los casos REALES medidos el 16/09, uno por uno."""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from pasarelas import (CAIDA, CATALOGO, ESCRIBE, LENTA, MODELO_FUERA, SIN_CANAL,
                       SIN_CLAVE, SIN_CUPO, accion_de, clasificar, hay_que_renovar,
                       informe, para_abrir)


class TestClasificar(unittest.TestCase):
    def test_si_escribio_esta_viva_digan_lo_que_digan(self):
        self.assertEqual(clasificar(200, "cualquier cosa", hubo_tokens=True), ESCRIBE)
        self.assertEqual(clasificar(429, "quota", hubo_tokens=True), ESCRIBE)

    def test_el_silencio_que_nos_costo_el_dia(self):
        # NIM: conexión aceptada, 20 s, cero bytes. http=0.
        self.assertEqual(clasificar(0, ""), LENTA)

    def test_xkiro_sin_cupo(self):
        self.assertEqual(
            clasificar(429, "You've reached today's free-model token quota."), SIN_CUPO)

    def test_tokenrouter_sin_canal(self):
        self.assertEqual(
            clasificar(503, "No available channel for model z-ai/glm-5.3-free"), SIN_CANAL)

    def test_deepseek_clave_caducada(self):
        self.assertEqual(
            clasificar(401, "Authentication Fails, Your api key is invalid"), SIN_CLAVE)

    def test_nim_sin_clave_da_un_500_enganoso(self):
        # El 500 diría «caída», pero el cuerpo dice la verdad: falta la autorización.
        self.assertEqual(
            clasificar(500, "Missing request extension: ... Authorization<Bearer>"), SIN_CLAVE)

    def test_openrouter_modelo_ya_no_gratis(self):
        self.assertEqual(
            clasificar(404, "This model is unavailable for free."), MODELO_FUERA)

    def test_groq_modelo_retirado(self):
        self.assertEqual(
            clasificar(404, "The model `llama-3.3-70b-versatile` does not exist"), MODELO_FUERA)

    def test_codigos_sin_cuerpo(self):
        self.assertEqual(clasificar(403, ""), SIN_CLAVE)
        self.assertEqual(clasificar(429, ""), SIN_CUPO)
        self.assertEqual(clasificar(502, ""), CAIDA)

    def test_entradas_raras(self):
        self.assertEqual(clasificar(None, None), LENTA)
        self.assertEqual(clasificar("no es un número", ""), LENTA)


class TestQueHacer(unittest.TestCase):
    def test_solo_la_clave_pide_una_persona(self):
        self.assertTrue(hay_que_renovar(SIN_CLAVE))
        for e in (ESCRIBE, SIN_CUPO, SIN_CANAL, MODELO_FUERA, LENTA, CAIDA):
            self.assertFalse(hay_que_renovar(e), e)

    def test_sin_cupo_no_manda_a_nadie_a_la_web(self):
        a = accion_de("xkiro", SIN_CUPO)
        self.assertFalse(a["humano"])
        self.assertIn("se repone sola", a["texto"])

    def test_sin_clave_trae_el_enlace(self):
        a = accion_de("deepseek", SIN_CLAVE)
        self.assertTrue(a["humano"])
        self.assertIn("platform.deepseek.com", a["enlace"])

    def test_la_lenta_no_es_culpa_de_la_clave(self):
        a = accion_de("nvidia", LENTA)
        self.assertFalse(a["humano"])
        self.assertIn("cola", a["texto"])


class TestInforme(unittest.TestCase):
    def test_cuenta_las_que_escriben(self):
        t = informe([{"clave": "openrouter", "modelo": "m", "estado": ESCRIBE},
                     {"clave": "xkiro", "modelo": "n", "estado": SIN_CUPO}])
        self.assertIn("1 de 2 escriben", t)

    def test_avisa_cuando_no_escribe_ninguna(self):
        t = informe([{"clave": "xkiro", "modelo": "n", "estado": SIN_CUPO}])
        self.assertIn("NO debe arrancar", t)

    def test_las_vivas_van_primero(self):
        t = informe([{"clave": "xkiro", "modelo": "n", "estado": CAIDA},
                     {"clave": "groq", "modelo": "m", "estado": ESCRIBE}])
        self.assertLess(t.index("Groq"), t.index("xkiro"))


class TestParaAbrir(unittest.TestCase):
    def test_solo_las_que_piden_clave_nueva(self):
        r = [{"clave": "deepseek", "estado": SIN_CLAVE},
             {"clave": "xkiro", "estado": SIN_CUPO},
             {"clave": "nvidia", "estado": LENTA}]
        self.assertEqual(para_abrir(r), [CATALOGO["deepseek"]["enlace"]])

    def test_sin_repetidos(self):
        r = [{"clave": "deepseek", "estado": SIN_CLAVE}] * 3
        self.assertEqual(len(para_abrir(r)), 1)

    def test_nada_que_abrir(self):
        self.assertEqual(para_abrir([{"clave": "groq", "estado": ESCRIBE}]), [])


class TestCatalogo(unittest.TestCase):
    def test_grok_esta_listado_aunque_no_haya_clave(self):
        self.assertIn("xai", CATALOGO)
        self.assertIn("console.x.ai", CATALOGO["xai"]["enlace"])

    def test_toda_ficha_tiene_nombre_y_enlace(self):
        for clave, f in CATALOGO.items():
            self.assertTrue(f.get("nombre"), clave)
            self.assertTrue(f.get("enlace", "").startswith("https://"), clave)


if __name__ == "__main__":
    unittest.main()
