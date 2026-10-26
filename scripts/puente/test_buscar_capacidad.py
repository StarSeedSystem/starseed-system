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
        """El caso medido el 2026-10-05: 0 elegibles, 16 agotadas, la Mac 3/3 con 12 listas.
        (2026-10-25, CAP1025B) Llena el sitio libre (2 jobs × 6) sin dejar a la Mac por debajo de su tope:
        12 listas − 3 = 9 reabiertas, no las 6 de un solo job de antes."""
        agotadas = ["T%d" % i for i in range(16)]
        p = B.plan_nube([], agotadas, 0, None, {}, AHORA, listas_mac=12, tope_mac=3)
        self.assertEqual(p["reabrir"], agotadas[:9])
        self.assertEqual(p["lanzar"], 2)
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
        self.assertIn("desde Genesis no se puede encender", t)

    def test_medio_generico(self):
        t = B.texto_medio({"id": "hf", "estado": "requiere_alex", "siguiente_paso": "solo con PRO"})
        self.assertEqual(t, "Hugging Face: te necesita · solo con PRO")

    CAPACIDAD_ORACLE = "A1 2 OCPU · 12 GB · 2 micro 1 GB · 10 TB/mes"

    def test_oracle_requiere_alex_ensenia_capacidad_y_vinculo(self):
        t = B.texto_medio({"id": "oracle", "estado": "requiere_alex",
                           "capacidad": self.CAPACIDAD_ORACLE,
                           "detalle": "cuenta sin vincular",
                           "siguiente_paso": "vincular: `oci setup bootstrap` en la Terminal"})
        self.assertEqual(t, "Oracle Always Free: te necesita · %s · vincular: `oci setup bootstrap` en la Terminal"
                         % self.CAPACIDAD_ORACLE)
        self.assertNotIn("descartado", t)

    def test_oracle_usable_sin_a1(self):
        t = B.texto_medio({"id": "oracle", "estado": "usable", "capacidad": self.CAPACIDAD_ORACLE,
                           "detalle": "vinculada (región madrid) sin máquina A1 en marcha",
                           "siguiente_paso": "desplegar el A1 y su orquestador"})
        self.assertEqual(t, "Oracle Always Free: disponible · %s · desplegar el A1 y su orquestador"
                         % self.CAPACIDAD_ORACLE)

    def test_oracle_listo_con_a1_en_marcha(self):
        t = B.texto_medio({"id": "oracle", "estado": "listo", "capacidad": self.CAPACIDAD_ORACLE,
                           "detalle": "A1 RUNNING y orquestador anunciado por el bus hace 30 s",
                           "siguiente_paso": ""})
        self.assertEqual(t, "Oracle Always Free: trabajando · %s · A1 RUNNING y orquestador anunciado por el bus hace 30 s"
                         % self.CAPACIDAD_ORACLE)

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
        # (CAP1025D) Se separa quién escribe de quién solo revisa.
        self.assertIn("2 proveedor(es) con cupo (escriben: xkiro; solo revisan o retirados: groq)", t)
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


class SinTrabajoListo(unittest.TestCase):
    """(2026-10-08) «aún hay tareas listas… pero Buscar más capacidad dice que no cabe más»."""

    def test_con_sitio_y_sin_listas_no_dice_sin_hueco(self):
        t = B.texto_mac({"ocupados": [], "tope": 3, "listas": []}, {}, [])
        self.assertIn("hay sitio, pero ninguna tarea está lista para la Mac", t)
        self.assertNotIn("sin hueco", t)

    def test_llena_sigue_diciendo_sin_hueco(self):
        t = B.texto_mac({"ocupados": ["A", "B", "C"], "tope": 3, "listas": []}, {}, [])
        self.assertIn("sin hueco", t)

    def test_explica_por_que_no_hay_trabajo(self):
        prog = {"RM3": {"estado": "pendiente_aprobacion"}, "R7c": {"estado": "bloqueante"},
                "DR1": {"estado": "bloqueada"}, "OK": {"estado": "commit"}}
        linea = B.texto_sin_trabajo(prog)
        self.assertIn("1 esperan visto bueno de la dirección (RM3)", linea)
        self.assertIn("2 bloqueadas (DR1, R7c)", linea)
        texto = B.resumen([linea], 0, sin_trabajo=True)
        self.assertIn("no hay más trabajo listo", texto)
        self.assertNotIn("no cabe más", texto)


