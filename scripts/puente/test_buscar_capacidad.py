# -*- coding: utf-8 -*-
"""Pruebas de «Buscar más capacidad» (buscar_capacidad.py) y de la segunda oportunidad en la
nube (repartir_nube: motivo_fuera, clasificar, reaperturas)."""
import os
import sys
import tempfile
import time
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import buscar_capacidad as B  # noqa: E402
import repartir_nube as RN  # noqa: E402

AHORA = 1_791_000_000.0


class PuedeReabrir(unittest.TestCase):
    def test_sin_reaperturas_se_puede(self):
        self.assertTrue(B.puede_reabrir([], AHORA))
        self.assertTrue(B.puede_reabrir(None, AHORA))

    def test_espera_entre_reaperturas(self):
        self.assertFalse(B.puede_reabrir([AHORA - 600], AHORA))
        self.assertTrue(B.puede_reabrir([AHORA - B.REABRIR_ESPERA_S - 1], AHORA))

    def test_tope_de_reaperturas(self):
        viejas = [AHORA - 30 * 3600, AHORA - 20 * 3600]
        self.assertFalse(B.puede_reabrir(viejas, AHORA))


class PlanNube(unittest.TestCase):
    def test_pausa_no_despliega(self):
        p = B.plan_nube(["A"], [], 0, "a mano", {}, AHORA)
        self.assertEqual(p["lanzar"], 0)
        self.assertIn("pausa", p["por_que"])

    def test_tope_de_jobs(self):
        p = B.plan_nube(["A"], [], B.TOPE_RUNS_NUBE, None, {}, AHORA)
        self.assertEqual(p["lanzar"], 0)
        self.assertIn("en marcha", p["por_que"])

    def test_elegibles_lanzan_sin_reabrir(self):
        p = B.plan_nube(["A", "B", "C", "D", "E", "F", "G"], ["X"], 0, None, {}, AHORA, listas_mac=30, tope_mac=3)
        self.assertEqual(p["lanzar"], 2)
        self.assertEqual(p["reabrir"], ["X"])  # quedaba sitio (12) y la Mac tiene de sobra
        self.assertEqual(p["trabajadores"], 3)

    def test_reabre_agotadas_cuando_no_hay_elegibles(self):
        """El caso medido el 2026-10-05: 0 elegibles, 16 agotadas, la Mac 3/3 con 12 listas."""
        agotadas = ["T%d" % i for i in range(16)]
        p = B.plan_nube([], agotadas, 0, None, {}, AHORA, listas_mac=12, tope_mac=3)
        self.assertEqual(len(p["reabrir"]), B.REABRIR_POR_PASADA)
        self.assertEqual(p["reabrir"], agotadas[:B.REABRIR_POR_PASADA])
        self.assertEqual(p["lanzar"], 1)
        self.assertEqual(p["trabajadores"], 3)

    def test_nunca_deja_a_la_mac_sin_trabajo(self):
        p = B.plan_nube([], ["A", "B", "C"], 0, None, {}, AHORA, listas_mac=4, tope_mac=3)
        self.assertEqual(p["reabrir"], ["A"])  # 4 listas − tope 3 = 1 de sobra
        p = B.plan_nube([], ["A", "B"], 0, None, {}, AHORA, listas_mac=3, tope_mac=3)
        self.assertEqual(p["lanzar"], 0)
        self.assertIn("agotadas", p["por_que"])

    def test_no_reabre_lo_reabierto_hace_poco(self):
        p = B.plan_nube([], ["A", "B"], 0, None, {"A": [AHORA - 60]}, AHORA, listas_mac=20, tope_mac=3)
        self.assertEqual(p["reabrir"], ["B"])
        self.assertEqual(p["trabajadores"], 1)

    def test_sin_trabajo(self):
        p = B.plan_nube([], [], 0, None, {}, AHORA)
        self.assertEqual(p["lanzar"], 0)
        self.assertIn("no hay trabajo", p["por_que"])

    def test_un_job_libre_no_reabre_de_mas(self):
        p = B.plan_nube(["A", "B"], ["X%d" % i for i in range(9)], 1, None, {}, AHORA, listas_mac=50, tope_mac=3)
        self.assertEqual(p["lanzar"], 1)
        self.assertEqual(len(p["reabrir"]), B.TAREAS_POR_RUN - 2)


