"""Pruebas de colmena_logica: relevo sin pérdidas y cualquier neurona como contenedor (COL1012)."""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import colmena_logica as C  # noqa: E402

HERR = {h: True for h in C.HERRAMIENTAS}
AHORA = 1_800_000_000.0


def aparato(**k):
    base = {"so": "macos", "medio_app": "terminal", "herramientas": HERR, "ram_total_mb": 8192,
            "nucleos": 8, "disco_libre_gb": 40}
    base.update(k)
    return base


class CapacidadContenedor(unittest.TestCase):
    def test_la_mac_de_hoy_da_tres_agentes(self):
        r = C.capacidad_contenedor(aparato())
        self.assertTrue(r["apto"])
        self.assertEqual(r["agentes"], 3)

    def test_el_a1_lo_limitan_sus_dos_nucleos(self):
        r = C.capacidad_contenedor(aparato(so="linux", ram_total_mb=12 * 1024, nucleos=2))
        self.assertEqual(r["agentes"], 2)

    def test_nunca_mas_de_cuatro(self):
        self.assertEqual(C.capacidad_contenedor(aparato(ram_total_mb=64 * 1024, nucleos=16))["agentes"], 4)

    def test_iphone_no_puede_trabajar(self):
        r = C.capacidad_contenedor(aparato(so="ios"))
        self.assertFalse(r["apto"])
        self.assertIn("mirar", r["motivo"])

    def test_una_pestana_sin_trabajador_pide_instalarlo(self):
        r = C.capacidad_contenedor({"so": "macos", "medio_app": "navegador", "ram_total_mb": 8192})
        self.assertFalse(r["apto"])
        self.assertEqual(r["falta"], ["trabajador"])

    def test_windows_sin_wsl(self):
        r = C.capacidad_contenedor(aparato(so="windows"))
        self.assertFalse(r["apto"])
        self.assertTrue(C.capacidad_contenedor(aparato(so="windows", wsl=True))["apto"])

    def test_dice_que_herramientas_faltan(self):
        r = C.capacidad_contenedor(aparato(herramientas={"git": True, "node": True}))
        self.assertFalse(r["apto"])
        self.assertEqual(r["falta"], ["python3", "opencode"])

    def test_menos_de_6_gb_no_cabe_tsc(self):
        self.assertFalse(C.capacidad_contenedor(aparato(ram_total_mb=4096))["apto"])

    def test_android_con_termux_un_agente(self):
        r = C.capacidad_contenedor(aparato(so="android", ram_total_mb=12 * 1024))
        self.assertEqual(r["agentes"], 1)

    def test_el_disco_recorta(self):
        r = C.capacidad_contenedor(aparato(disco_libre_gb=5.25))
        self.assertEqual(r["agentes"], 2)
        self.assertFalse(C.capacidad_contenedor(aparato(disco_libre_gb=4))["apto"])

    def test_bateria(self):
        self.assertEqual(C.capacidad_contenedor(aparato(bateria={"cargando": False, "nivel": 0.6}))["agentes"], 1)
        r = C.capacidad_contenedor(aparato(bateria={"cargando": False, "nivel": 0.15}))
        self.assertTrue(r["apto"])
        self.assertEqual(r["agentes"], 0)
        self.assertEqual(C.capacidad_contenedor(aparato(bateria={"cargando": True, "nivel": 0.1}))["agentes"], 3)

    def test_red_medida(self):
        self.assertEqual(C.capacidad_contenedor(aparato(red={"medida": True}))["agentes"], 1)


class PuntosDeControl(unittest.TestCase):
    def test_cada_cinco_minutos_si_hay_cambios(self):
        t = {"fase": "escribiendo", "cambios": True, "punto": {"t": AHORA - 299}}
        self.assertFalse(C.debe_guardar_punto(t, AHORA))
        t["punto"]["t"] = AHORA - 300
        self.assertTrue(C.debe_guardar_punto(t, AHORA))

    def test_el_primero_al_momento(self):
        self.assertTrue(C.debe_guardar_punto({"fase": "completando", "cambios": True}, AHORA))

    def test_sin_cambios_o_fuera_de_escritura_no(self):
        self.assertFalse(C.debe_guardar_punto({"fase": "escribiendo", "cambios": False}, AHORA))
        self.assertFalse(C.debe_guardar_punto({"fase": "tsc", "cambios": True}, AHORA))

    def test_tarea_viva_es_toda_fase_que_no_esta_cerrada(self):
        """La misma regla que el orquestador: viva = fase que no es vacía ni «hecho» (tsc e integrando también cuentan)."""
        for fase in ("escribiendo", "completando", "tsc", "tests", "revision", "integrando",
                     "esperando proveedor", "esperando cupo", "esperando-memoria", "esperando aprobación"):
            self.assertTrue(C.tarea_viva(fase), fase)
        for fase in (None, "", "  ", "hecho", 7, ["escribiendo"]):
            self.assertFalse(C.tarea_viva(fase), repr(fase))


def latido(t, en_curso=(), periodo=300):
    return {"t": t, "periodo_s": periodo, "en_curso": list(en_curso)}


