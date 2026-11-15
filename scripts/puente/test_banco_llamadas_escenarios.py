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
        g = {"motivo": "la app de la Mac no está en modo banco o no sondea desde las 03:00"}
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