class Contadores(unittest.TestCase):
    def test_runs_en_marcha(self):
        runs = [{"status": "completed"}, {"status": "in_progress"}, {"status": "queued"}, {}]
        self.assertEqual(B.runs_en_marcha(runs), 2)
        self.assertEqual(B.runs_en_marcha(None), 0)

    def test_en_camino(self):
        self.assertEqual(B.en_camino({"en_camino": 2, "en_camino_hasta": AHORA + 10}, AHORA), 2)
        self.assertEqual(B.en_camino({"en_camino": 2, "en_camino_hasta": AHORA - 10}, AHORA), 0)
        self.assertEqual(B.en_camino(None, AHORA), 0)


class Textos(unittest.TestCase):
    def test_mac_llena_dice_el_tope(self):
        t = B.texto_mac({"ocupados": ["A", "B", "C"], "tope": 3, "listas": ["X"] * 12,
                         "motivo_tope": "máximo 3 por hardware (8 GB)"}, {"huecos": 0}, [])
        self.assertIn("3 de 3 trabajando", t)
        self.assertIn("12 lista(s)", t)
        self.assertIn("hardware", t)
        self.assertIn("3 es el máximo de esta Mac", t)

    def test_mac_asignada(self):
        t = B.texto_mac({}, {"resumen": "Meto BLQ1005C en la tanda viva."}, ["cola viva actualizada"])
        self.assertIn("Meto BLQ1005C", t)

    def test_nube_explica_lo_que_no_coge(self):
        clases = {"elegibles": [], "agotada": ["A", "B"], "espera": ["C"], "grande": ["D", "E", "F"]}
        plan = {"lanzar": 0, "reabrir": [], "por_que": "no hay trabajo"}
        t = B.texto_nube(clases, plan, 0)
        self.assertIn("0 tarea(s) elegible(s)", t)
        self.assertIn("2 ya se mandaron", t)
        self.assertIn("1 esperan a otra tarea", t)
        self.assertIn("3 piden más de", t)

    def test_nube_dice_lo_reabierto(self):
        plan = {"lanzar": 1, "reabrir": ["A", "B"], "trabajadores": 2, "por_que": "x"}
        t = B.texto_nube({"elegibles": []}, plan, 0, "lanzando 1 job(s) de 2 agente(s) en segundo plano")
        self.assertIn("reabro 2", t)
        self.assertIn("A, B", t)
        self.assertIn("lanzando 1 job", t)

    def test_comprobar_dice_lo_que_haria(self):
        plan = {"lanzar": 1, "reabrir": ["A"], "trabajadores": 1, "por_que": "1 tarea(s) para la nube"}
        t = B.texto_nube({"elegibles": []}, plan, 0, aplicado=False)
        self.assertIn("se pueden reabrir 1", t)
        self.assertNotIn("reabro", t)

    def test_medio_claude_explica_que_no_se_enciende_desde_el_mando(self):
        t = B.texto_medio({"id": "claude", "estado": "usable", "siguiente_paso": "pídele a Claude"})
        self.assertIn("Contenedor de Claude: disponible", t)
        self.assertIn("desde el Mando no se puede encender", t)

    def test_medio_generico(self):
        t = B.texto_medio({"id": "hf", "estado": "requiere_alex", "siguiente_paso": "solo con PRO"})
        self.assertEqual(t, "Hugging Face: te necesita · solo con PRO")

    def test_resumen(self):
        self.assertTrue(B.resumen(["a", "b"], 3).startswith("Busqué en todos los medios · 3 agente(s) más"))
        self.assertIn("no cabe más", B.resumen(["a"], 0))
        self.assertIn("\n· a", B.resumen(["a"], 0))