class EscritoresDelBoton(unittest.TestCase):
    """(2026-10-06) «Buscar más capacidad no lo arregla»: si ningún modelo tiene cupo, lo dice."""

    def test_representantes_por_proveedor_sin_pago_ni_revisores(self):
        cfg = {"provider": {
            "openrouter": {"models": {"a:free": {}, "b:free": {}}},
            "nvidia": {"models": {"moonshotai/kimi-k3": {}}},
            "xai": {"models": {"grok": {}}},
            "groq": {"models": {"gpt-oss": {}}},
            "freellmapi": {"models": {"auto": {}}},
            "vacio": {"models": {}},
        }}
        self.assertEqual(B.representantes(cfg), {"freellmapi": ["freellmapi/auto"],
                                                  "nvidia": ["nvidia/moonshotai/kimi-k3"],
                                                  "openrouter": ["openrouter/a:free", "openrouter/b:free"]})

    def test_un_modelo_retirado_no_decide_por_el_proveedor(self):
        respuestas = {"p/viejo": (False, "modelo retirado (410)", 0, True),
                      "p/pago": (False, "modelo solo de pago (403)", 0, True),
                      "p/bueno": (True, "responde", 0, False),
                      "q/a": (False, "cupo del día agotado (429)", 3.0, False),
                      "q/b": (True, "responde", 0, False)}
        self.assertEqual(B.veredicto_proveedor(["p/viejo", "p/pago", "p/bueno"], respuestas.get)[:2], ("p/bueno", True))
        # Un cupo agotado es del proveedor: no se gasta otra sonda en el siguiente modelo.
        self.assertEqual(B.veredicto_proveedor(["q/a", "q/b"], respuestas.get)[:2], ("q/a", False))
        self.assertEqual(B.veredicto_proveedor(["p/viejo"], respuestas.get)[2], "modelo retirado (410)")

    def test_ninguno_puede(self):
        ahora = time.mktime((2026, 10, 6, 15, 0, 0, 0, 0, -1))
        linea, alguno = B.texto_escritores([
            ("openrouter/a:free", False, "cupo del día agotado (429)", 3.0),
            ("nvidia/moonshotai/kimi-k3", False, "no contesta en 25 s", 0.25),
        ], ahora)
        self.assertFalse(alguno)
        self.assertIn("NINGUNO", linea)
        self.assertIn("openrouter: cupo del día agotado (429) · vuelve hacia las 18:00", linea)
        linea2, _ = B.texto_escritores([("apinex/x", False, "sin crédito (402)", 24)], ahora)
        self.assertIn("vuelve mañana hacia las 15:00", linea2)
        self.assertNotIn("vuelve", linea.split("nvidia")[1])
        self.assertIn("el límite NO son los huecos", B.resumen([linea], 0, sin_escritores=True))

    def test_alguno_puede(self):
        linea, alguno = B.texto_escritores([("xkiro/x", True, "responde", 0), ("google/g", False, "saturado (429)", 0.25)])
        self.assertTrue(alguno)
        self.assertTrue(linea.startswith("Escritores que pueden escribir ahora: xkiro"))
        self.assertTrue(B.resumen(["x"], 3).startswith("Busqué en todos los medios · 3 agente(s)"))

    def test_sin_resultados_no_alarma(self):
        self.assertEqual(B.texto_escritores([]), ("Escritores: no pude sondearlos", True))

    def test_un_modelo_lento_no_decide_por_el_proveedor(self):
        """(2026-10-10, CAP1010) kimi-k3 tardaba 45 s y NIM salía «no contesta» con nemotron vivo."""
        r = {"nvidia/viejo": (False, "modelo retirado (410)", 0, True),
             "nvidia/kimi": (False, "no contesta en 25 s", 0.25, False),
             "nvidia/nemo": (True, "responde", 0, False),
             "n2/a": (False, "no contesta en 25 s", 0.25, False),
             "n2/b": (False, "error del proveedor (503)", 0.25, False)}
        self.assertEqual(B.veredicto_proveedor(["nvidia/viejo", "nvidia/kimi", "nvidia/nemo"], r.get)[:2],
                         ("nvidia/nemo", True))
        # Si ninguno contesta, el veredicto es el del primero que falló por lento (no el último).
        self.assertEqual(B.veredicto_proveedor(["n2/a", "n2/b"], r.get)[:3],
                         ("n2/a", False, "no contesta en 25 s"))

    def test_retirados_no_se_sondean_y_se_explican(self):
        cfg = {"provider": {"apinex": {"models": {"free/x": {}}}, "tokenrouter": {"models": {"z": {}}},
                            "nvidia": {"models": {"a": {}}}}}
        self.assertEqual(list(B.representantes(cfg)), ["nvidia"])
        t = B.texto_fuera_de_escritura()
        for p in ("apinex", "tokenrouter", "github-models", "groq (solo revisa"):
            self.assertIn(p, t)


