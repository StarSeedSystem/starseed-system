# -*- coding: utf-8 -*-
"""Pruebas de director_dream.py: el que convierte el Dream en encargos."""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import director_dream as DD

#: La forma real de una propuesta, tal como la devuelve `dream_a_cola.puntos`.
P = {"titulo": "Algo que hacer", "seccion": "top 3 accionables", "cuerpo": "detalle"}


class TestIdsUnicosPorDia(unittest.TestCase):
    """Un id repetido hacía que el mecanismo sirviera UNA SOLA VEZ.

    (2026-09-17) Los ids eran «DR1», «DR2»… así que el segundo informe reusaba
    los del primero, el orquestador los encontraba en progreso.json como ya
    hechos o bloqueados, y no los cogía nunca. El «DR1» de hoy chocaba con el
    «DR1» del día 15, que estaba en «bloqueante». Alex pidió que los Dream se
    procesaran CADA VEZ que ocurren; con ids repetidos solo se procesaba el
    primero de todos, y nadie se enteraba porque las demás parecían «ya hechas».
    """

    def test_el_id_lleva_el_dia(self):
        self.assertEqual(DD.tarea_de(P, "2026-09-17", 0)["id"], "DR0917-1")

    def test_dos_dias_no_chocan(self):
        a = DD.tarea_de(P, "2026-09-15", 0)["id"]
        b = DD.tarea_de(P, "2026-09-17", 0)["id"]
        self.assertNotEqual(a, b)

    def test_dentro_del_mismo_dia_se_numeran(self):
        ids = [DD.tarea_de(P, "2026-09-17", i)["id"] for i in range(3)]
        self.assertEqual(ids, ["DR0917-1", "DR0917-2", "DR0917-3"])
        self.assertEqual(len(set(ids)), 3)

    def test_no_choca_con_los_ids_viejos_de_dos_digitos(self):
        # Los DR1..DR3 del día 15 siguen en progreso.json: ninguno puede repetirse.
        nuevos = {DD.tarea_de(P, "2026-09-17", i)["id"] for i in range(3)}
        self.assertFalse(nuevos & {"DR1", "DR2", "DR3"})


class TestFormaDelEncargo(unittest.TestCase):
    def test_lleva_el_titulo_del_dream(self):
        self.assertEqual(DD.tarea_de(P, "2026-09-17", 0)["titulo"], P["titulo"])

    def test_el_prompt_dice_de_donde_sale(self):
        # Un agente que no sabe de dónde viene el encargo se inventa el alcance.
        prompt = DD.tarea_de(P, "2026-09-17", 0)["prompt"]
        self.assertIn("sugerencias-2026-09-17.md", prompt)
        self.assertIn(P["seccion"], prompt)

    def test_deja_salida_si_ya_no_aplica(self):
        # El Dream lo escriben modelos gratuitos leyendo registros: a veces
        # proponen algo ya hecho. El encargo tiene que permitir decirlo.
        self.assertIn("NO APLICA", DD.tarea_de(P, "2026-09-17", 0)["prompt"])

    def test_sin_dependencias_ni_alcance_impuesto(self):
        t = DD.tarea_de(P, "2026-09-17", 0)
        self.assertEqual(t["depende"], [])
        self.assertEqual(t["archivos"], [])


if __name__ == "__main__":
    unittest.main()