class Modelos(unittest.TestCase):
    SALUD = {
        "nim": {"estado": "vivo", "sin_cupo_hasta": "2026-10-05 13:40:00"},
        "xkiro": {"estado": "vivo", "sin_cupo_hasta": "2026-09-29 17:07:11"},
        "llm7": {"estado": "caido"},
        "groq": {"estado": "vivo"},
        "claves": {"x": 1},
        "ultimo_revisor_ok": "2026-10-05",
    }

    def test_separa_con_cupo_sin_cupo_y_caidos(self):
        t = B.texto_modelos(self.SALUD, "2026-10-05 13:35:00")
        self.assertIn("2 proveedor(es) con cupo (groq, xkiro)", t)
        self.assertIn("1 sin cupo (nim hasta las 13:40)", t)
        self.assertIn("1 caído(s) (llm7)", t)
        self.assertNotIn("claves", t)

    def test_cuando_esperan_pasarela_lo_dice(self):
        t = B.texto_modelos(self.SALUD, "2026-10-05 13:35:00", esperando=3)
        self.assertIn("3 agente(s) de la Mac esperando pasarela", t)
        self.assertIn("el límite son los modelos", t)

    def test_cupo_vencido_vuelve_a_contar(self):
        self.assertIn("3 proveedor(es) con cupo", B.texto_modelos(self.SALUD, "2026-10-05 13:41:00"))

    def test_esperando_pasarela_solo_latidos_frescos(self):
        fresco = {"tareas": {"A": {"fase": "esperando proveedor"}, "B": {"fase": "escribiendo"},
                             "C": {"fase": "esperando cupo"}}}
        viejo = {"tareas": {"D": {"fase": "esperando proveedor"}}}
        self.assertEqual(B.esperando_pasarela([(AHORA - 30, fresco), (AHORA - 900, viejo)], AHORA), 2)
        self.assertEqual(B.esperando_pasarela(None, AHORA), 0)


class ContenedoresReusanElSondeo(unittest.TestCase):
    """(2026-10-05) El botón fusionado mide los contenedores con el MISMO sondeo de medios."""

    def test_inventario_con_medios_dados_no_vuelve_a_sondear(self):
        import contenedores_nube as CN

        llamadas = []
        sondeo, vivos = CN._sondeo, CN._vivos_por_medio
        CN._sondeo = lambda: llamadas.append(1) or []
        CN._vivos_por_medio = lambda: {}
        try:
            d = CN.inventario([{"id": "nube-gh", "nombre": "GitHub Actions", "estado": "usable"},
                               {"id": "mac", "estado": "listo"}])
        finally:
            CN._sondeo, CN._vivos_por_medio = sondeo, vivos
        self.assertEqual(llamadas, [])
        self.assertIn("nube-gh", [c["id"] for c in d["contenedores"]])


def _tarea(tid, **kw):
    t = {"id": tid, "ola": "Ola 900 · prueba", "archivos": ["a.ts"]}
    t.update(kw)
    return t


class MotivosYClasificar(unittest.TestCase):
    def test_motivo_fuera_en_orden(self):
        prog = {"D": {"estado": "pendiente"}}
        self.assertIsNone(RN.motivo_fuera(_tarea("A"), {}, [], None))
        self.assertEqual(RN.motivo_fuera(_tarea("A"), {}, [], 900), "ola-actual")
        self.assertEqual(RN.motivo_fuera(_tarea("A"), {"A": {"estado": "commit"}}, [], None), "estado")
        self.assertEqual(RN.motivo_fuera(_tarea("A", archivos=list("abcd")), {}, [], None), "grande")
        self.assertEqual(RN.motivo_fuera(_tarea("A", depende=["D"]), prog, [], None), "espera")
        self.assertEqual(RN.motivo_fuera(_tarea("A"), {}, [], None, envios={"A": 3}), "agotada")
        self.assertEqual(RN.motivo_fuera(_tarea("A", privado=True), {}, [], None), "privada")

    def test_clasificar_coincide_con_elegir(self):
        colas = [("c1", [_tarea("A"), _tarea("B", archivos=list("abcd")), _tarea("C")]),
                 ("c2", [_tarea("D", privado=True), _tarea("E"), _tarea("A")])]
        envios = {"C": 3, "E": 3}
        clases = RN.clasificar(colas, {"E": {"estado": "pendiente"}}, [], "", envios)
        elegidas = [t["id"] for t in RN.elegir(colas, {}, [], "", envios=envios)]
        self.assertEqual(clases["elegibles"], elegidas)
        self.assertEqual(clases["grande"], ["B"])
        self.assertEqual(clases["agotada"], ["C", "E"])
        self.assertEqual(clases["privada"], ["D"])

    def test_agotada_que_seguiria_fuera_sale_con_su_otro_motivo(self):
        colas = [("c", [_tarea("P", privado=True)])]
        clases = RN.clasificar(colas, {}, [], "", {"P": 5})
        self.assertEqual(clases.get("privada"), ["P"])
        self.assertNotIn("agotada", clases)

    def test_cerradas_no_cuentan(self):
        colas = [("c", [_tarea("H")])]
        clases = RN.clasificar(colas, {"H": {"estado": "commit"}}, [], "")
        self.assertEqual(clases, {"elegibles": []})


