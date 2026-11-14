#!/usr/bin/env python3
"""(PRB1111W) El banco de pruebas con un extracto saneado del registro real de enlaces (11-11, prueba.39)."""
import json
import os
import re
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import banco_pruebas as BP  # noqa: E402
import banco_pruebas_logica as B  # noqa: E402
import comprobaciones_prueba as C  # noqa: E402

QUI = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fixtures", "enlaces-log-prueba39.txt")
TEXTO = open(QUI, encoding="utf-8").read()
MAC37 = {"version": "0.5.1-prueba.37", "app_abierta": True, "ultimo_arranque": None, "errores_arranque": []}
# la Mac corre la versión desde ANTES de la llamada del extracto (19:19Z del 11) / desde DESPUES de ella (01:50Z del 12)
ANTES, DESPUES = "2026-11-11T10:00:00Z", "2026-11-12T01:50:00Z"
MAC_VIEJA = dict(MAC37, version_desde=ANTES, ultimo_arranque="2026-11-11T10:00:30Z")


def comprobaciones(version_prueba="39", senales=None):
    d, _ = C.registrar(None, version_prueba, ["x%d" % i for i, _ in enumerate(senales or C.SENALES)], version="0.5.1-prueba." + version_prueba)
    for c, s in zip(d["pruebas"][version_prueba]["comprobaciones"], senales or C.SENALES):
        c["senal"] = s
    return d


class Registro(unittest.TestCase):
    def test_parsea_las_lineas_de_las_dos_puntas(self):
        ls = [B.parse_linea(x) for x in TEXTO.splitlines()]
        self.assertTrue(all(ls))
        tab = [l for l in ls if l["aparato"] == "maggaboard"]
        self.assertTrue(tab and all(l["nombre"] == "Maggaboard" for l in tab))
        self.assertTrue(any(l["canal"] == "ble" and l["tipo"] == "l2cap-kbps" for l in ls))
        self.assertIsNone(B.parse_linea("basura sin forma"))

    def test_una_llamada_con_las_dos_puntas(self):
        b = B.construir(TEXTO, MAC37, {"pruebas": {}}, 0)
        self.assertEqual(len(b["llamadas"]), 1)          # la línea suelta «inicio paso» de la tablet no es una llamada
        ll = b["llamadas"][0]
        self.assertTrue(ll["terminada"]); self.assertEqual(ll["con"], "maggaboard"); self.assertTrue(80 <= ll["duracion_s"] <= 100)
        self.assertIn("enlace-datos", ll["medios"]); self.assertIn("video-datos", ll["medios"])
        mac, tab = ll["lados"]["mac"], ll["lados"]["maggaboard"]
        self.assertEqual((mac["voz"]["nivel_min"], mac["voz"]["nivel_max"]), (4, 5))
        self.assertEqual((mac["voz"]["opus_kbps_min"], mac["voz"]["opus_kbps_max"]), (6, 8))
        self.assertEqual(mac["voz"]["espera_voz_ms_max"], 376)
        self.assertEqual(mac["voz"]["perdida_pct_max"], 3.3)
        self.assertGreater(mac["voz"]["mudo_s"], 0)
        self.assertEqual(mac["video"]["fps_activo"]["max"], 4)
        self.assertEqual(mac["video"]["enviados"], 26)
        self.assertTrue(mac["video"]["pausas"] and mac["video"]["pausas"][0]["motivo"] == "suelo")
        self.assertEqual(mac["camara"]["abierta"], "FaceTime HD Camera")
        self.assertEqual(tab["video"]["pintados"], 26)
        self.assertEqual(tab["video"]["fps_activo"], {"min": None, "med": None, "max": None})   # null = no lo trae el extracto
        self.assertGreaterEqual(ll["kbps_rapido"]["max"], 234)

    def test_las_lineas_crudas_salen_limpias(self):
        b = B.construir(TEXTO, MAC37, {"pruebas": {}}, 0)
        for lado in b["llamadas"][0]["lados"].values():
            self.assertTrue(lado["lineas"]); self.assertLessEqual(len(lado["lineas"]), 6)
            for l in lado["lineas"]:
                self.assertNotRegex(l, r"[0-9a-f]{8}-[0-9a-f]{4}-")
                self.assertNotIn("/Users/", l)
        self.assertNotIn("/Users/", json.dumps(b))

    def test_aparatos_mac_primero_y_version_desconocida_de_la_tablet(self):
        b = B.construir(TEXTO, MAC37, {"pruebas": {}}, 0)
        self.assertEqual([a["id"] for a in b["aparatos"]], ["mac", "maggaboard"])
        self.assertEqual(b["aparatos"][0]["version"], "0.5.1-prueba.37")
        self.assertIsNone(b["aparatos"][1]["version"]); self.assertIsNone(b["aparatos"][1]["version_de"])

    def test_texto_vacio_o_roto_no_rompe(self):
        for t in ("", "\n\nlinea rara\n", "2026-11-11T19:19:45.694Z web algo"):
            b = B.construir(t, MAC37, {"pruebas": {}}, 0)
            self.assertEqual(b["llamadas"], [])


