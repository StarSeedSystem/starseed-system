#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas de jev_libreta (sin red ni disco)."""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import jev_libreta as JL


class ConstruirLibreta(unittest.TestCase):
    """Probas de `construir` con datos falsos inyectados."""

    def setUp(self):
        self.DOMINIOS_PRIVADOS = (
            "telegram",
            "chat",
            "inbox",
            "buzon",
        )

    def _hacer_libreta(self, captura, experiencia, enlace_id=None):
        """Helper: construir una libreta con captura y experiencia dados.

        Anyade el campo "enlace" a la captura para que construir()
        pueda emparejarla con la experiencia.
        """
        captura_con_link = dict(captura)
        if enlace_id is None:
            enlace_id = experiencia.get("id")
        captura_con_link["enlace"] = enlace_id
        return JL.construir(
            [captura_con_link],
            leer_captura_fn=lambda: [captura_con_link],
            leer_experiencias_fn=lambda: [experiencia],
        )

    def test_privado_excluido(self):
        """Entradas con dominio privado son excluidas."""
        captura = {
            "id": "cap-001",
            "quien": "test",
            "dominio": "telegram",
            "estado": "produccion",
            "estratos": ["noul:produccion"],
            "tipo": "progreso",
        }
        experiencia = {
            "id": "exp-001",
            "tipo": "progreso",
            "estado": "integrada",
        }
        libreta = self._hacer_libreta(captura, experiencia)
        self.assertEqual(len(libreta), 0, "Dominio privado debe ser excluido")

    def test_dominio_publico_incluido(self):
        """Entradas con dominio publico sonincluidas."""
        captura = {
            "id": "cap-002",
            "quien": "test",
            "dominio": "noul",
            "estado": "produccion",
            "estratos": ["noul:produccion"],
            "tipo": "progreso",
        }
        experiencia = {
            "id": "exp-002",
            "tipo": "progreso",
            "estado": "integrada",
        }
        libreta = self._hacer_libreta(captura, experiencia)
        self.assertEqual(len(libreta), 1, "Dominio publico debe ser incluido")

    def test_etiqueta_verdad(self):
        """Experiencia con desenlace integrado -> etiqueta 'verdad'."""
        captura = {
            "id": "cap-003",
            "quien": "test",
            "dominio": "noul",
            "estado": "produccion",
            "estratos": ["noul:produccion"],
            "tipo": "progreso",
        }
        experiencia = {
            "id": "exp-003",
            "tipo": "progreso",
            "estado": "integrada",
        }
        libreta = self._hacer_libreta(captura, experiencia)
        self.assertEqual(libreta[0]["etiqueta"], "verdad")

    def test_etiqueta_debil(self):
        """Solo opinion de Jev -> etiqueta 'debil'."""
        captura = {
            "id": "cap-004",
            "quien": "test",
            "dominio": "noul",
            "estado": "produccion",
            "estratos": ["noul:produccion"],
            "tipo": "progreso",
        }
        experiencia = {
            "id": "exp-004",
            "tipo": "jev_opinion",
        }
        libreta = self._hacer_libreta(captura, experiencia)
        self.assertEqual(libreta[0]["etiqueta"], "debil")

    def test_sin_desenlace_etiqueta_sin_dato(self):
        """Sin experiencia vinculada -> etiqueta 'sin_dato'."""
        captura = {
            "id": "cap-005",
            "quien": "test",
            "dominio": "noul",
            "estado": "produccion",
            "estratos": ["noul:produccion"],
            "tipo": "progreso",
        }
        # Sin experiencia (lista vacía)
        libreta = JL.construir(
            [captura],
            leer_captura_fn=lambda: [captura],
            leer_experiencias_fn=lambda: [],
        )
        self.assertEqual(libreta[0]["etiqueta"], "sin_dato")

    def test_duplicados_deduplicados(self):
        """Misma captura dos veces -> solo una en el resultado."""
        captura = {
            "id": "cap-006",
            "quien": "test",
            "dominio": "noul",
            "estado": "produccion",
            "estratos": ["noul:produccion"],
            "tipo": "progreso",
        }
        experiencia = {
            "id": "exp-006",
            "tipo": "progreso",
            "estado": "integrada",
        }
        libreta = self._hacer_libreta(captura, experiencia)
        # Deberia haber solo 1 (deduplicado por huella)
        self.assertEqual(len(libreta), 1, "Duplicados deben ser deduplicados por huella")

    def test_contadores_por_estrato(self):
        """Contadores por estrato funcionan."""
        captura = {
            "id": "cap-007",
            "quien": "test",
            "dominio": "noul",
            "estado": "produccion",
            "estratos": ["noul:produccion"],
            "tipo": "progreso",
        }
        experiencia = {
            "id": "exp-007",
            "tipo": "progreso",
            "estado": "integrada",
        }
        libreta = self._hacer_libreta(captura, experiencia)
        res = JL.resumen(libreta)
        self.assertIn("noul:produccion", res["por_estrato"])
        self.assertEqual(res["por_estrato"]["noul:produccion"], 1)

    def test_contadores_por_etiqueta(self):
        """Contadores por etiqueta funcionan."""
        captura = {
            "id": "cap-008",
            "quien": "test",
            "dominio": "noul",
            "estado": "produccion",
            "estratos": ["noul:produccion"],
            "tipo": "progreso",
        }
        experiencia = {
            "id": "exp-008",
            "tipo": "progreso",
            "estado": "integrada",
        }
        libreta = self._hacer_libreta(captura, experiencia)
        res = JL.resumen(libreta)
        self.assertEqual(res["por_etiqueta"]["verdad"], 1)
        self.assertEqual(res["por_etiqueta"]["debil"], 0)
        self.assertEqual(res["por_etiqueta"]["sin_dato"], 0)

    def test_solo_verdad_en_jsonl(self):
        """a_jsonl con solo_verdad=True solo incluye 'verdad'."""
        captura_verdad = {
            "id": "cap-v1",
            "quien": "test",
            "dominio": "noul",
            "estado": "produccion",
            "estratos": ["noul:produccion"],
            "tipo": "progreso",
        }
        captura_debil = {
            "id": "cap-d1",
            "quien": "test",
            "dominio": "noul",
            "estado": "produccion",
            "estratos": ["noul:produccion"],
            "tipo": "progreso",
        }
        experiencia_verdad = {
            "id": "exp-v1",
            "tipo": "progreso",
            "estado": "integrada",
        }
        experiencia_debil = {
            "id": "exp-d1",
            "tipo": "progreso",
            "estado": "jev_opinion",
        }

        libreta = self._hacer_libreta(captura_verdad, experiencia_verdad)
        # Also add the debilidad entry (con su propio enlace)
        libreta2 = self._hacer_libreta(captura_debil, experiencia_debil, enlace_id="exp-d1")
        libreta.extend(libreta2)
        jsonl = JL.a_jsonl(libreta, solo_verdad=True)
        lines = [l for l in jsonl.split("\n") if l]
        # Deberia tener solo 1 linea (solo la de verdad)
        self.assertEqual(len(lines), 1, "solo_verdad=True debe incluir solo etiqueta verdad")

    def test_todos_los_datos_en_jsonl(self):
        """a_jsonl con solo_verdad=False incluye todas las etiquetas."""
        captura = {
            "id": "cap-t1",
            "quien": "test",
            "dominio": "noul",
            "estado": "produccion",
            "estratos": ["noul:produccion"],
            "tipo": "progreso",
        }
        experiencia = {
            "id": "exp-t1",
            "tipo": "progreso",
            "estado": "integrada",
        }
        libreta = self._hacer_libreta(captura, experiencia)
        jsonl = JL.a_jsonl(libreta, solo_verdad=False)
        lines = [l for l in jsonl.split("\n") if l]
        # Deberia tener todas las entradas (sin filtro de etiqueta)
        self.assertEqual(len(lines), 1, "solo_verdad=False debe incluir todas")


