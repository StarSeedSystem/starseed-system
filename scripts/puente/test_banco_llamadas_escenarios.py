#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""(BAN1115D) Los escenarios de las fases 2 y 3 (c1, c10, c4 y c14) y el paso que falta, contra líneas en la gramática del contrato."""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import banco_llamadas_logica as L  # noqa: E402
import test_banco_llamadas as T  # noqa: E402

U, BUENAS, SERIE = T.U, T.BUENAS, T.SERIE
T0 = T.T0


def juzga(esc, texto, lecturas=None):
    ls = T.parsear(texto)
    return L.juzgar_llamada(esc, SERIE, 1, ls, [x for x in ls if x["canal"] == "ble"], BUENAS if lecturas is None else lecturas, U)


def base(esc, dur, cuelga, contesta="tab", medio="auto", extra=(), datos=True, quita=()):
    """Una llamada con sus marcas; `extra` son líneas ya escritas; `datos` añade voz y vídeo por el enlace de datos en las dos puntas."""
    ini = T0 + 8
    fin = ini + dur
    ls = [T.l_mac(T0, "banco inicio esc=%s serie=%s n=1 medio=%s tipo=video" % (esc, SERIE, medio))]
    f = T.l_mac if contesta == "mac" else T.l_tab
    ls.append(f(T0 + 5, "banco contesta esc=%s serie=%s n=1 camara=si" % (esc, SERIE)))
    if datos:
        ls += T.lado(T.l_mac, ini, dur) + T.lado(T.l_tab, ini, dur)
    else:   # WebRTC: solo líneas sueltas de las dos puntas
        ls += [T.l_mac(ini + 20, "medio=webrtc par=PAR1:1 ice candidatos enviados=0 recibidos=0"), T.l_tab(fin - 3, "medio=webrtc par=PAR2:2 estado ok")]
        ls += list(T.lado(T.l_mac, ini, dur)[:0])
    ls += [x for x in extra]
    ls.append(T.l_mac(fin + 1, "banco fin esc=%s serie=%s n=1 cuelga=%s dur_s=%d" % (esc, SERIE, cuelga, dur)))
    return "\n".join(l for l in ls if not any(q in l for q in quita)) + "\n"


def c1(**k):
    ini = T0 + 8
    extra = [T.l_mac(ini + 25, "banco simulacion corte-ip medio_real=no"), T.l_tab(ini + 25, "banco simulacion corte-ip medio_real=no"),
             T.l_mac(ini + 85, "banco simulacion vuelve-ip medio_real=no"),
             T.l_mac(ini + 90, "medio=webrtc par=PAR1:1 ice=connected tras-reintentos=1"),
             T.l_mac(ini + 115, "fin por=colgar motivo=\"x\" contestada=si dur-s=115 origen=par:aaaa via=ble")]
    if k.pop("sin_webrtc", False):
        extra = [x for x in extra if "ice=connected" not in x]
    if k.pop("sola", False):
        extra.append(T.l_mac(ini + 50, "fin por=error motivo=\"La llamada falló\" contestada=si dur-s=50 origen=local via=-"))
    return base("corte-ip-vuelve", 115, k.pop("cuelga", "tableta"), extra=extra, **k)


