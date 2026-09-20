#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Casos de reintento_sin_cambios: quién merece un segundo proveedor y quién no."""

import os, sys, unittest
from datetime import datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from reconciliar_progreso import en_main
from reintento_sin_cambios import candidatas, marcar, NOTA_REINTENTO

MODELOS = ["apinex/free/gemini-3.8-flash", "apinex/free/muse-spark-1.3"]


def prog(tid, **kw):
    return {
        tid: {"estado": "sin_cambios", "modelo": "apinex/free/muse-spark-1.3", **kw}
    }


class ReintentoSinCambios(unittest.TestCase):
    def test_sin_rastro_en_main_es_candidata(self):
        c = candidatas(prog("p316E"), ["ola zzz: otra cosa"], MODELOS, ahora="2026-09-13 12:00:00")
        self.assertEqual(c, [("p316E", "apinex/free/gemini-3.8-flash")])

    def test_en_main_no_se_reintenta(self):
        c = candidatas(prog("p316E"), ["Ola 316 · p316E: integra el módulo"], MODELOS, ahora="2026-09-13 12:00:00")
        self.assertEqual(c, [])

    def test_ya_reintentada_no_se_reintenta(self):
        c = candidatas(prog("p316E", reintentos=1), [], MODELOS, ahora="2026-09-13 12:00:00")
        self.assertEqual(c, [])

    def test_evita_el_mismo_modelo(self):
        c = candidatas(prog("p316E"), [], ["apinex/free/muse-spark-1.3"], ahora="2026-09-13 12:00:00")
        self.assertEqual(c, [])

    def test_lista_vacia(self):
        self.assertEqual(candidatas({}, [], MODELOS, ahora="2026-09-13 12:00:00"), [])
        self.assertEqual(candidatas(prog("p316E"), [], [], ahora="2026-09-13 12:00:00"), [])

    def test_marcar_devuelve_copia(self):
        p = prog("p316E")
        nuevo = marcar(p, "p316E", "apinex/free/gemini-3.8-flash")
        e = nuevo["p316E"]
        self.assertEqual(e["estado"], "pendiente")
        self.assertEqual(e["reintentos"], 1)
        self.assertEqual(e["nota"], NOTA_REINTENTO % "apinex/free/gemini-3.8-flash")
        self.assertEqual(p["p316E"]["estado"], "sin_cambios")  # el original intacto

    def test_proveedor_caido_se_excluye(self):
        # apinex está caído, debe excluirse
        salud = {"apinex": {"estado": "caido", "motivo": "api down"}}
        c = candidatas(prog("p316E"), [], MODELOS, salud=salud, ahora="2026-09-13 12:00:00")
        # Los dos modelos son de apinex, ambos se excluyen
        self.assertEqual(c, [])

    def test_sin_cupo_hasta_futuro_se_excluye(self):
        # apinex sin cupo hasta las 14:00, ahora es 12:00
        salud = {"apinex": {"sin_cupo_hasta": "2026-09-13 14:00:00"}}
        c = candidatas(prog("p316E"), [], MODELOS, salud=salud, ahora="2026-09-13 12:00:00")
        self.assertEqual(c, [])

    def test_sin_cupo_hasta_pasado_se_admite(self):
        # apinex sin cupo hasta las 10:00, ahora es 12:00 (ya pasó)
        salud = {"apinex": {"sin_cupo_hasta": "2026-09-13 10:00:00"}}
        c = candidatas(prog("p316E"), [], MODELOS, salud=salud, ahora="2026-09-13 12:00:00")
        self.assertEqual(c, [("p316E", "apinex/free/gemini-3.8-flash")])

    def test_sin_cupo_hasta_con_z_iso_format(self):
        # ISO 8601 con Z debe parsearse correctamente
        salud = {"apinex": {"sin_cupo_hasta": "2026-09-13T14:00:00Z"}}
        c = candidatas(prog("p316E"), [], MODELOS, salud=salud, ahora="2026-09-13 12:00:00")
        self.assertEqual(c, [])  # futuro, excluido

    def test_ahora_como_datetime(self):
        # ahora puede ser datetime en vez de string
        ahora_dt = datetime(2026, 9, 13, 12, 0, 0)
        c = candidatas(prog("p316E"), ["otro"], MODELOS, ahora=ahora_dt)
        self.assertEqual(c, [("p316E", "apinex/free/gemini-3.8-flash")])

    def test_sin_alternativas_no_se_reintenta(self):
        # El único modelo alternativo está caído
        salud = {"apinex": {"estado": "caido"}}
        c = candidatas(prog("p316E"), [], ["apinex/free/gemini-3.8-flash"], salud=salud, ahora="2026-09-13 12:00:00")
        self.assertEqual(c, [])

    def test_ahora_obligatorio(self):
        # ahora es obligatorio
        with self.assertRaises(ValueError):
            candidatas(prog("p316E"), [], MODELOS)

    def test_salud_opcional_por_defecto(self):
        # salud es None por defecto
        c = candidatas(prog("p316E"), [], MODELOS, ahora="2026-09-13 12:00:00")
        self.assertEqual(c, [("p316E", "apinex/free/gemini-3.8-flash")])


if __name__ == "__main__":
    unittest.main()
