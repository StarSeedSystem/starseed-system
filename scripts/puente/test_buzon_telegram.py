# -*- coding: utf-8 -*-
"""Pruebas puras de buzon_telegram.py: partir, lista blanca, tope diario, sin liderazgo no lee."""

import os
import sys
import tempfile
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import buzon_telegram as B


class TestPartir(unittest.TestCase):
    """Pruebas de la función pura partir(texto, tope)."""

    def test_un_parrafo_corto(self):
        texto = "Hola mundo"
        trozos = B.partir(texto, 3500)
        self.assertEqual(trozos, ["Hola mundo"])

    def test_parrafos_multiples_dentro_del_tope(self):
        texto = "Párrafo uno.\n\nPárrafo dos.\n\nPárrafo tres."
        trozos = B.partir(texto, 3500)
        self.assertEqual(trozos, ["Párrafo uno.", "Párrafo dos.", "Párrafo tres."])

    def test_parrafo_mas_largo_que_tope_se_corta(self):
        largo = "a" * 4000
        trozos = B.partir(largo, 3500)
        self.assertEqual(len(trozos), 2)
        self.assertEqual(len(trozos[0]), 3500)
        self.assertEqual(len(trozos[1]), 500)
        self.assertEqual(trozos[0] + trozos[1], largo)

    def test_tope_exacto(self):
        texto = "a" * 3500
        trozos = B.partir(texto, 3500)
        self.assertEqual(trozos, [texto])

    def test_varios_parrafos_que_suman_mas_del_tope(self):
        p1 = "a" * 2000
        p2 = "b" * 2000
        texto = p1 + "\n\n" + p2
        trozos = B.partir(texto, 3500)
        self.assertEqual(len(trozos), 2)
        self.assertLessEqual(len(trozos[0]), 3500)
        self.assertLessEqual(len(trozos[1]), 3500)

    def test_texto_vacio(self):
        trozos = B.partir("", 3500)
        self.assertEqual(trozos, [])

    def test_solo_saltos_de_linea(self):
        trozos = B.partir("\n\n\n", 3500)
        self.assertEqual(trozos, [])


class TestListaBlanca(unittest.TestCase):
    """Pruebas de validación de destino en lista blanca."""

    def test_destino_permitido(self):
        self.assertTrue(B.destino_permitido("telegram:Maggasukha"))

    def test_destino_no_permitido(self):
        self.assertFalse(B.destino_permitido("telegram:OtroUsuario"))
        self.assertFalse(B.destino_permitido("otro:canal"))
        self.assertFalse(B.destino_permitido(""))

    def test_destino_none(self):
        self.assertFalse(B.destino_permitido(None))


class TestTopeDiario(unittest.TestCase):
    """Pruebas de conteo de entregas por día UTC."""

    def setUp(self):
        self.ahora = 1_900_000_000.0  # 2030-01-14 aprox

    def test_sin_entregas_previas(self):
        filas = []
        self.assertEqual(B.contar_entregas_hoy(filas, "claude-sintesis-diaria", self.ahora), 0)

    def test_cuenta_solo_hoy_utc(self):
        ayer = self.ahora - 86400
        filas = [
            {"de": "claude-sintesis-diaria", "t": ayer, "estado": "entregado"},
            {"de": "claude-sintesis-diaria", "t": self.ahora - 3600, "estado": "entregado"},
        ]
        self.assertEqual(B.contar_entregas_hoy(filas, "claude-sintesis-diaria", self.ahora), 1)

    def test_cuenta_hasta_10(self):
        filas = [{"de": "claude-sintesis-diaria", "t": self.ahora - i * 3600, "estado": "entregado"} for i in range(10)]
        self.assertEqual(B.contar_entregas_hoy(filas, "claude-sintesis-diaria", self.ahora), 10)

    def test_no_cuenta_fallos(self):
        filas = [
            {"de": "claude-sintesis-diaria", "t": self.ahora - 3600, "estado": "entregado"},
            {"de": "claude-sintesis-diaria", "t": self.ahora - 7200, "estado": "fallo"},
        ]
        self.assertEqual(B.contar_entregas_hoy(filas, "claude-sintesis-diaria", self.ahora), 1)

    def test_origen_diferente_no_cuenta(self):
        filas = [
            {"de": "otro-origen", "t": self.ahora - 3600, "estado": "entregado"},
        ]
        self.assertEqual(B.contar_entregas_hoy(filas, "claude-sintesis-diaria", self.ahora), 0)


