# -*- coding: utf-8 -*-
"""Puertas de `es_aviso_de_cuota` con los mensajes REALES que devolvieron las pasarelas.

Cada cadena de aquí está copiada de un log de tarea, no inventada. Un aviso de cuota que no
se reconoce como tal cuesta un intento de la rotación por cada modelo de esa pasarela, y en
la ola 323 eso fueron tres de los seis intentos de p323A, p323E y p323G.

El módulo se importa con importlib porque el nombre del archivo lleva guiones (igual que en
test_alcance.py y test_escritores.py); el import es seguro porque el arranque vive bajo
`if __name__ == "__main__"`.
"""
import importlib.util
import os
import unittest

RUTA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "starseed-enjambre.py")
ESPEC = importlib.util.spec_from_file_location("enjambre_cuota", RUTA)
enjambre = importlib.util.module_from_spec(ESPEC)
ESPEC.loader.exec_module(enjambre)


class AvisosDeCuota(unittest.TestCase):
    def test_el_fichaje_diario_de_apinex_es_aviso_de_cuota(self):
        """Textual del log de p323A, 2026-09-14 16:18."""
        real = ("Daily check-in required to use free models. Please visit "
                "https://apinex.bond/airdrop?tab=quests to check in.")
        self.assertTrue(enjambre.es_aviso_de_cuota(real))

    def test_sigue_reconociendo_los_de_siempre(self):
        self.assertTrue(enjambre.es_aviso_de_cuota(
            "Sorry, to prevent abuse of free resources, accounts that have not been recharged"))
        self.assertTrue(enjambre.es_aviso_de_cuota("insufficient balance"))

    def test_una_respuesta_de_codigo_normal_no_es_aviso_de_cuota(self):
        """Lo importante del otro lado: no confundir trabajo bueno con una cuota agotada."""
        self.assertFalse(enjambre.es_aviso_de_cuota(
            "export function sumar(a: number, b: number) { return a + b; }"))

    def test_un_texto_largo_nunca_es_aviso_de_cuota(self):
        """Los avisos de cuota son cortos; un texto de 400+ caracteres es contenido."""
        self.assertFalse(enjambre.es_aviso_de_cuota("daily check-in required " + "x" * 500))

    def test_vacio_y_none_no_revientan(self):
        self.assertFalse(enjambre.es_aviso_de_cuota(""))
        self.assertFalse(enjambre.es_aviso_de_cuota(None))


if __name__ == "__main__":
    unittest.main()
