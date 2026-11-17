#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""FRN01: el freno de migraciones reconoce una restricción RECREADA en la misma migración.

Quitar y volver a poner LA MISMA restricción en la MISMA tabla y en la misma migración
(`ALTER TABLE t DROP CONSTRAINT IF EXISTS c; ALTER TABLE t ADD CONSTRAINT c FOREIGN KEY …`)
es recrearla, como ya se perdona recrear una política o un disparador: no borra datos y
no debe frenar la autopublicación. Todo lo demás sigue bloqueando.
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import autopublicar as A  # noqa: E402

MIGRACION = "supabase/migrations/x.sql"


def lote(sql):
    """Bloqueos de `analizar_lote` con una sola migración y diff vacío."""
    return A.analizar_lote("", {MIGRACION: sql})


def de_migracion(bloqueos):
    return [b for b in bloqueos if "migración destructiva" in b]


class PruebaRestriccionRecreada(unittest.TestCase):
    RECREADA = ("ALTER TABLE public.t DROP CONSTRAINT IF EXISTS c;\n"
                "ALTER TABLE public.t ADD CONSTRAINT c FOREIGN KEY (u) REFERENCES public.u (id) "
                "ON DELETE CASCADE;")

    def test_recreada_en_la_misma_tabla_no_bloquea(self):
        self.assertEqual(lote(self.RECREADA), [])

    def test_sin_volver_a_ponerla_sigue_bloqueando(self):
        sql = "ALTER TABLE public.t DROP CONSTRAINT IF EXISTS c;"
        self.assertEqual(len(de_migracion(lote(sql))), 1)

    def test_volver_a_ponerla_en_otra_tabla_sigue_bloqueando(self):
        sql = ("ALTER TABLE public.t DROP CONSTRAINT IF EXISTS c;\n"
               "ALTER TABLE public.otra ADD CONSTRAINT c FOREIGN KEY (u) REFERENCES public.u (id) "
               "ON DELETE CASCADE;")
        self.assertEqual(len(de_migracion(lote(sql))), 1)

    def test_volver_a_ponerla_con_otro_nombre_sigue_bloqueando(self):
        sql = ("ALTER TABLE public.t DROP CONSTRAINT IF EXISTS c;\n"
               "ALTER TABLE public.t ADD CONSTRAINT c2 FOREIGN KEY (u) REFERENCES public.u (id) "
               "ON DELETE CASCADE;")
        self.assertEqual(len(de_migracion(lote(sql))), 1)

    def test_drop_con_cascade_sigue_bloqueando(self):
        sql = "ALTER TABLE public.t DROP CONSTRAINT c CASCADE;"
        self.assertEqual(len(de_migracion(lote(sql))), 1)

    def test_drop_table_y_drop_column_sigue_bloqueando(self):
        sql = ("DROP TABLE public.vieja;\n"
               "ALTER TABLE public.t DROP CONSTRAINT IF EXISTS c;\n"
               "ALTER TABLE public.t ADD CONSTRAINT c FOREIGN KEY (u) REFERENCES public.u (id) "
               "ON DELETE CASCADE;\n"
               "ALTER TABLE public.t DROP COLUMN vieja;")
        bloqueos = de_migracion(lote(sql))
        self.assertEqual(len(bloqueos), 1)
        self.assertIn("DROP", bloqueos[0])

    def test_migracion_limpia_sigue_limpia(self):
        sql = "CREATE TABLE public.nueva (id bigint PRIMARY KEY, u bigint REFERENCES public.u (id));"
        self.assertEqual(lote(sql), [])


if __name__ == "__main__":
    unittest.main()
