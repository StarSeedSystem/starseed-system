"""Pruebas de cortes y continuidad (CVV1028, tarea M).

Solo la puntuación pura, con series inventadas: no se llama a ffmpeg.
Ejecutar: python3 scripts/contenido_vivo/test_cortes.py
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cortes import juzgar_pares, mediana_local  # noqa: E402


class PruebaContinuidad(unittest.TestCase):
    def test_movimiento_rapido_y_suave_pasa(self):
        # SSIM baja pero estable: el movimiento es rápido, no hay cortes.
        serie = [0.42, 0.39, 0.41, 0.38, 0.40, 0.37, 0.41, 0.39]
        informe = juzgar_pares(serie)
        self.assertTrue(informe["pasa"], msg=informe)
        self.assertEqual(informe["cortes"], [])

    def test_desplome_local_falla(self):
        serie = [0.90, 0.90, 0.90, 0.10, 0.90, 0.90, 0.90]
        informe = juzgar_pares(serie)
        self.assertFalse(informe["pasa"])
        self.assertEqual(informe["cortes"], [3])

    def test_mas_de_dos_congelados_falla(self):
        informe = juzgar_pares([0.999] * 6)
        self.assertFalse(informe["pasa"])
        self.assertGreater(len(informe["congelados"]), 2)

    def test_dos_congelados_pasan(self):
        serie = [0.90, 0.999, 0.90, 0.90, 0.999, 0.90]
        informe = juzgar_pares(serie)
        self.assertTrue(informe["pasa"], msg=informe)
        self.assertEqual(len(informe["congelados"]), 2)

    def test_menos_de_tres_pares_nunca_pasa(self):
        for serie in ([0.9], [0.9, 0.9], []):
            with self.subTest(serie=serie):
                informe = juzgar_pares(serie)
                self.assertFalse(informe["pasa"])
                self.assertIn("pares medidos", informe["motivo"])

    def test_mediana_local_usa_ventana_de_tres(self):
        serie = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]
        self.assertEqual(mediana_local(serie, 4), 0.5)
        self.assertEqual(mediana_local(serie, 1), 0.3)


class PruebaCortes(unittest.TestCase):
    def test_corte_contra_mediana_del_clip(self):
        informe = juzgar_pares([0.90, 0.91, 0.10, 0.90, 0.89], local=False)
        self.assertFalse(informe["pasa"])
        self.assertEqual(informe["cortes"], [2])

    def test_clip_estable_pasa(self):
        informe = juzgar_pares([0.80, 0.81, 0.79, 0.80], local=False)
        self.assertTrue(informe["pasa"], msg=informe)

    def test_clip_corto_no_pasa(self):
        informe = juzgar_pares([0.9, 0.9], local=False)
        self.assertFalse(informe["pasa"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