class CorteIp(unittest.TestCase):
    def test_buena_cumple_c1_y_es_simulada(self):
        j = juzga("corte-ip-vuelve", c1())
        self.assertEqual((j["valida"], j["cumple"], j["fallos"]), (True, True, []))
        self.assertTrue(j["comp"]["c1"]["cumple"])
        self.assertIs(j["medio_real"], False)
        self.assertEqual(j["cuelga"], "tableta")

    def test_sin_reconexion_de_webrtc_falla(self):
        j = juzga("corte-ip-vuelve", c1(sin_webrtc=True))
        self.assertFalse(j["cumple"])
        self.assertIn("WebRTC no se reconectó", j["fallos"][0])

    def test_si_la_llamada_acabo_sola_falla(self):
        j = juzga("corte-ip-vuelve", c1(sola=True))
        self.assertFalse(j["cumple"])
        self.assertTrue(any("terminó sola" in x for x in j["fallos"]))
        self.assertTrue(any("La llamada falló" in x for x in j["fallos"]))

    def test_si_colgo_la_mac_falla(self):
        j = juzga("corte-ip-vuelve", c1(cuelga="mac"))
        self.assertTrue(any("cuelga la tableta" in x for x in j["fallos"]))

    def test_sin_datos_durante_el_corte_falla(self):
        t = c1()
        t = "\n".join(x for x in t.splitlines() if "datos rx" not in x or not (T0 + 8 + 25 <= T.parsear(x)[0]["t"] <= T0 + 8 + 85)) + "\n"
        j = juzga("corte-ip-vuelve", t)
        self.assertTrue(j["valida"])
        self.assertTrue(any("enlace de datos" in x for x in j["fallos"]), j["fallos"])

    def test_sin_las_marcas_de_simulacion_lo_dice(self):
        t = "\n".join(x for x in c1().splitlines() if "banco simulacion" not in x) + "\n"
        j = juzga("corte-ip-vuelve", t)
        self.assertTrue(any("no quedó anotado" in x for x in j["fallos"]))

    def test_veredicto_de_serie_c1(self):
        js = [juzga("corte-ip-vuelve", c1()) for _ in range(3)]
        v = L.veredicto_serie(js, 3, "c1", "c1")
        self.assertEqual(v["veredicto"], "bien")
        self.assertIn("simulado", v["sugerencia"])
        malas = [juzga("corte-ip-vuelve", c1(sin_webrtc=True)) for _ in range(2)]
        self.assertEqual(L.veredicto_serie(js[:1] + malas, 3, "c1", "c1")["veredicto"], "falla")


def c10(conecta=5, cand="enviados=8 recibidos=4", cuelga="mac"):
    ini = T0 + 8
    extra = [T.l_mac(T0 + 5 + conecta, "medio=webrtc par=PAR1:1 ice=connected tras-reintentos=0"),
             T.l_mac(T0 + 6, "medio=webrtc par=PAR1:1 ice candidatos %s en-espera=0 descartados=0" % cand),
             T.l_tab(ini + 29, "medio=webrtc par=PAR2:2 video llega")]
    return base("tableta-llama", 30, cuelga, contesta="mac", datos=False, extra=extra)


class TabletaLlama(unittest.TestCase):
    def test_buena_cumple_c10(self):
        j = juzga("tableta-llama", c10())
        self.assertEqual((j["valida"], j["cumple"]), (True, True), j)

    def test_contesta_la_tableta_no_vale(self):
        t = c10().replace("banco contesta", "banco contesta").replace("\n", "\n")
        t = "\n".join(x.replace("web ", "web (Maggaboard) ", 1) if "banco contesta" in x else x for x in t.splitlines()) + "\n"
        j = juzga("tableta-llama", t)
        self.assertFalse(j["valida"])
        self.assertTrue(any("de la Mac" in x for x in j["motivos_invalida"]))

    def test_conecta_tarde_falla(self):
        j = juzga("tableta-llama", c10(conecta=40))
        self.assertTrue(any("después de contestar" in x for x in j["fallos"]))

    def test_candidatos_en_una_sola_direccion_falla(self):
        j = juzga("tableta-llama", c10(cand="enviados=8 recibidos=0"))
        self.assertTrue(any("recibidos" in x for x in j["fallos"]))

    def test_sin_conexion_falla(self):
        t = "\n".join(x for x in c10().splitlines() if "ice=connected" not in x) + "\n"
        self.assertTrue(any("no llegó a conectar" in x for x in juzga("tableta-llama", t)["fallos"]))

    def test_la_orden_lleva_llama_tableta(self):
        o = L.construir_orden("tableta-llama", "s1", 1, 5, "u", T0, 120)
        self.assertEqual(o["llama"], "tableta")
        self.assertNotIn("llama", L.construir_orden("corte-ip-vuelve", "s1", 1, 3, "u", T0, 120))


def mc(mudo=True, pausa=False, cam=True, ve=True):
    ini = T0 + 8
    extra = []
    if mudo:
        extra += [T.l_mac(ini + 20 + i, "medio=enlace-datos voz-datos tx n=3 opus=10k mudo paq=1") for i in range(0, 32, 4)]
    if cam:
        extra.append(T.l_mac(ini + 76, "camara encendida estado=live pares=1"))
    if ve:
        extra.append(T.l_tab(ini + 79, "medio=video-datos video-datos rx paquetes=9 cuadros=9 decodificados=9 pintados=9 errores=0"))
    return base("mudo-camara", 95, "mac", extra=extra, quita=() if ve else ("video-datos rx",))


