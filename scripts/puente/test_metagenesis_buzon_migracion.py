# -*- coding: utf-8 -*-
"""Prueba pura (sin red) de la migración 20261108120000_metagenesis_buzon.sql (BZN1108A).

Comprueba, leyendo el SQL y el SOP del buzón desde el repo:
  · la tabla con sus columnas, valores por defecto y chequeos de clase/estado;
  · las reglas por clase: aviso → telegram:Maggasukha y ≤ 12 000; parte → sin destino,
    archivado y ≤ 40 000;
  · RLS activado y sin políticas para anon ni authenticated;
  · índice parcial de pendientes y otro por (clase, t desc), idempotentes;
  · el SOP que dice quién escribe, quién entrega, el parte diario y los límites.
Nunca toca la base de verdad: la aplique la publicación de siempre.
"""
import os
import re
import unittest

DIR = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(os.path.dirname(DIR))
RUTA_SQL = os.path.join(RAIZ, "supabase", "migrations", "20261108120000_metagenesis_buzon.sql")
RUTA_SOP = os.path.join(RAIZ, "architecture", "buzon-claude-nube-telegram.md")


def leer(ruta):
    with open(ruta, encoding="utf-8") as f:
        return f.read()


def compactar(texto):
    """Una sola línea con espacios normales: la forma importa, la sangría no."""
    return re.sub(r"\s+", " ", texto)


class TestMigracion(unittest.TestCase):
    def setUp(self):
        self.sql = compactar(leer(RUTA_SQL))

    def test_tabla_y_columnas(self):
        for trozo in (
            "CREATE TABLE IF NOT EXISTS public.metagenesis_buzon",
            "id bigserial",
            "t timestamptz",
            'clase text not null default \'aviso\' check (clase in (\'aviso\',\'parte\'))',
            "de text not null",
            "destino text",
            "asunto text",
            "char_length(asunto) <= 120",
            "texto text not null",
            "asunto text check (char_length(asunto) <= 120)",
            "estado text not null default 'pendiente' check (estado in "
            "('pendiente','entregado','fallo','archivado'))",
            "entregado_en timestamptz",
            "detalle text",
        ):
            self.assertIn(trozo, self.sql, trozo)

    def test_reglas_por_clase(self):
        self.assertIn("char_length(texto) <= 12000", self.sql)
        self.assertIn("char_length(texto) <= 40000", self.sql)
        self.assertIn("'telegram:Maggasukha'", self.sql)
        # El chequeo cruza clase, destino, estado y tamaño en una sola regla.
        self.assertIn("clase = 'parte' AND destino IS NULL AND estado = 'archivado'", self.sql)

    def test_rls_sin_politicas(self):
        self.assertIn("ENABLE ROW LEVEL SECURITY", self.sql)
        self.assertNotIn("CREATE POLICY", self.sql)
        self.assertNotIn("FROM anon", self.sql)
        self.assertNotIn("FROM authenticated", self.sql)

    def test_indices_idempotentes(self):
        self.assertIn("CREATE INDEX IF NOT EXISTS metagenesis_buzon_pendientes_idx", self.sql)
        self.assertIn("(clase, t desc)", self.sql)
        self.assertIn("WHERE estado = 'pendiente'", self.sql)

    def test_sin_claves(self):
        for marca in ("sk-", "eyJ", "postgresql://", "postgres://"):
            self.assertNotIn(marca, self.sql)


class TestSop(unittest.TestCase):
    def setUp(self):
        self.sop = leer(RUTA_SOP)

    def test_dice_quien_escribe_y_quien_entrega(self):
        self.assertIn("metagenesis_buzon", self.sop)
        self.assertIn("insert into metagenesis_buzon", self.sop)
        self.assertIn("claude-sintesis-diaria", self.sop)
        self.assertIn("BZN1108B", self.sop)
        self.assertIn("hermes send", self.sop)

    def test_dice_el_parte_y_los_limites(self):
        self.assertIn("where clase='parte' order by t desc limit 1", self.sop)
        self.assertIn("BZN1108C", self.sop)
        self.assertIn("lista blanca", self.sop)
        self.assertIn("10 avisos", self.sop)
        self.assertIn("Mando", self.sop)

    def test_sin_claves_ni_valores(self):
        for marca in ("sk-", "TOKEN =", "postgresql://"):
            self.assertNotIn(marca, self.sop)


if __name__ == "__main__":
    unittest.main()
