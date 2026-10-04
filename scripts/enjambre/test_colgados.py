# -*- coding: utf-8 -*-
"""Un modelo que se cuelga 3 veces seguidas sin escribir sale de la rotación horas
(2026-10-04, Ola 1004C · CP1004A).

google/gemini-3.6-flash se colgó 45 veces en dos días y escribió cero: cada cuelgue
costaba ~300 s y MUERTOS solo vivía en memoria, así que el orquestador lo volvía a
elegir. La racha ahora es persistente (~/.starseed/colgados.json) y a la tercera el
modelo sale; con dos del mismo proveedor en racha, el proveedor entero sale horas.
"""

import importlib.util
import json
import os
import sys
import tempfile
import time
import unittest
from unittest import mock

RUTA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "starseed-enjambre.py")
ESPEC = importlib.util.spec_from_file_location("enjambre", RUTA)
enjambre = importlib.util.module_from_spec(ESPEC)
sys.modules["enjambre"] = enjambre
ESPEC.loader.exec_module(enjambre)

AHORA = time.time()
M1 = "nim/modelo-uno"
M2 = "nim/modelo-dos"


class ContarColgado(unittest.TestCase):
    def test_suma_uno_y_guarda_ultimo(self):
        datos = enjambre.contar_colgado({}, M1, AHORA)
        self.assertEqual(datos[M1]["seguidos"], 1)
        self.assertEqual(datos[M1]["ultimo"], AHORA)
        datos = enjambre.contar_colgado(datos, M1, AHORA + 60)
        self.assertEqual(datos[M1]["seguidos"], 2)

    def test_racha_vieja_empieza_de_1(self):
        datos = {M1: {"seguidos": 5, "ultimo": AHORA - 25 * 3600}}
        datos = enjambre.contar_colgado(datos, M1, AHORA)
        self.assertEqual(datos[M1]["seguidos"], 1)

    def test_exito_rompe_la_racha(self):
        datos = enjambre.contar_colgado({}, M1, AHORA)
        datos = enjambre.contar_colgado(datos, M1, AHORA + 10)
        datos = enjambre.anotar_escritura(datos, M1)
        self.assertEqual(datos[M1]["seguidos"], 0)
        datos = enjambre.contar_colgado(datos, M1, AHORA + 20)
        self.assertEqual(datos[M1]["seguidos"], 1)


class ApartarSiSeCuelga(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.archivo = os.path.join(self.tmp, "colgados.json")
        self.parches = [
            mock.patch.object(enjambre, "ARCHIVO_COLGADOS", self.archivo),
            mock.patch.object(enjambre, "evento"),
            mock.patch.object(enjambre, "sin_cupo", return_value=False),
        ]
        for p in self.parches:
            p.start()

    def tearDown(self):
        for p in self.parches:
            p.stop()
        enjambre.MUERTOS.discard(M1)
        enjambre.MUERTOS.discard(M2)

    def test_tres_veces_aparta(self):
        with mock.patch.object(enjambre, "marcar_sin_cupo"):
            self.assertFalse(enjambre.apartar_si_se_cuelga("T1", M1))
            self.assertFalse(enjambre.apartar_si_se_cuelga("T1", M1))
            self.assertTrue(enjambre.apartar_si_se_cuelga("T1", M1))
        self.assertIn(M1, enjambre.MUERTOS)
        d = json.load(open(self.archivo, encoding="utf-8"))
        self.assertEqual(d[M1]["seguidos"], 3)

    def test_un_exito_a_mitad_reinicia(self):
        with mock.patch.object(enjambre, "marcar_sin_cupo"):
            enjambre.apartar_si_se_cuelga("T1", M1)
            enjambre.apartar_si_se_cuelga("T1", M1)
            enjambre.anotar_escritura_ok(M1)
            self.assertFalse(enjambre.apartar_si_se_cuelga("T1", M1))
        self.assertNotIn(M1, enjambre.MUERTOS)

    def test_dos_del_mismo_proveedor_apartan_al_proveedor(self):
        marcados = []
        with mock.patch.object(
            enjambre, "marcar_sin_cupo", side_effect=lambda *a, **k: marcados.append(a)
        ):
            for _ in range(enjambre.COLGADOS_MAX):
                enjambre.apartar_si_se_cuelga("T1", M1)
            for _ in range(enjambre.COLGADOS_MAX):
                enjambre.apartar_si_se_cuelga("T1", M2)
        self.assertEqual(len(marcados), 1)
        self.assertEqual(marcados[0][0], "nim")
        self.assertEqual(marcados[0][2], enjambre.HORAS_COLGADO)

    def test_archivo_corrupto_no_rompe_nada(self):
        with open(self.archivo, "w", encoding="utf-8") as f:
            f.write("{ esto no es json")
        with mock.patch.object(enjambre, "marcar_sin_cupo"):
            self.assertFalse(enjambre.apartar_si_se_cuelga("T1", M1))
        d = json.load(open(self.archivo, encoding="utf-8"))
        self.assertEqual(d[M1]["seguidos"], 1)


if __name__ == "__main__":
    unittest.main()