class MudoCamara(unittest.TestCase):
    def test_buena_cumple_c4_y_c14(self):
        j = juzga("mudo-camara", mc())
        self.assertEqual((j["valida"], j["cumple"], j["fallos"]), (True, True, []), j["fallos"])
        self.assertTrue(j["comp"]["c4"]["cumple"] and j["comp"]["c14"]["cumple"])

    def test_sin_mudo_falla_c4_pero_no_c14(self):
        j = juzga("mudo-camara", mc(mudo=False))
        self.assertFalse(j["comp"]["c4"]["cumple"])
        self.assertTrue(j["comp"]["c14"]["cumple"])

    def test_camara_que_no_vuelve_falla_c14(self):
        j = juzga("mudo-camara", mc(cam=False))
        self.assertFalse(j["comp"]["c14"]["cumple"])

    def test_otro_lado_sin_video_falla_c14(self):
        self.assertFalse(juzga("mudo-camara", mc(ve=False))["comp"]["c14"]["cumple"])

    def test_veredictos_por_comprobacion(self):
        js = [juzga("mudo-camara", mc()) for _ in range(3)]
        self.assertEqual(L.veredicto_serie(js, 3, "c4", "c4")["veredicto"], "bien")
        self.assertEqual(L.veredicto_serie(js, 3, "c14", "c14")["veredicto"], "bien")


class Evidencia(unittest.TestCase):
    def test_sin_evidencia_de_datos_basta_una_linea_de_la_tableta(self):
        ls = T.parsear(c10())
        self.assertTrue(L.evidencia_completa(ls, SERIE, 1, "tableta-llama")[0])


class PasoQueFalta(unittest.TestCase):
    AHORA = T0 + 1000
    REC = AHORA - 10

    def app(self, **k):
        d = {"t": self.REC, "llave": True, "objetivo": "aaaa0002-0000-4000-8000-000000000003", "codigo": "ABCD-1234",
             "sesion": {"estado": "aceptada"}, "armada": {"con": "x", "hasta": (self.AHORA + 3600) * 1000, "restantes": 40}}
        d.update(k)
        return d

    def test_sin_informe_o_viejo_vale_la_frase_generica(self):
        g = {"motivo": "la app de la Mac no está en modo de pruebas de llamadas o no sondea desde las 03:00"}
        self.assertEqual(L.paso_que_falta(None, self.AHORA, g), g["motivo"])
        self.assertIn(g["motivo"], L.paso_que_falta(self.app(t=self.AHORA - 999), self.AHORA, g))

    def test_el_orden_es_clave_aceptada_armada(self):
        f = lambda **k: L.paso_que_falta(self.app(**k), self.AHORA)  # noqa: E731
        self.assertIn("no tiene clave propia", f(llave=False, armada=None, sesion={"estado": "rechazada"}))
        r = f(armada=None, sesion={"estado": "rechazada", "motivo": "sin-respuesta"})
        self.assertIn("no ha aceptado", r)
        self.assertIn("ABCD-1234", r)
        self.assertIn("no está armado", f(armada=None))
        self.assertIn("venció", f(armada={"con": "x", "hasta": (self.AHORA - 5) * 1000}))
        self.assertIsNone(f())


if __name__ == "__main__":
    unittest.main()


# ── CAL1115I: escenarios de medida y funcionales ───────────────────────────────────────────────────────────────
BUSY = [T.lec(T0 + 30 * i, carga1=6.9, presion=2, libre_pct=21.0, swap_pct=93.0, swapouts_min=51312.0) for i in range(5)]


