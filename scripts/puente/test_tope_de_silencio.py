"""Pruebas de `tope_de_silencio` (scripts/enjambre/medios.py) DENTRO de las puertas.

Por qué vive aquí y no en scripts/enjambre: los test_*.py de esa carpeta no los corre
ninguna puerta (necesitan pytest, que no siempre está). Esta decisión gobierna cuándo se
corta a un agente vivo, y equivocarla cuesta horas de enjambre: merece estar en la suite
que sí se ejecuta antes de publicar.
"""

import os
import sys
import unittest

RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(RAIZ, "scripts", "enjambre"))

from medios import tope_de_silencio

CORTO, LARGO = 300, 900


class TestTopeDeSilencio(unittest.TestCase):
    def test_escribiendo_y_hablando_tope_largo(self):
        # PS1 y PS7 (ola 325): archivo escrito, registro creciendo. No se cortan.
        self.assertEqual(tope_de_silencio(5000, CORTO, LARGO, True), LARGO)

    def test_escribio_y_se_calla_tope_corto(self):
        # Escribió y lleva cinco minutos mudo: sospechoso, se corta.
        self.assertEqual(tope_de_silencio(5000, CORTO, LARGO, False), CORTO)

    def test_orientandose_tope_largo(self):
        # Kimi K3 (p324A): aún no ha escrito, pero lee y lista — el registro crece.
        self.assertEqual(tope_de_silencio(0, CORTO, LARGO, True), LARGO)

    def test_modelo_que_no_contesta_tope_corto(self):
        # zD1 y zO2 (16/09): cero bytes Y registro plano. Antes se le regalaban 900 s
        # por cada modelo de la rotación; ahora se corta en 300 y rota antes.
        self.assertEqual(tope_de_silencio(0, CORTO, LARGO, False), CORTO)

    def test_manda_el_registro_no_los_bytes(self):
        # La regla en una frase: con el mismo registro, el tope no depende de los bytes.
        for octetos in (0, 1, 999_999):
            self.assertEqual(tope_de_silencio(octetos, CORTO, LARGO, True), LARGO)
            self.assertEqual(tope_de_silencio(octetos, CORTO, LARGO, False), CORTO)

    def test_entradas_raras_no_revientan(self):
        for octetos in (None, -5, "no es un número"):
            self.assertEqual(tope_de_silencio(octetos, CORTO, LARGO, False), CORTO)

    def test_valores_por_defecto(self):
        self.assertEqual(tope_de_silencio(0), 300)
        self.assertEqual(tope_de_silencio(0, log_creciendo=True), 900)


if __name__ == "__main__":
    unittest.main()
