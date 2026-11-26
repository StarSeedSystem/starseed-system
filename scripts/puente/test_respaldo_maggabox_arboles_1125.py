# -*- coding: utf-8 -*-
"""Pruebas de `_es_candidato_aliviar` y `_obtener_id_worktree` (ALM1125Gs).

Herméticas: no tocan la red, ~/.ssh, ~/.starseed/env ni el disco real;
usando rutas falsas de los tres formatos y estados de ejemplo inyectados.
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import respaldo_maggabox as R  # noqa: E402

# Estados que bloquean: la tarea no es candidata si está en cualquiera de estos.
ESTADOS_BLOQUEADOS = ("pendiente", "en_marcha", "reasignada", "integrada-sin-traer")

RUTAS = {
    "starseed-wt-<id>": "/falso/Documentos/starseed-wt-ola1",
    "starseed-wt/<id>": "/falso/Documentos/starseed-wt/ola1",
    "wt-<id>": "/falso/Documentos/wt-ola1",
}
ID_ESPERADO = "ola1"


def progreso_con(estado):
    """Estado de ejemplo inyectado (función pura, sin leer progreso.json real)."""
    return {"olas": {"ola-1": {"tareas": [{"id": "ola1", "estado": estado}]}}}


class TestObtenerIdWorktree(unittest.TestCase):
    """Extrae el id de trabajo de los tres formatos de árbol real."""

    def test_reconoce_starseed_wt_guion(self):
        self.assertEqual(
            R._obtener_id_worktree(RUTAS["starseed-wt-<id>"]), ID_ESPERADO
        )

    def test_reconoce_starseed_wt_carpeta(self):
        self.assertEqual(
            R._obtener_id_worktree(RUTAS["starseed-wt/<id>"]), ID_ESPERADO
        )

    def test_reconoce_wt_guion(self):
        self.assertEqual(R._obtener_id_worktree(RUTAS["wt-<id>"]), ID_ESPERADO)

    def test_no_reconoce_ruta_sin_id(self):
        self.assertIsNone(R._obtener_id_worktree("/falso/Documentos/otro"))
        self.assertIsNone(R._obtener_id_worktree("/falso/Documentos/starseed-wt"))
        self.assertIsNone(R._obtener_id_worktree("/falso/Documentos/starseed-wt/"))


class TestEsCandidatoAliviar(unittest.TestCase):
    """Decisión pura: candidato solo si la tarea no está bloqueada en progreso."""

    def _candidato(self, ruta, progreso=None, cola=None):
        return R._es_candidato_aliviar(ruta, cola or set(), progreso)

    def test_tres_formatos_sin_tarea_son_candidatos(self):
        for nombre, ruta in RUTAS.items():
            es, porque = self._candidato(ruta)
            self.assertTrue(es, f"{nombre}: {porque}")

    def test_estados_bloqueados_no_son_candidatos(self):
        for estado in ESTADOS_BLOQUEADOS:
            for nombre, ruta in RUTAS.items():
                es, porque = self._candidato(ruta, progreso_con(estado))
                self.assertFalse(es, f"{estado} {nombre}: {porque}")

    def test_estado_integrada_si_es_candidato(self):
        for nombre, ruta in RUTAS.items():
            es, porque = self._candidato(ruta, progreso_con("integrada"))
            self.assertTrue(es, f"{nombre}: {porque}")

    def test_sin_progreso_es_candidato(self):
        for nombre, ruta in RUTAS.items():
            es, porque = self._candidato(ruta, progreso=None)
            self.assertTrue(es, f"{nombre}: {porque}")

    def test_en_cola_activa_no_es_candidato(self):
        for nombre, ruta in RUTAS.items():
            es, porque = self._candidato(
                ruta, progreso_con("integrada"), cola={"ola1"}
            )
            self.assertFalse(es, f"{nombre}: {porque}")

    def test_lista_negra_no_cambia(self):
        negra = "/x/proyecto/.git"
        es, porque = self._candidato(negra)
        self.assertFalse(es)
        self.assertIn("lista negra", porque)

    def test_rutas_no_worktree_siguen_listas_blanca_y_negra(self):
        es, porque = self._candidato("/falso/proyecto/.next/cache")
        self.assertTrue(es, porque)
        es2, porque2 = self._candidato("/falso/proyecto/.env.local")
        self.assertFalse(es2, porque2)


if __name__ == "__main__":
    unittest.main()
