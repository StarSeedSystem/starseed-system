# -*- coding: utf-8 -*-
"""Lo que lanza el Mando tiene que ser VISIBLE para el vigilante.

El caso real (ola 325, 2026-09-16): el Mando lanzó el orquestador a las 19:34:59
sin la bandera `-u`. `orquestador_vivo()` solo reconoce como orquestador un
proceso cuya orden empieza por un python seguido de `-u`, así que para el
vigilante no había nadie trabajando — y a los cuarenta y ocho segundos lanzó un
SEGUNDO orquestador sobre la misma cola. Los dos se pelearon por los arriendos
(«el arriendo de PS8 ya pertenece a otro medio») y doblaron la memoria usada en
una Mac de 8 GB, con las puertas ya haciendo cola detrás de un único cerrojo.

La regla de oro es UN orquestador con N trabajadores. Esta prueba la defiende
desde el otro lado: comprueba que la orden que escribe el Mando encaja con el
patrón con el que el vigilante cuenta orquestadores. Son dos archivos distintos
—`src/lib/mando/colas.ts` y `scripts/puente/vigilante_logica.py`— y nada más los
ata; por eso se atan aquí.
"""

import os
import re
import sys
import unittest

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
if DIRECTORIO not in sys.path:
    sys.path.insert(0, DIRECTORIO)

RAIZ = os.path.dirname(os.path.dirname(DIRECTORIO))
COLAS_TS = os.path.join(RAIZ, "src", "lib", "mando", "colas.ts")

#: El mismo patrón que usa el vigilante en `orquestador_vivo()`.
PATRON_VIGILANTE = re.compile(r"^[^ ]*[Pp]ython[0-9.]* +-u +.*starseed-enjambre\.py")


class PruebaLanzamientoVisible(unittest.TestCase):
    def setUp(self):
        with open(COLAS_TS, encoding="utf-8") as f:
            self.fuente = f.read()

    def test_el_mando_lanza_con_menos_u(self):
        # Se busca la llamada a spawn del lanzamiento local.
        i = self.fuente.find('spawn("python3"')
        self.assertGreater(i, 0, "no se encontró el spawn del orquestador en colas.ts")
        trozo = self.fuente[i : i + 400]
        self.assertIn(
            '"-u"',
            trozo,
            "el Mando lanzaría un orquestador INVISIBLE para el vigilante, que a los "
            "90 s lanzaría un segundo orquestador sobre la misma cola",
        )

    def test_la_orden_resultante_la_reconoce_el_patron_del_vigilante(self):
        orden = (
            "/opt/homebrew/Cellar/python@3.14/3.14.7/Frameworks/Python.framework/"
            "Versions/3.14/Resources/Python.app/Contents/MacOS/Python -u "
            "/Users/alex/.local/bin/starseed-enjambre.py "
            "starseed_memory_root/olas/cola-325-panorama-sociocultural.json --workers 3"
        )
        self.assertTrue(PATRON_VIGILANTE.match(orden))

    def test_sin_la_bandera_el_vigilante_no_lo_ve(self):
        # Esta es exactamente la orden que se lanzó en la ola 325 y que el
        # vigilante no contó.
        orden = (
            "/opt/homebrew/Cellar/python@3.14/3.14.7/Frameworks/Python.framework/"
            "Versions/3.14/Resources/Python.app/Contents/MacOS/Python "
            "/Users/alex/.local/bin/starseed-enjambre.py "
            "starseed_memory_root/olas/cola-325-panorama-sociocultural.json --workers 5"
        )
        self.assertIsNone(PATRON_VIGILANTE.match(orden))


if __name__ == "__main__":
    unittest.main()
