#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""(BAN1114C) La lógica pura de la serie de llamadas automáticas: marcas, calma, juicio y veredicto. Sin aparatos ni disco real."""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import banco_llamadas_logica as L  # noqa: E402
import banco_pruebas_logica as BL  # noqa: E402

AQUI = os.path.dirname(os.path.abspath(__file__))
NEU_MAC = "aaaa0000-0000-4000-8000-000000000001"
NEU_TAB = "aaaa0002-0000-4000-8000-000000000003"
T0 = 1_794_600_000.0
SERIE = "s20261114-0300"
ESC = "ble-video-2min"


def iso(t):
    return BL._a_iso(t)[:-1] + ".000Z"


def l_mac(t, msg):
    return "%s web %s · llamada · b3 · neurona %s · %s" % (iso(t + 1), iso(t), NEU_TAB, msg)


def l_app(t, msg):
    """Una marca de la app sin enlace de llamada (armada, sondeo…): así las escribe `anotarLlamada` sin neurona."""
    return "%s web %s · llamada · %s" % (iso(t + 1), iso(t), msg)


def l_tab(t, msg):
    return "%s web (Maggaboard) %s · web · llamada · b1 · neurona %s · %s" % (iso(t + 9), iso(t), NEU_MAC, msg)


def parsear(texto):
    return [x for x in (BL.parse_linea(s) for s in texto.splitlines()) if x]


def lado(f, t0, dur, fps=4, inventado=2, perdida=1.0, negros=0, suelo=False):
    """Líneas de UN lado de una llamada buena: voz y vídeo cada 10 s (contadores acumulados)."""
    out = []
    for i, t in enumerate(range(int(t0), int(t0 + dur) + 1, 10)):
        k = i + 1
        out.append(f(t, "medio=enlace-datos voz-datos tx n=3 opus=10k 60/180ms texto=16k b1 red otro:perd=1%%/tarde=0%% cabe=170k enlace=202k+56ms/139 "
                        "entregado=54k esc=9.9x681 espera=108/130ms paq=%d tiradas=25%s" % (k * 50, " BAJO-SUELO" if suelo else "")))
        out.append(f(t, "medio=enlace-datos voz-datos rx paq=%d perd=%s%% tardias=0 ocultadas=+0 inventado=%s%% jitter=40ms" % (k * 50, perdida, inventado)))
        out.append(f(t, "medio=video-datos video-datos tx capturados=%d codificados=%d enviados=%d descartados=0 clave=1 kbps=14 negros=%d" % (
            k * 40, k * 40, k * 40, negros)))
        out.append(f(t, "medio=video-datos video-datos rx paquetes=%d cuadros=%d decodificados=%d pintados=%d errores=0 ultimoError=ninguno" % (
            k * 40, k * 40, k * 40, k * 10 * fps)))
    return out


def llamada(serie=SERIE, n=1, t0=T0, dur=120, mac=True, tab=True, marca_inicio=True, marca_fin=True, marca_contesta=True, webrtc=False,
            cuelga="mac", fps=4, inventado=2, extra=()):
    """El texto del registro de UNA llamada de la serie, con las marcas del banco. `dur` = lo que dura el guion."""
    ini = t0 + 8
    fin = ini + dur
    ls = []
    if marca_inicio:
        ls.append(l_mac(t0, "banco inicio esc=%s serie=%s n=%d medio=sin-ip-desde-inicio tipo=video" % (ESC, serie, n)))
    if marca_contesta:
        ls.append(l_tab(t0 + 5, "banco contesta esc=%s serie=%s n=%d camara=si" % (ESC, serie, n)))
    ls.append(l_mac(t0 + 6, "medio=enlace-datos par=PAR1:111111 codec=opus via=ble cifrada motivo=arranque"))
    ls.append(l_mac(t0 + 6, "medio=video-datos par=PAR1:111111 el-otro-ve-mi-video-webrtc=no"))
    if webrtc:
        ls.append(l_mac(t0 + 7, "medio=webrtc par=PAR1:111111"))
    if mac:
        ls += lado(l_mac, ini, dur, fps=fps, inventado=inventado)
    if tab:
        ls += lado(l_tab, ini, dur, fps=fps, inventado=inventado)
    ls.append(l_mac(fin, "senal-enviada colgar via=ble") if cuelga == "mac" else l_mac(fin, "senal-recibida colgar"))
    ls.append(l_tab(fin, "senal-recibida colgar") if cuelga == "mac" else l_tab(fin, "senal-enviada colgar via=ble"))
    if marca_fin:
        ls.append(l_mac(fin + 1, "banco fin esc=%s serie=%s n=%d cuelga=%s dur_s=%d" % (ESC, serie, n, cuelga, dur)))
    ls += list(extra)
    return "\n".join(ls) + "\n"


