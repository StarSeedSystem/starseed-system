# -*- coding: utf-8 -*-
"""Pruebas de verificacion_tokens_sin_exponer: asegurar que no hay tokens reales en el código."""

import importlib.util
import os
import unittest

_ruta = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "verificar_tokens_sin_exponer.py"
)
_spec = importlib.util.spec_from_file_location("verificar_tokens_sin_exponer", _ruta)
V = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(V)


class TestBuscarTokensEnArchivo(unittest.TestCase):
    def test_no_hallar_tokens_reales_en_archivo_normal(self):
        archivos_reales = [
            "scripts/puente/dream_a_cola.py",
            "scripts/puente/destilacion_corpus.py",
            "CLAUDE.md",
        ]
        for ruta in archivos_reales:
            if os.path.exists(ruta):
                coincidencias = V.buscar_tokens_reales_en_archivo(ruta)
                self.assertEqual(
                    coincidencias,
                    [],
                    f"Archivos de código no deberían contener tokens reales: {ruta}",
                )


class TestPatronToken(unittest.TestCase):
    def test_ghp_token_detectado(self):
        linea = 'apiKey="ghp_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8"'
        self.assertTrue(V.PATRON_TOKEN.search(linea))
        self.assertTrue(V.es_token_falso(linea))

    def test_gho_token_detectado(self):
        linea = "TOKEN=gho_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0"
        self.assertTrue(V.PATRON_TOKEN.search(linea))
        self.assertTrue(V.es_token_falso(linea))

    def test_sk_token_con_letras_detectado(self):
        linea = "sk-abcdefghijklmnopqrstu"
        self.assertTrue(V.PATRON_TOKEN.search(linea))
        self.assertTrue(V.es_token_falso(linea))

    def test_texto_sin_token_no_detecta(self):
        lineas_sin_token = [
            "Token `gho_` incrustado en remoto `astraura`",
            "gho_ siempre que quede",
            "Este es un token ficticio: gho_falso",
            "Ver: https://github.com/StarSeedSystem/starseed-system",
        ]
        for linea in lineas_sin_token:
            self.assertFalse(
                V.PATRON_TOKEN.search(linea),
                f"No debería detectar token ficticio: {linea}",
            )

    def test_token_de_prueba_no_es_real(self):
        lineas_prueba = [
            'const a = "sk-abcdefghijklmnop1234"',
            'token = "github_pat_11AAAAAA0123456789abcdefghijkl"',
        ]
        for linea in lineas_prueba:
            self.assertTrue(V.PATRON_TOKEN.search(linea))
            self.assertTrue(V.es_token_falso(linea), f"Debe ser detectado como token de prueba: {linea}")


class TestVerificarRepositorio(unittest.TestCase):
    def test_repositorio_actual_sin_tokens_reales(self):
        if not os.path.isdir("."):
            self.skipTest("No hay repositorio para verificar")
        hallados = V.verificar_repositorio_sin_tokens_reales(".")
        self.assertEqual(
            hallados,
            {},
            f"No se deberían encontrar tokens reales en el código actual: {hallados}",
        )


if __name__ == "__main__":
    unittest.main()