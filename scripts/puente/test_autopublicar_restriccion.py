#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas del freno de migraciones de la autopublicación: reconocer una restricción recreada
(FRN1116A, aprobado por Alex el 16-11). Quitar y volver a poner LA MISMA restricción en la MISMA
tabla dentro de la misma migración es recrearla (p. ej. para cambiar el `ON DELETE` de una clave
ajena, que no se puede de otro modo); no borra datos y no debe frenar la publicación. Todo lo
demás —DROP sin reponer, otra tabla, otro nombre, CASCADE, DROP TABLE, DROP COLUMN— sigue bloqueando."""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import autopublicar as A  # noqa: E402

ARCHIVO = "supabase/migrations/x.sql"
#: El caso real del 16-11: cambiar el `ON DELETE` de una clave ajena exige quitar y volver a poner
#: la misma restricción; con saltos de línea y tabla con esquema, como en la migración parada.
SQL_RECREADA = (
    "ALTER TABLE public.t DROP CONSTRAINT IF EXISTS c;\n"
    "ALTER TABLE public.t ADD CONSTRAINT c FOREIGN KEY (x) REFERENCES public.otra(id) "
    "ON DELETE CASCADE;"
)


def lote(sql):
    return A.analizar_lote("", {ARCHIVO: sql})


class PruebaRestriccionRecreada(unittest.TestCase):
    def test_recreada_en_la_misma_tabla_no_bloquea(self):
        self.assertEqual(lote(SQL_RECREADA), [])

    def test_drop_sin_volver_a_poner_bloquea(self):
        bloqueos = lote("ALTER TABLE public.t DROP CONSTRAINT IF EXISTS c;")
        self.assertTrue(bloqueos)
        self.assertIn("destructiva", bloqueos[0])

    def test_volver_a_ponerla_en_otra_tabla_bloquea(self):
        sql = ("ALTER TABLE public.t DROP CONSTRAINT IF EXISTS c;\n"
               "ALTER TABLE public.otra ADD CONSTRAINT c FOREIGN KEY (x) "
               "REFERENCES public.t(id) ON DELETE CASCADE;")
        bloqueos = lote(sql)
        self.assertTrue(bloqueos)
        self.assertIn("destructiva", bloqueos[0])

    def test_volver_a_ponerla_con_otro_nombre_bloquea(self):
        sql = ("ALTER TABLE public.t DROP CONSTRAINT IF EXISTS c;\n"
               "ALTER TABLE public.t ADD CONSTRAINT c2 FOREIGN KEY (x) "
               "REFERENCES public.otra(id) ON DELETE CASCADE;")
        bloqueos = lote(sql)
        self.assertTrue(bloqueos)
        self.assertIn("destructiva", bloqueos[0])

    def test_drop_constraint_con_cascade_bloquea(self):
        bloqueos = lote("ALTER TABLE public.t DROP CONSTRAINT c CASCADE;")
        self.assertTrue(bloqueos)
        self.assertIn("destructiva", bloqueos[0])

    def test_drop_table_y_drop_column_bloquean_aun_recreando(self):
        for sql in ("DROP TABLE public.t;\n" + SQL_RECREADA,
                    "ALTER TABLE public.t DROP COLUMN x;\n" + SQL_RECREADA):
            bloqueos = lote(sql)
            self.assertTrue(bloqueos, sql)
            self.assertIn("destructiva", bloqueos[0])

    def test_migracion_sin_nada_de_esto_sigue_limpia(self):
        sql = ("CREATE TABLE public.otra (id uuid primary key, t_id uuid);\n"
               "ALTER TABLE public.t ENABLE ROW LEVEL SECURITY;")
        self.assertEqual(lote(sql), [])


if __name__ == "__main__":
    unittest.main()