class TopeNubeDinamico(unittest.TestCase):
    """(2026-10-10, CAP1010) El tope de jobs ya no es un 2 fijo."""

    def test_sin_escritor_en_la_nube_no_hay_job(self):
        tope, motivo = B.tope_runs_nube(30, [])
        self.assertEqual(tope, 0)
        self.assertIn("freellmapi", motivo)

    def test_sin_tareas_no_hay_job(self):
        self.assertEqual(B.tope_runs_nube(0, ["nvidia"])[0], 0)

    def test_manda_el_limite_mas_bajo(self):
        self.assertEqual(B.tope_runs_nube(7, ["nvidia", "google"]), (2, "7 tarea(s) para la nube dan para 2 job(s) de 6"))
        tope, motivo = B.tope_runs_nube(40, ["nvidia"])
        self.assertEqual(tope, B.RUNS_POR_ESCRITOR)
        self.assertIn("1 escritor(es) vivo(s) en la nube (nvidia)", motivo)
        tope, motivo = B.tope_runs_nube(400, ["google", "nvidia", "openrouter", "xkiro"], maximo=6)
        self.assertEqual(tope, 6)
        self.assertIn("techo de 6", motivo)

    def test_crece_con_trabajo_y_escritores(self):
        uno = B.tope_runs_nube(36, ["nvidia"])[0]
        dos = B.tope_runs_nube(36, ["nvidia", "xkiro"])[0]
        self.assertGreater(dos, uno)
        self.assertGreater(dos, B.TOPE_RUNS_NUBE)

    def test_escritores_en_la_nube_desde_sondas_y_desde_salud(self):
        sondas = [("nvidia/nvidia/nemo", True, "responde", 0), ("freellmapi/auto", True, "responde", 0),
                  ("google/g", False, "cupo del día agotado (429)", 3)]
        # (2026-10-26, CAP1026L) freellmapi corre también dentro de cada job de la nube: cuenta.
        self.assertEqual(B.escritores_en_la_nube(sondas), ["freellmapi", "nvidia"])
        salud = {"nim": {"estado": "vivo"}, "google": {"sin_cupo_hasta": "2026-10-10 18:00:00"},
                 "xkiro": {"estado": "caido"}, "openrouter": {"sin_cupo_hasta": "2026-10-10 10:00:00"},
                 "freellmapi": {"estado": "vivo"}}
        # (2026-10-22, ZEN1021B) Zen viaja como secreto y no tiene sonda: sin marca en la salud, cuenta.
        self.assertEqual(B.escritores_en_la_nube(None, salud, "2026-10-10 15:00:00"),
                         ["nvidia", "openrouter", "opencode", "freellmapi"])

    def test_plan_con_tope_cero_dice_por_que(self):
        p = B.plan_nube(["A"], [], 0, None, {}, AHORA, tope_runs=0, motivo_tope="ningún escritor con cupo")
        self.assertEqual(p["lanzar"], 0)
        self.assertEqual(p["por_que"], "no lanzo: ningún escritor con cupo")
        p = B.plan_nube(["A"], [], 3, None, {}, AHORA, tope_runs=3, motivo_tope="1 escritor")
        self.assertIn("(1 escritor)", p["por_que"])

    def test_el_tope_cuenta_los_jobs_vivos_aparte_de_las_nuevas(self):
        """(2026-10-25, CAP1025B, medido a las 12:10) 2 jobs en marcha, 0 elegibles, 271 agotadas reabribles,
        3 escritores vivos y la Mac 0 de 2 con 306 listas: el botón decía «1 a la vez» y no lanzaba nada."""
        esc = ["google", "nvidia", "opencode"]
        self.assertEqual(B.tope_runs_nube(6, esc, vivos=2),
                         (3, "2 job(s) en marcha y 6 tarea(s) nuevas para la nube: dan para 1 job(s) más de 6"))
        agotadas = ["T%d" % i for i in range(271)]
        tope, motivo = B.tope_runs_nube(min(B.REABRIR_POR_PASADA, len(agotadas)), esc, vivos=2)
        self.assertEqual(tope, 6)
        self.assertIn("3 escritor(es) vivo(s) en la nube (google, nvidia, opencode)", motivo)
        p = B.plan_nube([], agotadas, 2, None, {}, AHORA, listas_mac=306, tope_mac=2, tope_runs=tope,
                        motivo_tope=motivo)
        self.assertEqual((p["lanzar"], p["trabajadores"], len(p["reabrir"])), (4, 3, 24))
        # Sin vivos, como siempre.
        self.assertEqual(B.tope_runs_nube(7, ["nvidia", "google"], vivos=0)[0], 2)
        # Con los escritores llenos, ni uno más aunque sobre trabajo.
        self.assertEqual(B.plan_nube([], agotadas, 6, None, {}, AHORA, listas_mac=306, tope_mac=2, tope_runs=6,
                                     motivo_tope=motivo)["lanzar"], 0)

    def test_la_cabecera_dice_que_frena_cada_medio(self):
        """(2026-10-25, CAP1025D, medido a las 12:47) «no cabe más ahora mismo» a secas, con la Mac al tope
        por memoria, la nube al tope de escritores y Cloudroom sin cupo hoy."""
        mac = {"ocupados": ["A", "B"], "tope": 2, "listas": ["X"] * 308,
               "motivo_tope": "el gobernador lo baja a 2: recursos al límite (swap llena (5542 de 6144 MB))"}
        plan = {"lanzar": 0, "por_que": "ya hay 2 job(s) en marcha, el tope a la vez (1 escritor(es) vivo(s) en la "
                                        "nube (nvidia) × 2 job(s) cada uno)"}
        cr = "Cloudroom: sin cupo hoy: ya van 2 hoy (quedan 51 para 29 día(s): 2 al día, tope 6)"
        causas = B.causas_sin_suma(mac, plan, cr)
        self.assertEqual(causas, [
            "la Mac está en su tope (2 de 2 por memoria)",
            "nube: ya hay 2 job(s) en marcha, el tope a la vez (1 escritor(es) vivo(s) en la nube (nvidia) × 2 job(s) cada uno)",
            "Cloudroom: sin cupo hoy: ya van 2 hoy (quedan 51 para 29 día(s): 2 al día, tope 6)"])
        cabeza = B.resumen(["x"], 0, causas=causas).splitlines()[0]
        self.assertTrue(cabeza.startswith("Busqué en todos los medios · no cabe más ahora mismo: la Mac está en su tope"))
        self.assertEqual(B.causas_sin_suma({"ocupados": [], "tope": 2, "listas": []}, {"lanzar": 1}), [
            "la Mac no tiene tareas listas"])
        self.assertEqual(B.resumen(["x"], 0).splitlines()[0], "Busqué en todos los medios · no cabe más ahora mismo")
        # Solo comprobando: lo que cabría, no «no cabe más».
        self.assertEqual(B.resumen(["x"], 0, causas=causas[:1], posibles=6).splitlines()[0],
                         "Comprobé todos los medios sin lanzar nada · cabrían 6 agente(s) más · frena: la Mac está "
                         "en su tope (2 de 2 por memoria)")

    def test_las_agotadas_que_la_nube_ya_integro_se_dicen_y_no_se_reabren(self):
        clases = {"elegibles": [], "agotada": ["A", "B", "C"]}
        t = B.texto_nube(clases, {"por_que": "x"}, 0, por_traer=["B", "C", "Z"])
        self.assertIn("3 ya se mandaron 3 veces sin integrarse (de ellas, 2 son trabajo que la nube YA integró y "
                      "que traer_nube trae a main: no se reabren)", t)
        self.assertNotIn("de ellas", B.texto_nube(clases, {"por_que": "x"}, 0))

    def test_plan_con_tope_grande_lanza_mas_de_dos(self):
        p = B.plan_nube(["T%d" % i for i in range(24)], [], 0, None, {}, AHORA, tope_runs=4)
        self.assertEqual(p["lanzar"], 4)

    def test_ultimo_despliegue_fallido_se_dice(self):
        e = {"ultimo_despliegue": {"t": AHORA - 60, "pedidos": 2, "lanzados": 0,
                                   "fallo": "el reparto no creó ninguna cola"}}
        self.assertIn("salieron 0 de 2", B.texto_ultimo_despliegue(e, AHORA))
        self.assertEqual(B.texto_ultimo_despliegue(e, AHORA + 7200), "")
        e["ultimo_despliegue"].update(lanzados=2)
        self.assertEqual(B.texto_ultimo_despliegue(e, AHORA), "")

    def test_texto_nube_dice_tope_y_cesion(self):
        t = B.texto_nube({"elegibles": ["A"]}, {"por_que": "x"}, 1, mac={"tanda": 118, "se_queda": 6, "cedibles": ["A"]},
                         tope=(4, "2 escritor(es)"))
        self.assertIn("1 job(s) en marcha de 4 a la vez ahora (2 escritor(es))", t)
        self.assertIn("la tanda de la Mac tiene 118: se queda 6", t)
        t = B.texto_nube({"elegibles": ["A", "B"]}, {"por_que": "x"}, 0,
                         mac={"tanda": 309, "se_queda": 4, "cedibles": ["A", "B"], "en_cadenas": 2})
        self.assertIn("cede 2 (2 en cadenas que viajan enteras)", t)

    def test_techo_de_la_nube_deja_sitio_al_ci(self):
        # (2026-10-13) 20 jobs a la vez en un repo público Free: 14 para el enjambre, 6 para el CI.
        self.assertLessEqual(B.MAX_RUNS_NUBE, 20)
        if not os.environ.get("STARSEED_NUBE_MAX_RUNS"):
            self.assertEqual(B.MAX_RUNS_NUBE, 14)


