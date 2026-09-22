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
        # (2026-09-19) «integrado en main» ya NO suena: Alex pidió solo olas nuevas,
        # aprobaciones y sugerencias. Una tarea más va al resumen de media hora.
        self.assertFalse(suena(l("commit PS9 · 11b13719 integrado en main", tipo="commit")))
        self.assertTrue(suena(l("INTEGRADO PERO NO APLICADO: exportas avanceCombinado")))
        self.assertTrue(suena(l("18 tareas · 3 trabajadores · medios sincronizados (lease 300s)")))
        self.assertTrue(suena(l("Dream 2026-09-19 · 3 sugerencias accionables")))
        self.assertTrue(suena(l("10 cambios publicados, verificados uno a uno")))

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
        # Lleva las dos: es una rotación (nunca) y un visto bueno (siempre). Gana siempre.
        self.assertTrue(suena(l("reenrutado y ahora espera tu visto bueno en el Mando")))
        # Una cuota caída ya no suena: el enjambre la aparta solo.
        self.assertFalse(suena(l("reenrutado: apinex sin cupo hasta 2026-09-16 19:31:08")))

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
        self.assertEqual(resumir_callados([l("rama ola/x lista: espera tu visto bueno")]), "")
        self.assertEqual(resumir_callados([]), "")


class TestFiltrar(unittest.TestCase):
    def test_separa_las_dos_cosas(self):
        lineas = [l("latido - · x"),
                  l("rama ola/zW7 lista: espera tu visto bueno en el Mando"),
                  l("sin cambios con kimi (1/5) → sigo"),
                  l("commit zW7 · integrado en main", tipo="commit")]
        fuertes, resumen = filtrar(lineas)
        self.assertEqual(len(fuertes), 1)
        self.assertIn("visto bueno", fuertes[0]["texto"])
        self.assertIn("3 avisos de rutina", resumen)

    def test_una_hora_normal_del_enjambre_casi_no_suena(self):
        # 20 latidos y 6 rotaciones: exactamente lo que inundaba el móvil.
        lineas = [l("latido - · zO2 escribiendo/kimi 3m")] * 20
        lineas += [l("sin cambios con kimi (1/5) → sigo con otro proveedor")] * 6
        fuertes, resumen = filtrar(lineas)
        self.assertEqual(fuertes, [])
        self.assertIn("26 avisos de rutina", resumen)


if __name__ == "__main__":
    unittest.main()


class LoQueSoloPuedeHacerAlexSiempreSuena(unittest.TestCase):
    """(2026-09-22, MEDIDO) «el te toca a ti no me ha avisado del fichaje de la api ni de nada».

    El token estaba puesto (el servicio hace `source ~/.hermes/.env`), el puente vivo y la
    línea en el canal desde las 10:04. La tragaba el filtro de ruido:

        suena({quien: "director-acciones",
               texto: "nueva: NVIDIA Build (NIM): renovar la clave · https://…"}) → False

    Reducir ruido no puede significar callar lo único que está parado esperándole a él.
    """

    def test_un_aviso_del_director_de_acciones_suena(self):
        self.assertTrue(suena({
            "quien": "director-acciones", "tipo": "aviso",
            "texto": "nueva: NVIDIA Build (NIM): renovar la clave · https://build.nvidia.com/",
        }))

    def test_tambien_cuando_se_resuelve(self):
        self.assertTrue(suena({
            "quien": "director-acciones", "tipo": "aviso",
            "texto": "resuelta: apinex: renovar la clave",
        }))

    def test_gana_incluso_a_la_lista_de_NUNCA(self):
        """«sin cupo hasta» está en NUNCA, pero si lo dice el director de acciones, suena."""
        self.assertTrue(suena({
            "quien": "director-acciones", "tipo": "aviso",
            "texto": "nueva: groq sin cupo hasta mañana: renovar la clave",
        }))

    def test_el_ruido_de_siempre_sigue_callado(self):
        self.assertFalse(suena({"quien": "enjambre", "tipo": "mensaje",
                                            "texto": "latido de X"}))
        self.assertFalse(suena({"quien": "enjambre", "tipo": "mensaje",
                                            "texto": "integrado en main"}))
