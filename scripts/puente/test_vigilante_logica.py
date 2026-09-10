# -*- coding: utf-8 -*-
"""Pruebas sin disco, procesos ni red de la selección económica de tareas."""
import os
import sys
import unittest


DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
if DIRECTORIO not in sys.path:
    sys.path.insert(0, DIRECTORIO)

from vigilante_logica import id_en_asuntos, seleccionar_pendientes  # noqa: E402


class VigilanteLogicaTest(unittest.TestCase):
    def test_ignora_colas_automaticas_derivadas(self):
        colas = [("cola-auto-0910.json", [{"id": "A1"}])]
        self.assertEqual(seleccionar_pendientes(colas, {}, []), [])

    def test_una_tarea_repetida_solo_aparece_una_vez(self):
        colas = [
            ("cola-311.json", [{"id": "A1", "titulo": "nueva"}]),
            ("cola-210.json", [{"id": "A1", "titulo": "vieja"}]),
        ]
        salida = seleccionar_pendientes(colas, {}, [])
        self.assertEqual(salida, [{"id": "A1", "titulo": "nueva"}])

    def test_no_reintenta_estados_cerrados_o_de_decision_humana(self):
        tareas = [{"id": tid} for tid in ("A1", "A2", "A3", "A4")]
        progreso = {
            "A1": {"estado": "commit"},
            "A2": {"estado": "sin_cambios"},
            "A3": {"estado": "bloqueada"},
            "A4": {"estado": "rechazada"},
        }
        self.assertEqual(seleccionar_pendientes([("cola-311.json", tareas)], progreso, []), [])

    def test_git_manda_sobre_un_en_curso_obsoleto(self):
        tareas = [{"id": "R1F"}, {"id": "R10"}]
        progreso = {"R1F": {"estado": "en_curso"}, "R10": {"estado": "en_curso"}}
        asuntos = ["Ola 228 · R1F: corrección integrada"]
        self.assertEqual(
            seleccionar_pendientes([("cola-311.json", tareas)], progreso, asuntos),
            [{"id": "R10"}],
        )

    def test_el_id_se_reconoce_como_token_completo(self):
        self.assertTrue(id_en_asuntos("V2", ["Ola 228 · V2: voces"]))
        self.assertFalse(id_en_asuntos("R1", ["Ola 228 · R10: otra tarea"]))


if __name__ == "__main__":
    unittest.main()