class CesionDeLaTandaDeLaMac(unittest.TestCase):
    """(2026-10-10, CAP1010) 118 en la tanda, 32 listas, 3 trabajando: la nube y el A1 a cero."""

    def test_la_mac_se_queda_sus_rondas_y_cede_lo_que_nadie_espera(self):
        listas = ["L%d" % i for i in range(10)]
        tanda = set(listas) | {"X"}
        ced = RN.cedibles_de_la_tanda(tanda, listas, 3, esperadas={"L7"})
        self.assertEqual(ced, ["L6", "L8", "L9"])  # 3 × 2 rondas = L0..L5 se quedan; L7 la espera alguien
        self.assertEqual(RN.cedibles_de_la_tanda(tanda, listas[:6], 3), [])
        self.assertEqual(RN.cedibles_de_la_tanda(set(), listas, 3), [])
        self.assertEqual(RN.cedibles_de_la_tanda(tanda, ["Z"] + listas, 0), [t for t in listas])

    def test_sin_lo_de_la_mac(self):
        colas = [("c", [{"id": "A"}, {"id": "B"}, {"id": "C"}])]
        self.assertEqual(RN.sin_lo_de_la_mac(colas, {"A", "B"}, ["B"]), [("c", [{"id": "B"}, {"id": "C"}])])
        self.assertEqual(RN.sin_lo_de_la_mac(colas, set(), []), colas)

    def test_lo_prestado_por_metagenesis_ni_se_cede_ni_se_reparte(self):
        """(2026-10-10, medido) MetaGenesis prestó 4 al A1 sin marcarlas y 3 acabaron también en la nube."""
        mem = {"prestamos": [{"ids": ["S1010-ES1", "RT1b"], "ts": AHORA - 600},
                             {"ids": ["VIEJA"], "ts": AHORA - 7 * 3600}]}
        ajenas = RN.prestadas_vigentes(mem, AHORA)
        self.assertEqual(ajenas, {"S1010-ES1", "RT1b"})
        colas = [("c", [{"id": "S1010-ES1"}, {"id": "OTRA"}, {"id": "VIEJA"}])]
        self.assertEqual(RN.sin_lo_de_la_mac(colas, set(), [], ajenas), [("c", [{"id": "OTRA"}, {"id": "VIEJA"}])])
        self.assertEqual(RN.prestadas_vigentes(None, AHORA), set())
        self.assertEqual(RN.leer_prestadas(AHORA, ruta="/no/existe.json"), set())

    def test_esperadas_por_otras_ignora_lo_cerrado(self):
        colas = [("c", [{"id": "A", "depende": ["X"]}, {"id": "B", "depende": ["Y"]}, {"id": "C", "depende_de": "Z"}])]
        self.assertEqual(RN.esperadas_por_otras(colas, {"B": {"estado": "commit"}}), {"X", "Z"})

    def test_ordenes_soltar_por_cola(self):
        o = RN.ordenes_soltar(["B", "Q"], [("cola-auto-1.json", ["A", "B"]), ("cola-2.json", ["Q"])], "nube-gh", t="T")
        self.assertEqual(o, {"cola-auto-1.json": {"B": {"accion": "soltar", "donde": "nube-gh", "quien": "capacidad", "t": "T"}},
                             "cola-2.json": {"Q": {"accion": "soltar", "donde": "nube-gh", "quien": "capacidad", "t": "T"}}})

    def test_soltar_en_la_mac_escribe_el_control_que_lee_el_orquestador(self):
        import json
        with tempfile.TemporaryDirectory() as d:
            olas, cer = os.path.join(d, "olas"), os.path.join(d, "cer")
            os.makedirs(olas)
            ruta = os.path.join(olas, "control-cola-auto-1.json")
            with open(ruta, "w") as f:
                json.dump({"Z": {"accion": "reabrir"}}, f)
            hechos = RN.soltar_en_la_mac({"cola-auto-1.json": {"B": {"accion": "soltar"}}}, olas, cerrojos=cer)
            self.assertEqual(hechos, ["B"])
            with open(ruta) as f:
                self.assertEqual(json.load(f), {"Z": {"accion": "reabrir"}, "B": {"accion": "soltar"}})
            self.assertTrue(os.path.exists(os.path.join(cer, "control-control-cola-auto-1.json.lock")))

    def test_colas_de_la_tanda_viva(self):
        import json
        with tempfile.TemporaryDirectory() as olas:
            with open(os.path.join(olas, "cola-auto-9.json"), "w") as f:
                json.dump({"tareas": [{"id": "A"}, {"id": "B"}]}, f)
            ps = ("/usr/bin/python3 -u /x/starseed-enjambre.py starseed_memory_root/olas/cola-auto-9.json --workers 3\n"
                  "grep starseed-enjambre.py cola-auto-9.json\n")
            self.assertEqual(RN.colas_de_la_tanda_viva(ps, olas), [("cola-auto-9.json", ["A", "B"])])


