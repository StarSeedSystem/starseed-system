# -*- coding: utf-8 -*-
"""Tests de identidad de tarea verificable contra commits (unittest puro)."""

import unittest

from identidad_tarea import identidad_tarea, identidad_commit, esta_integrada


class TestIdentidadTarea(unittest.TestCase):
    def test_extrae_ola_e_id(self):
        tarea = {"ola": "Ola 305 · salas y puente", "id": "zW8"}
        self.assertEqual(identidad_tarea(tarea), ("305", "zW8"))

    def test_ids_con_sufijos_y_prefijos(self):
        for tid in ("V2", "T3F", "p311B", "CX1"):
            self.assertEqual(
                identidad_tarea({"ola": "Ola 249", "id": tid}), ("249", tid)
            )

    def test_rechaza_sin_ola_u_ola_basura(self):
        self.assertIsNone(identidad_tarea({"id": "zW8"}))
        self.assertIsNone(identidad_tarea({"ola": None, "id": "zW8"}))
        self.assertIsNone(identidad_tarea({"ola": "Ola x", "id": "zW8"}))
        self.assertIsNone(identidad_tarea({"ola": 305, "id": "zW8"}))

    def test_rechaza_id_invalido(self):
        for tid in ("", "   ", "solo-letras", "123", "z W8", None, 305):
            self.assertIsNone(identidad_tarea({"ola": "Ola 305", "id": tid}))

    def test_rechaza_entrada_no_dict(self):
        self.assertIsNone(identidad_tarea(None))
        self.assertIsNone(identidad_tarea("zW8"))


class TestIdentidadCommit(unittest.TestCase):
    def test_asunto_simple(self):
        self.assertEqual(
            identidad_commit("Ola 305 · zW8: contrato de salas"), ("305", "zW8")
        )

    def test_asunto_con_descripcion_intermedia(self):
        asunto = (
            "Ola 311 · Puente económico y verificable · p311B: Acuses "
            "honestos y reintentos acotados de notificaciones entre IDE"
        )
        self.assertEqual(identidad_commit(asunto), ("311", "p311B"))

    def test_descripcion_intermedia_con_dos_puntos(self):
        asunto = "Ola 305 · descripción incluso con dos puntos: detalle · zW8: título"
        self.assertEqual(identidad_commit(asunto), ("305", "zW8"))

    def test_titulo_solo_id_sin_texto_no_es_valido(self):
        self.assertIsNone(identidad_commit("Ola 305 · zW8:"))

    def test_referencia_en_titulo_no_cambia_tarea(self):
        self.assertEqual(identidad_commit("Ola 305 · zW8: conecta · V2: voces"), ("305", "zW8"))

    def test_prefijo_no_cierra_otro_id(self):
        self.assertFalse(esta_integrada({"ola": "Ola 305", "id": "V2"}, ["Ola 305 · V20: título"]))

    def test_no_reconoce_menciones_libres(self):
        self.assertIsNone(
            identidad_commit("fix: reparación completa del Puente de Mando")
        )
        self.assertIsNone(identidad_commit("repara zW8 que quedó roto en Ola 305"))
        self.assertIsNone(identidad_commit("Ola 305 · zW8 quedó a medias y se retoca"))
        self.assertIsNone(identidad_commit("zW8: título sin ola"))
        self.assertIsNone(identidad_commit("Ola 305: zW8: sin separador de segmentos"))

    def test_basura_y_tipos_no_texto(self):
        self.assertIsNone(identidad_commit(""))
        self.assertIsNone(identidad_commit("Ola"))
        self.assertIsNone(identidad_commit(None))


class TestEstaIntegrada(unittest.TestCase):
    TAREA = {"ola": "Ola 305", "id": "zW8"}

    def test_integrada_con_asunto_real(self):
        asuntos = ["Ola 305 · zW8: contrato de salas"]
        self.assertTrue(esta_integrada(self.TAREA, asuntos))

    def test_integrada_con_descripcion_intermedia(self):
        asuntos = ["Ola 305 · Puente de pruebas: detalle · zW8: título"]
        self.assertTrue(esta_integrada(self.TAREA, asuntos))

    def test_mismo_id_en_ola_distinta_no_cierra(self):
        v2_275 = {"ola": "Ola 275", "id": "V2"}
        self.assertFalse(esta_integrada(v2_275, ["Ola 249 · V2: paleta"]))
        self.assertTrue(esta_integrada(v2_275, ["Ola 275 · V2: paleta"]))
        self.assertFalse(
            esta_integrada({"ola": "Ola 249", "id": "V2"}, ["Ola 275 · V2: paleta"])
        )

    def test_misma_ola_otro_id_no_cierra(self):
        self.assertFalse(esta_integrada(self.TAREA, ["Ola 305 · T3F: corrección"]))

    def test_mencion_libre_no_cierra(self):
        asuntos = ["fix: repara lo de zW8 de la Ola 305", "Ola 305 · zW8 roto aún"]
        self.assertFalse(esta_integrada(self.TAREA, asuntos))

    def test_tarea_invalida_o_lista_vacia(self):
        self.assertFalse(esta_integrada({"id": "zW8"}, ["Ola 305 · zW8: algo"]))
        self.assertFalse(esta_integrada(self.TAREA, []))
        self.assertFalse(esta_integrada(self.TAREA, None))


if __name__ == "__main__":
    unittest.main()