PUNTO = {"rama": "relevo/mac-a1b2c3/AV1", "sha": "abc1234", "t": AHORA - 200}


class NodosPerdidos(unittest.TestCase):
    def test_silencio_largo(self):
        p = C.nodos_perdidos({"mac-1": latido(AHORA - 901)}, {}, AHORA)
        self.assertIn("mac-1", p)
        self.assertEqual(C.nodos_perdidos({"mac-1": latido(AHORA - 899)}, {}, AHORA), {})

    def test_con_freno_de_consumo_se_espera_mas(self):
        self.assertEqual(C.nodos_perdidos({"a": latido(AHORA - 1500, periodo=600)}, {}, AHORA), {})
        self.assertIn("a", C.nodos_perdidos({"a": latido(AHORA - 1801, periodo=600)}, {}, AHORA))

    def test_el_boton_cuenta_al_momento_y_el_reinicio_no(self):
        lat = {"mac-1": latido(AHORA - 60)}
        self.assertIn("mac-1", C.nodos_perdidos(lat, {"mac-1": {"t": AHORA - 10, "traspaso": True}}, AHORA))
        self.assertEqual(C.nodos_perdidos(lat, {"mac-1": {"t": AHORA - 10}}, AHORA), {})

    def test_si_volvio_despues_del_boton_no_esta_perdido(self):
        lat = {"mac-1": latido(AHORA - 5)}
        self.assertEqual(C.nodos_perdidos(lat, {"mac-1": {"t": AHORA - 600, "traspaso": True}}, AHORA), {})


def nodo(medio, agentes=2, **k):
    base = {"medio": medio, "vivo": True, "modo": "real", "contenedor": {"activo": True, "agentes": agentes}}
    base.update(k)
    return base


class Destino(unittest.TestCase):
    def test_primero_lo_que_nunca_se_apaga(self):
        nodos = {"neurona-x": nodo("neurona", 3), "oracle-a1-y": nodo("oracle-a1", 2), "gh": nodo("gh-actions", 6)}
        self.assertEqual(C.elegir_destino({"id": "T"}, nodos, {})[0], "oracle-a1-y")

    def test_sin_huecos_pasa_al_siguiente(self):
        nodos = {"neurona-x": nodo("neurona", 3), "oracle-a1-y": nodo("oracle-a1", 2)}
        self.assertEqual(C.elegir_destino({"id": "T"}, nodos, {"oracle-a1-y": 2})[0], "neurona-x")

    def test_privada_nunca_a_la_nube_compartida(self):
        nodos = {"gh": nodo("gh-actions", 6), "nube": nodo("nube-cowork", 2)}
        d, porque = C.elegir_destino({"id": "T", "privado": True}, nodos, {})
        self.assertIsNone(d)
        self.assertIn("espera", porque)

    def test_grande_no_va_a_github(self):
        nodos = {"gh": nodo("gh-actions", 6)}
        self.assertIsNone(C.elegir_destino({"id": "T", "archivos": ["a", "b", "c", "d"]}, nodos, {})[0])

    def test_solo_mac(self):
        nodos = {"oracle-a1-y": nodo("oracle-a1"), "mac-1": nodo("mac", 3)}
        self.assertEqual(C.elegir_destino({"id": "T", "solo_mac": True}, nodos, {})[0], "mac-1")

    def test_no_cuenta_seco_muerto_desconectando_ni_sin_contenedor(self):
        nodos = {"a": nodo("oracle-a1", modo="seco"), "b": nodo("oracle-a1", vivo=False),
                 "c": nodo("oracle-a1", desconectando=True), "d": dict(nodo("oracle-a1"), contenedor={"activo": False, "agentes": 2})}
        self.assertIsNone(C.elegir_destino({"id": "T"}, nodos, {})[0])

    def test_a_igual_medio_gana_la_sesion_insomne_mas_larga(self):
        nodos = {"neurona-x": nodo("neurona", insomne={"hasta": 1800}),
                 "neurona-y": nodo("neurona", insomne={"hasta": 3600})}
        self.assertEqual(C.elegir_destino({"id": "T"}, nodos, {})[0], "neurona-y")

    def test_una_neurona_insomne_gana_a_la_que_no_lo_es(self):
        nodos = {"sin-sesion": nodo("neurona"), "con-sesion": nodo("neurona", insomne={"hasta": 1200})}
        self.assertEqual(C.elegir_destino({"id": "T"}, nodos, {})[0], "con-sesion")

    def test_nunca_una_sesion_que_termina_antes_de_15_min(self):
        nodos = {"neurona-x": nodo("neurona", insomne={"hasta": 899})}
        self.assertIsNone(C.elegir_destino({"id": "T"}, nodos, {})[0])
        nodos["neurona-x"]["insomne"]["hasta"] = 900
        self.assertEqual(C.elegir_destino({"id": "T"}, nodos, {})[0], "neurona-x")

    def test_lee_el_insomne_de_las_senales_de_presencia(self):
        nodos = {"neurona-x": nodo("neurona", senales={"insomne": {"hasta": 3600}}),
                 "neurona-y": nodo("neurona", insomne={"hasta": 1800})}
        self.assertEqual(C.elegir_destino({"id": "T"}, nodos, {})[0], "neurona-x")

    def test_la_preferencia_de_medio_manda_sobre_una_sesion_mas_larga(self):
        nodos = {"oracle-a1-y": nodo("oracle-a1", insomne={"hasta": 900}),
                 "mac-1": nodo("mac", insomne={"hasta": 100_000})}
        self.assertEqual(C.elegir_destino({"id": "T"}, nodos, {})[0], "oracle-a1-y")