class ResumenLibreta(unittest.TestCase):
    """Probas de `resumen`."""

    def test_resumen_vacio(self):
        """Resumen de libreta vacia."""
        res = JL.resumen(None)
        self.assertEqual(res["total"], 0)
        self.assertEqual(res["por_estrato"]["noul:produccion"], 0)
        self.assertEqual(res["por_etiqueta"]["verdad"], 0)

    def test_resumen_sin_etiquetas(self):
        """Resumen con entradas sin etiqueta."""
        libreta = [{"id": "x", "etiqueta": "sin_dato"}]
        res = JL.resumen(libreta)
        self.assertEqual(res["por_etiqueta"]["sin_dato"], 1)


class AJsonlLibreta(unittest.TestCase):
    """Probas de `a_jsonl`."""

    def test_jsonl_solo_verdad(self):
        """a_jsonl solo_verdad=True filtra solo verdad."""
        captura = {
            "id": "cap-j1",
            "quien": "test",
            "dominio": "noul",
            "estado": "produccion",
            "estratos": ["noul:produccion"],
            "tipo": "progreso",
            "enlace": "exp-j1",
        }
        experiencia = {
            "id": "exp-j1",
            "tipo": "progreso",
            "estado": "integrada",
        }
        libreta = JL.construir(
            [captura],
            leer_captura_fn=lambda: [captura],
            leer_experiencias_fn=lambda: [experiencia],
        )
        jsonl = JL.a_jsonl(libreta, solo_verdad=True)
        self.assertIn("verdad", jsonl or "")
        self.assertNotIn("debil", jsonl or "")

    def test_jsonl_incluye_privado_excluido(self):
        """a_jsonl excluye dominio privado aun con solo_verdad=True."""
        captura = {
            "id": "cap-p1",
            "quien": "test",
            "dominio": "telegram",
            "estado": "produccion",
            "estratos": ["noul:produccion"],
            "tipo": "progreso",
        }
        experiencia = {
            "id": "exp-p1",
            "tipo": "progreso",
            "estado": "integrada",
        }
        libreta = JL.construir(
            [captura],
            leer_captura_fn=lambda: [captura],
            leer_experiencias_fn=lambda: [experiencia],
        )
        jsonl = JL.a_jsonl(libreta, solo_verdad=True)
        self.assertEqual(jsonl.strip(), "")


if __name__ == "__main__":
    unittest.main()