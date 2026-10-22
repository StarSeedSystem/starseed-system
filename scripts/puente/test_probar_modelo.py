#!/usr/bin/env python3
"""Pruebas de probar_modelo.py: la decisión pura y la medida con motores de ejemplo (sin red)."""

from __future__ import annotations

import unittest

from probar_modelo import decidir, probar_modelo


def ok(segundos: float, **extra) -> dict:
    return {"exitoso": True, "segundos": segundos, **extra}


class TestDecidir(unittest.TestCase):
    def test_fallo_vuelve_atras(self) -> None:
        self.assertEqual(decidir({"exitoso": False}, None), "volver_atras")
        self.assertEqual(decidir({"exitoso": False, "capacidad_nueva": True}, ok(1)), "volver_atras")

    def test_sin_actual_se_queda(self) -> None:
        self.assertEqual(decidir(ok(9.0), None), "quedarse")
        self.assertEqual(decidir(ok(9.0), {"exitoso": False}), "quedarse")

    def test_limite_del_15_por_ciento(self) -> None:
        self.assertEqual(decidir(ok(1.15), ok(1.0)), "quedarse")
        self.assertEqual(decidir(ok(1.2), ok(1.0)), "volver_atras")
        self.assertEqual(decidir(ok(0.5), ok(1.0)), "quedarse")

    def test_capacidad_nueva_compensa_la_lentitud(self) -> None:
        self.assertEqual(decidir(ok(5.0, capacidad_nueva=True), ok(1.0)), "quedarse")

    def test_sin_medida_no_se_afirma(self) -> None:
        self.assertEqual(decidir({"exitoso": True}, ok(1.0)), "volver_atras")


class TestProbar(unittest.TestCase):
    def reloj(self):
        marcas = iter([10.0, 12.5])
        return lambda: next(marcas)

    def test_imagen_mide_tiempo_y_memoria(self) -> None:
        vistas = []

        def http(url, cuerpo):
            vistas.append((url, cuerpo))
            return {"images": ["base64"]}

        mems = iter([100.0, 450.0])
        r = probar_modelo("imagen", "http://127.0.0.1:7860/", http, lambda: next(mems), self.reloj())
        self.assertTrue(r["exitoso"])
        self.assertEqual((r["segundos"], r["pico_mb"]), (2.5, 450.0))
        self.assertEqual(vistas[0][0], "http://127.0.0.1:7860/sdapi/v1/txt2img")
        self.assertEqual((vistas[0][1]["width"], vistas[0][1]["height"]), (512, 512))

    def test_palabra_pide_64_tokens(self) -> None:
        cuerpos = []
        r = probar_modelo("palabra", "http://x", lambda u, c: cuerpos.append(c) or {"content": "hola"},
                          lambda: 1.0, self.reloj())
        self.assertTrue(r["exitoso"])
        self.assertEqual(cuerpos[0]["n_predict"], 64)

    def test_motor_que_no_responde(self) -> None:
        def http(url, cuerpo):
            raise ConnectionRefusedError("cerrado")

        r = probar_modelo("voz", "http://x", http, lambda: 0.0, self.reloj())
        self.assertFalse(r["exitoso"])
        self.assertIn("no responde", r["error"])

    def test_respuesta_vacia_y_area_desconocida(self) -> None:
        r = probar_modelo("oido", "http://x", lambda u, c: {}, lambda: 0.0, self.reloj())
        self.assertFalse(r["exitoso"])
        self.assertIn("text", r["error"])
        self.assertFalse(probar_modelo("telepatia", "http://x")["exitoso"])


if __name__ == "__main__":
    unittest.main()