class Sugerencias(unittest.TestCase):
    def sugerir(self, version, comp):
        mac = dict(MAC_VIEJA, version=version)
        return B.construir(TEXTO, mac, comp, 0)

    def test_nunca_se_propone_para_otra_version_que_la_instalada(self):
        b = self.sugerir("0.5.1-prueba.37", comprobaciones("39"))
        self.assertEqual(b["sugerencias"], [])
        self.assertIn("instalada la 0.5.1-prueba.37", b["sugerencias_nota"])

    def test_sin_senales_lo_dice(self):
        d, _ = C.registrar(None, 39, ["algo"])
        b = self.sugerir("0.5.1-prueba.39", d)
        self.assertEqual(b["sugerencias"], []); self.assertIn("ninguna", b["sugerencias_nota"].lower())

    def test_con_la_version_instalada_hay_sugerencias_razonadas(self):
        b = self.sugerir("0.5.1-prueba.39", comprobaciones("39"))
        por = {s["senal"]: s for s in b["sugerencias"]}
        self.assertEqual(por["llamada-ble"]["veredicto"], "bien")
        self.assertEqual(por["video-sin-negro"]["veredicto"], "bien")
        self.assertEqual(por["camara-abre"]["veredicto"], "bien")
        self.assertEqual(por["video-fps-ble"]["veredicto"], "falla")          # 0,9 imágenes/s medias en la Mac, 0 en la tablet
        self.assertIn("llamada-2026", por["video-fps-ble"]["llamada"])
        for s in b["sugerencias"]:
            self.assertIn(s["veredicto"], ("bien", "falla")); self.assertTrue(s["motivo"])
            self.assertEqual(s["prueba"], 39)

    def test_una_sugerencia_no_marca_nada(self):
        d = comprobaciones("39")
        antes = json.dumps(d, sort_keys=True)
        self.sugerir("0.5.1-prueba.39", d)
        self.assertEqual(json.dumps(d, sort_keys=True), antes)
        self.assertTrue(all(c["estado"] == "pendiente" for c in d["pruebas"]["39"]["comprobaciones"]))

    def test_arranque_limpio_y_con_errores(self):
        mac = dict(MAC_VIEJA, version="0.5.1-prueba.39")
        b = B.construir("", mac, comprobaciones("39", ["arranque-limpio"]), 0)
        self.assertEqual(b["sugerencias"][0]["veredicto"], "bien")
        mac["errores_arranque"] = [{"t": "2026-11-12T00:00:00Z", "texto": "EADDRINUSE 47610"}]
        b = B.construir("", mac, comprobaciones("39", ["arranque-limpio"]), 0)
        self.assertEqual(b["sugerencias"][0]["veredicto"], "falla")

    def test_resumen_para_pedir_arreglo(self):
        b = self.sugerir("0.5.1-prueba.39", comprobaciones("39"))
        r = B.resumen_texto(b, 39, "c1")
        self.assertIn("Esta Mac", r); self.assertIn("Última llamada", r)
        self.assertNotIn("/Users", r)
        self.assertIn("Sin evidencia", B.resumen_texto(None))


def linea_ble(t, quien, ev="l2cap-kbps"):
    tag = "" if quien == "mac" else " (Maggaboard)"
    return "%s ble%s %s enlace=b1 neurona=00000000-0000-4000-8000-0000000000a1 · kbps=300" % (t, tag, ev)


def hora_de_enlace(minutos, tablet=True, cierres=0, desde="2026-11-12T02:00:00"):
    """Un registro de `minutos` de enlace: una línea por minuto de la Mac (y de la tablet si `tablet`)."""
    from datetime import datetime, timedelta
    t0, out = datetime.fromisoformat(desde), []
    for i in range(minutos + 1):
        t = (t0 + timedelta(minutes=i)).strftime("%Y-%m-%dT%H:%M:%S.000Z")
        out.append(linea_ble(t, "mac"))
        if tablet:
            out.append(linea_ble(t, "tablet"))
        if i and i % 10 == 0 and cierres:
            out.append(linea_ble(t, "mac", "enlace-cerrado")); cierres -= 1
    return "\n".join(out)


