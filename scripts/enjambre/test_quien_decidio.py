# -*- coding: utf-8 -*-
"""Un rechazo tiene que decir QUIÉN lo firmó.

EL CASO REAL (2026-09-16, ola 326). `p316I` y `p317C` pasaron `tsc` en 0 y las
pruebas en verde. Su revisión cruzada salió bloqueante, así que el orquestador
las puso a esperar y anunció:

    «rama ola/p316I lista (da05b469): tsc 0 · tests ok · revisión bloqueante.
     Espera tu visto bueno en el Mando.»

Nueve minutos después, algo que se identificaba como `ide` —el desatascador, que
corre por temporizador— ejecutó `starseed-puente rechazar` sobre las dos. En el
registro quedó «(ide)». En `progreso.json` quedó esto:

    nota: "rechazada desde el Mando; rama ola/p316I conservada"

Es decir: el estado decía que la había rechazado el Mando, o sea una persona,
cuando no la miró nadie. Alex lo notó sin ver el código, preguntando por qué no
avanzaba nada. Un sistema que no distingue «lo revisó Alex» de «lo mató un
temporizador» no se puede auditar, y esa es justo la diferencia que importa.

Esto NO decide si un director debe poder rechazar solo — eso es política y la
decide Alex. Solo exige que, decida quien decida, quede escrito quién fue.
"""

import os
import sys
import unittest

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
if DIRECTORIO not in sys.path:
    sys.path.insert(0, DIRECTORIO)

from test_progreso_irreversible import enjambre


class PruebaQuienDecidio(unittest.TestCase):
    def test_existe_el_registro_de_quien_decide(self):
        self.assertTrue(hasattr(enjambre, "QUIEN_DECIDIO"))
        self.assertIsInstance(enjambre.QUIEN_DECIDIO, dict)

    def test_el_codigo_ya_no_dice_desde_el_mando_pase_lo_que_pase(self):
        # La cadena solo puede aparecer dentro de la rama que comprueba
        # `quien == "mando"`. Si vuelve a estar suelta, esta prueba lo caza.
        fuente = open(
            os.path.join(DIRECTORIO, "starseed-enjambre.py"), encoding="utf-8"
        ).read()
        i = fuente.find('nota="rechazada desde el Mando')
        self.assertEqual(
            i, -1, "el rechazo vuelve a firmarse como «desde el Mando» sin mirar quién fue"
        )

    def test_un_rechazo_automatico_se_nombra_como_tal(self):
        # La frase que se escribe cuando NO vino del Mando tiene que decir dos
        # cosas: quién fue, y que ahí no hubo persona.
        fuente = open(
            os.path.join(DIRECTORIO, "starseed-enjambre.py"), encoding="utf-8"
        ).read()
        self.assertIn("rechazada automáticamente por %s (sin revisión humana)", fuente)

    def test_el_estado_guarda_quien_decidio(self):
        fuente = open(
            os.path.join(DIRECTORIO, "starseed-enjambre.py"), encoding="utf-8"
        ).read()
        self.assertIn("quien_decidio=quien", fuente)


if __name__ == "__main__":
    unittest.main()