class Funcionales(unittest.TestCase):
    def test_cuales_son_funcionales_y_cuales_de_medida(self):
        self.assertEqual(sorted(e for e in L.ESCENARIOS if L.es_funcional(e)), ["corte-ip-vuelve", "mudo-camara", "tableta-llama"])
        self.assertFalse(L.es_funcional("ble-video-2min"))

    def test_funcional_con_la_mac_cargada_y_llamada_buena_es_valida_y_guarda_las_lecturas(self):
        j = juzga("corte-ip-vuelve", c1(), lecturas=BUSY)
        self.assertEqual((j["valida"], j["cumple"], j["no_concluyente"]), (True, True, False))
        self.assertEqual(j["modo"], "funcional")
        self.assertIn("carga 1 min 6,9 > 6,0", j["carga_alta"])
        self.assertEqual(j["calma"]["lecturas"], 5)                 # las lecturas de la Mac quedan con la llamada
        self.assertEqual((j["calma"]["carga1"]["max"], j["calma"]["presion"]["max"], j["calma"]["swap_pct"]["max"]), (6.9, 2, 93.0))

    def test_funcional_que_falla_con_la_mac_cargada_es_no_concluyente_por_carga(self):
        j = juzga("corte-ip-vuelve", c1(sin_webrtc=True), lecturas=BUSY)
        self.assertEqual((j["valida"], j["cumple"], j["no_concluyente"]), (False, None, True))
        self.assertIn("no concluyente por carga", j["motivos_invalida"][0])
        self.assertIn("WebRTC no se reconectó", j["motivos_invalida"][0])

    def test_funcional_que_falla_con_la_mac_en_calma_sigue_fallando(self):
        j = juzga("corte-ip-vuelve", c1(sin_webrtc=True))
        self.assertEqual((j["valida"], j["cumple"], j["no_concluyente"]), (True, False, False))

    def test_la_de_medida_con_la_mac_cargada_sigue_invalida_como_antes(self):
        j = L.juzgar_llamada("ble-video-2min", T.SERIE, 1, [], [], BUSY, U)
        self.assertFalse(j["valida"])
        self.assertTrue(any("no estuvo en calma durante la llamada" in m for m in j["motivos_invalida"]))
        self.assertNotIn("modo", j)

    def test_veredicto_funcional_dice_sin_calma_y_no_concluyente(self):
        buenas = [juzga("corte-ip-vuelve", c1(), lecturas=BUSY) for _ in range(3)]
        v = L.veredicto_serie(buenas, 3, "c1", "c1")
        self.assertEqual(v["veredicto"], "bien")
        self.assertIn("funcional, sin calma", v["sugerencia"])
        dudosas = [juzga("corte-ip-vuelve", c1(sin_webrtc=True), lecturas=BUSY) for _ in range(3)]
        v = L.veredicto_serie(dudosas, 3, "c1", "c1")
        self.assertEqual(v["veredicto"], "sin-veredicto")
        self.assertNotIn("falla", v["sugerencia"].split("(")[0])
        self.assertIn("funcional, sin calma", v["sugerencia"])
        self.assertIn("3 llamada(s) no concluyente(s) por carga", v["sugerencia"])

    def test_veredicto_de_medida_no_lleva_la_etiqueta(self):
        j = L.juzgar_llamada("ble-video-2min", T.SERIE, 1, [], [], BUENAS_, U)
        self.assertNotIn("sin calma", L.veredicto_serie([j], 1)["sugerencia"])


BUENAS_ = T.BUENAS


