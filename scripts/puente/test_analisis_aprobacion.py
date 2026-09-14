# -*- coding: utf-8 -*-
"""Pruebas del análisis de aprobación (unittest puro, sin pytest ni red).

p320E2: pytest no está instalado en la Mac y su import tumbaba la suite entera
del puente (`unittest discover` importa todos los `test_*.py`), así que estas
pruebas usan solo la biblioteca estándar, como el resto de scripts/puente/.
"""

import os
import sys
import unittest


DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
if DIRECTORIO not in sys.path:
    sys.path.insert(0, DIRECTORIO)

from analisis_aprobacion import construir_prompt, leer_veredicto, puede_aprobar_solo  # noqa: E402


FICHA = {
    "id": "123",
    "titulo": "Test Task",
    "rama": "test-branch",
    "sha": "abc123",
    "estado": "pendiente",
    "modelo": "test-model",
    "dificultad": "alta",
    "revisor": "test-revisor",
    "faltan": [],
    "motivo_vb": "test-motivo",
}


def veredicto_json(veredicto, confianza):
    """Construye una salida limpia del analista con el veredicto dado."""
    return (
        '{"veredicto": "%s", "confianza": "%s", '
        '"razones": [], "riesgos": [], "que_revisar": []}' % (veredicto, confianza)
    )


class TestConstruirPrompt(unittest.TestCase):
    def test_incluye_ficha_diff_y_contexto(self):
        prompt = construir_prompt(FICHA, "Test diff", "Test contexto")
        self.assertIn("Test Task", prompt)
        self.assertIn("Test diff", prompt)
        self.assertIn("Test contexto", prompt)

    def test_exige_la_forma_de_json(self):
        # El prompt debe enseñar al analista la estructura JSON exacta que
        # luego leer_veredicto espera; sin ella, la salida es libre e ilegible.
        prompt = construir_prompt(FICHA, "diff", "contexto")
        for clave in ("veredicto", "confianza", "razones", "riesgos", "que_revisar"):
            self.assertIn('"%s"' % clave, prompt)
        for valor in ("aprobar", "rechazar", "dudoso", "alta", "media", "baja"):
            self.assertIn(valor, prompt)

    def test_avisar_cuando_recorta_el_diff(self):
        # Un diff de 24000+ caracteres se recorta y el aviso debe verse en el
        # prompt: el analista decide sin saber que falta texto si no se lo dice.
        largo = "x" * 24000
        recortado = construir_prompt(FICHA, largo, "contexto")
        self.assertNotIn("RECORTADAS", recortado)
        recorte = construir_prompt(FICHA, largo + "y", "contexto")
        self.assertIn("[DIFERENCIAS RECORTADAS]", recorte)
        self.assertNotIn(largo + "y", recorte)


class TestLeerVeredicto(unittest.TestCase):
    def test_json_limpio(self):
        veredicto = leer_veredicto(veredicto_json("aprobar", "alta"))
        self.assertEqual(veredicto["veredicto"], "aprobar")
        self.assertEqual(veredicto["confianza"], "alta")

    def test_json_envuelto_en_prosa(self):
        salida = "El veredicto es: " + veredicto_json("rechazar", "media")
        veredicto = leer_veredicto(salida)
        self.assertEqual(veredicto["veredicto"], "rechazar")
        self.assertEqual(veredicto["confianza"], "media")

    def test_json_en_bloque_de_codigo(self):
        salida = "```json\n%s\n```" % veredicto_json("dudoso", "baja")
        veredicto = leer_veredicto(salida)
        self.assertEqual(veredicto["veredicto"], "dudoso")
        self.assertEqual(veredicto["confianza"], "baja")

    def test_salida_vacia(self):
        veredicto = leer_veredicto("")
        self.assertEqual(veredicto["veredicto"], "dudoso")
        self.assertEqual(veredicto["confianza"], "baja")

    def test_prosa_sin_json(self):
        veredicto = leer_veredicto("creo que está bien, apruébalo")
        self.assertEqual(veredicto["veredicto"], "dudoso")
        self.assertEqual(veredicto["confianza"], "baja")

    def test_veredicto_inventado(self):
        # Valores fuera del catálogo (aprobar/rechazar/dudoso y alta/media/baja)
        # se normalizan a dudoso/baja: nunca se aprueba algo inesperado.
        veredicto = leer_veredicto(veredicto_json("inventado", "inventada"))
        self.assertEqual(veredicto["veredicto"], "dudoso")
        self.assertEqual(veredicto["confianza"], "baja")
        veredicto = leer_veredicto(veredicto_json("aprobar", "inventada"))
        self.assertEqual(veredicto["veredicto"], "dudoso")

    def test_json_roto_se_degrada_a_dudoso(self):
        # Un recorte de JSON incompleto (llaves sin cerrar) no tira la excepción:
        # degrada a dudoso, que nunca auto-aprueba nada.
        veredicto = leer_veredicto('{"veredicto": "aprobar", "confianza": ')
        self.assertEqual(veredicto["veredicto"], "dudoso")
        self.assertEqual(veredicto["confianza"], "baja")


class TestPuedeAprobarSolo(unittest.TestCase):
    def test_aprobar_alta_con_ficha_verde(self):
        veredicto = {"veredicto": "aprobar", "confianza": "alta"}
        self.assertTrue(puede_aprobar_solo(veredicto, True))

    def test_jamas_sin_ficha_verde(self):
        # La regla dura: aunque el analista diga «aprobar» con confianza alta,
        # sin ficha verde no hay auto-aprobación; el humano decide.
        veredicto = {"veredicto": "aprobar", "confianza": "alta"}
        self.assertFalse(puede_aprobar_solo(veredicto, False))

    def test_confianza_menor_no_auto_aprueba(self):
        for confianza in ("media", "baja"):
            veredicto = {"veredicto": "aprobar", "confianza": confianza}
            self.assertFalse(puede_aprobar_solo(veredicto, True))

    def test_veredictos_distintos_de_aprobar(self):
        # rechazar y dudoso nunca auto-aprueban, aunque la ficha esté verde.
        for veredicto_valor in ("rechazar", "dudoso"):
            veredicto = {"veredicto": veredicto_valor, "confianza": "alta"}
            self.assertFalse(puede_aprobar_solo(veredicto, True))

    def test_riesgos_y_revisiones_no_bloquean(self):
        # Decisión de diseño de p320E: puede_aprobar_solo solo mira veredicto,
        # confianza y ficha; riesgos y que_revisar quedan a la puerta humana.
        veredicto = {
            "veredicto": "aprobar",
            "confianza": "alta",
            "razones": ["Test reason"],
            "riesgos": ["Test risk"],
            "que_revisar": ["Test to review"],
        }
        self.assertTrue(puede_aprobar_solo(veredicto, True))


if __name__ == "__main__":
    unittest.main()