def lec(t=T0, **k):
    base = {"t": t, "carga1": 1.0, "presion": 1, "libre_pct": 60.0, "swap_pct": 40.0, "swapouts_min": 10.0, "disco_gb": 50.0, "pesados": []}
    base.update(k)
    return base


U = L.Umbrales(env={}, nucleos=8)
BUENAS = [lec(T0 + 30 * i) for i in range(5)]


class Marcas(unittest.TestCase):
    EJEMPLOS = {
        "armada": "banco armada con=%s hasta=2026-11-14T07:00:00Z restantes=40" % NEU_TAB,
        "apagada": "banco apagada motivo=pulso-apagar",
        "sondeo": "banco sondeo orden=ninguna",
        "inicio": "banco inicio esc=ble-video-2min serie=s20261114-0300 n=1 medio=sin-ip-desde-inicio tipo=video",
        "contesta": "banco contesta esc=ble-video-2min serie=s20261114-0300 n=1 camara=si",
        "fin": "banco fin esc=ble-video-2min serie=s20261114-0300 n=1 cuelga=mac dur_s=121",
        "calma": "banco calma serie=s20261114-0300 n=1 fase=inicio carga1=1.2 presion=1 libre=48% swap=40% swapouts_min=10",
        "rechaza": "banco rechaza esc=ble-video-2min serie=s20261114-0300 n=1 motivo=falta-permiso",
    }

    def test_cada_evento_se_lee_de_una_linea_real_del_registro(self):
        for ev, msg in self.EJEMPLOS.items():
            linea = l_mac(T0, msg) if ev in ("inicio", "fin", "rechaza", "calma") else l_app(T0, msg)
            ls = parsear(linea)
            self.assertEqual(len(ls), 1, ev)
            self.assertEqual(ls[0]["tipo"], "llamada")
            mk = L.parse_marca(ls[0]["msg"])
            self.assertIsNotNone(mk, ev)
            self.assertEqual(mk["evento"], ev)
        mk = L.parse_marca(self.EJEMPLOS["fin"])
        self.assertEqual((mk["esc"], mk["serie"], mk["n"], mk["campos"]["cuelga"], mk["campos"]["dur_s"]), (ESC, SERIE, 1, "mac", "121"))
        self.assertEqual(L.parse_marca(self.EJEMPLOS["rechaza"])["motivo"], "falta-permiso")

    def test_una_marca_mal_formada_no_es_marca(self):
        malas = ["banco inicio esc=ble-video-2min serie=s1 n=1",                       # serie demasiado corta
                 "banco inicio esc=ble-video-2min serie=s20261114-0300",               # sin n
                 "banco inicio esc=ble-video-2min serie=s20261114-0300 n=0",
                 "banco inicio esc=ble-video-2min serie=s20261114-0300 n=1000",
                 "banco inicio esc=BLE serie=s20261114-0300 n=1",
                 "banco rechaza esc=ble-video-2min serie=s20261114-0300 n=1 motivo=porque-si",
                 "banco fin esc=ble-video-2min serie=s20261114-0300 n=1 cuelga=nadie",
                 "banco contesta esc=ble-video-2min serie=s20261114-0300 n=1 camara=quiza",
                 "banco armada hasta=2026-11-14T07:00:00Z",                              # sin la neurona
                 "banco explota", "bancos inicio", "camara lista n=5", "", None]
        for x in malas:
            self.assertIsNone(L.parse_marca(x), x)

    def test_marcas_de_lineas_ordena_y_dice_de_que_aparato(self):
        txt = l_tab(T0 + 5, self.EJEMPLOS["contesta"]) + "\n" + l_mac(T0, self.EJEMPLOS["inicio"]) + "\n" + l_mac(T0, "camara lista n=1")
        ms = L.marcas_de_lineas(parsear(txt))
        self.assertEqual([(m["evento"], m["aparato"]) for m in ms], [("inicio", "mac"), ("contesta", "maggaboard")])

    def test_estado_app_armada_viva_y_el_texto_de_la_negativa(self):
        arm = l_app(T0, self.EJEMPLOS["armada"].replace("2026-11-14T07:00:00Z", iso(T0 + 4 * 3600)[:-5] + "Z"))
        ms = L.marcas_de_lineas(parsear(arm + "\n" + l_app(T0 + 60, "banco sondeo orden=ninguna")))
        e = L.estado_app(ms, T0 + 100, 90)
        self.assertTrue(e["armada"] and e["viva"] and e["motivo"] is None)
        self.assertEqual(e["con"], NEU_TAB)
        e = L.estado_app(ms, T0 + 200, 90)                           # el último sondeo es de hace 140 s
        self.assertTrue(e["armada"] and not e["viva"])
        self.assertRegex(e["motivo"], r"^la app de la Mac no está en modo banco o no sondea desde las \d\d:\d\d$")
        e = L.estado_app([], T0, 90)
        self.assertFalse(e["armada"] or e["viva"])
        self.assertIn("no hay ninguna marca", e["motivo"])

    def test_apagada_o_vencida_no_cuenta_como_armada(self):
        ms = L.marcas_de_lineas(parsear(l_app(T0, self.EJEMPLOS["armada"]) + "\n" + l_app(T0 + 10, "banco apagada motivo=vencio") + "\n"
                                        + l_app(T0 + 20, "banco sondeo orden=ninguna")))
        self.assertFalse(L.estado_app(ms, T0 + 30, 90)["armada"])
        vencida = L.marcas_de_lineas(parsear(l_app(T0, "banco armada con=%s hasta=%s restantes=3" % (NEU_TAB, iso(T0 + 50)[:-5] + "Z"))))
        self.assertFalse(L.estado_app(vencida, T0 + 60, 90)["armada"])

    def test_la_marca_de_calma_que_escribe_la_app_se_lee_de_vuelta(self):
        txt = L.texto_calma_marca(lec(), SERIE, 1, "inicio")
        mk = L.parse_marca(txt)
        self.assertEqual((mk["evento"], mk["campos"]["libre"], mk["campos"]["swapouts_min"]), ("calma", "60%", "10"))

    def test_construir_llamada_trae_escenario_serie_y_n_solo_con_marca(self):
        con = BL.construir_llamada(parsear(llamada(n=4)), [])
        self.assertEqual((con["escenario"], con["serie"], con["n"]), (ESC, SERIE, 4))
        sin = BL.construir_llamada([x for x in parsear(llamada()) if "banco " not in x["msg"]], [])
        self.assertNotIn("serie", sin)
        self.assertNotIn("escenario", sin)


