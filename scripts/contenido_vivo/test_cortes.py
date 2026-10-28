"""Pruebas de cortes y continuidad (CVV1028, tarea M).

Solo la función de puntuación pura con series inventadas: no se llama a ffmpeg.
Ejecutar: python3 scripts/contenido_vivo/test_cortes.py
"""
import os
import sys
import unittest

_Aqui = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _Aqui)
from cortes import (  # noqa: E402
    MIN_PARES,
    UMBRAL_CONGELADO,
    UMBRAL_CORTE,
    puntuar,
)


class PruebaPuntuacion(unittest.TestCase):
    def test_movimiento_rapido_y_suave_pasa(self):
        serie = [0.35, 0.33, 0.36, 0.34, 0.32, 0.35, 0.33]
        resultado = puntuar(serie)
        self.assertTrue(resultado["pasa"], msg=resultado["motivos"])

    def test_ssim_baja_uniforme_pasa(self):
        serie = [0.2, 0.21, 0.19, 0.22, 0.2, 0.21]
        self.assertTrue(puntuar(serie)["pasa"])

    def test_desplome_local_falla(self):
        serie = [0.92, 0.91, 0.9, 0.08, 0.92, 0.91]
        resultado = puntuar(serie)
        self.assertFalse(resultado["pasa"])
        self.assertEqual(resultado["cortes"], [3])

    def test_desplome_sobre_ssim_baja_falla(self):
        serie = [0.4, 0.41, 0.39, 0.1, 0.4, 0.42]
        resultado = puntuar(serie)
        self.assertFalse(resultado["pasa"])
        self.assertIn(3, resultado["cortes"])

    def test_pico_aislado_no_es_corte(self):
        serie = [0.2, 0.2, 0.9, 0.2, 0.2]
        self.assertTrue(puntuar(serie)["pasa"])

    def test_congelado_absoluto(self):
        serie = [0.9, 0.9, 0.996, 0.9, 0.9]
        self.assertEqual(puntuar(serie)["congelados"], [2])

    def test_tres_congelados_fallan(self):
        serie = [0.996, 0.996, 0.996, 0.9, 0.9]
        resultado = puntuar(serie)
        self.assertFalse(resultado["pasa"])
        self.assertEqual(len(resultado["congelados"]), 3)

    def test_dos_congelados_pasan(self):
        serie = [0.996, 0.996, 0.9, 0.9, 0.9]
        self.assertTrue(puntuar(serie)["pasa"])

    def test_menos_de_tres_pares_nunca_pasa(self):
        for serie in ([], [0.9], [0.9, 0.9]):
            self.assertFalse(puntuar(serie)["pasa"])
        self.assertEqual(MIN_PARES, 3)

    def test_mediana_global_para_cortes(self):
        serie = [0.9, 0.9, 0.1, 0.9, 0.9, 0.9]
        resultado = puntuar(serie, local=False, mirar_congelados=False)
        self.assertEqual(resultado["cortes"], [2])
        self.assertFalse(resultado["pasa"])

    def test_clip_rapido_sin_cortes_pasa(self):
        serie = [0.3, 0.31, 0.29, 0.3, 0.32, 0.28]
        self.assertTrue(puntuar(serie, local=False, mirar_congelados=False)["pasa"])

    def test_cortes_ignora_congelados(self):
        serie = [0.996, 0.996, 0.996, 0.996]
        self.assertTrue(puntuar(serie, local=False, mirar_congelados=False)["pasa"])

    def test_umbrales_documentados(self):
        self.assertEqual(UMBRAL_CORTE, 0.45)
        self.assertEqual(UMBRAL_CONGELADO, 0.995)


if __name__ == "__main__":
    unittest.main(verbosity=2)