MAC39_HOY = {"version": "0.5.1-prueba.39", "app_abierta": True, "ultimo_arranque": "2026-11-12T02:01:59Z",
             "errores_arranque": [], "version_desde": DESPUES, "version_desde_fuente": "paquete-instalado"}


class EvidenciaDeUnaVersion(unittest.TestCase):
    """PRB1111Y: la evidencia pertenece a una versión; sin ella no hay veredicto, hay un estado."""

    def test_la_situacion_real_solo_propone_el_arranque(self):
        b = B.construir(TEXTO, MAC39_HOY, comprobaciones("39"), 0)
        self.assertEqual([s["senal"] for s in b["sugerencias"]], ["arranque-limpio"])
        self.assertEqual(b["sugerencias"][0]["veredicto"], "bien")
        self.assertEqual(len(b["sin_evidencia"]), 11)
        self.assertEqual({e["senal"] for e in b["sin_evidencia"]}, set(C.SENALES) - {"arranque-limpio"})
        for e in b["sin_evidencia"]:
            self.assertTrue(e["razon"].endswith(".") and e["produciria"])
        # la llamada sigue en la historia, marcada como de otra versión
        self.assertEqual(b["llamadas"][0]["version_relacion"], "otra")
        self.assertEqual(b["aparatos"][0]["version_desde"], DESPUES)
        razon_ll = next(e for e in b["sin_evidencia"] if e["senal"] == "llamada-ble")["razon"]
        self.assertIn("otra versión", razon_ll)

    def test_una_llamada_hecha_antes_de_la_actualizacion_nunca_propone(self):
        b = B.construir(TEXTO, dict(MAC_VIEJA, version="0.5.1-prueba.39", version_desde=DESPUES, ultimo_arranque="2026-11-12T02:00:00Z"),
                        comprobaciones("39", ["llamada-ble", "video-sin-negro", "camara-abre"]), 0)
        self.assertEqual(b["sugerencias"], [])
        self.assertEqual(len(b["sin_evidencia"]), 3)

    def test_la_misma_llamada_hecha_con_la_version_si_propone(self):
        b = B.construir(TEXTO, dict(MAC_VIEJA, version="0.5.1-prueba.39"), comprobaciones("39", ["llamada-ble"]), 0)
        self.assertEqual(b["llamadas"][0]["version_relacion"], "esta")
        self.assertEqual(b["llamadas"][0]["version_mac"], "0.5.1-prueba.39")
        self.assertEqual(b["sugerencias"][0]["llamada"], b["llamadas"][0]["id"])

    def test_sin_saber_desde_cuando_no_se_propone_nada(self):
        mac = dict(MAC39_HOY, version_desde=None)
        b = B.construir(TEXTO, mac, comprobaciones("39"), 0)
        self.assertEqual(b["sugerencias"], [])
        self.assertTrue(all("desde cuándo" in e["razon"] for e in b["sin_evidencia"]))
        self.assertEqual(b["llamadas"][0]["version_relacion"], "desconocida")
        self.assertIsNone(b["llamadas"][0]["version_mac"])

    def test_el_arranque_se_juzga_con_un_inicio_posterior_a_la_actualizacion(self):
        mac = dict(MAC39_HOY, ultimo_arranque="2026-11-12T01:40:00Z")
        b = B.construir("", mac, comprobaciones("39", ["arranque-limpio"]), 0)
        self.assertEqual(b["sugerencias"], [])
        self.assertIn("anterior a la actualización", b["sin_evidencia"][0]["razon"])
        mac = dict(MAC39_HOY, errores_arranque=[{"t": "2026-11-12T02:02:00Z", "texto": "EADDRINUSE"}])
        self.assertEqual(B.construir("", mac, comprobaciones("39", ["arranque-limpio"]), 0)["sugerencias"][0]["veredicto"], "falla")
        mac = dict(MAC39_HOY, app_abierta=False)
        b = B.construir("", mac, comprobaciones("39", ["arranque-limpio"]), 0)
        self.assertEqual(b["sugerencias"], []); self.assertIn("cerrada", b["sin_evidencia"][0]["razon"])

    def test_dos_aparatos_sin_la_tablet_no_hay_sugerencia_y_dice_por_que(self):
        solo_mac = "\n".join(x for x in TEXTO.splitlines() if "Maggaboard" not in x)
        b = B.construir(solo_mac, dict(MAC_VIEJA, version="0.5.1-prueba.39"), comprobaciones("39", ["llamada-ble", "video-fps-ble", "voz-limpia-lejos", "camara-abre"]), 0)
        por = {e["senal"]: e for e in b["sin_evidencia"]}
        self.assertEqual(set(por) & {"llamada-ble", "video-fps-ble", "voz-limpia-lejos"}, {"llamada-ble", "video-fps-ble", "voz-limpia-lejos"})
        for s in ("llamada-ble", "video-fps-ble", "voz-limpia-lejos"):
            self.assertIn("la tablet no da señal", por[s]["razon"])
        self.assertNotIn("camara-abre", por)             # es de la Mac sola

    def test_el_resumen_de_pedir_arreglo_dice_que_no_hay_evidencia(self):
        b = B.construir(TEXTO, MAC39_HOY, comprobaciones("39"), 0)
        r = B.resumen_texto(b, 39, next(e for e in b["sin_evidencia"] if e["senal"] == "llamada-ble")["comprobacion"])
        self.assertIn("Sin evidencia aún con esta versión", r)

    def test_las_siete_senales_de_dos_aparatos(self):
        self.assertEqual(B.DOS_APARATOS, {"enlace-ble-hora", "voz-sin-corte", "llamada-ble", "video-fps-ble",
                                          "video-sin-pausa-mudo", "video-pausa-ancho", "voz-limpia-lejos"})
        self.assertTrue(B.DOS_APARATOS <= set(C.SENALES))

    def test_enlace_una_hora_con_las_dos_puntas_vivas(self):
        c = comprobaciones("39", ["enlace-ble-hora"])
        mac = dict(MAC39_HOY, version_desde="2026-11-12T01:50:00Z")
        b = B.construir(hora_de_enlace(70), mac, c, 0)
        self.assertEqual(b["sugerencias"][0]["veredicto"], "bien")
        b = B.construir(hora_de_enlace(70, cierres=3), mac, c, 0)
        self.assertEqual(b["sugerencias"][0]["veredicto"], "falla")

    def test_enlace_sin_la_tablet_no_se_juzga(self):
        c = comprobaciones("39", ["enlace-ble-hora"])
        b = B.construir(hora_de_enlace(70, tablet=False, cierres=30), MAC39_HOY, c, 0)
        self.assertEqual(b["sugerencias"], [])
        self.assertIn("la tablet no da señal", b["sin_evidencia"][0]["razon"].lower())

    def test_enlace_con_la_tablet_a_ratos_no_se_juzga(self):
        c = comprobaciones("39", ["enlace-ble-hora"])
        lineas = [l for l in hora_de_enlace(70, cierres=30).splitlines() if "Maggaboard" not in l or "T02:1" in l]
        b = B.construir("\n".join(lineas), MAC39_HOY, c, 0)
        self.assertEqual(b["sugerencias"], [])
        self.assertIn("la tablet solo dio señal en 1 de 6", b["sin_evidencia"][0]["razon"].lower())

    def test_enlace_menos_de_una_hora_desde_la_actualizacion(self):
        c = comprobaciones("39", ["enlace-ble-hora"])
        b = B.construir(hora_de_enlace(12), MAC39_HOY, c, 0)
        self.assertEqual(b["sugerencias"], [])
        self.assertIn("solo hay 12 min", b["sin_evidencia"][0]["razon"])

    def test_enlace_antiguo_no_cuenta_aunque_dure_una_hora(self):
        c = comprobaciones("39", ["enlace-ble-hora"])
        mac = dict(MAC39_HOY, version_desde="2026-11-12T05:00:00Z")
        b = B.construir(hora_de_enlace(70), mac, c, 0)
        self.assertEqual(b["sugerencias"], [])
        self.assertIn("no hay registro del enlace", b["sin_evidencia"][0]["razon"].lower())

    def test_otra_prueba_que_la_instalada_tambien_queda_sin_evidencia(self):
        b = B.construir(TEXTO, MAC37, comprobaciones("39", ["llamada-ble"]), 0)
        self.assertEqual(b["sugerencias"], [])
        self.assertIn("instalada la 0.5.1-prueba.37", b["sugerencias_nota"])
        self.assertEqual(len(b["sin_evidencia"]), 1)