class Calma(unittest.TestCase):
    def test_lectura_buena_empieza_y_cada_umbral_la_rompe(self):
        self.assertEqual(L.evaluar_calma(lec(), U, "inicio")[:2], (True, []))
        casos = [({"carga1": 4.5}, "carga 1 min 4,5"), ({"presion": 2}, "presión de memoria 2"), ({"libre_pct": 20.0}, "memoria libre 20"),
                 ({"swap_pct": 90.0}, "swap en uso 90"), ({"swapouts_min": 3000.0}, "swap activo 3000"), ({"disco_gb": 7.0}, "disco libre 7"),
                 ({"pesados": ["el type check"]}, "trabajo pesado")]
        for k, texto in casos:
            ok, fallos, _ = L.evaluar_calma(lec(**k), U, "inicio")
            self.assertFalse(ok, k)
            self.assertIn(texto, fallos[0].replace(".", ","))
        self.assertEqual(L.evaluar_calma(lec(carga1=4.0), U, "inicio")[0], True)      # el límite cuenta como bueno

    def test_lo_que_no_se_pudo_leer_no_pasa_en_silencio(self):
        for k in ("carga1", "presion", "libre_pct", "swap_pct", "swapouts_min", "disco_gb"):
            ok, fallos, _ = L.evaluar_calma(lec(**{k: None}), U, "inicio")
            self.assertFalse(ok, k)
            self.assertIn("no pude leer" if k != "swapouts_min" else "sin dato", fallos[0])
        ok, fallos, notas = L.evaluar_calma(lec(presion=None, libre_pct=None), U, "durante")
        self.assertTrue(ok)                       # durante la llamada falta de lectura = nota, y se dice
        self.assertEqual(len(notas), 2)

    def test_durante_la_llamada_los_umbrales_son_otros(self):
        self.assertTrue(L.evaluar_calma(lec(carga1=5.9), U, "durante")[0])
        self.assertFalse(L.evaluar_calma(lec(carga1=6.1), U, "durante")[0])
        self.assertTrue(L.evaluar_calma(lec(presion=2), U, "durante")[0])
        self.assertIn("presión de memoria en aviso (2)", L.evaluar_calma(lec(presion=2), U, "durante")[2])
        self.assertFalse(L.evaluar_calma(lec(presion=4), U, "durante")[0])
        self.assertTrue(L.evaluar_calma(lec(swapouts_min=3900.0), U, "durante")[0])
        self.assertFalse(L.evaluar_calma(lec(swapouts_min=4100.0), U, "durante")[0])
        self.assertTrue(L.evaluar_calma(lec(disco_gb=6.5), U, "durante")[0])
        self.assertFalse(L.evaluar_calma(lec(disco_gb=5.5), U, "durante")[0])
        self.assertTrue(L.evaluar_calma(lec(libre_pct=10.0, swap_pct=95.0), U, "durante")[0])      # solo se anotan

    def test_los_umbrales_se_cambian_con_variables_de_entorno(self):
        u = L.Umbrales(env={"STARSEED_BANCO_CARGA_INI": "9", "STARSEED_BANCO_DISCO_INI_GB": "100", "STARSEED_BANCO_LECTURAS": "2"}, nucleos=8)
        self.assertEqual((u.carga_ini, u.disco_ini_gb, u.lecturas), (9.0, 100.0, 2))
        self.assertFalse(L.evaluar_calma(lec(), u, "inicio")[0])          # 50 GB < 100 GB

    def test_tres_lecturas_buenas_seguidas_en_dos_minutos(self):
        h = lambda *oks: [{"t": T0 + 30 * i, "ok": ok, "fallos": [] if ok else ["presión de memoria 2 (se pide 1, normal)"]} for i, ok in enumerate(oks)]
        self.assertFalse(L.calma_para_empezar(h(True, True), U)[0])
        self.assertTrue(L.calma_para_empezar(h(True, True, True), U)[0])
        self.assertFalse(L.calma_para_empezar(h(True, True, False, True, True), U)[0])        # una mala rompe la racha
        self.assertTrue(L.calma_para_empezar(h(True, True, False, True, True, True), U)[0])
        motivo = L.calma_para_empezar(h(True, True, False), U)[1]
        self.assertIn("presión de memoria 2", motivo)
        lento = [{"t": T0 + 70 * i, "ok": True, "fallos": []} for i in range(3)]                # 140 s entre la primera y la última
        self.assertFalse(L.calma_para_empezar(lento, U)[0])

    def test_lecturas_de_macos(self):
        self.assertAlmostEqual(L.parse_swapusage("vm.swapusage: total = 10240.00M  used = 8904.00M  free = 1336.00M  (encrypted)"), 86.95, 1)
        self.assertIsNone(L.parse_swapusage("basura"))
        self.assertEqual(L.parse_memoria_libre("The system has 8589934592 (2097152 pages)\nSystem-wide memory free percentage: 39%\n"), 39.0)
        self.assertEqual(L.parse_swapouts("Pages free: 1.\nSwapouts:                        123456.\n"), 123456.0)
        self.assertIsNone(L.parse_swapouts("sin nada"))

    def test_swap_activo_pide_una_muestra_de_hace_casi_un_minuto(self):
        m = []
        self.assertIsNone(L.tasa_swapouts(m, T0, 1000))
        self.assertIsNone(L.tasa_swapouts(m, T0 + 30, 1500))
        self.assertAlmostEqual(L.tasa_swapouts(m, T0 + 60, 2000), 1000.0)         # 1000 páginas en 60 s
        self.assertIsNone(L.tasa_swapouts(m, T0 + 90, None))


