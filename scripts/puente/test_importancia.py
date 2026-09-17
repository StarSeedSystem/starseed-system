"""Pruebas de importancia: qué suena en el móvil de Alex y qué no.

Los casos son líneas REALES del canal de hoy, copiadas del registro.
"""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from importancia import filtrar, resumir_callados, suena


def l(texto, tipo="aviso", tarea=""):
    return {"texto": texto, "tipo": tipo, "tarea": tarea}


class TestSuena(unittest.TestCase):
    def test_lo_que_pide_una_decision(self):
        self.assertTrue(suena(l("rama ola/p316I lista: Espera tu visto bueno en el Mando")))
        self.assertTrue(suena(l("Rechazo automático · p316I")))
        self.assertTrue(suena(l("ninguna pasarela escribe ahora mismo — no arranco")))

    def test_los_hechos_que_cambian_el_mundo(self):
        self.assertTrue(suena(l("commit PS9 · 11b13719 integrado en main", tipo="commit")))
        self.assertTrue(suena(l("INTEGRADO PERO NO APLICADO: exportas avanceCombinado")))

    def test_la_contabilidad_del_enjambre_se_calla(self):
        for t in ("latido - · zO2 escribiendo/kimi-k3 8m · 277 integradas",
                  "sin cambios con codex/gpt-5.6-sol (1/5) → sigo con otro proveedor",
                  "reenrutado zD1 · minimax se colgó y fue cortado",
                  "estancado zO2 · 911 s sin crecer en bytes",
                  "worktree y rama conservados; limpieza automática deshabilitada",
                  "empiezo por otro modelo: kimi-k3, glm-5.3-free ya falló aquí antes",
                  "arriendo tomado por opencode:mac:mac:18567",
                  "revisores saltados: llm7 (caído)",
                  "cerrojo huérfano eliminado: dueño muerto",
                  "chore(memoria): aprendizaje de la ola auto-0916-174029"):
            self.assertFalse(suena(l(t)), t)

    def test_siempre_gana_sobre_nunca(self):
        # Lleva las dos: es una rotación, pero anuncia una cuota caída.
        self.assertTrue(suena(l("reenrutado: apinex sin cupo hasta 2026-09-16 19:31:08")))

    def test_un_error_suena_aunque_no_diga_nada_conocido(self):
        self.assertTrue(suena(l("el revisor devolvió una cosa rarísima", tipo="error")))

    def test_un_aviso_cualquiera_no_suena(self):
        self.assertFalse(suena(l("he mirado el catálogo y sigo")))

    def test_lineas_vacias_o_rotas(self):
        self.assertFalse(suena({}))
        self.assertFalse(suena(None))
        self.assertFalse(suena(l("")))


class TestResumen(unittest.TestCase):
    def test_cuenta_lo_que_se_callo(self):
        lineas = [l("latido - · x"), l("latido - · y"),
                  l("sin cambios con kimi (1/5) → sigo")]
        t = resumir_callados(lineas)
        self.assertIn("3 avisos de rutina", t)
        self.assertIn("2 × latido", t)

    def test_sin_nada_callado_no_hay_resumen(self):
        self.assertEqual(resumir_callados([l("integrado en main", tipo="commit")]), "")
        self.assertEqual(resumir_callados([]), "")


class TestFiltrar(unittest.TestCase):
    def test_separa_las_dos_cosas(self):
        lineas = [l("latido - · x"),
                  l("commit zW7 · integrado en main", tipo="commit"),
                  l("sin cambios con kimi (1/5) → sigo")]
        fuertes, resumen = filtrar(lineas)
        self.assertEqual(len(fuertes), 1)
        self.assertIn("integrado en main", fuertes[0]["texto"])
        self.assertIn("2 avisos de rutina", resumen)

    def test_una_hora_normal_del_enjambre_casi_no_suena(self):
        # 20 latidos y 6 rotaciones: exactamente lo que inundaba el móvil.
        lineas = [l("latido - · zO2 escribiendo/kimi 3m")] * 20
        lineas += [l("sin cambios con kimi (1/5) → sigo con otro proveedor")] * 6
        fuertes, resumen = filtrar(lineas)
        self.assertEqual(fuertes, [])
        self.assertIn("26 avisos de rutina", resumen)


if __name__ == "__main__":
    unittest.main()