class TestSinLiderazgoNoLee(unittest.TestCase):
    """Pruebas de que sin liderazgo no se lee de Supabase."""

    def test_soy_lider_falso_no_llama_supabase(self):
        with mock.patch("buzon_telegram.leer_avisos_pendientes") as mock_leer:
            with mock.patch("buzon_telegram.LD.soy_lider", return_value={"soy": False, "motivo": "no soy líder"}):
                B.pasada(ahora=1_900_000_000.0, una_vez=True)
            mock_leer.assert_not_called()

    def test_soy_lider_verdadero_llama_supabase(self):
        with mock.patch("buzon_telegram.leer_avisos_pendientes", return_value=[]) as mock_leer:
            with mock.patch("buzon_telegram.LD.soy_lider", return_value={"soy": True, "motivo": "líder"}):
                B.pasada(ahora=1_900_000_000.0, una_vez=True)
            mock_leer.assert_called_once()


class TestValidaciones(unittest.TestCase):
    """Pruebas de validaciones de fila antes de entregar."""

    def test_texto_muy_largo_rechazado(self):
        fila = {"id": 1, "texto": "a" * 12001, "destino": "telegram:Maggasukha", "asunto": "Test", "de": "claude-sintesis-diaria"}
        valido, motivo = B.validar_fila(fila, [])
        self.assertFalse(valido)
        self.assertIn("texto", motivo.lower())

    def test_destino_no_blanca_rechazado(self):
        fila = {"id": 1, "texto": "hola", "destino": "telegram:Otro", "asunto": "Test", "de": "claude-sintesis-diaria"}
        valido, motivo = B.validar_fila(fila, [])
        self.assertFalse(valido)
        self.assertIn("destino", motivo.lower())

    def test_tope_diario_alcanza_rechazado(self):
        ahora = 1_900_000_000.0
        filas_hoy = [{"de": "claude-sintesis-diaria", "t": ahora - i * 3600, "estado": "entregado"} for i in range(10)]
        fila = {"id": 1, "texto": "hola", "destino": "telegram:Maggasukha", "asunto": "Test", "de": "claude-sintesis-diaria"}
        valido, motivo = B.validar_fila(fila, filas_hoy, ahora=ahora)
        self.assertFalse(valido)
        self.assertIn("tope", motivo.lower())

    def test_fila_valida_pasa(self):
        fila = {"id": 1, "texto": "hola", "destino": "telegram:Maggasukha", "asunto": "Test", "de": "claude-sintesis-diaria"}
        valido, motivo = B.validar_fila(fila, [])
        self.assertTrue(valido)
        self.assertEqual(motivo, "")


class TestFrenoSupabase(unittest.TestCase):
    """Pruebas de respeto al freno de Supabase (os_freno)."""

    def test_freno_activo_salta_pasada(self):
        with mock.patch("buzon_telegram.leer_freno_supabase", return_value={"activo": True, "motivo": "cuota"}):
            with mock.patch("buzon_telegram.LD.soy_lider", return_value={"soy": True, "motivo": "líder"}):
                with mock.patch("buzon_telegram.leer_avisos_pendientes") as mock_leer:
                    B.pasada(ahora=1_900_000_000.0, una_vez=True)
                    mock_leer.assert_not_called()

    def test_freno_inactivo_continua(self):
        with mock.patch("buzon_telegram.leer_freno_supabase", return_value={"activo": False}):
            with mock.patch("buzon_telegram.LD.soy_lider", return_value={"soy": True, "motivo": "líder"}):
                with mock.patch("buzon_telegram.leer_avisos_pendientes", return_value=[]) as mock_leer:
                    B.pasada(ahora=1_900_000_000.0, una_vez=True)
                    mock_leer.assert_called_once()


if __name__ == "__main__":
    unittest.main()