class Juicio(unittest.TestCase):
    def juzga(self, texto, lecturas=None, serie=SERIE, n=1):
        ls = parsear(texto)
        return L.juzgar_llamada(ESC, serie, n, ls, [x for x in ls if x["canal"] == "ble"], BUENAS if lecturas is None else lecturas, U)

    def test_una_llamada_buena_es_valida_y_cumple_pero_siempre_simulada(self):
        j = self.juzga(llamada())
        self.assertEqual((j["valida"], j["cumple"], j["fallos"], j["motivos_invalida"]), (True, True, [], []))
        self.assertTrue(j["c3"]["cumple"])
        self.assertIs(j["medio_real"], False)
        self.assertIs(j["simulado"], True)
        self.assertEqual(j["cuelga"], "mac")
        self.assertEqual(sorted(j["numeros"]), ["mac", "maggaboard"])
        self.assertGreaterEqual(j["numeros"]["mac"]["fps_recibidos_med"], 3)

    def test_criterios_de_c2_uno_por_uno(self):
        casos = [(dict(fps=2), "fps recibidos"), (dict(inventado=15), "voz inventada"), (dict(webrtc=True), "medio=webrtc"),
                 (dict(cuelga="tableta"), "el guion dice que cuelga mac"), (dict(dur=100), "duró")]
        for k, texto in casos:
            j = self.juzga(llamada(**k))
            self.assertTrue(j["valida"], (k, j["motivos_invalida"]))
            self.assertFalse(j["cumple"], k)
            self.assertTrue(any(texto in f for f in j["fallos"]), (k, j["fallos"]))

    def test_c3_cuenta_reconectando_y_ruta_ip_nueva(self):
        j = self.juzga(llamada(extra=[l_mac(T0 + 40, "medio=webrtc par=PAR1:111111 ruta IP nueva (Wi-Fi directo): se reintenta WebRTC sin colgar intento=1"),
                                      l_mac(T0 + 50, "Reconectando…")]))
        self.assertTrue(j["cumple"])                                  # c2 no mira esas líneas
        self.assertFalse(j["c3"]["cumple"])
        self.assertEqual(len(j["c3"]["fallos"]), 2)

    def test_evidencia_incompleta_de_la_tableta_no_cuenta(self):
        j = self.juzga(llamada(tab=False, extra=[l_tab(T0 + 20, "banco contesta esc=%s serie=%s n=1 camara=si" % (ESC, SERIE))]))
        self.assertFalse(j["valida"])
        self.assertIsNone(j["cumple"])
        self.assertTrue(any("tableta" in x for x in j["motivos_invalida"]))
        # la tableta dio señal pero no después de la mitad de la llamada
        temprana = [l for l in parsear(llamada()) if not (l["aparato"] != "mac" and "rx" in l["msg"] and l["t"] >= T0 + 60)]
        j = L.juzgar_llamada(ESC, SERIE, 1, temprana, [], BUENAS, U)
        self.assertFalse(j["valida"])
        self.assertTrue(any("después de la mitad" in x for x in j["motivos_invalida"]), j["motivos_invalida"])
        self.assertFalse(L.evidencia_completa(temprana, SERIE, 1)[0])
        self.assertTrue(L.evidencia_completa(parsear(llamada()), SERIE, 1)[0])

    def test_faltan_marcas_o_contesta(self):
        for k, texto in (("marca_inicio", "banco inicio"), ("marca_fin", "banco fin"), ("marca_contesta", "banco contesta")):
            j = self.juzga(llamada(**{k: False}))
            self.assertFalse(j["valida"], k)
            self.assertTrue(any(texto in x for x in j["motivos_invalida"]), (k, j["motivos_invalida"]))

    def test_si_la_tableta_rechazo_la_llamada_dice_por_que(self):
        txt = l_mac(T0, "banco inicio esc=%s serie=%s n=1 medio=sin-ip-desde-inicio tipo=video" % (ESC, SERIE)) + "\n" + \
              l_mac(T0 + 4, "banco rechaza esc=%s serie=%s n=1 motivo=otra-llamada" % (ESC, SERIE)) + "\n"
        j = self.juzga(txt)
        self.assertFalse(j["valida"])
        self.assertTrue(any("otra llamada en curso" in x for x in j["motivos_invalida"]))

    def test_si_la_mac_no_estuvo_en_calma_durante_la_llamada_no_vale(self):
        mala = BUENAS[:2] + [lec(T0 + 60, carga1=7.5)] + BUENAS[3:]
        j = self.juzga(llamada(), mala)
        self.assertFalse(j["valida"])
        self.assertTrue(any("carga 1 min 7,5" in x.replace(".", ",") for x in j["motivos_invalida"]))
        self.assertFalse(self.juzga(llamada(), [])["valida"])                    # sin lecturas tampoco
        # un 2 de presión solo se anota
        j = self.juzga(llamada(), [lec(T0, presion=2)])
        self.assertTrue(j["valida"])
        self.assertIn("presión de memoria en aviso (2)", j["calma"]["notas"])

    def test_otra_llamada_de_otra_serie_no_se_mezcla(self):
        txt = llamada(serie="s20261113-2200", n=1, t0=T0 - 900) + llamada(n=1)
        j = self.juzga(txt)
        self.assertTrue(j["valida"] and j["cumple"])
        self.assertEqual(self.juzga(txt, n=2)["valida"], False)


