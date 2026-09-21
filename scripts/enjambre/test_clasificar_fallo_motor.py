#!/usr/bin/env python3
"""Pruebas unitarias del clasificador de fallos del motor."""

import unittest

from clasificar_fallo_motor import clasificar


class ClasificarFalloMotorTest(unittest.TestCase):
    def test_red(self) -> None:
        salidas = (
            "Unable to connect. Failed to fetch models.dev",
            "Was there a typo in the url or port?",
            "ECONNREFUSED",
            "ENOTFOUND",
            "ETIMEDOUT",
            "getaddrinfo failed",
            "connection reset by peer",
            "network is unreachable",
            "certificate verify failed",
            "name or service not known",
        )
        for salida in salidas:
            with self.subTest(salida=salida):
                self.assertEqual(clasificar(salida, 5), "red")

    def test_pasarela(self) -> None:
        salidas = (
            "405 Not Allowed",
            "HTTP 502 Bad Gateway",
            "HTTP 503 Service Unavailable",
            "HTTP 504 Gateway Timeout",
            "<!doctype html><title>nginx error</title>",
        )
        for salida in salidas:
            with self.subTest(salida=salida):
                self.assertEqual(clasificar(salida, 2), "pasarela")

    def test_cuota(self) -> None:
        for salida in ("HTTP 402", "429", "quota exceeded", "check-in required"):
            with self.subTest(salida=salida):
                self.assertEqual(clasificar(salida, 1), "cuota")

    def test_sin_cambios(self) -> None:
        self.assertEqual(clasificar("Completed without modifying files", 31), "sin_cambios")

    def test_ok_vacio_o_none(self) -> None:
        self.assertEqual(clasificar("", 0), "ok")
        self.assertEqual(clasificar(None, 0), "ok")

    def test_ambiguo_prioriza_red(self) -> None:
        salida = "Unable to connect: upstream returned 503 and quota unavailable"
        self.assertEqual(clasificar(salida, 5), "red")


if __name__ == "__main__":
    unittest.main()
