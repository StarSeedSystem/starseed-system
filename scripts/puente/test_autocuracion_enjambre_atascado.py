# -*- coding: utf-8 -*-
"""Punto 6 de la autocuración: enjambre esperando proveedores que ya volvieron (2026-10-06).

Caso real: a las 22:56 tres trabajadores llevaban 30-40 min «esperando proveedor» y la sonda
veía escribir a apinex, freellmapi y Google. Nadie lo arreglaba sin que Alex lo pidiera."""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import autocuracion_mando as A  # noqa: E402

AHORA = 1_791_349_000.0
LATIDO_REAL = {
    "MC1007Bc": {"fase": "esperando proveedor", "desde": AHORA - 42 * 60},
    "PT1008Bb": {"fase": "esperando proveedor", "desde": AHORA - 32 * 60},
    "LC1007A": {"fase": "esperando proveedor", "desde": AHORA - 10},
    "PT1007Ab": {"fase": "hecho", "desde": AHORA - 3600},
}
SONDA_REAL = [("apinex/free/deepseek-v4-pro-0813", True, "responde", 0),
              ("freellmapi/auto", True, "responde", 0),
              ("google/gemini-3.6-flash", True, "responde", 0),
              ("nvidia/moonshotai/kimi-k3", False, "no contesta en 25 s", 0.25),
              ("openrouter/cohere/north-mini-code:free", False, "cupo del día agotado (429)", 19.0)]


class Diagnostico(unittest.TestCase):
    def test_caso_real(self):
        d = A.diagnostico_atasco(LATIDO_REAL, AHORA)
        self.assertTrue(d["atascada"])
        self.assertEqual([t for t, _ in d["largas"]], ["MC1007Bc", "PT1008Bb"])
        self.assertEqual(len(d["esperando"]), 3)
        self.assertEqual(d["trabajando"], [])

    def test_escribiendo_no_es_atasco_y_espera_corta_tampoco(self):
        d = A.diagnostico_atasco({"A": {"fase": "escribiendo", "desde": AHORA - 9999},
                                  "B": {"fase": "esperando proveedor", "desde": AHORA - 60}}, AHORA)
        self.assertFalse(d["atascada"])
        self.assertEqual(d["trabajando"], ["A"])

    def test_datos_raros_no_lanzan(self):
        d = A.diagnostico_atasco({"A": "x", "B": {"fase": "esperando cupo", "desde": "nan?"}}, AHORA)
        self.assertEqual(len(d["esperando"]), 1)


class Decision(unittest.TestCase):
    ATASCO = {"atascada": True, "esperando": [("A", 1500)], "largas": [("A", 1500)]}

    def test_nada_sin_atasco(self):
        self.assertEqual(A.decidir_atasco({"atascada": False, "esperando": []}, True, {}, AHORA)[0], "nada")

    def test_sin_escritores_se_espera(self):
        self.assertEqual(A.decidir_atasco(self.ATASCO, False, {}, AHORA)[0], "esperar")

    def test_primero_refrescar(self):
        self.assertEqual(A.decidir_atasco(self.ATASCO, True, {}, AHORA)[0], "refrescar")

    def test_refresco_reciente_se_le_da_tiempo(self):
        e = {"ultimo_refresco": AHORA - 300}
        self.assertEqual(A.decidir_atasco(self.ATASCO, True, e, AHORA)[0], "esperar")

    def test_refresco_sin_efecto_reinicia(self):
        e = {"ultimo_refresco": AHORA - 11 * 60}
        self.assertEqual(A.decidir_atasco(self.ATASCO, True, e, AHORA)[0], "reiniciar")

    def test_reinicio_reciente_no_se_repite(self):
        e = {"ultimo_refresco": AHORA - 11 * 60, "ultimo_reinicio_orq": AHORA - 20 * 60}
        self.assertEqual(A.decidir_atasco(self.ATASCO, True, e, AHORA)[0], "esperar")

    def test_tras_reinicio_vuelve_a_refrescar_primero(self):
        e = {"ultimo_refresco": AHORA - 50 * 60, "ultimo_reinicio_orq": AHORA - 30 * 60}
        self.assertEqual(A.decidir_atasco(self.ATASCO, True, e, AHORA)[0], "refrescar")

    def test_boton_actua_con_cualquier_espera_y_tiempos_cortos(self):
        corta = {"atascada": False, "esperando": [("A", 60)], "largas": []}
        self.assertEqual(A.decidir_atasco(corta, True, {}, AHORA, forzar=True)[0], "refrescar")
        e = {"ultimo_refresco": AHORA - 180}
        self.assertEqual(A.decidir_atasco(corta, True, e, AHORA, forzar=True)[0], "reiniciar")


