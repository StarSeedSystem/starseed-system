# -*- coding: utf-8 -*-
"""Pruebas de la rotación temporal escrita por el director optimizador."""
import importlib.util
import os
import sys
import tempfile
import unittest
from unittest import mock

RUTA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "starseed-enjambre.py")
ESPEC = importlib.util.spec_from_file_location("enjambre_rotacion", RUTA)
enjambre = importlib.util.module_from_spec(ESPEC)
sys.modules["enjambre_rotacion"] = enjambre
ESPEC.loader.exec_module(enjambre)


class RotacionOptimizada(unittest.TestCase):
    def setUp(self):
        self.temporal = tempfile.TemporaryDirectory()
        self.parche_eventos = mock.patch.object(
            enjambre, "EVENTOS", os.path.join(self.temporal.name, "eventos.jsonl")
        )
        self.parche_anon = mock.patch.object(enjambre, "ANON", "")
        self.parche_eventos.start()
        self.parche_anon.start()

    def tearDown(self):
        self.parche_anon.stop()
        self.parche_eventos.stop()
        self.temporal.cleanup()

    def datos(self, **cambios):
        datos = {
            "t": "2026-10-04T12:00:00+00:00",
            "delante": ["c/3", "fuera/9"],
            "detras": ["a/1"],
            "probar": ["nuevo/5", "b/2"],
            "caduca": "2026-10-05T00:00:00+00:00",
        }
        datos.update(cambios)
        return datos

    def test_ordena_delante_probar_y_detras(self):
        base = ["a/1", "b/2", "c/3", "d/4"]
        resultado = enjambre.aplicar_rotacion_optimizada(
            base, self.datos(), "2026-10-04T18:00:00+00:00"
        )
        self.assertEqual(resultado, ["c/3", "d/4", "nuevo/5", "b/2", "a/1"])
        self.assertEqual(base, ["a/1", "b/2", "c/3", "d/4"])

    def test_caducada_deja_la_base_igual(self):
        base = ["a/1", "b/2"]
        resultado = enjambre.aplicar_rotacion_optimizada(
            base,
            self.datos(caduca="2026-10-04T17:59:59+00:00"),
            "2026-10-04T18:00:00+00:00",
        )
        self.assertIs(resultado, base)

    def test_datos_rotos_dejan_la_base_igual(self):
        base = ["a/1", "b/2"]
        for datos in (None, {"caduca": "no-es-fecha"}, self.datos(probar="nuevo/5")):
            with self.subTest(datos=datos):
                self.assertIs(
                    enjambre.aplicar_rotacion_optimizada(
                        base, datos, "2026-10-04T18:00:00+00:00"
                    ),
                    base,
                )

    def test_instantes_epoch_numericos(self):
        # Rescatado de nube/…/OPT1004F: `ahora` y `caduca` admiten epoch.
        base = ["a/1", "b/2", "c/3"]
        resultado = enjambre.aplicar_rotacion_optimizada(
            base,
            self.datos(delante=["c/3"], detras=[], probar=[], caduca=1_800_000_000),
            1_700_000_000,
        )
        self.assertEqual(resultado[0], "c/3")
        caducada = enjambre.aplicar_rotacion_optimizada(
            base,
            self.datos(delante=["c/3"], detras=[], probar=[], caduca=1_600_000_000),
            1_700_000_000,
        )
        self.assertIs(caducada, base)

    def test_duplicados_entre_listas_no_se_repiten(self):
        # Rescatado de nube/…/OPT1004F: un modelo en varias listas sale una vez.
        base = ["a/1", "b/2", "c/3", "d/4"]
        resultado = enjambre.aplicar_rotacion_optimizada(
            base,
            self.datos(
                delante=["a/1", "a/1"],
                detras=["a/1", "d/4"],
                probar=["b/2", "b/2", "nuevo/5"],
            ),
            "2026-10-04T18:00:00+00:00",
        )
        self.assertEqual(resultado, ["a/1", "c/3", "b/2", "nuevo/5", "d/4"])
        self.assertEqual(len(resultado), len(set(resultado)))

    def test_modelo_pedido_sigue_primero(self):
        orden = enjambre.aplicar_rotacion_optimizada(
            ["a/1", "b/2", "c/3"],
            self.datos(probar=[]),
            "2026-10-04T18:00:00+00:00",
        )
        self.assertEqual(
            enjambre.anteponer_modelo_pedido(orden, "b/2"),
            ["b/2", "c/3", "a/1"],
        )


if __name__ == "__main__":
    unittest.main()
