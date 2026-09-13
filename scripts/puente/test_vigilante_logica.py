# -*- coding: utf-8 -*-
"""Pruebas sin disco, procesos ni red de la selección económica de tareas."""

import os
import sys
import unittest


DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
if DIRECTORIO not in sys.path:
    sys.path.insert(0, DIRECTORIO)

from vigilante_logica import id_en_asuntos, seleccionar_pendientes, ultima_salida  # noqa: E402


class UltimaSalidaTest(unittest.TestCase):
    def test_recoge_codigo_y_motivo_de_la_ultima_linea_no_vacia(self):
        lineas = [
            "arrancando orquestador con 3 tareas",
            "working tree de main con cambios sin commit: 1 archivos — no arranco",
            "",
            "__EXIT__=2",
        ]
        self.assertEqual(
            ultima_salida(lineas),
            (2, "working tree de main con cambios sin commit: 1 archivos — no arranco"),
        )

    def test_sin_marca_exit_no_hay_cierre(self):
        self.assertEqual(ultima_salida(["todo bien", ""]), (None, ""))

    def test_gana_la_ultima_marca_y_el_motivo_se_recorta(self):
        lineas = ["primera causa", "__EXIT__=1", "x" * 300, "__EXIT__=0"]
        codigo, motivo = ultima_salida(lineas)
        self.assertEqual(codigo, 0)
        self.assertEqual(motivo, "x" * 200)


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
        self.assertEqual(
            seleccionar_pendientes([("cola-311.json", tareas)], progreso, []), []
        )

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

    def test_modelo_siguiente_reemplaza_modelo_de_la_cola(self):
        tareas = [{"id": "M1", "modelo": "nvidia/x"}]
        progreso = {"M1": {"estado": "en_curso", "modelo_siguiente": "anthropic/claude-haiku-4-5"}}
        salida = seleccionar_pendientes([("cola-311.json", tareas)], progreso, [])
        self.assertEqual(len(salida), 1)
        self.assertEqual(salida[0]["modelo"], "anthropic/claude-haiku-4-5")
        # Verificar que la lista original no se mutó
        self.assertEqual(tareas[0]["modelo"], "nvidia/x")

    def test_sin_modelo_siguiente_conserva_el_de_la_cola(self):
        tareas = [{"id": "M2", "modelo": "xkiro/qwen"}]
        progreso = {"M2": {"estado": "en_curso"}}
        salida = seleccionar_pendientes([("cola-311.json", tareas)], progreso, [])
        self.assertEqual(len(salida), 1)
        self.assertEqual(salida[0]["modelo"], "xkiro/qwen")


if __name__ == "__main__":
    unittest.main()
