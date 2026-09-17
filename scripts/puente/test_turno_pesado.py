# -*- coding: utf-8 -*-
"""Pruebas del turno de lo pesado.

Solo se prueban las funciones puras. El `with turno()` toca disco y reloj; lo
que se rompe de verdad no es el mkdir, es DECIDIR si un turno está huérfano y
si me toca soltarlo. Esas dos decisiones son las que aquí se fijan.
"""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import turno_pesado as TP


class TestDueno(unittest.TestCase):
    def test_ida_y_vuelta(self):
        self.assertEqual(TP.dueno_de(TP.texto_dueno(4321, 1700000000)), (4321, 1700000000))

    def test_escritura_a_medias_no_revienta(self):
        # El proceso murió entre el open y el write: el archivo existe vacío.
        self.assertEqual(TP.dueno_de(""), (0, 0))
        self.assertEqual(TP.dueno_de("4321"), (0, 0))
        self.assertEqual(TP.dueno_de(None), (0, 0))

    def test_basura_no_revienta(self):
        self.assertEqual(TP.dueno_de("hola mundo"), (0, 0))

    def test_epoch_con_decimales(self):
        # time.time() es float; el formato lo trunca, pero si alguien escribió
        # el float entero hay que poder leerlo igual.
        self.assertEqual(TP.dueno_de("77 1700000000.94"), (77, 1700000000))


class TestHuerfano(unittest.TestCase):
    AHORA = 1_700_000_000

    def test_dueno_vivo_y_reciente_manda(self):
        texto = TP.texto_dueno(101, self.AHORA - 60)
        self.assertFalse(TP.es_huerfano(texto, [101, 102], self.AHORA))

    def test_dueno_muerto_libera(self):
        texto = TP.texto_dueno(101, self.AHORA - 60)
        self.assertTrue(TP.es_huerfano(texto, [102, 103], self.AHORA))

    def test_dueno_ilegible_libera(self):
        self.assertTrue(TP.es_huerfano("", [101], self.AHORA))

    def test_dueno_vivo_pero_eterno_libera(self):
        texto = TP.texto_dueno(101, self.AHORA - TP.VIEJO_S - 1)
        self.assertTrue(TP.es_huerfano(texto, [101], self.AHORA))

    def test_justo_en_el_limite_no_libera(self):
        texto = TP.texto_dueno(101, self.AHORA - TP.VIEJO_S)
        self.assertFalse(TP.es_huerfano(texto, [101], self.AHORA))


class TestSoltar(unittest.TestCase):
    def test_suelto_lo_mio(self):
        self.assertTrue(TP.puedo_soltar(TP.texto_dueno(55, 1), 55))

    def test_no_suelto_lo_ajeno(self):
        # El caso que costó una publicación: A forzó el turno de B, B despertó
        # y en su finally iba a borrar el turno de A a mitad de la build.
        self.assertFalse(TP.puedo_soltar(TP.texto_dueno(56, 1), 55))

    def test_sin_dueno_no_suelto(self):
        self.assertFalse(TP.puedo_soltar("", 55))


class TestVivo(unittest.TestCase):
    def test_pid_cero_nunca_esta_vivo(self):
        self.assertFalse(TP.esta_vivo(0, [0, 1, 2]))

    def test_lista_vacia(self):
        self.assertFalse(TP.esta_vivo(9, []))
        self.assertFalse(TP.esta_vivo(9, None))


if __name__ == "__main__":
    unittest.main()
