# -*- coding: utf-8 -*-
"""Main quieto mientras se publica (2026-10-05): la publicación toma el cerrojo `integrar`.

Dos publicaciones de la tarde cayeron porque el enjambre integró un cambio de `src/` durante
las puertas: la build instalada dejó de servir y se puso a compilar en la Mac, que ya no puede.
"""
import fcntl
import os
import sys
import tempfile
import unittest

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
if DIRECTORIO not in sys.path:
    sys.path.insert(0, DIRECTORIO)

import publicar as P  # noqa: E402


class DiarioFalso:
    def __init__(self):
        self.marcas = []

    def marcar(self, paso, estado, detalle=""):
        self.marcas.append((paso, estado, detalle))


class CerrojoIntegrar(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        self.ruta = os.path.join(self.dir, "cerrojos", "integrar.lock")
        P.soltar_integracion()

    def tearDown(self):
        P.soltar_integracion()

    def test_libre_lo_toma_y_lo_suelta(self):
        d = DiarioFalso()
        self.assertTrue(P.tomar_integracion(d, espera_max_s=1, dormir=lambda s: None, ruta=self.ruta))
        # Mientras lo tiene, un orquestador (otra apertura del archivo) no puede integrar.
        otro = open(self.ruta, "w")
        with self.assertRaises(BlockingIOError):
            fcntl.flock(otro, fcntl.LOCK_EX | fcntl.LOCK_NB)
        P.soltar_integracion()
        fcntl.flock(otro, fcntl.LOCK_EX | fcntl.LOCK_NB)  # ya libre: no lanza
        fcntl.flock(otro, fcntl.LOCK_UN)
        otro.close()
        self.assertEqual(d.marcas, [])

    def test_si_una_integracion_lo_tiene_espera_avisando_y_no_se_cuelga(self):
        os.makedirs(os.path.dirname(self.ruta), exist_ok=True)
        orquestador = open(self.ruta, "w")
        fcntl.flock(orquestador, fcntl.LOCK_EX | fcntl.LOCK_NB)
        d = DiarioFalso()
        relojes = iter([0.0, 1.0, 2.0, 99.0, 99.0])
        original = P.time.time
        P.time.time = lambda: next(relojes, 99.0)
        try:
            tiene = P.tomar_integracion(d, espera_max_s=5, dormir=lambda s: None, ruta=self.ruta)
        finally:
            P.time.time = original
            fcntl.flock(orquestador, fcntl.LOCK_UN)
            orquestador.close()
        self.assertFalse(tiene)
        self.assertTrue(d.marcas)
        self.assertIn("esperando a que el enjambre termine de integrar", d.marcas[0][2])

    def test_soltar_dos_veces_no_falla(self):
        d = DiarioFalso()
        P.tomar_integracion(d, espera_max_s=1, dormir=lambda s: None, ruta=self.ruta)
        P.soltar_integracion()
        P.soltar_integracion()


if __name__ == "__main__":
    unittest.main()
