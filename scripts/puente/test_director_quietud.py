# -*- coding: utf-8 -*-
"""Pruebas de minutos_quieta: medición de espera por t o por latido."""

import os
import sys
import time
import unittest


DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
if DIRECTORIO not in sys.path:
    sys.path.insert(0, DIRECTORIO)


def minutos_quieta(entrada, ahora, latido=None):
    """Función pura de medición de quietud (copiada de director-orquestacion.py)."""
    try:
        t_str = entrada.get("t")
        if t_str:
            t = time.mktime(time.strptime(t_str, "%Y-%m-%d %H:%M:%S"))
            return (ahora - t) / 60
        if latido and isinstance(latido, dict) and "desde" in latido:
            desde = latido["desde"]
            return (ahora - desde) / 60
        return 0
    except Exception:
        return 0


class MinutosQuietaTest(unittest.TestCase):
    def test_con_t_en_formato_valido(self):
        ahora = time.time()
        hace_10_min = ahora - 600  # hace 10 minutos en segundos
        t_str = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(hace_10_min))
        entrada = {"t": t_str}
        minutos = minutos_quieta(entrada, ahora)
        # Permite 0.5 min de tolerancia por overhead
        self.assertGreater(minutos, 9)
        self.assertLess(minutos, 11)

    def test_sin_t_pero_con_latido_desde_epoch(self):
        ahora = time.time()
        hace_5_min = ahora - 300  # hace 5 minutos en segundos
        entrada = {}
        latido = {"desde": hace_5_min}
        minutos = minutos_quieta(entrada, ahora, latido=latido)
        # Permite 0.5 min de tolerancia
        self.assertGreater(minutos, 4)
        self.assertLess(minutos, 6)

    def test_sin_t_ni_latido_devuelve_0(self):
        ahora = time.time()
        entrada = {}
        minutos = minutos_quieta(entrada, ahora)
        self.assertEqual(minutos, 0)

    def test_sin_t_pero_latido_sin_desde_devuelve_0(self):
        ahora = time.time()
        entrada = {}
        latido = {"otro_campo": 123}
        minutos = minutos_quieta(entrada, ahora, latido=latido)
        self.assertEqual(minutos, 0)

    def test_t_malformado_devuelve_0(self):
        ahora = time.time()
        entrada = {"t": "fecha-invalida"}
        minutos = minutos_quieta(entrada, ahora)
        self.assertEqual(minutos, 0)

    def test_t_toma_precedencia_sobre_latido(self):
        ahora = time.time()
        hace_5_min = ahora - 300
        hace_10_min = ahora - 600

        t_str = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(hace_10_min))
        entrada = {"t": t_str}
        latido = {"desde": hace_5_min}

        minutos = minutos_quieta(entrada, ahora, latido=latido)
        # Debe usar t (10 min), no latido (5 min)
        self.assertGreater(minutos, 9)
        self.assertLess(minutos, 11)

    def test_latido_none_como_default(self):
        ahora = time.time()
        entrada = {}
        # Sin pasar latido, sin t, debe devolver 0
        minutos = minutos_quieta(entrada, ahora)
        self.assertEqual(minutos, 0)


if __name__ == "__main__":
    unittest.main()