REAL39 = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "fixtures", "enlaces-log-prueba39-real.txt"), encoding="utf-8").read()
MAC39_REAL = {"version": "0.5.1-prueba.39", "app_abierta": True, "ultimo_arranque": "2026-11-12T02:01:59Z", "errores_arranque": [],
              "version_desde": "2026-11-12T01:49:31Z", "version_desde_fuente": "paquete-instalado"}


class RegistroDeLaPrueba39(unittest.TestCase):
    """PRB1111AB: las llamadas reales de la 39 (congestión rehecha) se leen bien y nada tumba el archivo."""

    @classmethod
    def setUpClass(cls):
        cls.b = B.construir(REAL39, MAC39_REAL, comprobaciones("39"), 0)
        cls.ll = cls.b["llamadas"][0]
        cls.mac, cls.tab = cls.ll["lados"]["mac"], cls.ll["lados"]["maggaboard"]

    def test_la_llamada_real_se_construye_sin_problemas(self):
        self.assertEqual(self.b["problemas"], []); self.assertEqual(self.b["problemas_total"], 0)
        self.assertEqual(self.b["fuente"]["ilegibles"]["lineas"], 0)
        self.assertEqual(len(self.b["llamadas"]), 1)
        self.assertEqual((self.ll["desde"], self.ll["duracion_s"]), ("2026-11-12T03:47:04Z", 51))
        self.assertEqual(self.ll["version_relacion"], "esta")
        self.assertIn("enlace-datos", self.ll["medios"]); self.assertEqual(self.ll["enlaces"], ["b2", "b1"])

    def test_voz_escalon_tasa_suelo_y_lo_que_dice_el_otro(self):
        v = self.mac["voz"]
        self.assertEqual((v["nivel_min"], v["nivel_max"], v["nivel_ultimo"]), (0, 5, 5))
        self.assertEqual((v["opus_kbps_min"], v["opus_kbps_max"]), (6, 16))
        self.assertEqual(v["bajo_suelo_lineas"], 3)
        self.assertEqual(v["otro_perdida_pct_max"], 18); self.assertEqual(v["tarde_pct_max"], 57.5)
        self.assertEqual((v["enlace_kbps"], v["entregado_kbps_max"]), (160, 56))

    def test_la_espera_son_dos_numeros_percentil_90_y_maximo(self):
        self.assertEqual(B._espera("espera=72/89ms"), (72.0, 89.0))
        self.assertEqual(B._espera("espera=89ms"), (None, 89.0))
        self.assertEqual(B._espera("espera=-/0ms"), (None, 0.0))
        self.assertEqual(B._espera("entregado=2k espera=85/65m"), (85.0, 65.0))          # la línea cortada por el registro
        self.assertEqual(B._enlace("enlace=160k+29ms/139"), (160.0, 29.0, 139.0))
        self.assertEqual(B._otro("BAJO-SUELO red otro:perd=18%/tarde=57.5% cabe"), (18.0, 57.5))
        v = self.mac["voz"]
        self.assertGreaterEqual(v["espera_voz_ms_max"], v["espera_voz_p90_ms_max"])

    def test_audio_inventado_sin_las_muestras_de_arranque(self):
        self.assertEqual(self.mac["voz"]["inventado_pct_max"], 67)          # no el 100 % de la primera muestra (paq=2)
        self.assertEqual(self.mac["voz"]["perdida_pct_max"], 2.2)

    def test_imagenes_por_segundo_enviadas_y_vistas_en_cada_sentido(self):
        self.assertEqual(self.mac["video"]["fps_enviados_med"], 5.1)
        self.assertEqual(self.mac["video"]["fps_recibidos_med"], 1)          # lo que la Mac pinta de la tablet
        self.assertEqual(self.tab["video"]["fps_recibidos_med"], 3)          # lo que la tablet pinta de la Mac
        self.assertEqual(self.mac["video"]["fps_activo"]["med"], 5.5)
        self.assertEqual(self.mac["video"]["otro_pausado_lineas"], 1)
        self.assertEqual(self.mac["video"]["pausas"], [])

    def test_la_linea_de_reparto_sin_fps_no_rompe_nada(self):          # el fallo original: «reparto carril=… escalon=…» sin fps
        lin = [l for l in REAL39.splitlines() if "reparto carril=" in l]
        self.assertTrue(lin)
        self.assertIsNotNone(B.construir("\n".join(lin), MAC39_REAL, {"pruebas": {}}, 0))
        cortada = [B.parse_linea(x.split("fps=")[0]) for x in REAL39.splitlines() if "reparto activo" in x][:1]      # activo, sin fps
        lado = B.metricas_lado([B.parse_linea(lin[0])] + cortada, 0, 1)
        self.assertIsNone(lado["video"]["fps_medio"])

    def test_sugerencias_de_la_llamada_real(self):
        por = {s["senal"]: s for s in self.b["sugerencias"]}
        self.assertEqual(por["video-fps-ble"]["veredicto"], "falla")          # la Mac ve 1 imagen/s de la tablet
        self.assertIn("mac 1", por["video-fps-ble"]["motivo"]); self.assertIn("maggaboard 3", por["video-fps-ble"]["motivo"])
        self.assertEqual(por["voz-limpia-lejos"]["veredicto"], "falla")       # BAJO-SUELO y la voz inventada llegó al 67 %
        self.assertEqual(por["llamada-ble"]["veredicto"], "bien"); self.assertIn("2 min", por["llamada-ble"]["motivo"])
        self.assertEqual(por["voz-sin-corte"]["veredicto"], "bien")
        sin = {e["senal"] for e in self.b["sin_evidencia"]}
        self.assertIn("video-sin-pausa-mudo", sin)                # no hubo micrófono mudo
        self.assertIn("enlace-ble-hora", sin)

    def test_lineas_ilegibles_se_cuentan_y_se_nombran(self):
        sucio = REAL39 + "\nesto no es una línea del registro\n\notra cosa rara\n"
        b = B.construir(sucio, MAC39_REAL, comprobaciones("39"), 0)
        self.assertEqual(b["fuente"]["ilegibles"]["lineas"], 2)
        self.assertIn("esto no es", b["fuente"]["ilegibles"]["ejemplo"])
        self.assertEqual(b["llamadas"][0]["id"], self.ll["id"]); self.assertTrue(b["sugerencias"])

    def test_una_llamada_que_no_se_puede_construir_no_borra_las_demas(self):
        orig = B.construir_llamada

        def con_fallo(g, ble, prob=None):
            ll = orig(g, ble, prob)
            if ll["id"].endswith("191944"):
                raise TypeError("campo roto de prueba")
            return ll
        B.construir_llamada = con_fallo
        try:
            b = B.construir(TEXTO + "\n" + REAL39, MAC39_REAL, comprobaciones("39"), 0)
        finally:
            B.construir_llamada = orig
        ids = {l["id"]: l for l in b["llamadas"]}
        self.assertTrue(ids["llamada-20261111T191944"]["ilegible"])
        self.assertIn("campo roto de prueba", ids["llamada-20261111T191944"]["error"])
        self.assertNotIn("ilegible", ids["llamada-20261112T034704"])
        self.assertEqual(b["problemas_total"], 1); self.assertIn("TypeError", b["problemas"][0]["error"])
        self.assertTrue(b["aparatos"]); self.assertTrue(b["sugerencias"])

    def test_una_seccion_rota_deja_la_punta_con_lo_demas(self):
        orig = B._video
        B._video = lambda *a, **k: 1 / 0
        try:
            b = B.construir(REAL39, MAC39_REAL, comprobaciones("39"), 0)
        finally:
            B._video = orig
        lado = b["llamadas"][0]["lados"]["mac"]
        self.assertIsNone(lado["video"]); self.assertIsNotNone(lado["voz"])
        self.assertTrue(any("video" in p["donde"] and "ZeroDivisionError" in p["error"] for p in b["problemas"]))

    def test_una_senal_que_revienta_queda_sin_evidencia_y_las_otras_siguen(self):
        orig = B.regla

        def mala(senal, llamada, ctx):
            if senal == "llamada-ble":
                raise ValueError("regla rota")
            return orig(senal, llamada, ctx)
        B.regla = mala
        try:
            b = B.construir(REAL39, MAC39_REAL, comprobaciones("39"), 0)
        finally:
            B.regla = orig
        self.assertTrue(any(e["senal"] == "llamada-ble" and "regla rota" in e["razon"] for e in b["sin_evidencia"]))
        self.assertTrue(any(s["senal"] == "video-fps-ble" for s in b["sugerencias"]))

    def test_el_archivo_en_disco_sale_aunque_haya_un_defecto(self):
        with tempfile.TemporaryDirectory() as d:
            ruta = os.path.join(d, "enlaces.log")
            open(ruta, "w", encoding="utf-8").write(REAL39 + "\nbasura\n")

            class M(BP.Medios):
                def plist(self):
                    return {"CFBundleShortVersionString": "0.5.1-prueba.39", "CFBundleExecutable": "x"}

                def app_abierta(self, e):
                    return True
            _, b = BP.pasada(M(log=ruta, salida=d, logs=d))
            self.assertEqual(b["fuente"]["ilegibles"]["lineas"], 1)
            self.assertEqual(len(b["llamadas"]), 1)
            self.assertNotIn(d, json.dumps(b))


