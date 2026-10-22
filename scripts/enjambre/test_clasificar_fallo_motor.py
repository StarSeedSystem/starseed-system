#!/usr/bin/env python3
"""Pruebas unitarias del clasificador de fallos del motor."""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

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
        self.assertEqual(
            clasificar("Completed without modifying files", 31), "sin_cambios"
        )

    def test_ok_vacio_o_none(self) -> None:
        self.assertEqual(clasificar("", 0), "ok")
        self.assertEqual(clasificar(None, 0), "ok")

    def test_transcripcion_normal_no_es_cuota(self) -> None:
        """(2026-10-22) Lo que el agente LEE no es un error: el A1 apartaba 24 h a todos."""
        salida = "\n".join([
            "$ opencode run --model opencode/glm-5.3-flash-free · 2026-10-22 14:19:20",
            "> build · glm-5.3-flash-free",
            "→ Read src/lib/avatares/cupo-429.ts",
            "✱ Glob \"src/**/quota*.ts\"",
            "| export const MENSAJE = 'Sin cupo: quota del día (HTTP 402)';",
            "He revisado el medidor de quota y los 1429 bytes del registro de las 14:29:02.",
            "Leí 503 líneas del archivo y no hacía falta cambiar nada.",
            "Completed without modifying files",
        ])
        self.assertEqual(clasificar(salida, 120), "sin_cambios")

    def test_error_al_final_tras_transcripcion(self) -> None:
        relleno = "\n".join("→ Read src/lib/archivo-%d.ts" % i for i in range(80))
        for final, clase in (
            ("Error: 429 Too Many Requests", "cuota"),
            ("AI_APICallError: Insufficient credits on this key", "cuota"),
            ("You exceeded your current quota, please check your plan", "cuota"),
            ("HTTP 503 Service Unavailable", "pasarela"),
            ("status code 502 from upstream", "pasarela"),
        ):
            with self.subTest(final=final):
                self.assertEqual(clasificar(relleno + "\n" + final, 60), clase)

    def test_cuota_solo_al_principio_no_cuenta(self) -> None:
        salida = "Error: 429 Too Many Requests\n" + "\n".join(
            "linea normal de trabajo %d" % i for i in range(40))
        self.assertEqual(clasificar(salida, 60), "sin_cambios")

    def test_numeros_que_contienen_el_codigo(self) -> None:
        for salida in ("tamaño 14290 bytes", "pid 4021 terminado", "versión 1.503.2", "a las 15:04:29"):
            with self.subTest(salida=salida):
                self.assertEqual(clasificar(salida, 3), "sin_cambios")

    def test_colores_ansi(self) -> None:
        self.assertEqual(clasificar("\x1b[31mError: 402 Payment Required\x1b[0m", 2), "cuota")

    def test_ambiguo_prioriza_red(self) -> None:
        salida = "Unable to connect: upstream returned 503 and quota unavailable"
        self.assertEqual(clasificar(salida, 5), "red")


if __name__ == "__main__":
    unittest.main()