def leer_fixture():
    with open(os.path.join(AQUI, "fixtures", "enlaces-log-ronda41-1915.txt"), encoding="utf-8") as f:
        return f.read()


class RegistroReal(unittest.TestCase):
    """La llamada de las 19:15:13 del 13-11 (prueba 41), recortada y con ids e IP inventados, con las marcas que habría llevado."""

    def lineas(self, completar=False):
        texto = leer_fixture()
        t0 = BL._a_epoch("2026-11-13T19:15:13.000Z")
        marcas = [l_mac(t0, "banco inicio esc=%s serie=%s n=1 medio=sin-ip-desde-inicio tipo=video" % (ESC, SERIE)),
                  l_tab(t0 + 5, "banco contesta esc=%s serie=%s n=1 camara=si" % (ESC, SERIE)),
                  l_mac(BL._a_epoch("2026-11-13T19:19:59.900Z"), "banco fin esc=%s serie=%s n=1 cuelga=mac dur_s=286" % (ESC, SERIE))]
        if completar:   # lo que la tableta no llegó a mandar: sus últimas líneas, inventadas, para que el juicio pueda dar números
            tf = BL._a_epoch("2026-11-13T19:19:50.000Z")
            marcas += [l_tab(tf, "medio=video-datos video-datos rx paquetes=5 cuadros=5 decodificados=5 pintados=5 errores=0 ultimoError=ninguno"),
                       l_tab(tf, "medio=enlace-datos voz-datos rx paq=300 perd=0.5% tardias=0 ocultadas=+0 inventado=3% jitter=40ms"),
                       l_tab(tf, "medio=video-datos video-datos tx capturados=9 codificados=9 enviados=8 descartados=1 clave=1 kbps=5 negros=0")]
        return parsear(texto + "\n".join(marcas) + "\n")

    def test_el_fixture_es_corto_y_no_lleva_ids_ni_ip_reales(self):
        texto = leer_fixture()
        self.assertLess(len(texto.splitlines()), 150)
        for real in ("62d50afc", "e0b9faf2", "a5a21893", "14f9ce64"):
            self.assertNotIn(real, texto)
        self.assertNotRegex(texto, r"\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b")

    def juzga(self, ls):
        return L.juzgar_llamada(ESC, SERIE, 1, ls, [x for x in ls if x["canal"] == "ble"], BUENAS, U)

    def test_con_el_registro_tal_cual_la_evidencia_de_la_tableta_esta_incompleta(self):
        j = self.juzga(self.lineas())
        self.assertFalse(j["valida"])
        self.assertTrue(any("evidencia de la tableta incompleta" in x for x in j["motivos_invalida"]), j["motivos_invalida"])
        self.assertIs(j["medio_real"], False)

    def test_con_la_evidencia_completa_la_llamada_real_no_cumple_y_dice_por_que(self):
        j = self.juzga(self.lineas(completar=True))
        self.assertTrue(j["valida"], j["motivos_invalida"])
        self.assertFalse(j["cumple"])
        texto = " | ".join(j["fallos"])
        self.assertIn("medio=webrtc", texto)                 # hubo una conexión por WebRTC
        self.assertIn("fps recibidos", texto)
        self.assertIn("voz inventada", texto)
        self.assertIn("BAJO-SUELO", texto)
        self.assertFalse(j["c3"]["cumple"])
        self.assertTrue(any("ruta IP nueva" in x for x in j["c3"]["fallos"]))
        self.assertEqual(j["id"], "llamada-20261113T191513")