class MemoriaDeVersion(unittest.TestCase):
    T = 1794448000.0

    def test_version_nueva_toma_el_instante_de_la_instalacion(self):
        mem, esc = B.actualizar_memoria(None, "0.5.1-prueba.39", self.T - 600, self.T)
        self.assertTrue(esc); self.assertEqual(mem["fuente"], "paquete-instalado")
        self.assertEqual(B._a_epoch(mem["desde"]), self.T - 600)

    def test_misma_version_conserva_el_desde_aunque_el_sello_cambie(self):
        mem, _ = B.actualizar_memoria(None, "0.5.1-prueba.39", self.T - 600, self.T)
        mem2, esc = B.actualizar_memoria(mem, "0.5.1-prueba.39", self.T + 5, self.T + 60)
        self.assertFalse(esc); self.assertEqual(mem2["desde"], mem["desde"])
        mem3, esc = B.actualizar_memoria(mem, "0.5.1-prueba.39", self.T + 5, self.T + 4000)
        self.assertTrue(esc); self.assertEqual(mem3["desde"], mem["desde"]); self.assertNotEqual(mem3["visto"], mem["visto"])

    def test_actualizacion_vista_nunca_empieza_antes_de_la_ultima_vez_de_la_anterior(self):
        viejo, _ = B.actualizar_memoria(None, "0.5.1-prueba.37", self.T - 9000, self.T - 8000)
        viejo = dict(viejo, visto=B._a_iso(self.T - 100))
        nueva, esc = B.actualizar_memoria(viejo, "0.5.1-prueba.39", self.T - 3000, self.T)   # sello anterior a lo que ya vimos
        self.assertTrue(esc); self.assertEqual(nueva["fuente"], "ultima-vez-vista-la-anterior")
        self.assertEqual(B._a_epoch(nueva["desde"]), self.T - 100); self.assertEqual(nueva["anterior"], "0.5.1-prueba.37")

    def test_sin_sello_ni_memoria_es_ahora(self):
        mem, _ = B.actualizar_memoria(None, "0.5.1-prueba.39", None, self.T)
        self.assertEqual((mem["fuente"], B._a_epoch(mem["desde"])), ("primera-vez-visto", self.T))

    def test_sin_version_no_hay_memoria(self):
        self.assertEqual(B.actualizar_memoria(None, None, self.T, self.T), (None, False))