class Puras(unittest.TestCase):
    def test_aptos_de_sonda_con_alias(self):
        self.assertEqual(A.aptos_de_sonda(SONDA_REAL), ["apinex", "freellmapi", "google"])
        self.assertEqual(A.aptos_de_sonda([("nvidia/x", True, "", 0)]), ["nim"])

    def test_levantar_solo_marcas_futuras_de_aptos(self):
        salud = {"google": {"estado": "vivo", "sin_cupo_hasta": "2026-10-07 01:05:00", "motivo": "429"},
                 "xkiro": {"sin_cupo_hasta": "2026-10-07 18:00:00"},
                 "apinex": {"sin_cupo_hasta": "2026-10-06 10:00:00"}}
        nueva, lev = A.levantar_marcas(salud, ["google", "apinex"], "2026-10-06 22:56:00")
        self.assertEqual(lev, ["google"])
        self.assertNotIn("sin_cupo_hasta", nueva["google"])
        self.assertEqual(nueva["google"]["estado"], "vivo")
        self.assertIn("sin_cupo_hasta", nueva["xkiro"])
        self.assertIn("sin_cupo_hasta", salud["google"])  # no muta la entrada

    def test_perdonar_rachas_de_quien_responde(self):
        colg = {"freellmapi/auto": {"seguidos": 3, "ultimo": 1.0}, "xkiro/q": {"seguidos": 3},
                "nvidia/k": {"seguidos": 2}}
        nuevo, perd = A.perdonar_colgados(colg, ["freellmapi", "nim"])
        self.assertEqual(sorted(perd), ["freellmapi/auto", "nvidia/k"])
        self.assertEqual(nuevo["freellmapi/auto"]["seguidos"], 0)
        self.assertEqual(nuevo["xkiro/q"]["seguidos"], 3)