class FBM1116SinMarcaContesta(unittest.TestCase):
    """FBM1116: la marca «banco contesta» del aparato controlado no llegó (el espejo calló); se juzga con la evidencia que hay."""

    def _sin(self, t):
        return "\n".join(x for x in t.splitlines() if "banco contesta" not in x) + "\n"

    def _con_ice_tableta(self, t):
        return t + T.l_tab(T0 + 14, "medio=webrtc par=PAR2:2 ice=connected tras-reintentos=0") + "\n"

    def test_c1_con_ice_en_las_dos_puntas_y_fin_contestada_cuenta_y_lo_dice(self):
        j = juzga("corte-ip-vuelve", self._con_ice_tableta(self._sin(c1())))
        self.assertTrue(j["valida"], j["motivos_invalida"])
        self.assertTrue(j["cumple"], j["fallos"])
        self.assertIn("ice=connected", j["evidencia_contesta"])
        self.assertIn("contestada=si", j["evidencia_contesta"])
        v = L.veredicto_serie([j, j, j], 3, "c1", "c1")
        self.assertEqual(v["veredicto"], "bien")
        self.assertIn("sin la marca «banco contesta» de la tableta", v["sugerencia"])

    def test_sin_ice_de_la_tableta_sigue_sin_valer(self):
        j = juzga("corte-ip-vuelve", self._sin(c1()))
        self.assertFalse(j["valida"])
        self.assertTrue(any("falta la marca «banco contesta» de la tableta" in x for x in j["motivos_invalida"]))
        self.assertNotIn("evidencia_contesta", j)

    def test_sin_fin_contestada_sigue_sin_valer(self):
        t = self._con_ice_tableta(self._sin(c1()))
        t = "\n".join(x.replace("contestada=si", "contestada=no") for x in t.splitlines()) + "\n"
        self.assertFalse(juzga("corte-ip-vuelve", t)["valida"])

    def test_corte_sin_el_resultado_de_la_tableta_no_da_veredicto_del_corte(self):
        t = self._con_ice_tableta(c1())
        t = "\n".join(x for x in t.splitlines() if not ("banco simulacion corte-ip" in x and "(Maggaboard)" in x)) + "\n"
        j = juzga("corte-ip-vuelve", t)
        self.assertFalse(j["valida"])
        self.assertIsNone(j["cumple"])
        self.assertTrue(any("falta el resultado de «simular-corte-ip» de la tableta" in x for x in j["motivos_invalida"]))
        v = L.veredicto_serie([j, j, j], 3, "c1", "c1")
        self.assertEqual(v["veredicto"], "sin-veredicto")
        self.assertIn("no se puede mostrar que el corte ocurrió", v["sugerencia"])

    def test_c10_sin_la_marca_de_la_mac_con_evidencia_cuenta_sin_medir_el_tiempo(self):
        t = self._sin(c10(conecta=40))
        t += T.l_tab(T0 + 14, "medio=webrtc par=PAR2:2 ice=connected tras-reintentos=0") + "\n"
        t += T.l_mac(T0 + 8 + 30, "fin por=colgar motivo=\"orden\" contestada=si dur-s=30 origen=local via=-") + "\n"
        j = juzga("tableta-llama", t)
        self.assertTrue(j["valida"], j["motivos_invalida"])
        self.assertFalse(any("después de contestar" in x for x in j["fallos"]))
        self.assertIn("de la Mac", j["evidencia_contesta"])

    def test_mudo_camara_sin_marca_de_la_tableta_con_evidencia(self):
        j = juzga("mudo-camara", self._con_ice_tableta(self._sin(mc())) + T.l_mac(T0 + 13, "medio=webrtc par=PAR1:1 ice=connected tras-reintentos=0") + "\n" + T.l_mac(T0 + 8 + 100, 'fin por=colgar motivo="orden" contestada=si dur-s=100 origen=local via=-') + "\n")
        self.assertTrue(j["valida"], j["motivos_invalida"])
        self.assertIn("evidencia_contesta", j)


class FBM1116Nombre(unittest.TestCase):
    """FBM1116: «modo banco» lo usa el dueño para otra cosa; los textos de esta función dicen «modo de pruebas de llamadas»."""

    def test_los_textos_que_lee_una_persona(self):
        ahora = T0
        textos = [L.paso_que_falta({"t": ahora, "llave": True, "objetivo": "a" * 36, "sesion": {"estado": "aceptada"}, "armada": None}, ahora),
                  L.paso_que_falta({"t": ahora, "llave": True, "objetivo": "a" * 36, "sesion": {"estado": "aceptada"},
                                    "armada": {"con": "a" * 36, "hasta": (ahora - 5) * 1000}}, ahora),
                  L.estado_app([], ahora)["motivo"], L.MOTIVOS_RECHAZO["modo-apagado"]]
        self.assertTrue(all(isinstance(x, str) and x for x in textos))
        for x in textos:
            self.assertNotIn("modo banco", x.lower())
        self.assertIn("modo de pruebas de llamadas", textos[0])
        self.assertIn("modo de pruebas de llamadas", textos[3])
        import banco_llamadas as B
        self.assertNotIn("modo banco", B.texto_estado({"series": []}).lower())
        self.assertTrue(B.texto_estado({"series": []}).startswith("Banco de pruebas de llamadas"))