class Arranque(unittest.TestCase):
    def test_ultimo_arranque_y_errores_de_los_primeros_5_min(self):
        t = ("1794081368055 [servidor-local] lanzando /Applications/StarSeed OS.app/Contents/MacOS/starseed-node en http://127.0.0.1:47610\n"
             "[starseed-arranque] puerta en http://127.0.0.1:47610\n   ▲ Next.js 15\n"
             "Error: EADDRINUSE en /Users/alex/x/y.js\n"
             "1794081380000 [capas] ok\n"
             "1794130333101 [capas] no se pudo actualizar la capa: curl 504\n")
        ult, err = B.info_arranque(t)
        self.assertTrue(ult.startswith("2026-11-07"))
        self.assertEqual(len(err), 1)
        self.assertIn("EADDRINUSE", err[0]["texto"]); self.assertNotIn("/Users", err[0]["texto"])
        self.assertEqual(B.info_arranque("nada"), (None, []))

    def test_dos_arranques_cuenta_el_ultimo(self):
        t = "1794000000000 [s] lanzando a\nError viejo\n1794100000000 [s] lanzando b\n"
        ult, err = B.info_arranque(t)
        self.assertEqual(err, [])


class Disco(unittest.TestCase):
    def test_solo_reescribe_si_algo_cambio(self):
        with tempfile.TemporaryDirectory() as d:
            class M(BP.Medios):
                def plist(self):
                    return {"CFBundleShortVersionString": "0.5.1-prueba.37", "CFBundleExecutable": "x"}

                def app_abierta(self, e):
                    return True
            m = M(log=QUI, salida=d, logs=d)
            ruta, b1 = BP.pasada(m)
            self.assertTrue(ruta)
            mt = os.stat(ruta).st_mtime_ns
            ruta2, b2 = BP.pasada(m)
            self.assertIsNone(ruta2); self.assertEqual(os.stat(ruta).st_mtime_ns, mt)
            self.assertEqual(b1["llamadas"][0]["id"], b2["llamadas"][0]["id"])
            c, _ = C.registrar(None, 39, ["z"]); C.escribir(c, os.path.join(d, C.NOMBRE))
            ruta3, _ = BP.pasada(m)
            self.assertTrue(ruta3)                       # cambió el archivo de comprobaciones
            self.assertNotIn(d, json.dumps(json.load(open(ruta3))))

    def test_la_memoria_de_version_sobrevive_a_otro_servicio_y_a_un_sello_que_cambia(self):
        with tempfile.TemporaryDirectory() as d:
            sello = [1794447000.0]
            ahora = [1794448000.0]

            class M(BP.Medios):
                def plist(self):
                    return {"CFBundleShortVersionString": "0.5.1-prueba.39", "CFBundleExecutable": "x"}

                def app_abierta(self, e):
                    return True

                def sello_paquete(self):
                    return sello[0]

                def ahora(self):
                    return ahora[0]
            _, b1 = BP.pasada(M(log=QUI, salida=d, logs=d))
            desde1 = b1["aparatos"][0]["version_desde"]
            self.assertEqual(b1["aparatos"][0]["version_desde_fuente"], "paquete-instalado")
            sello[0] += 5000; ahora[0] += 30                  # el sistema toca el paquete: otro servicio, mismo desde
            _, b2 = BP.pasada(M(log=QUI, salida=d, logs=d), forzar=True)
            self.assertEqual(b2["aparatos"][0]["version_desde"], desde1)
            self.assertTrue(os.path.exists(os.path.join(d, BP.MEMORIA)))
            self.assertNotIn(d, json.dumps(b2))

    def test_sin_registro_ni_app_dice_desconocido(self):
        with tempfile.TemporaryDirectory() as d:
            class M(BP.Medios):
                def plist(self):
                    return None
            ruta, b = BP.pasada(M(log=os.path.join(d, "no-existe.log"), salida=d, logs=d))
            self.assertIsNone(b["aparatos"][0]["version"]); self.assertIsNone(b["aparatos"][0]["app_abierta"])
            self.assertEqual(b["llamadas"], [])