class PlanRelevo(unittest.TestCase):
    def test_la_mac_se_va_y_sus_tareas_siguen_en_el_a1_desde_su_punto(self):
        lat = {"mac-1": latido(AHORA - 30, [{"id": "AV1", "fase": "escribiendo", "punto": PUNTO},
                                             {"id": "AV2", "fase": "escribiendo"}, {"id": "AV3"}]),
               "oracle-a1-y": latido(AHORA - 30)}
        bajas = {"mac-1": {"t": AHORA - 5, "traspaso": True}}
        nodos = {"mac-1": nodo("mac", 3), "oracle-a1-y": nodo("oracle-a1", 2)}
        plan = C.plan_relevo(lat, bajas, {}, nodos, {}, {}, AHORA)
        self.assertEqual([p["id"] for p in plan], ["AV1", "AV2", "AV3"])
        self.assertEqual([p["a"] for p in plan], ["oracle-a1-y", "oracle-a1-y", None])
        self.assertEqual(plan[0]["perdida_s"], 200)
        self.assertEqual(plan[0]["punto"]["rama"], PUNTO["rama"])
        self.assertIsNone(plan[1]["perdida_s"])  # sin punto: empieza de nuevo
        self.assertIn("espera", plan[2]["espera"])

    def test_no_repite_lo_ya_seguido(self):
        lat = {"mac-1": latido(AHORA - 2000, [{"id": "AV1", "punto": PUNTO}])}
        asig = {"AV1": {"a": "oracle-a1-y", "t": AHORA - 100}}
        self.assertEqual(C.tareas_a_reenrutar(lat, {}, asig, AHORA), [])

    def test_un_nodo_vivo_no_suelta_nada(self):
        lat = {"mac-1": latido(AHORA - 30, [{"id": "AV1", "punto": PUNTO}])}
        self.assertEqual(C.plan_relevo(lat, {}, {}, {"mac-1": nodo("mac")}, {}, {}, AHORA), [])


class AlVolver(unittest.TestCase):
    def test_suelta_lo_que_otro_siguio_mientras_estaba_fuera(self):
        asig = {"AV1": {"a": "oracle-a1-y", "t": AHORA - 100}, "AV2": {"a": "mac-1", "t": AHORA - 100},
                "AV4": {"a": "oracle-a1-y", "t": AHORA - 5000}}
        soltar, seguir = C.al_volver("mac-1", ["AV1", "AV2", "AV3", "AV4"], asig, AHORA - 1000)
        self.assertEqual(soltar, ["AV1"])
        self.assertEqual(seguir, ["AV2", "AV3", "AV4"])


class DesconexionSola(unittest.TestCase):
    def test_bateria_critica_y_apagado(self):
        self.assertTrue(C.debe_desconectarse_solo({"bateria": {"cargando": False, "nivel": 0.1}})[0])
        self.assertFalse(C.debe_desconectarse_solo({"bateria": {"cargando": True, "nivel": 0.05}})[0])
        self.assertTrue(C.debe_desconectarse_solo({"apagado_en_s": 120})[0])
        self.assertFalse(C.debe_desconectarse_solo({"apagado_en_s": 3600})[0])
        self.assertFalse(C.debe_desconectarse_solo({})[0])

    def test_suelta_cuando_la_sesion_insomne_termina_en_menos_de_5_min(self):
        ok, porque = C.debe_desconectarse_solo({"insomne": {"hasta": 299}})
        self.assertTrue(ok)
        self.assertEqual(porque, "la sesión insomne termina en 4 min")
        self.assertTrue(C.debe_desconectarse_solo({"insomne": {"hasta": 60}})[0])
        self.assertTrue(C.debe_desconectarse_solo({"insomne": {"hasta": 0}})[0])
        self.assertIn("termina en 1 min", C.debe_desconectarse_solo({"insomne": {"hasta": 60}})[1])

    def test_no_suelta_con_5_min_o_mas_de_sesion_insomne(self):
        self.assertFalse(C.debe_desconectarse_solo({"insomne": {"hasta": 300}})[0])
        self.assertFalse(C.debe_desconectarse_solo({"insomne": {"hasta": 3600}})[0])
        self.assertFalse(C.debe_desconectarse_solo({"insomne": {}})[0])

    def test_lee_el_insomne_de_las_senales_de_presencia(self):
        self.assertTrue(C.debe_desconectarse_solo({"senales": {"insomne": {"hasta": 120}}})[0])


if __name__ == "__main__":
    unittest.main()