class Curar(unittest.TestCase):
    def setUp(self):
        self.ordenes, self.reinicios, self.avisos, self.levantados = [], [], [], []

    def curar(self, estado, latido=LATIDO_REAL, sonda=SONDA_REAL, forzar=False, ahora=AHORA):
        return A.curar_enjambre(
            estado, ahora, forzar, latido_fn=lambda cola: latido, sondear_fn=lambda: sonda,
            ordenar_fn=self.ordenes.append, reiniciar_fn=lambda: self.reinicios.append(1) or [4242],
            levantar_fn=lambda aptos: (self.levantados.append(aptos) or (["google"], ["freellmapi/auto"])),
            avisar_fn=self.avisos.append, cola_fn=lambda: "cola-auto-1006-181014.json")

    def test_caso_real_ordena_refrescar_y_lo_dice(self):
        estado = {}
        linea = self.curar(estado)
        self.assertEqual(self.ordenes, ["cola-auto-1006-181014.json"])
        self.assertEqual(self.levantados, [["apinex", "freellmapi", "google"]])
        self.assertEqual(estado["ultimo_refresco"], AHORA)
        self.assertIn("MC1007Bc (42 min)", linea)
        self.assertIn("google", self.avisos[0])
        self.assertEqual(estado["enjambre"]["esperando"], 3)

    def test_sigue_igual_diez_minutos_despues_reinicia(self):
        estado = {}
        self.curar(estado)
        self.curar(estado, ahora=AHORA + 11 * 60)
        self.assertEqual(self.reinicios, [1])
        self.assertEqual(estado["ultimo_reinicio_orq"], AHORA + 11 * 60)

    def test_la_sonda_se_reutiliza_diez_minutos(self):
        estado = {}
        llamadas = []
        A.curar_enjambre(estado, AHORA, latido_fn=lambda c: LATIDO_REAL,
                         sondear_fn=lambda: llamadas.append(1) or SONDA_REAL,
                         ordenar_fn=lambda c: None, reiniciar_fn=lambda: [],
                         levantar_fn=lambda a: ([], []), avisar_fn=lambda t: None,
                         cola_fn=lambda: "cola-x.json")
        A.curar_enjambre(estado, AHORA + 60, latido_fn=lambda c: LATIDO_REAL,
                         sondear_fn=lambda: llamadas.append(1) or SONDA_REAL,
                         ordenar_fn=lambda c: None, reiniciar_fn=lambda: [],
                         levantar_fn=lambda a: ([], []), avisar_fn=lambda t: None,
                         cola_fn=lambda: "cola-x.json")
        self.assertEqual(len(llamadas), 1)

    def test_sin_cupo_en_nadie_no_toca_y_avisa_una_vez_por_hora(self):
        estado = {}
        sin = [(m, False, "cupo", 5) for m, *_ in SONDA_REAL]
        self.curar(estado, sonda=sin)
        self.curar(estado, sonda=sin, ahora=AHORA + 600)
        self.assertEqual(self.ordenes, [])
        self.assertEqual(self.reinicios, [])
        self.assertEqual(len(self.avisos), 1)

    def test_sin_orquestador_vivo_no_hace_nada(self):
        estado = {}
        r = A.curar_enjambre(estado, AHORA, cola_fn=lambda: None, sondear_fn=lambda: 1 / 0)
        self.assertEqual(r, "")

    def test_todo_bien_no_sondea(self):
        estado = {}
        bien = {"A": {"fase": "escribiendo", "desde": AHORA - 100}}
        r = A.curar_enjambre(estado, AHORA, latido_fn=lambda c: bien, sondear_fn=lambda: 1 / 0,
                             cola_fn=lambda: "cola-x.json")
        self.assertEqual(r, "")
        self.assertEqual(estado["enjambre"]["trabajando"], 1)


if __name__ == "__main__":
    unittest.main()


class ServiciosEnLaPasada(unittest.TestCase):
    def setUp(self):
        import tempfile
        self.tmp = tempfile.mkdtemp()
        self._e, self._p = A.ESTADO, A.PUBLICACION
        A.ESTADO = os.path.join(self.tmp, "estado.json")
        A.PUBLICACION = os.path.join(self.tmp, "pub.json")

    def tearDown(self):
        A.ESTADO, A.PUBLICACION = self._e, self._p

    def pasada(self, forzar=False, ahora=AHORA):
        avisos, llamadas = [], []
        r = A.revisar(ahora=ahora, sondear_fn=lambda: True, reiniciar_fn=lambda: None,
                      limpiar_fn=lambda ids: {}, libre_fn=lambda: 50.0, avisar_fn=avisos.append,
                      dormir=lambda s: None, asignar_fn=lambda: ({"puede": False}, lambda: []),
                      buscar_fn=lambda: {}, traer_fn=lambda: True, forzar=forzar,
                      curar_fn=lambda e, a, f: "",
                      servicios_fn=lambda: llamadas.append(1) or {"estado": "reparado",
                                                                  "detalle": "relanzados: vigilante"})
        return r, avisos, llamadas

    def test_servicio_caido_se_relanza_y_se_dice_cada_diez_minutos(self):
        r, avisos, llamadas = self.pasada()
        self.assertEqual(llamadas, [1])
        self.assertIn("servicios: relanzados: vigilante", r["hechos"])
        self.assertTrue(any("vigilante" in a for a in avisos))
        _, _, llamadas2 = self.pasada(ahora=AHORA + 60)
        self.assertEqual(llamadas2, [])

    def test_con_forzar_lo_hace_el_reactivador_no_la_pasada(self):
        _, _, llamadas = self.pasada(forzar=True)
        self.assertEqual(llamadas, [])