class ClaudeEnLaNube(unittest.TestCase):
    """(ALT1022C) La línea de Claude en la nube y su lanzamiento, sin red ni `claude` real."""

    def test_linea_del_resumen(self):
        ahora = time.mktime(time.strptime("2026-10-15", "%Y-%m-%d"))
        credito = {"restante_usd": 244, "vence": "2026-11-04T23:59:00-08:00"}
        linea = B.texto_claude_nube(1, 4, credito, ahora)
        self.assertTrue(linea.startswith("Claude en la nube: 1 de 4 sesiones · crédito 244 $ (vence 2026-11-04"))
        self.assertIn("hoy caben ", linea)
        self.assertIn("sin crédito declarado", B.texto_claude_nube(0, 4, None, ahora))
        self.assertIn("hoy caben 0", B.texto_claude_nube(0, 4, None, ahora))

    def test_no_lanza_sin_lanzador(self):
        corridas = []
        sumadas, texto = B.lanzar_claude_nube("listo", False, lambda: corridas.append(1), lambda: 0, lambda: 5)
        self.assertEqual((sumadas, corridas), (0, []))
        self.assertIn("aún no está en main", texto)

    def test_no_lanza_si_el_medio_no_esta_listo(self):
        corridas = []
        self.assertEqual(B.lanzar_claude_nube("no_disponible", True, lambda: corridas.append(1),
                                              lambda: 0, lambda: 5)[0], 0)
        self.assertEqual(corridas, [])

    def test_lanza_y_suma_solo_lo_anotado(self):
        cuenta = {"n": 2}

        def correr():
            cuenta["n"] += 2

        sumadas, texto = B.lanzar_claude_nube("listo", True, correr, lambda: cuenta["n"], lambda: cuenta["n"])
        self.assertEqual(sumadas, 2)
        self.assertIn("lanzadas 2", texto)

    def test_un_lanzador_que_falla_no_rompe_el_boton(self):
        def correr():
            raise TimeoutError()

        sumadas, texto = B.lanzar_claude_nube("listo", True, correr, lambda: 0, lambda: 0)
        self.assertEqual(sumadas, 0)
        self.assertIn("TimeoutError", texto)


