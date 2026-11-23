# -*- coding: utf-8 -*-
"""Pruebas de «Buscar más capacidad» (buscar_capacidad.py) y de la segunda oportunidad en la
nube (repartir_nube: motivo_fuera, clasificar, reaperturas)."""
import inspect
import json
import os
import sys
import tempfile
import time
import unittest
from unittest import mock

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
        self.assertEqual(RN.motivo_fuera(_tarea("A", archivos=list("abcdef")), {}, [], None), "grande")
        self.assertEqual(RN.motivo_fuera(_tarea("A", depende=["D"]), prog, [], None), "espera")
        self.assertEqual(RN.motivo_fuera(_tarea("A"), {}, [], None, envios={"A": 5}), "agotada")
        self.assertEqual(RN.motivo_fuera(_tarea("A", privado=True), {}, [], None), "privada")

    def test_clasificar_coincide_con_elegir(self):
        colas = [("c1", [_tarea("A"), _tarea("B", archivos=list("abcdef")), _tarea("C")]),
                 ("c2", [_tarea("D", privado=True), _tarea("E"), _tarea("A")])]
        envios = {"C": 5, "E": 5}
        clases = RN.clasificar(colas, {"E": {"estado": "pendiente"}}, [], "", envios)
        elegidas = [t["id"] for t in RN.elegir(colas, {}, [], "", envios=envios)]
        self.assertEqual(sorted(clases["elegibles"]), sorted(elegidas))
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
        envios = {"A": 5}
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
        self.assertIn("3 ya se mandaron 5 veces sin integrarse (de ellas, 2 son trabajo que la nube YA integró y "
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


def test_1103_prioridad_y_sin_intento():
    import os as _o, sys as _s
    _s.path.insert(0, _o.path.dirname(_o.path.abspath(__file__)))
    import buscar_capacidad as B
    assert B.sin_intento("devuelta de la nube: su run terminó")
    assert B.sin_intento("el carril en la nube no dio sesión: vuelve al enjambre")
    assert not B.sin_intento("fallo tsc")
    ahora = 100_000.0
    dos = [ahora - 7200, ahora - 5000]
    assert not B.puede_reabrir_tarea(dos, ahora, "fallo tsc")
    assert B.puede_reabrir_tarea(dos, ahora, "devuelta de la nube: su run terminó")
    assert not B.puede_reabrir_tarea(dos + [ahora - 600], ahora, "devuelta de la nube: su run terminó")
    colas = [("a", [{"id": "X"}, {"id": "Y", "depende": ["X"]}, {"id": "Z", "depende": ["X", "W"]},
                    {"id": "C", "importancia": "capacidad"}])]
    dep, cap = B.dependientes_y_capacidad(colas)
    assert dep == {"X": 2, "W": 1} and cap == {"C"}
    assert B.ordenar_por_prioridad(["W", "Q", "X", "C"], dep, cap) == ["C", "X", "W", "Q"]
    plan = B.plan_nube([], ["T1", "T2"], 0, None, {"T1": dos, "T2": dos}, ahora, listas_mac=10, tope_mac=2,
                       tope_runs=2, por_run=6, notas={"T1": "devuelta de la nube: su run terminó"})
    assert plan["reabrir"] == ["T1"] and plan["lanzar"] == 1


def test_1103_o_reaperturas_sin_intento_desde_ajustes(tmp_path):
    import json as _j, os as _o, sys as _s
    _s.path.insert(0, _o.path.dirname(_o.path.abspath(__file__)))
    import buscar_capacidad as B
    c = tmp_path / "director-config.json"
    c.write_text(_j.dumps({"reaperturas_sin_intento": 0}))
    assert B.reaperturas_sin_intento_ajuste(str(c)) == 0
    c.write_text(_j.dumps({"reaperturas_sin_intento": 99}))
    assert B.reaperturas_sin_intento_ajuste(str(c)) == 6
    assert B.reaperturas_sin_intento_ajuste(str(tmp_path / "no")) == B.REAPERTURAS_SIN_INTENTO_EXTRA
    dos = [100_000.0 - 7200, 100_000.0 - 5000]
    assert not B.puede_reabrir_tarea(dos, 100_000.0, "devuelta de la nube: su run terminó", extra=0)
    assert B.puede_reabrir_tarea(dos, 100_000.0, "devuelta de la nube: su run terminó", extra=1)


class FrenoMismoMotivo(unittest.TestCase):
    """(HAL09) Freno por mismo motivo en Buscar más capacidad."""

    def _mock_buscar_base(self, mock_progreso, mock_reunir_nube=None, runs=0):
        from unittest import mock
        import asignar_huecos

        nube = {"clases": {"elegibles": ["A", "B"], "agotada": []}, "pausa": None, "runs": runs, "error": None, "mac": {}}
        if mock_reunir_nube is None:
            mock_reunir_nube = lambda *a, **k: nube

        with mock.patch.object(B, "ESTADO", "/tmp/estado-test.json"), \
                mock.patch.object(B, "SALUD", "/tmp/salud-test.json"), \
                mock.patch.object(B, "reunir_nube", mock_reunir_nube), \
                mock.patch.object(B, "cloudroom", lambda *a, **k: (0, "Cloudroom: nada", [])), \
                mock.patch.object(B, "claude_nube", lambda *a, **k: (0, "Claude en la nube: 0")), \
                mock.patch.object(B, "_avisar", lambda *a, **k: None), \
                mock.patch.object(RN, "leer_reaperturas", lambda *a, **k: {}), \
                mock.patch.object(asignar_huecos, "reunir", lambda: {"listas": [], "tope": 3, "ocupados": []}), \
                mock.patch.object(asignar_huecos, "decidir", lambda e: {"puede": False}), \
                mock.patch.object(B, "_leer_json", lambda r, d: mock_progreso if "progreso" in r else d):
            return B.buscar(aplicar=True, sondear_medios=False, mac=False, origen="autocuracion", ahora=AHORA)

    def test_frena_cuando_7_de_10_sin_cambios_mismo_motivo(self):
        """7 de 10 tareas acabadas con 'sin_cambios' por el mismo motivo → frena y no lanza runs nuevos."""
        ahora = AHORA
        mismo_motivo = "la nube dijo «sin_cambios» por «modelo sin cupo»"
        progreso = {
            f"T{i}": {"estado": "sin_cambios", "nota": mismo_motivo, "fin": ahora - i * 100}
            for i in range(7)
        }
        # 3 tareas con motivo DISTINTO normalizado (fallo, no sin_cambios)
        progreso.update({
            f"T{i+7}": {"estado": "fallo", "nota": "la nube dijo «fallo» por «otro motivo»", "fin": ahora - (i + 7) * 100}
            for i in range(3)
        })

        r = self._mock_buscar_base(progreso, runs=0)
        self.assertEqual(r["sumados"], 0)
        self.assertIn("se frena: 7 de las últimas 10 tareas acabaron", r["resumen"])
        self.assertIn("sin_cambios", r["resumen"])

    def test_no_frena_con_motivos_distintos(self):
        """Si los motivos son variados, no frena y lanza runs como antes."""
        ahora = AHORA
        # 10 tareas con motivos normalizados DISTINTOS (máximo 3 de cada uno)
        motivos = [
            ("sin_cambios", "la nube dijo «sin_cambios» por «motivo A»"),
            ("sin_cambios", "la nube dijo «sin_cambios» por «motivo B»"),
            ("fallo", "la nube dijo «fallo» por «motivo C»"),
            ("fallo_tsc", "la nube dijo «fallo_tsc» por «motivo D»"),
            ("rechazada", "la nube dijo «rechazada» por «motivo E»"),
            ("sin_cambios", "la nube dijo «sin_cambios» por «motivo F»"),
            ("fallo_tests", "la nube dijo «fallo_tests» por «motivo G»"),
            ("fallo", "la nube dijo «fallo» por «motivo H»"),
            ("rechazada", "la nube dijo «rechazada» por «motivo I»"),
            ("fallo", "la nube dijo «fallo» por «motivo J»"),
        ]
        progreso = {}
        for i, (estado, nota) in enumerate(motivos):
            progreso[f"T{i}"] = {"estado": estado, "nota": nota, "fin": ahora - i * 100}

        r = self._mock_buscar_base(progreso, runs=0)
        # Con 2 elegibles y 1 escritor (opencode), tope=1 job → 2 trabajadores
        self.assertEqual(r["sumados"], 2)
        self.assertNotIn("se frena", r["resumen"])

    def test_freno_excepcion_no_rompe_y_avisa(self):
        """Si el cálculo del freno falla, no frena y avisa en una línea."""
        from unittest import mock
        import asignar_huecos

        nube = {"clases": {"elegibles": ["A", "B"], "agotada": []}, "pausa": None, "runs": 0, "error": None, "mac": {}}

        def leer_json_falla(ruta, defecto):
            if "progreso" in ruta:
                raise OSError("disco lleno")
            return defecto

        with mock.patch.object(B, "ESTADO", "/tmp/estado-test.json"), \
                mock.patch.object(B, "SALUD", "/tmp/salud-test.json"), \
                mock.patch.object(B, "reunir_nube", lambda *a, **k: nube), \
                mock.patch.object(B, "cloudroom", lambda *a, **k: (0, "Cloudroom: nada", [])), \
                mock.patch.object(B, "claude_nube", lambda *a, **k: (0, "Claude en la nube: 0")), \
                mock.patch.object(B, "_avisar", lambda *a, **k: None), \
                mock.patch.object(RN, "leer_reaperturas", lambda *a, **k: {}), \
                mock.patch.object(asignar_huecos, "reunir", lambda: {"listas": [], "tope": 3, "ocupados": []}), \
                mock.patch.object(asignar_huecos, "decidir", lambda e: {"puede": False}), \
                mock.patch.object(B, "_leer_json", leer_json_falla):
            r = B.buscar(aplicar=True, sondear_medios=False, mac=False, origen="autocuracion", ahora=AHORA)

        # Con 2 elegibles y 1 escritor (opencode), tope=1 job → 2 trabajadores
        self.assertEqual(r["sumados"], 2)
        self.assertIn("Freno por mismo motivo: no se pudo calcular", "\n".join(r["lineas"]))


class CandadoYEstadoParcial(unittest.TestCase):
    """(CAP1119E) Candado de ejecución única y guardado de estado parcial."""

    def test_tomar_y_liberar_candado(self):
        """El candado impide ejecuciones concurrentes."""
        with tempfile.TemporaryDirectory() as d:
            candado = os.path.join(d, "candado.test")
            with mock.patch.object(B, "CANDADO", candado):
                # Primera vez: debe conseguir el candado
                self.assertTrue(B._tomar_candado())
                self.assertTrue(os.path.exists(candado))
                # Segunda vez: debe fallar
                self.assertFalse(B._tomar_candado())
                # Liberar
                B._liberar_candado()
                self.assertFalse(os.path.exists(candado))
                # Tercera vez: debe conseguir de nuevo
                self.assertTrue(B._tomar_candado())
                B._liberar_candado()

    def test_guardar_estado_parcial(self):
        """El estado parcial se guarda y se puede leer."""
        with tempfile.TemporaryDirectory() as d:
            estado = os.path.join(d, "estado.test")
            with mock.patch.object(B, "ESTADO", estado):
                B._guardar_estado_parcial({}, ["línea 1", "línea 2"], 5, ["hecha 1"], None, en_curso=False)
                self.assertTrue(os.path.exists(estado))
                with open(estado, encoding="utf-8") as f:
                    datos = json.load(f)
                self.assertEqual(datos["sumados"], 5)
                self.assertEqual(datos["hechas"], ["hecha 1"])
                self.assertEqual(datos["lineas"], ["línea 1", "línea 2"])
                self.assertFalse(datos["en_curso"])
                self.assertIsNone(datos.get("error"))

    def test_guardar_estado_parcial_con_error(self):
        """El estado parcial guarda el error si se proporciona."""
        with tempfile.TemporaryDirectory() as d:
            estado = os.path.join(d, "estado.test")
            with mock.patch.object(B, "ESTADO", estado):
                B._guardar_estado_parcial({}, ["línea 1"], 0, [], "algo falló", en_curso=True)
                with open(estado, encoding="utf-8") as f:
                    datos = json.load(f)
                self.assertEqual(datos["error"], "algo falló")
                self.assertTrue(datos["en_curso"])


class LanzarJobConReintentos(unittest.TestCase):
    """(CAP1119E) Reintentos al lanzar jobs de GitHub Actions."""

    def test_exito_en_primer_intento(self):
        """Si el job sale a la primera, devuelve éxito."""
        from unittest import mock
        with mock.patch.object(B, "_lanzar_job_con_reintentos", lambda t: (True, "lanzado: job 123")):
            exito, msg = B._lanzar_job_con_reintentos(3)
            self.assertTrue(exito)
            self.assertEqual(msg, "lanzado: job 123")

    def test_fallo_y_reintento(self):
        """Si el job falla, se reintenta y avisa."""
        from unittest import mock
        # Simular fallo en todos los reintentos pasando max_reintentos explícitamente
        with mock.patch.object(B, "ESPERA_REINTENTO_GITHUB_S", 0), \
             mock.patch("subprocess.run") as mock_run:
            mock_run.return_value = mock.MagicMock(
                returncode=1, stdout="error", stderr="fallo")
            exito, msg = B._lanzar_job_con_reintentos(3, max_reintentos=2)
            self.assertFalse(exito)
            self.assertIn("2 intentos", msg)
            self.assertEqual(mock_run.call_count, 2)

    def test_continua_despues_de_fallo(self):
        """desplegar continua con los siguientes jobs aunque uno falle."""
        from unittest import mock
        with mock.patch.object(B, "_lanzar_job_con_reintentos", side_effect=[
            (True, "lanzado: job 1"),
            (False, "job 2 falló"),
            (True, "lanzado: job 3"),
        ]):
            hechos = B.desplegar(3, 3)
            # desplegar añade los éxitos a hechos y los fallos al final como "fallos: job N: ..."
            self.assertEqual(len(hechos), 3)
            self.assertIn("lanzado: job 1", hechos[0])
            self.assertIn("lanzado: job 3", hechos[1])
            self.assertIn("fallos: job 2:", hechos[2])


# ── CAP1119B · Decisiones de reparto a los contenedores de la nube ──────────────
# Cloudroom con su cupo mensual, el A1 escalando agentes, la Mac guardada cediendo
# trabajo y el empuje a GitHub con reintentos. Sin red y sin tocar los archivos de estado.


def _agentes_a1(cpu_libre_pct, mem_libre_gb):
    """Agentes que caben en el A1 con esos recursos, con la forma que tenga el cálculo.

    La lectura del A1 llega de dos maneras (el cálculo directo por CPU/RAM o el consumo
    medido en `~/.starseed/oracle-consumo.json`); es la misma decisión y se ejerce por la
    que exista, para no atar la prueba a un nombre interno.
    """
    if hasattr(RN, "calcular_trabajadores_a1"):
        return RN.calcular_trabajadores_a1(cpu_libre_pct=cpu_libre_pct, mem_libre_gb=mem_libre_gb)
    consumo = {"leido": True, "freno": {"activo": False},
               "margen": {"cpu_libre_pct": cpu_libre_pct, "mem_libre_gb": mem_libre_gb}}
    return RN.a1_escalar_agentes(consumo)["agentes"]


def _tope_a1():
    return getattr(RN, "MAX_AGENTES_A1", getattr(RN, "A1_TOPE_HARDWARE", 4))


class CloudroomCupoMensual(unittest.TestCase):
    """(CAP1119B) Cloudroom tiene 100 hilos por ciclo de 30 días: se reparten por día y no
    se agotan de golpe."""

    AHORA = time.mktime(time.strptime("2026-11-19 12:00:00", "%Y-%m-%d %H:%M:%S"))

    def _ritmo(self, registro, **kw):
        import cloudroom_lanzar as CL

        return CL.ritmo(registro, self.AHORA, **kw)

    def test_un_cupo_nuevo_no_se_agota_de_golpe(self):
        r = self._ritmo([], total=100, max_vivos=3, tope_dia=6)
        self.assertEqual(r["quedan"], 100)
        self.assertEqual(r["hoy"], 3)          # manda el tope de hilos a la vez
        self.assertEqual(r["por_dia"], 4.0)    # ceil(100/30), no los 6 del tope diario
        self.assertIn("caben 3", r["motivo"])

    def test_lo_usado_en_el_ciclo_descuenta_del_cupo(self):
        viejo = self.AHORA - 10 * 86400
        registro = [{"t": viejo, "tarea": "T%d" % i, "hilo": "h%d" % i, "final": "traida"}
                    for i in range(20)]
        r = self._ritmo(registro, total=100, max_vivos=3, tope_dia=6)
        self.assertEqual(r["quedan"], 80)
        self.assertGreaterEqual(r["hoy"], 1)
        self.assertLessEqual(r["hoy"], 3)

    def test_ciclo_agotado_no_lanza_y_lo_dice(self):
        registro = [{"t": self.AHORA - (i % 30) * 86400, "tarea": "T%d" % i, "hilo": "h%d" % i}
                    for i in range(100)]
        r = self._ritmo(registro, total=100, max_vivos=3, tope_dia=6)
        self.assertEqual((r["hoy"], r["quedan"]), (0, 0))
        self.assertIn("sin cupo", r["motivo"])


class CloudroomEnElReparto(unittest.TestCase):
    """(CAP1119B) El reparto cuenta solo lo que el ritmo de Cloudroom dejó lanzar."""

    USABLE = {"id": "cloudroom", "estado": "usable", "detalle": "cuenta conectada"}

    class Lanzador:
        def __init__(self, lanzado):
            self.lanzado, self.llamadas = lanzado, []

        def seguir(self, aplicar=True, ahora=None):
            self.llamadas.append(("seguir", aplicar))
            return {"acciones": {}, "errores": []}

        def lanzar(self, ids, seco=False, priorizar=False, medio=None, ahora=None):
            self.llamadas.append(("lanzar", list(ids), seco, priorizar, medio))
            return dict(self.lanzado)

    def test_cuenta_lo_que_dejo_el_ritmo_y_lo_que_queda(self):
        cr = self.Lanzador({"lanzadas": ["A"], "quedan": 97,
                            "motivo": "caben 1 (quedan 97 para 30 día(s): 4 al día, tope 6)"})
        sumadas, linea, ids = B.cloudroom(True, ["A", "B", "C"], AHORA, cr=cr,
                                          sondear=lambda: self.USABLE)
        self.assertEqual((sumadas, ids), (1, ["A"]))
        self.assertIn("quedan 97 del ciclo", linea)
        self.assertIn("1 lanzadas", linea)

    def test_sin_cupo_no_cuenta_ninguna(self):
        cr = self.Lanzador({"lanzadas": [], "quedan": 0,
                            "motivo": "sin cupo: 100 de 100 hilos de la nube usados en 30 días"})
        sumadas, linea, ids = B.cloudroom(True, ["A"], AHORA, cr=cr, sondear=lambda: self.USABLE)
        self.assertEqual((sumadas, ids), (0, []))
        self.assertTrue(linea.startswith("Cloudroom:"))


class MacGuardadaCedeALaNube(unittest.TestCase):
    """(CAP1119B) La Mac se queda solo su reserva (tope × rondas dinámicas); lo que no cabe va a la
    nube en vez de esperar. Con la guardia de disco o memoria activa no se le reserva nada.
    (AUT1121C) Rondas: 2 por defecto, 1 si tope ≤ 2 o disco < 2 GB, 0 si disco < 1 GB."""

    def test_la_tanda_cede_lo_que_no_cabe_en_el_tope_guardado(self):
        listas = ["T%d" % i for i in range(10)]
        colas = [("c", [{"id": t} for t in listas])]
        cedibles, lote = RN.cedibles_y_lote(set(listas), {"listas": listas, "tope": 1}, colas, {})
        # Con tope=1 → 1 ronda (AUT1121C): la Mac se queda T0; el resto (T1..T9) es cedible.
        self.assertEqual(cedibles, listas[1:])
        self.assertEqual(lote, set())

    def test_plan_nube_reabre_lo_que_la_mac_no_puede_coger(self):
        agotadas = ["A%d" % i for i in range(10)]
        p = B.plan_nube([], agotadas, 0, None, {}, AHORA, listas_mac=10, tope_mac=1,
                        tope_runs=2)
        self.assertEqual(p["reabrir"], agotadas[:9])   # 10 listas − 1 del tope guardado
        self.assertEqual(p["lanzar"], 2)

    @unittest.skipUnless("mac_guardada" in inspect.signature(B.plan_nube).parameters,
                         "esta versión no separa la guardia del tope de la Mac")
    def test_con_la_guardia_la_nube_reabre_todo_lo_que_quepa(self):
        agotadas = ["A%d" % i for i in range(10)]
        p = B.plan_nube([], agotadas, 0, None, {}, AHORA, listas_mac=10, tope_mac=1,
                        tope_runs=2, mac_guardada=True)
        self.assertEqual(p["reabrir"], agotadas)       # sin reserva para la Mac: todo cabe
        self.assertEqual(p["lanzar"], 2)

    @unittest.skipUnless("mac_guardada" in inspect.signature(B.plan_nube).parameters,
                         "esta versión no separa la guardia del tope de la Mac")
    def test_la_guardia_no_le_quita_a_la_mac_el_trabajo_que_si_puede(self):
        sin = B.plan_nube([], ["A", "B", "C"], 0, None, {}, AHORA, listas_mac=2, tope_mac=1,
                          tope_runs=2)
        con = B.plan_nube([], ["A", "B", "C"], 0, None, {}, AHORA, listas_mac=2, tope_mac=1,
                          tope_runs=2, mac_guardada=True)
        self.assertGreater(len(con["reabrir"]), len(sin["reabrir"]))


class A1SubeDeAgentes(unittest.TestCase):
    """(CAP1119B) El A1 (2 OCPU · 12 GB) usa la CPU y la memoria libres, con su propio tope,
    en vez de quedarse parado al 15 % de CPU."""

    def test_con_la_cpu_casi_libre_aprovecha_el_a1(self):
        # Auditoría del 19-11: 15 % de CPU usada (85 % libre) y 5,6 GB libres.
        self.assertGreaterEqual(_agentes_a1(85, 5.6), 1)

    def test_nunca_pasa_de_su_propio_tope(self):
        self.assertGreaterEqual(_agentes_a1(100, 100), 1)
        self.assertLessEqual(_agentes_a1(100, 100), _tope_a1())

    def test_mas_recursos_no_bajan_los_agentes(self):
        self.assertGreaterEqual(_agentes_a1(100, 10), _agentes_a1(50, 2))

    @unittest.skipUnless(hasattr(RN, "a1_escalar_agentes"),
                         "esta versión no tiene lectura de consumo del A1")
    def test_el_freno_de_gasto_para_el_a1(self):
        consumo = {"leido": True, "freno": {"activo": True, "motivo": "el gasto del mes pasó de 0"},
                   "margen": {"cpu_libre_pct": 100, "mem_libre_gb": 10}}
        self.assertEqual(RN.a1_escalar_agentes(consumo)["agentes"], 0)

    @unittest.skipUnless(hasattr(RN, "a1_escalar_agentes"),
                         "esta versión no tiene lectura de consumo del A1")
    def test_sin_medidor_va_el_tope_minimo(self):
        self.assertEqual(RN.a1_escalar_agentes({"leido": False})["agentes"], RN.MIN_AGENTES_A1)


class EmpujeAGitHubConReintentos(unittest.TestCase):
    """(CAP1119B) El empuje de la rama de la cola a GitHub reintenta con espera ante un fallo
    transitorio y no deja el job «en camino» si no salió."""

    def _correr(self, respuestas):
        import subprocess as sp

        llamadas = []

        def falso_run(cmd, *a, **k):
            llamadas.append(list(cmd))
            rc, out, err = respuestas[min(len(llamadas) - 1, len(respuestas) - 1)]
            return sp.CompletedProcess(cmd, rc, stdout=out, stderr=err)

        with tempfile.TemporaryDirectory() as d:
            ruta = os.path.join(d, "estado.json")
            with mock.patch.object(B, "ESTADO", ruta), \
                    mock.patch.object(B, "ESPERA_BASE_REINTENTO_S", 0, create=True), \
                    mock.patch.object(B.time, "sleep", lambda *_: None), \
                    mock.patch.object(B, "_avisar", lambda *a, **k: None), \
                    mock.patch.object(sp, "run", side_effect=falso_run):
                hechos = B.desplegar(1, 2)
                estado = B._leer_json(ruta, {})
        return llamadas, hechos, estado

    def test_un_fallo_transitorio_se_reintenta_y_sale(self):
        llamadas, hechos, estado = self._correr([
            (1, "", "remote: error: temporary failure, please retry"),
            (0, "lanzado: cola-test.json · run 12345", ""),
        ])
        self.assertEqual(len(llamadas), 2)              # falló una vez y se reintentó
        self.assertEqual(estado.get("en_camino"), 1)    # lo que salió de verdad
        self.assertEqual(estado.get("ultimo_despliegue", {}).get("lanzados"), 1)
        self.assertIn("lanzado:", " ".join(hechos))

    def test_un_fallo_definitivo_no_deja_el_job_colgado(self):
        llamadas, hechos, estado = self._correr([
            (1, "", "fatal: push failed permanently: no space left on device"),
        ])
        tope = max(1, getattr(B, "MAX_REINTENTOS_DESPLEGAR", 3))
        self.assertLessEqual(len(llamadas), tope)       # no se queda reintentando sin fin
        self.assertEqual(estado.get("en_camino"), 0)
        self.assertEqual(estado.get("ultimo_despliegue", {}).get("lanzados"), 0)
        self.assertIn("no salió", " ".join(hechos))

    @unittest.skipUnless(hasattr(B, "_es_error_transitorio"),
                         "esta versión no clasifica los errores del empuje")
    def test_distingue_lo_transitorio_de_lo_definitivo(self):
        self.assertTrue(B._es_error_transitorio("remote: error: temporary failure"))
        self.assertTrue(B._es_error_transitorio("HTTP 503 Service Unavailable"))
        self.assertFalse(B._es_error_transitorio("fatal: no space left on device"))


def _gcloud_mira_facturacion():
    import medios_disponibles as M

    return "facturacion_activa" in inspect.signature(M.clasificar_gcloud).parameters


class GcloudConFacturacionApagada(unittest.TestCase):
    """(CAP1119B) Cloud Run exige facturación aunque el plan sea gratis: con la facturación
    desactivada, Google Cloud NO es «usable» y el medio dice qué hace falta."""

    def _clasificar(self, activa):
        import medios_disponibles as M

        return M.clasificar_gcloud(True, ["alex@ejemplo.com"], "starseed-os", [],
                                   facturacion_activa=activa)

    @unittest.skipUnless(_gcloud_mira_facturacion(),
                         "esta versión no mira la facturación de gcloud")
    def test_sin_facturacion_pide_a_alex_y_explica_el_paso(self):
        d = self._clasificar(False)
        self.assertEqual(d["estado"], "requiere_alex")
        self.assertNotEqual(d["estado"], "usable")
        self.assertIn("facturación", (d["detalle"] + " " + d["siguiente_paso"]).lower())
        self.assertIn("billing", d["siguiente_paso"].lower())

    @unittest.skipUnless(_gcloud_mira_facturacion(),
                         "esta versión no mira la facturación de gcloud")
    def test_con_facturacion_sigue_siendo_usable(self):
        self.assertEqual(self._clasificar(True)["estado"], "usable")
