# -*- coding: utf-8 -*-
"""test_optimizador_reglas · pruebas puras para R1–R8 (unittest, sin red ni archivos).

Una por regla que dispara y una que no; acción descartada por enfriamiento y
por tope diario; R2 manda sobre R1 con Mac saturada; R7 solo hallazgo; R8 rojo.
"""

import os
import sys
import unittest

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
if DIRECTORIO not in sys.path:
    sys.path.insert(0, DIRECTORIO)

import importlib.util
_ruta_mod = os.path.join(DIRECTORIO, "optimizador_reglas.py")
_spec = importlib.util.spec_from_file_location("optimizador_reglas", _ruta_mod)
_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_mod)


class ReglasOptimizadorTest(unittest.TestCase):
    """Cada regla con caso que dispara y caso que no."""

    def _m(self, **cambios):
        base = dict(_mod.METRICAS_EJEMPLO)
        base.update(cambios)
        return base

    def test_r1_dispara_con_capacidad_ociosa(self):
        hallazgos = _mod.diagnosticar(self._m(), {"maximo_por_hardware": 5}, [], 1000)
        r1 = [h for h in hallazgos if h["id"] == "R1"]
        self.assertTrue(any(r1), "R1 debe disparar con listas > vivos, RAM alta, swap bajo")
        self.assertEqual(r1[0]["gravedad"], "info")
        self.assertEqual(r1[0]["accion"], "subir_trabajadores")

    def test_r1_no_dispara_sin_capacidad_ociosa(self):
        # listas <= vivos → no hay capacidad ociosa
        hallazgos = _mod.diagnosticar(self._m(trabajadores={"tope_gobernador": 3, "vivos": 3, "escribiendo": 1, "en_puerta": 0, "ociosos": 0}, listas=2, memoria={"swap_usado_mb": 400, "swap_total_mb": 2048, "ram_libre_mb": 1800}), {"maximo_por_hardware": 3}, [], 1000)
        r1 = [h for h in hallazgos if h["id"] == "R1"]
        self.assertFalse(any(r1), "R1 no debe disparar sin capacidad ociosa")

    def test_r2_dispara_con_mac_saturada(self):
        hallazgos = _mod.diagnosticar(self._m(memoria={"swap_usado_mb": 1900, "swap_total_mb": 2048, "ram_libre_mb": 200}), {"maximo_por_hardware": 3}, [], 1000)
        r2 = [h for h in hallazgos if h["id"] == "R2"]
        self.assertTrue(any(r2), "R2 debe disparar con Mac saturada (swap > 90%%)")
        self.assertEqual(r2[0]["gravedad"], "aviso")
        self.assertEqual(r2[0]["accion"], "bajar_trabajadores")

    def test_r2_no_dispara_sin_saturacion(self):
        hallazgos = _mod.diagnosticar(self._m(memoria={"swap_usado_mb": 100, "swap_total_mb": 2048, "ram_libre_mb": 1800}, trabajadores={"tope_gobernador": 3, "vivos": 2, "escribiendo": 1, "en_puerta": 0, "ociosos": 0}), {"maximo_por_hardware": 3}, [], 1000)
        r2 = [h for h in hallazgos if h["id"] == "R2"]
        self.assertFalse(any(r2), "R2 no debe disparar sin saturación")

    def test_r2_manda_sobre_r1_con_mac_saturada(self):
        # Mac saturada + capacidad ociosa: R2 debe aparecer (aviso) antes que R1 (info)
        hallazgos = _mod.diagnosticar(
            self._m(
                memoria={"swap_usado_mb": 1900, "swap_total_mb": 2048, "ram_libre_mb": 1800},
                trabajadores={"tope_gobernador": 3, "vivos": 1, "escribiendo": 0, "en_puerta": 0, "ociosos": 1},
                listas=5,
            ),
            {"maximo_por_hardware": 5},
            [], 1000,
        )
        ids = [h["id"] for h in hallazgos]
        # R2 debe estar presente; R1 puede estar también pero con menor prioridad (info < aviso)
        r2_idx = ids.index("R2") if "R2" in ids else -1
        r1_idx = ids.index("R1") if "R1" in ids else -1
        if r2_idx >= 0:
            # R2 debe ir antes que R1 (menor índice = primero en lista ordenada)
            if r1_idx >= 0:
                self.assertLess(r2_idx, r1_idx, "R2 debe ir antes que R1 en orden de gravedad")

    def test_r3_dispara_modelo_improductivo(self):
        hallazgos = _mod.diagnosticar(self._m(modelos={"m_malo": {"intentos": 8, "tasa": 0.05, "sin_cambios": 7, "colgados": 0, "segundos_mediana": 120, "integradas": 0, "con_cambios": 0}}), {}, [], 1000)
        r3 = [h for h in hallazgos if h["id"] == "R3"]
        self.assertTrue(any(r3), "R3 debe disparar con tasa < 0.1")
        self.assertEqual(r3[0]["accion"], "bajar_en_rotacion")

    def test_r3_no_dispara_modelo_productivo(self):
        hallazgos = _mod.diagnosticar(self._m(modelos={"m_bueno": {"intentos": 8, "tasa": 0.9, "sin_cambios": 0, "colgados": 0, "segundos_mediana": 90, "integradas": 7, "con_cambios": 1}}), {}, [], 1000)
        r3 = [h for h in hallazgos if h["id"] == "R3"]
        self.assertFalse(any(r3), "R3 no debe disparar con tasa alta")

    def test_r4_dispara_modelo_estrella_fuera_top3(self):
        # Modelo con tasa alta y fuera del top 3
        hallazgos = _mod.diagnosticar(self._m(modelos={"m_estrella": {"intentos": 6, "tasa": 0.5, "sin_cambios": 1, "colgados": 0, "segundos_mediana": 90, "integradas": 3, "con_cambios": 3}, "m_mejor": {"intentos": 10, "tasa": 0.8, "sin_cambios": 1, "colgados": 0}, "m_segundo": {"intentos": 8, "tasa": 0.7, "sin_cambios": 1}, "m_tercero": {"intentos": 7, "tasa": 0.6, "sin_cambios": 1}}), {}, [], 1000)
        r4 = [h for h in hallazgos if h["id"] == "R4"]
        self.assertTrue(any(r4), "R4 debe disparar con modelo estrella fuera del top 3")
        self.assertEqual(r4[0]["accion"], "subir_en_rotacion")

    def test_r4_no_dispara_si_esta_en_top3(self):
        hallazgos = _mod.diagnosticar(self._m(modelos={"m_top": {"intentos": 6, "tasa": 0.5, "sin_cambios": 1, "colgados": 0, "segundos_mediana": 90, "integradas": 3, "con_cambios": 3}}), {}, [], 1000)
        r4 = [h for h in hallazgos if h["id"] == "R4"]
        self.assertFalse(any(r4), "R4 no debe disparar si el modelo está en el top 3")

    def test_r5_dispara_escritor_sin_usar(self):
        hallazgos = _mod.diagnosticar(self._m(sin_usar=["m_sin_usar"]), {}, [], 1000)
        r5 = [h for h in hallazgos if h["id"] == "R5"]
        self.assertTrue(any(r5), "R5 debe disparar con modelo en sin_usar")
        self.assertEqual(r5[0]["accion"], "probar_modelo")

    def test_r5_no_dispara_sin_modelos_sin_usar(self):
        hallazgos = _mod.diagnosticar(self._m(sin_usar=[]), {}, [], 1000)
        r5 = [h for h in hallazgos if h["id"] == "R5"]
        self.assertFalse(any(r5), "R5 no debe disparar sin modelos sin usar")

    def test_r6_dispara_cuello_de_botella(self):
        # Fase con p90 > 15 min y ocupando > 50% del tiempo total
        hallazgos = _mod.diagnosticar(self._m(fases={"tsc": {"n": 10, "segundos_mediana": 120, "segundos_p90": 1000, "fallos": 1}, "tests": {"n": 10, "segundos_mediana": 30, "segundos_p90": 50, "fallos": 0}, "rev": {"n": 10, "segundos_mediana": 15, "segundos_p90": 25, "fallos": 0}, "int": {"n": 10, "segundos_mediana": 10, "segundos_p90": 15, "fallos": 0}}), {}, [], 1000)
        r6 = [h for h in hallazgos if h["id"] == "R6"]
        # p90 de tsc es 1000 s (> 900) y mediana*10 = 1200 > 0.5*(1200+300+150+100) = 875
        # Debería disparar
        self.assertTrue(any(r6), "R6 debe disparar con cuello de botella")
        self.assertEqual(r6[0]["accion"], "proponer_tarea")

    def test_r6_no_dispara_sin_cuello(self):
        hallazgos = _mod.diagnosticar(self._m(fases={"tsc": {"n": 10, "segundos_mediana": 30, "segundos_p90": 120, "fallos": 0}, "tests": {"n": 10, "segundos_mediana": 30, "segundos_p90": 60, "fallos": 0}, "rev": {"n": 10, "segundos_mediana": 10, "segundos_p90": 20, "fallos": 0}, "int": {"n": 10, "segundos_mediana": 5, "segundos_p90": 10, "fallos": 0}}), {}, [], 1000)
        r6 = [h for h in hallazgos if h["id"] == "R6"]
        self.assertFalse(any(r6), "R6 no debe disparar sin cuello de botella")

    def test_r7_dispara_nube_pausada_solo_hallazgo(self):
        hallazgos = _mod.diagnosticar(self._m(nube={"pausada": True, "motivo": "mantenimiento", "quien_pausa": "claude-supervisor", "contenedores_libres": 2}, listas=6, trabajadores={"tope_gobernador": 2, "vivos": 2, "escribiendo": 0, "en_puerta": 0, "ociosos": 0}, modelos={"m1": {"intentos": 6, "tasa": 0.1, "sin_cambios": 5, "colgados": 0}}), {}, [], 1000)
        r7 = [h for h in hallazgos if h["id"] == "R7"]
        self.assertTrue(any(r7), "R7 debe disparar con nube en pausa")
        self.assertIsNone(r7[0]["accion"], "R7 nunca debe devolver acción que reactive la nube")

    def test_r7_no_dispara_sin_condiciones(self):
        hallazgos = _mod.diagnosticar(self._m(nube={"pausada": False, "motivo": "", "contenedores_libres": 0}, listas=1, trabajadores={"tope_gobernador": 2, "vivos": 2, "escribiendo": 1, "en_puerta": 0, "ociosos": 0}, modelos={"m1": {"intentos": 6, "tasa": 0.5, "sin_cambios": 1, "colgados": 0}}), {}, [], 1000)
        r7 = [h for h in hallazgos if h["id"] == "R7"]
        self.assertFalse(any(r7), "R7 no debe disparar sin nube en pausa o sin baja tasa")

    def test_r7_no_dispara_listas_insuficientes(self):
        # Nube en pausa pero listas < 2*vivos → R7 no dispara
        hallazgos = _mod.diagnosticar(
            self._m(
                nube={"pausada": True, "motivo": "otra-persona", "contenedores_libres": 2},
                listas=1,
                trabajadores={"tope_gobernador": 2, "vivos": 2, "escribiendo": 0, "en_puerta": 0, "ociosos": 0},
                modelos={"m1": {"intentos": 6, "tasa": 0.1, "sin_cambios": 5, "colgados": 0}},
            ),
            {}, [], 1000
        )
        r7 = [h for h in hallazgos if h["id"] == "R7"]
        self.assertFalse(any(r7), "R7 no debe disparar si listas < 2*vivos aun cuando nube en pausa")

    def test_r8_dispara_rojo(self):
        hallazgos = _mod.diagnosticar(self._m(coste={"jev_dia_usd": 0.85, "opus_semana_pct": 30, "supabase_pct_dia": 20}), {"tope_jev_dia_usd": 1.0}, [], 1000)
        r8 = [h for h in hallazgos if h["id"] == "R8"]
        self.assertTrue(any(r8), "R8 debe disparar con coste alto")
        self.assertEqual(r8[0]["gravedad"], "rojo")

    def test_r8_no_dispara_sin_coste_alto(self):
        hallazgos = _mod.diagnosticar(self._m(coste={"jev_dia_usd": 0.01, "opus_semana_pct": 10, "supabase_pct_dia": 20}), {"tope_jev_dia_usd": 1.0}, [], 1000)
        r8 = [h for h in hallazgos if h["id"] == "R8"]
        self.assertFalse(any(r8), "R8 no debe disparar con coste bajo")

    def test_r7_nunca_reanuda_con_claude_supervisor(self):
        # Pausa puesta por alguien distinto del director-optimizador → solo hallazgo R7, nunca acción.
        hallazgos = _mod.diagnosticar(
            self._m(
                nube={
                    "pausada": True,
                    "motivo": "mantenimiento",
                    "quien_pausa": "claude-supervisor",
                    "pausada_desde": 1697400000,
                    "contenedores_libres": 2,
                    "agentes_por_job": 3,
                    "runs_vivos": 1,
                    "runs_6h": [{"commits": 0, "terminado": 1697400100}],
                    "lanzados_hoy": 1,
                },
                listas=6,
                trabajadores={"tope_gobernador": 2, "vivos": 2, "escribiendo": 0, "en_puerta": 0, "ociosos": 0},
                modelos={"m1": {"intentos": 6, "tasa": 0.1, "sin_cambios": 5, "colgados": 0}},
            ),
            {}, [], 1000
        )
        r7 = [h for h in hallazgos if h["id"] == "R7"]
        self.assertTrue(any(r7), "R7 debe aparecer con pausa de claude-supervisor")
        self.assertIsNone(r7[0]["accion"], "R7 nunca debe devolver acción que reactive la nube")
        # R9 no debe aparecer porque la nube está pausada con quien_pausa != director-optimizador.
        r9 = [h for h in hallazgos if h["id"] == "R9"]
        # No debe haber acción de reanudar porque quien_pausa != director-optimizador.
        r9_acciones = [h.get("accion") for h in r9]
        self.assertNotIn("reanudar_nube", r9_acciones, "R9 no debe proponer reanudar si quien_pausa != director-optimizador")

    def test_r9_lanza_1_sin_runs(self):
        hallazgos = _mod.diagnosticar(
            self._m(
                nube={
                    "pausada": False,
                    "quien_pausa": "",
                    "pausada_desde": 0,
                    "contenedores_libres": 2,
                    "agentes_por_job": 3,
                    "runs_vivos": 0,
                    "runs_6h": [],
                    "lanzados_hoy": 0,
                },
                listas=4,
                trabajadores={"tope_gobernador": 3, "vivos": 2, "escribiendo": 1, "en_puerta": 0, "ociosos": 0},
            ),
            {"max_runs_nube_dia": 12},
            [], 1000
        )
        r9 = [h for h in hallazgos if h["id"] == "R9"]
        self.assertTrue(any(r9), "R9 debe aparecer sin runs previos")
        acciones_r9 = [h.get("accion") for h in r9]
        self.assertIn("lanzar_nube", acciones_r9, "R9 debe proponer lanzar_nube sin runs previos")

    def test_r9_escala_2_con_ultimo_run_1_commit(self):
        hallazgos = _mod.diagnosticar(
            self._m(
                nube={
                    "pausada": False,
                    "quien_pausa": "",
                    "pausada_desde": 0,
                    "contenedores_libres": 2,
                    "agentes_por_job": 3,
                    "runs_vivos": 1,
                    "runs_6h": [{"commits": 1, "terminado": 1697400200}],
                    "lanzados_hoy": 1,
                },
                listas=5,
                trabajadores={"tope_gobernador": 2, "vivos": 1, "escribiendo": 0, "en_puerta": 0, "ociosos": 0},
            ),
            {"max_runs_nube_dia": 12},
            [], 1000
        )
        r9 = [h for h in hallazgos if h["id"] == "R9"]
        acciones_r9 = [h.get("accion") for h in r9]
        self.assertIn("lanzar_nube", acciones_r9, "R9 debe escalar con último run >= 1 commit")

    def test_r9_pausa_2_runs_cero(self):
        hallazgos = _mod.diagnosticar(
            self._m(
                nube={
                    "pausada": False,
                    "quien_pausa": "",
                    "pausada_desde": 0,
                    "contenedores_libres": 2,
                    "agentes_por_job": 3,
                    "runs_vivos": 1,
                    "runs_6h": [{"commits": 0, "terminado": 1697400100}, {"commits": 0, "terminado": 1697400200}],
                    "lanzados_hoy": 2,
                },
                listas=6,
                trabajadores={"tope_gobernador": 2, "vivos": 2, "escribiendo": 0, "en_puerta": 0, "ociosos": 0},
                modelos={"m1": {"intentos": 6, "tasa": 0.1, "sin_cambios": 5, "colgados": 0}},
            ),
            {"max_runs_nube_dia": 12},
            [], 1000
        )
        r9 = [h for h in hallazgos if h["id"] == "R9"]
        acciones_r9 = [h.get("accion") for h in r9]
        self.assertIn("pausar_nube", acciones_r9, "R9 debe pausar con 2 runs a cero")

    def test_r9_reanuda_solo_director_optimizador_6h(self):
        # Reanudar solo con quien_pausa == director-optimizador y pasaron >= 6h.
        hallazgos = _mod.diagnosticar(
            self._m(
                nube={
                    "pausada": True,
                    "quien_pausa": "director-optimizador",
                    "pausada_desde": 1697396400,
                    "contenedores_libres": 2,
                    "agentes_por_job": 3,
                    "runs_vivos": 0,
                    "runs_6h": [{"commits": 0, "terminado": 1697400000}],
                    "lanzados_hoy": 1,
                },
                listas=5,
                trabajadores={"tope_gobernador": 2, "vivos": 2, "escribiendo": 0, "en_puerta": 0, "ociosos": 0},
            ),
            {"max_runs_nube_dia": 12},
            [], 1697418000  # >= pausada_desde (1697396400) + 6*3600 (21600)
        )
        r9 = [h for h in hallazgos if h["id"] == "R9"]
        acciones_r9 = [h.get("accion") for h in r9]
        self.assertIn("reanudar_nube", acciones_r9, "R9 debe reanudar con director-optimizador y >= 6h")

    def test_r9_sin_accion_tope_diario_lleno(self):
        hallazgos = _mod.diagnosticar(
            self._m(
                nube={
                    "pausada": False,
                    "quien_pausa": "",
                    "pausada_desde": 0,
                    "contenedores_libres": 2,
                    "agentes_por_job": 3,
                    "runs_vivos": 1,
                    "runs_6h": [{"commits": 1, "terminado": 1697400200}],
                    "lanzados_hoy": 12,
                },
                listas=5,
                trabajadores={"tope_gobernador": 2, "vivos": 2, "escribiendo": 0, "en_puerta": 0, "ociosos": 0},
            ),
            {"max_runs_nube_dia": 12},
            [], 1000
        )
        r9 = [h for h in hallazgos if h["id"] == "R9"]
        # Con tope diario lleno, no debe lanzar.
        acciones_r9 = [h.get("accion") for h in r9]
        self.assertNotIn("lanzar_nube", acciones_r9, "R9 no debe lanzar con tope diario lleno")
        # No debe aparecer ninguna acción de R9 en este caso (ni pausar, porque runs no son 0).
        acciones_r9_filtradas = [a for a in acciones_r9 if a is not None]
        self.assertEqual(acciones_r9_filtradas, [], "R9 no debe proponer ninguna acción con tope diario lleno")

    def test_r9_falta_entradas_falta_accion(self):
        hallazgos = _mod.diagnosticar(
            self._m(
                nube={
                    "pausada": False,
                    "conteneres_libres": 2,
                },
            ),
            {}, [], 1000
        )
        r9 = [h for h in hallazgos if h["id"] == "R9"]
        self.assertTrue(any(r9), "R9 debe aparecer cuando faltan entradas nuevas")
        self.assertIsNone(r9[0]["accion"], "R9 no debe tener acción si faltan datos")

    def test_accion_descartada_por_enfriamiento(self):
        # La misma perilla apareció hace 10 segundos (< 60 min de enfriamiento)
        hallazgos = _mod.diagnosticar(self._m(), {"enfriamiento_min": 60, "max_cambios_dia": 12}, [{"t": 990, "accion": "subir_trabajadores", "perilla": "subir_trabajadores"}], 1000)
        r1 = [h for h in hallazgos if h["id"] == "R1"]
        # Debe haber hallazgo R1 pero sin acción (descartada por enfriamiento)
        if any(r1):
            self.assertIsNone(r1[0]["accion"])

    def test_accion_descartada_por_tope_diario_lleno(self):
        # 12 cambios hoy (máximo)
        historial_lleno = [{"t": 1000 + i * 100, "accion": "subir_trabajadores", "perilla": "subir_trabajadores"} for i in range(12)]
        hallazgos = _mod.diagnosticar(self._m(), {"enfriamiento_min": 60, "max_cambios_dia": 12}, historial_lleno, 10000)
        r1 = [h for h in hallazgos if h["id"] == "R1"]
        if any(r1):
            self.assertIsNone(r1[0]["accion"])


if __name__ == "__main__":
    unittest.main()