if __name__ == "__main__":
    unittest.main()


class ZenCuentaEnLaNube(unittest.TestCase):
    """(2026-10-22, ZEN1021B) Zen es el escritor principal de la nube y no tiene sonda HTTP."""

    def test_con_clave_en_el_entorno_o_en_auth(self):
        self.assertTrue(B.hay_clave_zen({"OPENCODE_API_KEY": "x"}))
        self.assertTrue(B.hay_clave_zen({}, {"opencode": {"type": "api"}}))
        self.assertFalse(B.hay_clave_zen({}, {}))
        self.assertFalse(B.hay_clave_zen({"OPENCODE_API_KEY": "  "}))

    def test_fila_de_zen(self):
        fila = B.resultado_zen({"OPENCODE_API_KEY": "x"}, {}, "2026-10-22 12:00:00")
        self.assertEqual(fila[:3], ("opencode/glm-5.3-flash-free", True, B.MOTIVO_ZEN))
        self.assertIsNone(B.resultado_zen({}, {}, "2026-10-22 12:00:00"))
        sin = B.resultado_zen({"OPENCODE_API_KEY": "x"},
                              {"opencode": {"sin_cupo_hasta": "2026-10-23 00:00:00"}}, "2026-10-22 12:00:00")
        self.assertFalse(sin[1])

    def test_cuenta_como_escritor_de_la_nube(self):
        fila = B.resultado_zen({"OPENCODE_API_KEY": "x"}, {}, "2026-10-22 12:00:00")
        self.assertIn("opencode", B.escritores_en_la_nube([fila[:4]]))
        # Sin sondas: sin entrada en la salud, Zen cuenta como vivo; con marca de cupo, no.
        self.assertIn("opencode", B.escritores_en_la_nube(None, {}, "2026-10-22 12:00:00"))
        self.assertNotIn("opencode", B.escritores_en_la_nube(
            None, {"opencode": {"sin_cupo_hasta": "2026-10-23 00:00:00"}}, "2026-10-22 12:00:00"))

    def test_sube_el_tope_de_jobs(self):
        uno = B.tope_runs_nube(36, ["nvidia"])[0]
        dos = B.tope_runs_nube(36, ["nvidia", "opencode"])[0]
        self.assertGreater(dos, uno)


