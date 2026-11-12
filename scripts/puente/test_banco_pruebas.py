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
        mac = dict(MAC37, version=version)
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
        mac = dict(MAC37, version="0.5.1-prueba.39")
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

    def test_sin_registro_ni_app_dice_desconocido(self):
        with tempfile.TemporaryDirectory() as d:
            class M(BP.Medios):
                def plist(self):
                    return None
            ruta, b = BP.pasada(M(log=os.path.join(d, "no-existe.log"), salida=d, logs=d))
            self.assertIsNone(b["aparatos"][0]["version"]); self.assertIsNone(b["aparatos"][0]["app_abierta"])
            self.assertEqual(b["llamadas"], [])


if __name__ == "__main__":
    unittest.main()