class Reaperturas(unittest.TestCase):
    def test_envios_efectivos_descuenta(self):
        self.assertEqual(RN.envios_efectivos({"A": 3, "B": 1}, {"A": [1.0], "B": [1.0, 2.0]}), {"A": 2, "B": 0})

    def test_vigentes_descarta_viejas(self):
        datos = {"A": [AHORA - 3 * 86400, AHORA - 100], "B": [AHORA - 5 * 86400], "C": ["x"]}
        self.assertEqual(RN.reaperturas_vigentes(datos, AHORA), {"A": [AHORA - 100]})

    def test_anotar_y_leer(self):
        with tempfile.TemporaryDirectory() as d:
            ruta = os.path.join(d, "sub", "reap.json")
            RN.anotar_reaperturas(["A", "B"], AHORA, ruta)
            RN.anotar_reaperturas(["A"], AHORA + 10, ruta)
            leidas = RN.leer_reaperturas(AHORA + 20, ruta)
            self.assertEqual(len(leidas["A"]), 2)
            self.assertEqual(len(leidas["B"]), 1)
            self.assertEqual(RN.leer_reaperturas(AHORA, os.path.join(d, "no-existe.json")), {})

    def test_reabrir_devuelve_la_tarea_a_la_nube(self):
        """Lo que hace el botón, de punta a punta en lo puro: agotada → reabierta → elegible."""
        colas = [("c", [_tarea("A")])]
        envios = {"A": 3}
        self.assertEqual(RN.elegir(colas, {}, [], "", envios=envios), [])
        efectivos = RN.envios_efectivos(envios, {"A": [AHORA]})
        self.assertEqual([t["id"] for t in RN.elegir(colas, {}, [], "", envios=efectivos)], ["A"])


if __name__ == "__main__":
    unittest.main()


class EscritoresDelBoton(unittest.TestCase):
    """(2026-10-06) «Buscar más capacidad no lo arregla»: si ningún modelo tiene cupo, lo dice."""

    def test_representantes_uno_por_proveedor_sin_pago_ni_revisores(self):
        cfg = {"provider": {
            "openrouter": {"models": {"a:free": {}, "b:free": {}}},
            "nvidia": {"models": {"moonshotai/kimi-k3": {}}},
            "xai": {"models": {"grok": {}}},
            "groq": {"models": {"gpt-oss": {}}},
            "freellmapi": {"models": {"auto": {}}},
            "vacio": {"models": {}},
        }}
        self.assertEqual(B.representantes(cfg), ["nvidia/moonshotai/kimi-k3", "openrouter/a:free"])

    def test_ninguno_puede(self):
        ahora = time.mktime((2026, 10, 6, 15, 0, 0, 0, 0, -1))
        linea, alguno = B.texto_escritores([
            ("openrouter/a:free", False, "cupo del día agotado (429)", 3.0),
            ("nvidia/moonshotai/kimi-k3", False, "no contesta en 25 s", 0.25),
        ], ahora)
        self.assertFalse(alguno)
        self.assertIn("NINGUNO", linea)
        self.assertIn("openrouter: cupo del día agotado (429) · vuelve hacia las 18:00", linea)
        self.assertNotIn("vuelve", linea.split("nvidia")[1])
        self.assertIn("el límite NO son los huecos", B.resumen([linea], 0, sin_escritores=True))

    def test_alguno_puede(self):
        linea, alguno = B.texto_escritores([("xkiro/x", True, "responde", 0), ("google/g", False, "saturado (429)", 0.25)])
        self.assertTrue(alguno)
        self.assertTrue(linea.startswith("Escritores que pueden escribir ahora: xkiro"))
        self.assertTrue(B.resumen(["x"], 3).startswith("Busqué en todos los medios · 3 agente(s)"))

    def test_sin_resultados_no_alarma(self):
        self.assertEqual(B.texto_escritores([]), ("Escritores: no pude sondearlos", True))
