#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""(RON1112C) La autopublicación con el reloj, GitHub y la ronda de aparatos FALSOS.

1. El plazo del CI cuenta el CI (desde que GitHub crea el run), con la línea de tiempo REAL del 11-11 del candidato
   6539048b4e: empezó 20:25, el run se creó 21:01, se vetó a las 21:17 con un CI sano que acabó en verde.
2. Esperar a que el run aparezca tiene su propia cota y su propio mensaje.
3. Con una ronda de aparatos activa no empiezan las puertas locales; esperarla no gasta ningún plazo."""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import autopublicar as A  # noqa: E402
from test_autopublicar import Falso, SHA, run  # noqa: E402
from test_autopublicar_jobs_1111 import FalsoConJobs  # noqa: E402


def t(iso):
    return A.epoch_de_iso(iso)


# La línea de tiempo real (11-11, hora de la Mac convertida a una sola zona; solo cuentan las diferencias).
EMPEZO = t("2026-11-11T20:25:00Z")       # la pasada tomó el candidato 6539048b4e y empezó sus puertas locales
EMPUJADO = t("2026-11-11T20:57:00Z")     # acabaron las puertas locales (32 min) y se subió el candidato
RUN_CREADO = t("2026-11-11T21:01:00Z")   # GitHub creó el run del CI
VETO_ANTES = t("2026-11-11T21:17:00Z")   # donde el director lo vetó: 16 min de CI


def run_creado(estado, concl, creado="2026-11-11T21:01:00Z"):
    r = run(estado, concl)
    r["created_at"] = creado
    return r


def estado_ci(**mas):
    return dict({"fase": "ci", "sha": SHA, "desde": EMPEZO, "empujado": EMPUJADO}, **mas)


class ElPlazoDelCiCuentaElCi(unittest.TestCase):
    def test_la_regla_de_antes_habria_vetado_la_linea_de_tiempo_real(self):
        # lo que hacía _seguir_ci: espera = ahora - est["desde"]
        self.assertGreater(VETO_ANTES - EMPEZO, A.CI_TOPE_S)          # 52 min > 50: se vetaba
        self.assertLess(VETO_ANTES - RUN_CREADO, A.CI_TOPE_S)         # el CI de verdad llevaba 16 min

    def test_el_candidato_6539048b4e_no_se_veta_a_los_16_min_de_un_ci_sano(self):
        m = FalsoConJobs(runs=[run_creado("in_progress", None)], jobs_respuesta=[{"status": "in_progress", "conclusion": None}])
        e = A.pasada(m, estado_ci(), VETO_ANTES)
        self.assertEqual(e["fase"], "ci")
        self.assertEqual(e["detalle"], "CI en marcha (16 min).")
        self.assertNotIn(SHA, e.get("vetados") or {})
        self.assertEqual(e["ci_desde"], RUN_CREADO)
        self.assertFalse(any("/jobs" in r for r in m.rutas_gh))       # ni siquiera llegó al plazo
        # el CI acaba en verde 40 min después de crearse: se publica ese commit
        m.o["runs"] = [run_creado("completed", "success")]
        e = A.pasada(m, e, RUN_CREADO + 40 * 60)
        self.assertEqual(e["fase"], "verificando")
        self.assertTrue(any(p[-1].endswith(":main") for p in m.pushes))

    def test_el_plazo_de_50_min_sigue_existiendo_pero_desde_la_creacion_del_run(self):
        m = FalsoConJobs(runs=[run_creado("in_progress", None)], jobs_respuesta=[{"status": "in_progress", "conclusion": None}])
        e = A.pasada(m, estado_ci(), RUN_CREADO + A.CI_TOPE_S - 1)
        self.assertEqual(e["fase"], "ci")
        e = A.pasada(m, e, RUN_CREADO + A.CI_TOPE_S + 1)
        self.assertEqual(e["fase"], "bloqueado")
        self.assertEqual(e["detalle"], "CI sin terminar en 50 min")

    def test_el_plazo_se_acuerda_entre_pasadas(self):
        m = Falso(runs=[run_creado("in_progress", None)])
        e = A.pasada(m, estado_ci(), VETO_ANTES)
        e["desde"] = EMPEZO - 10 * 3600                                # aunque `desde` fuese viejísimo, manda ci_desde
        e = A.pasada(m, e, VETO_ANTES + 600)
        self.assertEqual(e["fase"], "ci")

    def test_un_run_con_hora_anterior_a_la_subida_no_adelanta_el_reloj(self):
        # un reloj distinto o un run reutilizado: el CI no puede haber empezado antes de que subiéramos el candidato
        self.assertEqual(A.inicio_del_ci("2026-11-11T19:00:00Z", EMPUJADO, EMPUJADO + 60), EMPUJADO)
        self.assertEqual(A.inicio_del_ci("2026-11-11T21:01:00Z", EMPUJADO, RUN_CREADO + 5), RUN_CREADO)
        self.assertEqual(A.inicio_del_ci("2030-01-01T00:00:00Z", EMPUJADO, EMPUJADO + 60), EMPUJADO + 60)   # nunca en el futuro
        self.assertEqual(A.inicio_del_ci(None, EMPUJADO, EMPUJADO + 60), EMPUJADO)
        self.assertEqual(A.inicio_del_ci("basura", EMPUJADO, EMPUJADO + 60), EMPUJADO)

    def test_el_ci_en_rojo_o_verde_no_depende_de_los_plazos(self):
        m = Falso(runs=[run_creado("completed", "failure")])
        e = A.pasada(m, estado_ci(), VETO_ANTES)
        self.assertEqual(e["vetados"][SHA], "CI en rojo")

    def test_las_puertas_locales_largas_no_cuentan(self):
        # el reloj marca 33 min más tarde que la pasada (lo que tardaron las pruebas): `desde` es la pasada, `empujado` la subida
        m = Falso()
        m.reloj = lambda: 1_800_000_000.0 + 33 * 60
        e = A.pasada(m, {}, 1_800_000_000.0)
        self.assertEqual(e["fase"], "ci")
        self.assertEqual(e["empujado"], 1_800_000_000.0 + 33 * 60)
        self.assertEqual(e["desde"], 1_800_000_000.0)


class UnRunQueNuncaAparece(unittest.TestCase):
    def test_tiene_su_propia_cota_y_su_propio_mensaje(self):
        m = Falso(runs=[])
        e = A.pasada(m, estado_ci(), EMPUJADO + A.CI_APARICION_S - 1)
        self.assertEqual(e["fase"], "ci")
        self.assertIn("Esperando a que GitHub cree el run", e["detalle"])
        e = A.pasada(m, e, EMPUJADO + A.CI_APARICION_S + 1)
        self.assertEqual(e["fase"], "bloqueado")
        self.assertEqual(e["detalle"], "GitHub no creó el run de CI en 15 min")
        self.assertNotIn("50 min", e["detalle"])
        self.assertIn("no creó el run", m.avisos[-1])
        self.assertIn(SHA, e["vetados"])

    def test_la_cota_corre_desde_la_subida_no_desde_que_empezo_el_candidato(self):
        # 32 min de puertas locales antes de subir: con la regla de antes el veto llegaba al instante
        m = Falso(runs=[])
        e = A.pasada(m, estado_ci(), EMPUJADO + 60)
        self.assertEqual(e["fase"], "ci")

    def test_un_estado_de_antes_sin_empujado_se_sigue_con_desde(self):
        m = Falso(runs=[])
        e = A.pasada(m, {"fase": "ci", "sha": SHA, "desde": EMPUJADO}, EMPUJADO + A.CI_APARICION_S + 1)
        self.assertEqual(e["fase"], "bloqueado")


class ConRondaDeAparatos(unittest.TestCase):
    T0 = 1_800_000_000.0

    def falso(self, ronda=None, **o):
        m = Falso(**o)
        m.linea_ronda = ronda
        m.llamadas_pruebas = 0
        m.ronda_activa = lambda: m.linea_ronda
        base = m.pruebas_python
        m.pruebas_python = lambda sha: (setattr(m, "llamadas_pruebas", m.llamadas_pruebas + 1), base(sha))[1]
        return m

    def test_con_ronda_no_empiezan_ni_las_pruebas_ni_el_analisis_ni_jev_ni_el_candidato(self):
        m = self.falso("ronda de aparatos activa (alex: llamadas): nada pesado empieza; termina a las 22:40, quedan 20 min")
        e = A.pasada(m, {}, self.T0)
        self.assertEqual(e["fase"], "esperando")
        self.assertIn("ronda de aparatos activa", e["detalle"])
        self.assertIn("pruebas del puente esperan", e["detalle"])
        self.assertEqual(m.llamadas_pruebas, 0)
        self.assertEqual(m.pushes, [])
        self.assertFalse(hasattr(m, "resumen_jev"))                    # Jev tampoco se gasta cada pasada
        self.assertNotIn("desde", e)                                   # ningún plazo empezó

    def test_esperar_la_ronda_no_gasta_ningun_plazo_el_lote_arranca_de_cero_al_terminar(self):
        m = self.falso("ronda activa")
        e = A.pasada(m, {}, self.T0)
        for i in range(1, 7):                                          # 30 min de ronda, una pasada cada 5
            e = A.pasada(m, e, self.T0 + i * 300)
            self.assertEqual(e["fase"], "esperando")
        self.assertNotIn("pruebas_tope", e)
        m.linea_ronda = None                                           # terminó la ronda
        fin = self.T0 + 7 * 300
        e = A.pasada(m, e, fin)
        self.assertEqual(e["fase"], "ci")
        self.assertEqual(e["desde"], fin)                              # el plazo empieza ahora, no hace 35 min
        self.assertEqual(m.llamadas_pruebas, 1)

    def test_una_ronda_que_empieza_con_el_ci_en_marcha_no_mata_ni_frena_nada(self):
        m = self.falso("ronda activa", runs=[run_creado("completed", "success")])
        e = A.pasada(m, estado_ci(), RUN_CREADO + 600)
        self.assertEqual(e["fase"], "verificando")                     # el CI vive en GitHub: la Mac solo mira
        self.assertEqual(m.llamadas_pruebas, 0)

    def test_una_ronda_que_empieza_justo_antes_de_las_pruebas_las_frena_dentro_de_pruebas_python(self):
        class Medios(A.Medios):
            def __init__(self):
                self.arbol = 0

            def git(self, args, timeout=None):
                return 0, SHA, ""

            def ronda_activa(self):
                return "ronda activa (alex)"

        m = Medios()
        ok, detalle = m.pruebas_python(SHA)
        self.assertIsNone(ok)
        self.assertIn("no empiezo las pruebas del puente", detalle)

    def test_sin_ronda_todo_sigue_como_antes(self):
        m = self.falso(None)
        e = A.pasada(m, {}, self.T0)
        self.assertEqual(e["fase"], "ci")
        self.assertEqual(m.llamadas_pruebas, 1)


if __name__ == "__main__":
    unittest.main()