class CloudroomEnLaPasada(unittest.TestCase):
    """(CRM1024I) «Buscar más capacidad» y la autocuración usan Cloudroom: el medio y el lanzador
    van simulados (sin room-cli, sin red)."""

    class Lanzador:
        def __init__(self, lanzado=None, falla_seguir=False, falla_lanzar=False):
            self.llamadas, self.lanzado = [], lanzado or {"lanzadas": [], "quedan": 100, "motivo": ""}
            self.falla_seguir, self.falla_lanzar = falla_seguir, falla_lanzar

        def seguir(self, aplicar=True, ahora=None):
            self.llamadas.append(("seguir", aplicar))
            if self.falla_seguir:
                raise TimeoutError()
            return {"acciones": {"X": "traer", "Y": "esperar"}, "errores": []}

        def lanzar(self, ids, seco=False, priorizar=False, medio=None, ahora=None):
            self.llamadas.append(("lanzar", list(ids), seco, priorizar, medio))
            if self.falla_lanzar:
                raise OSError("roto")
            return dict(self.lanzado, lanzadas=list(self.lanzado["lanzadas"]) if not seco else ids[:1])

    USABLE = {"id": "cloudroom", "estado": "usable", "detalle": "cuenta conectada"}

    def test_parte_con_lanzadas_y_lo_que_queda(self):
        linea = B.texto_cloudroom({"lanzadas": ["A", "B"], "quedan": 95}, {"acciones": {"X": "traer", "Y": "parche"}})
        self.assertTrue(linea.startswith("Cloudroom: 2 lanzadas, quedan 95 del ciclo"))
        self.assertIn("1 traída(s), 1 por diff-patch", linea)

    def test_parte_dice_por_que_no(self):
        self.assertEqual(B.texto_cloudroom({"lanzadas": [], "quedan": None, "motivo": "app sin instalar"}),
                         "Cloudroom: app sin instalar")
        self.assertEqual(B.texto_cloudroom({"lanzadas": [], "motivo": "sin sesión (inicia sesión en la app)"}),
                         "Cloudroom: sin sesión (inicia sesión en la app)")
        sin = B.texto_cloudroom({"lanzadas": [], "quedan": 0, "motivo": "sin cupo: 100 de 100 hilos de la nube usados en 30 días"})
        self.assertTrue(sin.startswith("Cloudroom: sin cupo:"))
        self.assertNotIn("quedan", sin)
        hoy = B.texto_cloudroom({"lanzadas": [], "quedan": 97, "motivo": "sin cupo hoy: ya van 3 (ritmo 3.3 al día)"})
        self.assertIn("quedan 97 del ciclo", hoy)
        self.assertIn("no se abrió: A: error", B.texto_cloudroom({"lanzadas": [], "quedan": 99, "errores": ["A: error"]}))

    def test_comprobar_dice_lo_que_haria(self):
        self.assertTrue(B.texto_cloudroom({"lanzadas": ["A"], "quedan": 98}, aplicado=False).startswith("Cloudroom: lanzaría 1 (A)"))

    def test_aplicar_sigue_y_luego_lanza_por_prioridad_las_cedibles(self):
        cr = self.Lanzador({"lanzadas": ["B"], "quedan": 97, "motivo": ""})
        sumadas, linea, ids = B.cloudroom(True, ["A", "B"], AHORA, cr=cr, sondear=lambda: self.USABLE)
        self.assertEqual((sumadas, ids), (1, ["B"]))
        self.assertEqual(cr.llamadas[0], ("seguir", True))
        self.assertEqual(cr.llamadas[1], ("lanzar", ["A", "B"], False, True, self.USABLE))
        self.assertIn("Cloudroom: 1 lanzadas, quedan 97 del ciclo", linea)
        self.assertIn("1 trabajando", linea)

    def test_comprobar_no_sigue_ni_suma(self):
        cr = self.Lanzador()
        sumadas, linea, ids = B.cloudroom(False, ["A", "B"], AHORA, cr=cr, sondear=lambda: self.USABLE)
        self.assertEqual((sumadas, ids), (0, []))
        self.assertEqual([c[0] for c in cr.llamadas], ["lanzar"])
        self.assertTrue(cr.llamadas[0][2])  # en seco
        self.assertIn("lanzaría 1 (A)", linea)

    def test_un_fallo_no_rompe_la_pasada(self):
        cr = self.Lanzador(falla_seguir=True)
        sumadas, linea, _ = B.cloudroom(True, ["A"], AHORA, cr=cr, sondear=lambda: self.USABLE)
        self.assertEqual(sumadas, 0)
        self.assertIn("aviso: no pude seguir los hilos (TimeoutError)", linea)
        roto = B.cloudroom(True, ["A"], AHORA, cr=self.Lanzador(falla_lanzar=True), sondear=lambda: self.USABLE)
        self.assertEqual(roto, (0, "Cloudroom: no pude mirarlo (OSError)", []))

    def test_lo_que_coge_cloudroom_no_se_reparte_a_github(self):
        from unittest import mock
        import asignar_huecos

        vistas = {}

        def plan(elegibles, *a, **k):
            vistas["elegibles"] = list(elegibles or [])
            return {"lanzar": 0, "reabrir": [], "trabajadores": 3, "por_que": "nada"}

        carpeta = tempfile.mkdtemp()
        nube = {"clases": {"elegibles": ["A", "B", "C"]}, "pausa": None, "runs": 0, "error": None, "mac": {}}
        with mock.patch.object(B, "ESTADO", os.path.join(carpeta, "estado.json")), \
                mock.patch.object(B, "SALUD", os.path.join(carpeta, "salud.json")), \
                mock.patch.object(B, "reunir_nube", lambda *a, **k: nube), \
                mock.patch.object(B, "cloudroom", lambda *a, **k: (1, "Cloudroom: 1 lanzadas, quedan 99 del ciclo · B", ["B"])), \
                mock.patch.object(B, "plan_nube", plan), \
                mock.patch.object(B, "claude_nube", lambda *a, **k: (0, "Claude en la nube: 0")), \
                mock.patch.object(B, "_avisar", lambda *a, **k: None), \
                mock.patch.object(RN, "leer_reaperturas", lambda *a, **k: {}), \
                mock.patch.object(asignar_huecos, "reunir", lambda: {"listas": [], "tope": 3}), \
                mock.patch.object(asignar_huecos, "decidir", lambda e: {"puede": False}):
            r = B.buscar(aplicar=True, sondear_medios=False, mac=False, origen="autocuracion", ahora=AHORA)
        self.assertEqual(vistas["elegibles"], ["A", "C"])
        self.assertEqual(r["sumados"], 1)
        self.assertIn("Cloudroom: 1 hilo(s) en la nube (B)", r["hechas"])
        self.assertIn("· Cloudroom: 1 lanzadas, quedan 99 del ciclo · B", r["resumen"])

    def test_medio_registrado_tras_claude_y_honesto_si_falla(self):
        import medios_disponibles as M

        self.assertEqual(M.sondear_cloudroom(lambda: self.USABLE), self.USABLE)

        def rota():
            raise ModuleNotFoundError("medio_cloudroom")

        caida = M.sondear_cloudroom(rota)
        self.assertEqual((caida["id"], caida["estado"]), ("cloudroom", "no_disponible"))
        self.assertIn("ModuleNotFoundError", caida["detalle"])
        self.assertEqual(M.sondear_cloudroom(lambda: {"estado": "conectado"})["estado"], "no_disponible")
        fuente = open(M.__file__, encoding="utf-8").read()
        self.assertLess(fuente.index("medios.append(clasificar_claude(reg, ahora))"),
                        fuente.index("medios.append(sondear_cloudroom())"))

    def test_su_linea_no_sale_dos_veces_en_otros_medios(self):
        from unittest import mock
        import contenedores_nube
        import medios_disponibles as M

        medios = {"medios": [{"id": "mac"}, self.USABLE, {"id": "hf", "estado": "requiere_alex"}]}
        inventariados = []
        with mock.patch.object(M, "sondear", lambda: medios), \
                mock.patch.object(contenedores_nube, "inventario", lambda m: inventariados.append(m) or {}), \
                mock.patch.object(contenedores_nube, "escribir", lambda d: d):
            otros = B._otros_medios()
        self.assertEqual([m["id"] for m in otros], ["hf"])
        self.assertIn(self.USABLE, inventariados[0])  # el medidor Contenedores sí lo ve