class VeredictoDeSerie(unittest.TestCase):
    def juicios(self, n, malas=0, invalidas=0, c3_malas=0):
        out = []
        for i in range(n):
            valida = i >= invalidas
            mala = valida and i < invalidas + malas
            mala3 = valida and i < invalidas + c3_malas
            out.append({"n": i + 1, "id": "llamada-x%d" % i, "esc": ESC, "valida": valida, "cumple": (not mala) if valida else None,
                        "fallos": ["1 fps recibidos (se piden 3 o más)"] if mala else [], "motivos_invalida": [] if valida else ["la Mac no estuvo en calma"],
                        "c3": {"cumple": (not mala3) if valida else None, "fallos": ["1 línea «ruta IP nueva»"] if mala3 else []}})
        return out

    def test_nueve_de_diez_es_bien(self):
        v = L.veredicto_serie(self.juicios(10, malas=1), 10)
        self.assertEqual((v["veredicto"], v["validas"], v["cumplen"]), ("bien", 10, 9))
        self.assertIn("simulado", v["sugerencia"])
        self.assertIs(v["medio_real"], False)

    def test_ocho_de_diez_es_falla_con_la_primera_que_fallo(self):
        v = L.veredicto_serie(self.juicios(10, malas=2), 10)
        self.assertEqual(v["veredicto"], "falla")
        self.assertIn("llamada-x0", v["sugerencia"])
        self.assertIn(ESC, v["sugerencia"])
        self.assertIn("1 fps recibidos", v["sugerencia"])

    def test_siete_validas_es_sin_veredicto_y_dice_por_que_no_valieron(self):
        v = L.veredicto_serie(self.juicios(10, invalidas=3), 10)
        self.assertEqual((v["veredicto"], v["validas"], v["no_validas"]), ("sin-veredicto", 7, 3))
        self.assertIn("7 llamadas válidas de 10", v["sugerencia"])
        self.assertIn("la Mac no estuvo en calma", v["sugerencia"])

    def test_ocho_validas_y_todas_cumplen_es_bien(self):
        self.assertEqual(L.veredicto_serie(self.juicios(10, invalidas=2), 10)["veredicto"], "bien")

    def test_con_cinco_repeticiones_hacen_falta_cinco_y_cinco(self):
        self.assertEqual(L.veredicto_serie(self.juicios(5), 5)["veredicto"], "bien")
        self.assertEqual(L.veredicto_serie(self.juicios(5, malas=1), 5)["veredicto"], "sin-veredicto")
        self.assertEqual(L.veredicto_serie(self.juicios(5, malas=2), 5)["veredicto"], "falla")
        self.assertEqual(L.veredicto_serie(self.juicios(5, invalidas=1), 5)["veredicto"], "sin-veredicto")

    def test_c3_se_juzga_con_su_propia_clave(self):
        js = self.juicios(10, c3_malas=3)
        self.assertEqual(L.veredicto_serie(js, 10)["veredicto"], "bien")
        v3 = L.veredicto_serie(js, 10, "c3", "c3")
        self.assertEqual((v3["comprobacion"], v3["veredicto"]), ("c3", "falla"))
        self.assertIn("ruta IP nueva", v3["sugerencia"])

    def test_serie_incompleta_nunca_es_bien_y_lo_dice(self):
        v = L.veredicto_serie(self.juicios(4), 10, incompleta_k=4)
        self.assertEqual(v["veredicto"], "sin-veredicto")
        self.assertIn("serie incompleta: 4 de 10", v["sugerencia"])
        self.assertEqual(L.veredicto_serie([], 10)["veredicto"], "sin-veredicto")


class Orden(unittest.TestCase):
    def test_la_orden_es_la_del_contrato(self):
        o = L.construir_orden(ESC, SERIE, 3, 10, NEU_TAB, T0, 120)
        self.assertEqual(sorted(o), sorted(["v", "serie", "n", "de_n", "escenario", "para", "tipo", "medio", "guion", "dur_s", "creada", "caduca"]))
        self.assertEqual((o["v"], o["n"], o["de_n"], o["tipo"], o["medio"], o["dur_s"]), (1, 3, 10, "video", "sin-ip-desde-inicio", 120))
        self.assertEqual(o["guion"], [{"t_s": 120, "quien": "mac", "accion": "colgar"}])
        self.assertEqual(BL._a_epoch(o["caduca"]) - BL._a_epoch(o["creada"]), 120)
        acciones = {"mudo", "micro", "camara-off", "camara-on", "corte-ip", "vuelve-ip", "colgar"}
        self.assertTrue(all(g["accion"] in acciones and g["quien"] in ("mac", "tableta", "ambos") for g in o["guion"]))

    def test_id_de_serie_cumple_la_gramatica(self):
        self.assertRegex(L.id_serie(T0), r"^s\d{8}-\d{4}$")


if __name__ == "__main__":
    unittest.main()