class BuildDeLaWeb(unittest.TestCase):
    """ACT1113F: la build de la web que corre cada aparato, en el aparato y en cada llamada."""

    def _log(self, mac_web, tab_web):
        def web(t, tag, msg):
            return "2026-11-13T17:59:%02dZ web%s 2026-11-13T17:59:%02dZ · web · llamada · b1 · neurona n1 · %s" % (t, tag, t, msg)
        return "\n".join([
            web(1, "", "inicio paso=timbre ok web=%s" % mac_web),
            web(2, " (Maggaboard)", ("inicio paso=timbre ok web=%s" % tab_web) if tab_web else "inicio paso=timbre ok"),
            web(3, "", "senal-enviada senal offer"),
            web(9, "", "senal-enviada colgar"),
            web(10, "", "fin por=colgar contestada=si dur-s=8 web=%s" % mac_web),
            web(10, " (Maggaboard)", ("fin por=colgar contestada=si web=%s" % tab_web) if tab_web else "fin por=colgar contestada=si"),
        ]) + "\n"

    def test_web_de_lee_build_y_sha(self):
        self.assertEqual(B.web_de("fin por=colgar web=mwfli3jt-ctfbyg/fbbcb6794a"), "mwfli3jt-ctfbyg/fbbcb6794a")
        self.assertEqual(B.web_de("inicio paso=x web=desconocida"), "desconocida")
        self.assertIsNone(B.web_de("sin build aqui"))
        self.assertIsNone(B.web_de("webx=abc123"))

    def test_cada_aparato_guarda_la_ultima_build_y_cuando(self):
        b = B.construir(self._log("mwfli3jt-ctfbyg/fbbcb6794a", "aaaa1111-bbbb22/0123456789"), MAC37, {"pruebas": {}}, 0)
        por = {a["id"]: a for a in b["aparatos"]}
        self.assertEqual(por["mac"]["web"], "mwfli3jt-ctfbyg/fbbcb6794a")
        self.assertEqual(por["mac"]["web_visto"], "2026-11-13T17:59:10Z")
        tab = [a for i, a in por.items() if i != "mac"][0]
        self.assertEqual(tab["web"], "aaaa1111-bbbb22/0123456789")

    def test_lados_con_builds_distintas_lo_dice_como_nota_no_como_fallo(self):
        b = B.construir(self._log("mwfli3jt-ctfbyg/fbbcb6794a", "aaaa1111-bbbb22/0123456789"), MAC37, {"pruebas": {}}, 0)
        ll = b["llamadas"][0]
        self.assertEqual(len(ll["web_por_lado"]), 2)
        self.assertEqual(len(ll["notas"]), 1)
        self.assertIn("informativo, no es un fallo", ll["notas"][0])
        self.assertEqual(b["problemas_total"], 0)

    def test_mismas_builds_o_un_lado_sin_dato_no_dan_nota(self):
        igual = B.construir(self._log("mwfli3jt-ctfbyg/fbbcb6794a", "mwfli3jt-ctfbyg/fbbcb6794a"), MAC37, {"pruebas": {}}, 0)
        self.assertEqual(igual["llamadas"][0]["notas"], [])
        sin = B.construir(self._log("mwfli3jt-ctfbyg/fbbcb6794a", None), MAC37, {"pruebas": {}}, 0)
        self.assertEqual(sin["llamadas"][0]["notas"], [])
        tab = [a for a in sin["aparatos"] if a["id"] != "mac"][0]
        self.assertIsNone(tab["web"])


if __name__ == "__main__":
    unittest.main()
