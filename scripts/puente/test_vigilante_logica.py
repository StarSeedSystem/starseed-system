# -*- coding: utf-8 -*-
"""Pruebas sin disco, procesos ni red de la selección económica de tareas."""

import os
import sys
import unittest
from datetime import datetime


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
        self.assertFalse(id_en_asuntos("MD1", ["enjambre: reparto a la nube (CC2, MD1, JV3)"]))
        self.assertTrue(id_en_asuntos("NE3-1", ["345 · NE3-1: Cliente tipado"]))

    def test_modelo_siguiente_reemplaza_modelo_de_la_cola(self):
        tareas = [{"id": "M1", "modelo": "nvidia/x"}]
        progreso = {
            "M1": {
                "estado": "en_curso",
                "modelo_siguiente": "anthropic/claude-haiku-4-5",
            }
        }
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


class OrdenPorPrioridadTest(unittest.TestCase):
    """Con `ahora` la cola se reordena por prioridad; sin él, nada cambia."""

    AHORA = datetime(2026, 9, 14, 12, 0, 0)

    def test_sin_ahora_el_orden_es_el_del_archivo(self):
        tareas = [{"id": "B1"}, {"id": "A1", "depende": ["B1"]}]
        salida = seleccionar_pendientes([("cola-311.json", tareas)], {}, [])
        self.assertEqual([t["id"] for t in salida], ["B1", "A1"])

    def test_con_ahora_quien_desbloquea_mas_va_primero(self):
        tareas = [
            {"id": "Z1"},
            {"id": "B1"},
            {"id": "A1", "depende": ["B1"]},
            {"id": "A2", "depende": ["B1"]},
        ]
        salida = seleccionar_pendientes(
            [("cola-311.json", tareas)], {}, [], ahora=self.AHORA
        )
        self.assertEqual(salida[0]["id"], "B1")

    def test_con_ahora_lo_bloqueado_no_sale(self):
        tareas = [{"id": "B1"}, {"id": "A1", "depende": ["B1"]}]
        salida = seleccionar_pendientes(
            [("cola-311.json", tareas)], {}, [], ahora=self.AHORA
        )
        self.assertEqual([t["id"] for t in salida], ["B1"])
        progreso = {"B1": {"estado": "commit"}}
        salida2 = seleccionar_pendientes(
            [("cola-311.json", tareas)], progreso, [], ahora=self.AHORA
        )
        self.assertEqual([t["id"] for t in salida2], ["A1"])

    def test_sin_modulo_prioridad_se_devuelve_el_orden_del_archivo(self):
        tareas = [{"id": "Z1"}, {"id": "B1"}, {"id": "A1", "depende": ["B1"]}]
        import vigilante_logica

        original = vigilante_logica.prioridad_logica
        try:
            vigilante_logica.prioridad_logica = None
            salida = seleccionar_pendientes(
                [("cola-311.json", tareas)], {}, [], ahora=self.AHORA
            )
        finally:
            vigilante_logica.prioridad_logica = original
        self.assertEqual([t["id"] for t in salida], ["Z1", "B1", "A1"])



class Correcciones(unittest.TestCase):
    def test_aplica_solo_campos_permitidos_y_no_muta(self):
        from vigilante_logica import aplicar_correcciones
        prog = {"A": {"estado": "commit", "sha": "abc", "nota": "vieja"}, "B": {"estado": "sin_cambios"}}
        nuevo, aplicadas = aplicar_correcciones(prog, {
            "A": {"estado": "pendiente", "nota": "reintento", "sha": "NO", "t": "2026-09-20 06:30"},
            "C": {"estado": "pendiente", "medio": "mac"},
            "D": {"nota": "sin estado: se ignora"},
        })
        self.assertEqual(sorted(aplicadas), ["A", "C"])
        self.assertEqual(nuevo["A"]["estado"], "pendiente")
        self.assertEqual(nuevo["A"]["sha"], "abc")
        self.assertEqual(nuevo["A"]["corregido"], "2026-09-20 06:30")
        self.assertEqual(nuevo["C"], {"estado": "pendiente", "medio": "mac", "corregido": "director"})
        self.assertNotIn("D", nuevo)
        self.assertEqual(prog["A"]["estado"], "commit")

    def test_vacio_devuelve_lo_mismo(self):
        from vigilante_logica import aplicar_correcciones
        prog = {"A": {"estado": "commit"}}
        self.assertEqual(aplicar_correcciones(prog, {}), (prog, []))
        self.assertEqual(aplicar_correcciones(prog, None), (prog, []))



class IdsColisionados(unittest.TestCase):
    def test_detecta_ids_ya_integrados_por_otra_ola(self):
        from vigilante_logica import ids_colisionados
        asuntos = ["Ola 234 · mundo · W1: Simulación", "345 · NE3-1: algo", "reparto a la nube (CC2, W2)"]
        tareas = [{"id": "W1"}, {"id": "W2"}, {"id": "NE3-1"}, {"id": "CB1"}]
        self.assertEqual(ids_colisionados(tareas, asuntos, {"NE3-1": {"estado": "commit"}}), ["W1"])
        self.assertEqual(ids_colisionados(tareas, asuntos, {}), ["W1", "NE3-1"])


if __name__ == "__main__":
    unittest.main()
