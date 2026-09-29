# -*- coding: utf-8 -*-
"""Director de consumo: alertas, presupuesto diario, freno remoto y bucles (sin red)."""
import datetime as dt
import json
import os
import shutil
import sys
import tempfile
import unittest
import urllib.parse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import vigia_consumo as V

UTC = dt.timezone.utc
CLAVE_SERVICIO = "eyJhbGciOiJIUzI1NiJ9.c2VydmljZV9yb2xl.firmaSecretaQueNuncaDebeVerse"
CRED = {"ref": "refprueba", "token": "sbp_tokenSecretoDePrueba1234567890", "url": "https://x.supabase.co",
        "clave": CLAVE_SERVICIO}


def t(texto):
    return dt.datetime.fromisoformat(texto).replace(tzinfo=UTC)


class Evaluar(unittest.TestCase):
    def test_lo_del_25_09_salta(self):
        # Lo que se midió el día del bloqueo: el Mando pidiendo el bus sin parar.
        filas = [{"ruta": "/rest/v1/relevo_eventos", "ua": "node", "st": "402", "n": 2750, "pesadas": 900}]
        a = V.evaluar(filas, {})
        self.assertTrue(any(x.startswith("CRÍTICO") for x in a))
        self.assertTrue(any("node" in x and "2750" in x for x in a))
        self.assertTrue(any("pesadas" in x for x in a))

    def test_trafico_normal_no_alerta(self):
        filas = [
            {"ruta": "/rest/v1/astraura_state", "ua": "curl/8.21.0", "st": "200", "n": 41, "pesadas": 0},
            {"ruta": "/rest/v1/relevo_eventos", "ua": "node", "st": "200", "n": 80, "pesadas": 1},
        ]
        self.assertEqual(V.evaluar(filas, {"coste_hoy": 0.0002, "techo_dia": 0.2, "saldo": 9.5}), [])

    def test_sin_medir_no_inventa(self):
        self.assertEqual(V.evaluar(None, {}), [])

    def test_jev_cerca_del_techo_y_saldo_bajo(self):
        a = V.evaluar([], {"coste_hoy": 0.18, "techo_dia": 0.2, "saldo": 1.2})
        self.assertEqual(len(a), 2)
        self.assertIn("Jev", a[0])
        self.assertIn("OpenRouter", a[1])

    def test_resumen_legible(self):
        texto = V.resumen({"supabase": {"peticiones_hora": 120}, "alertas": []})
        self.assertEqual(texto, "Supabase 120 pet/h · alertas: ninguna")

    def test_resumen_con_presupuesto(self):
        texto = V.resumen({"supabase": {"peticiones_hora": 120}, "alertas": [],
                           "presupuesto": {"pct": 0.42, "nivel": "ok"}})
        self.assertIn("hoy 42 % del presupuesto (ok)", texto)


class CuentasDelDia(unittest.TestCase):
    def test_bytes_medidos_media_por_ruta_y_errores(self):
        filas = [
            # 100 con tamaño (100 KB en total → media 1.024 B) y 50 sin tamaño.
            {"fuente": "edge_logs", "ruta": "/rest/v1/posts", "metodo": "GET", "st": 200, "n": 150,
             "bytes": 102400, "con_tamano": 100},
            {"fuente": "edge_logs", "ruta": "/rest/v1/posts", "metodo": "GET", "st": 400, "n": 10,
             "bytes": 0, "con_tamano": 0},
        ]
        d = V.resumen_dia(filas)
        self.assertEqual(d["peticiones"], 160)
        self.assertEqual(d["bytes_medidos"], 102400)
        self.assertEqual(d["bytes_rest_est"], 102400 + 50 * 1024 + 10 * V.BYTES_ERROR)
        self.assertAlmostEqual(d["fraccion_medida"], 100 / 160, places=3)

    def test_sin_ninguna_medida_usa_el_tamano_tipico(self):
        d = V.resumen_dia([{"ruta": "/auth/v1/user", "metodo": "GET", "st": 200, "n": 1000}])
        self.assertEqual(d["bytes_rest_est"], 1000 * 1200)
        self.assertEqual(d["fraccion_medida"], 0)

    def test_realtime_estimado_y_registros(self):
        filas = [
            {"fuente": "edge_logs", "ruta": "/rest/v1/os_mesh_topology", "metodo": "PATCH", "st": 204, "n": 100,
             "bytes": 0, "con_tamano": 0},
            {"fuente": "realtime_logs", "ruta": "", "metodo": "", "st": 0, "n": 37},
        ]
        d = V.resumen_dia(filas)
        rt = d["realtime"]
        self.assertTrue(rt["estimado"])
        self.assertEqual(rt["escrituras"], 100)
        self.assertEqual(rt["registros"], 37)
        self.assertEqual(rt["bytes_est"], 100 * V.REALTIME_SUSCRIPTORES * V.REALTIME_BYTES_EVENTO)
        self.assertEqual(d["bytes_est"], d["bytes_rest_est"] + rt["bytes_est"])
        self.assertEqual(d["peticiones"], 100)  # los registros de Realtime no son peticiones

    def test_top_cinco_402_y_rutas_sin_identificadores(self):
        filas = [{"ruta": "/rest/v1/t%d" % i, "metodo": "GET", "st": 200, "n": 10 * i} for i in range(1, 8)]
        filas.append({"ruta": "/storage/v1/object/public/b/123e4567-e89b-12d3-a456-426614174000.png",
                      "metodo": "GET", "st": 402, "n": 3})
        d = V.resumen_dia(filas)
        self.assertEqual([x["ruta"] for x in d["top"]], ["/rest/v1/t7", "/rest/v1/t6", "/rest/v1/t5",
                                                         "/rest/v1/t4", "/rest/v1/t3"])
        self.assertEqual(d["c402"], 3)
        self.assertEqual(V.sanitizar_ruta("/storage/v1/object/public/b/123e4567-e89b-12d3-a456-426614174000.png"),
                         "/storage/v1/object/public/b/:id.png")

    def test_ua_y_ruta_nunca_llevan_claves(self):
        ua = V.sanitizar_ua("node apikey=" + CLAVE_SERVICIO)
        self.assertNotIn("eyJ", ua)
        self.assertNotIn("firma", ua)
        self.assertEqual(V.sanitizar_ruta("/auth/v1/verify?token=" + CLAVE_SERVICIO), "/auth/v1/verify")
        self.assertEqual(V.sanitizar_ruta("/functions/v1/x/sb_secret_abcdefghijklmnopqrstuvwxyz"),
                         "/functions/v1/x/:id")


class Presupuesto(unittest.TestCase):
    P = dict(V.PRESUPUESTOS_POR_DEFECTO)

    def hoy(self, peticiones, mb=0):
        return {"peticiones": peticiones, "bytes_est": int(mb * V.MB)}

    def test_niveles(self):
        self.assertEqual(V.evaluar_presupuesto(self.hoy(1000), 0, self.P)["nivel"], "ok")
        self.assertEqual(V.evaluar_presupuesto(self.hoy(17500), 0, self.P)["nivel"], "aviso")
        e = V.evaluar_presupuesto(self.hoy(25000), 0, self.P)
        self.assertEqual(e["nivel"], "freno")
        self.assertIn("25.000 peticiones de 25.000", e["motivo"])

    def test_manda_la_dimension_mas_llena(self):
        e = V.evaluar_presupuesto(self.hoy(100, mb=160), 0, self.P)
        self.assertEqual(e["nivel"], "freno")
        self.assertIn("MB estimados", e["motivo"])
        e = V.evaluar_presupuesto(self.hoy(100, mb=1), 5200, self.P)
        self.assertEqual(e["nivel"], "freno")
        self.assertIn("ciclo", e["motivo"])

    def test_402_manda_sobre_todo(self):
        self.assertEqual(V.evaluar_presupuesto(self.hoy(10), 0, self.P, restringido=True)["nivel"], "restringido")

    def test_presupuestos_invalidos_vuelven_al_defecto(self):
        p = V.normalizar_presupuestos({"supabase_peticiones_dia": "abc", "supabase_mb_dia": -3,
                                       "ciclo_inicio": "2026-13-45", "jev_usd_dia": 0.1})
        self.assertEqual(p["supabase_peticiones_dia"], 25000)
        self.assertEqual(p["supabase_mb_dia"], 150)
        self.assertIsNone(p["ciclo_inicio"])
        self.assertEqual(p["jev_usd_dia"], 0.1)

    def test_ciclo(self):
        inicio, quedan, supuesto = V.ciclo_actual("2026-09-10", dt.date(2026, 9, 29), None)
        self.assertEqual((inicio, quedan, supuesto), (dt.date(2026, 9, 10), 11, False))
        inicio, quedan, _ = V.ciclo_actual("2026-09-10", dt.date(2026, 10, 12), None)
        self.assertEqual((inicio, quedan), (dt.date(2026, 10, 10), 29))
        inicio, _, _ = V.ciclo_actual("2026-01-31", dt.date(2026, 3, 5), None)
        self.assertEqual(inicio, dt.date(2026, 2, 28))
        inicio, quedan, supuesto = V.ciclo_actual(None, dt.date(2026, 9, 29), dt.date(2026, 9, 26))
        self.assertEqual((inicio, quedan, supuesto), (dt.date(2026, 9, 26), None, True))

    def test_mb_del_ciclo_solo_suma_los_dias_del_ciclo(self):
        dias = {"2026-09-01": {"bytes_est": 5 * V.MB}, "2026-09-10": {"bytes_est": 2 * V.MB},
                "2026-09-11": {"bytes_est": 3 * V.MB}, "roto": {}}
        self.assertEqual(V.mb_del_ciclo(dias, dt.date(2026, 9, 10), dt.date(2026, 9, 29)), 5)


class DecidirFreno(unittest.TestCase):
    def test_tabla_de_decisiones(self):
        ahora = 1000.0
        self.assertEqual(V.decidir_freno("freno", {"activo": False}, ahora), "activar")
        self.assertIsNone(V.decidir_freno("aviso", {"activo": False}, ahora))
        self.assertIsNone(V.decidir_freno("freno", {"activo": True, "hasta_epoch": 2000}, ahora))
        self.assertEqual(V.decidir_freno("freno", {"activo": True, "hasta_epoch": 500}, ahora), "activar")
        self.assertEqual(V.decidir_freno("ok", {"activo": True, "hasta_epoch": 2000}, ahora), "apagar")
        self.assertIsNone(V.decidir_freno("restringido", {"activo": True, "hasta_epoch": 500}, ahora))
        self.assertIsNone(V.decidir_freno(None, {"activo": True, "hasta_epoch": 500}, ahora))

    def test_nunca_en_bucle(self):
        self.assertFalse(V.puede_intentar({"no_disponible_dia": "2026-09-29"}, 0, "2026-09-29"))
        self.assertTrue(V.puede_intentar({"no_disponible_dia": "2026-09-28"}, 0, "2026-09-29"))
        self.assertFalse(V.puede_intentar({"reintento_epoch": 100}, 50, "d"))
        self.assertTrue(V.puede_intentar({"reintento_epoch": 100}, 100, "d"))


class Bucles(unittest.TestCase):
    def test_ruta_repartida_entre_agentes(self):
        filas = [{"ruta": "/rest/v1/os_mesh_relay", "ua": "Chrome %d" % i, "st": "200", "n": 400} for i in range(4)]
        b = V.detectar_bucles(filas)
        self.assertEqual(len(b), 1)
        self.assertEqual((b[0]["tipo"], b[0]["ruta"], b[0]["n"]), ("ruta", "/rest/v1/os_mesh_relay", 1600))

    def test_un_agente_en_una_ruta(self):
        filas = [{"ruta": "/auth/v1/user", "ua": "Mozilla/5.0 Mac", "st": "200", "n": 700},
                 {"ruta": "/auth/v1/user", "ua": "Mozilla/5.0 Mac", "st": "401", "n": 200},
                 {"ruta": "/rest/v1/posts", "ua": "node", "st": "200", "n": 790}]
        b = V.detectar_bucles(filas)
        self.assertEqual([(x["tipo"], x["ruta"], x["n"]) for x in b], [("agente+ruta", "/auth/v1/user", 900)])
        self.assertIn("/auth/v1/user", V.texto_bucle(b[0]))
        self.assertIn("900", V.texto_bucle(b[0]))

    def test_trafico_normal_sin_bucles(self):
        self.assertEqual(V.detectar_bucles([{"ruta": "/rest/v1/posts", "ua": "x", "st": "200", "n": 799}]), [])
        self.assertEqual(V.detectar_bucles(None), [])


class Falso:
    """La API de registros y PostgREST de mentira: cuenta cada petición."""

    def __init__(self, hora=None, dia=None, freno=(201, ""), falla_todo=False):
        self.hora = hora or []
        self.dia = dia or []
        self.freno = freno
        self.falla_todo = falla_todo
        self.llamadas = []

    def __call__(self, metodo, url, cab, cuerpo=None, timeout=30):
        self.llamadas.append((metodo, url, cuerpo))
        if self.falla_todo:
            raise OSError("sin red")
        if "/analytics/endpoints/logs" in url:
            sql = urllib.parse.parse_qs(urllib.parse.urlparse(url).query)["sql"][0]
            filas = self.hora if "user_agent" in sql else self.dia
            return 200, json.dumps({"result": filas})
        if "/rest/v1/os_freno" in url:
            return self.freno
        return 404, ""

    def escrituras(self):
        return [c for c in self.llamadas if "/rest/v1/os_freno" in c[1]]


def dia_con(peticiones):
    return [{"fuente": "edge_logs", "ruta": "/auth/v1/user", "metodo": "GET", "st": 200, "n": peticiones,
             "bytes": 0, "con_tamano": 0}]


class Vueltas(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        self.rutas = {k: os.path.join(self.dir, k + ".json") for k in ("salida", "historial", "presupuestos")}
        self.avisos = []

    def tearDown(self):
        shutil.rmtree(self.dir, ignore_errors=True)

    def vuelta(self, cuando, http, **kw):
        return V.ejecutar(ahora=t(cuando), http=http, avisar=lambda x, tipo="aviso": self.avisos.append(x),
                          rutas=self.rutas, cred=CRED, jev={}, **kw)

    def test_crea_presupuestos_con_el_contrato(self):
        self.vuelta("2026-09-29T10:00:00", Falso(dia=dia_con(10)))
        with open(self.rutas["presupuestos"], encoding="utf-8") as f:
            self.assertEqual(json.load(f), V.PRESUPUESTOS_POR_DEFECTO)

    def test_freno_se_activa_una_vez_y_se_apaga_a_medianoche(self):
        http = Falso(dia=dia_con(26000))
        d = self.vuelta("2026-09-29T20:00:00", http)
        self.assertEqual(len(http.escrituras()), 1)
        fila = http.escrituras()[0][2][0]
        self.assertTrue(fila["activo"])
        self.assertEqual(fila["hasta"], "2026-09-30T00:00:00Z")
        self.assertIn("Presupuesto diario de Supabase agotado", fila["motivo"])
        self.assertTrue(d["freno"]["activo"])
        self.assertEqual(d["presupuesto"]["nivel"], "freno")
        # Misma noche: ya está puesto, no se vuelve a escribir.
        self.vuelta("2026-09-29T20:15:00", http)
        self.assertEqual(len(http.escrituras()), 1)
        # Día nuevo: por debajo del presupuesto → se apaga con UNA escritura.
        http.dia = dia_con(50)
        d = self.vuelta("2026-09-30T00:05:00", http)
        self.assertEqual(len(http.escrituras()), 2)
        self.assertFalse(http.escrituras()[1][2][0]["activo"])
        self.assertFalse(d["freno"]["activo"])
        self.assertTrue(any(a.startswith("FRENO apagado") for a in self.avisos))

    def test_aviso_al_70_una_vez_al_dia(self):
        http = Falso(dia=dia_con(18000))
        self.vuelta("2026-09-29T10:00:00", http)
        self.vuelta("2026-09-29T10:15:00", http)
        self.assertEqual(sum("% del presupuesto diario" in a for a in self.avisos), 1)
        self.assertEqual(http.escrituras(), [])

    def test_con_402_no_escribe_nada(self):
        http = Falso(hora=[{"ruta": "/auth/v1/user", "ua": "Chrome", "st": "402", "n": 30}], dia=dia_con(30000))
        d = self.vuelta("2026-09-29T10:00:00", http)
        self.assertEqual(http.escrituras(), [])
        self.assertTrue(d["restringido"])
        self.assertEqual(d["presupuesto"]["nivel"], "restringido")

    def test_tabla_inexistente_avisa_una_vez_y_no_insiste(self):
        http = Falso(dia=dia_con(26000), freno=(404, '{"code":"PGRST205"}'))
        d = self.vuelta("2026-09-29T20:00:00", http)
        self.assertEqual(d["freno"]["remoto"], "no_disponible")
        for m in range(1, 8):  # dos horas más de vueltas cada 15 min
            self.vuelta("2026-09-29T%02d:%02d:00" % (20 + m // 4, (m % 4) * 15), http)
        self.assertEqual(len(http.escrituras()), 1)
        self.assertEqual(sum("Freno remoto no disponible" in a for a in self.avisos), 1)
        # Al día siguiente, si sigue haciendo falta, UN intento más.
        self.vuelta("2026-09-30T20:00:00", http)
        self.assertEqual(len(http.escrituras()), 2)

    def test_error_de_escritura_espera_una_hora(self):
        http = Falso(dia=dia_con(26000), freno=(500, ""))
        self.vuelta("2026-09-29T10:00:00", http)
        self.vuelta("2026-09-29T10:15:00", http)
        self.vuelta("2026-09-29T10:45:00", http)
        self.assertEqual(len(http.escrituras()), 1)
        http.freno = (201, "")
        d = self.vuelta("2026-09-29T11:01:00", http)
        self.assertEqual(len(http.escrituras()), 2)
        self.assertTrue(d["freno"]["activo"])

    def test_nunca_en_bucle_sin_red(self):
        http = Falso(falla_todo=True)
        d = self.vuelta("2026-09-29T10:00:00", http)
        # Falla la primera consulta → no se pide nada más en esta vuelta.
        self.assertEqual(len(http.llamadas), 1)
        self.assertIsNone(d["supabase"])
        self.assertIsNone(d["presupuesto"])
        self.assertEqual(self.avisos, [])

    def test_sin_credenciales_no_llama(self):
        http = Falso()
        d = V.ejecutar(ahora=t("2026-09-29T10:00:00"), http=http, avisar=lambda *a: None, rutas=self.rutas,
                       cred={"ref": "", "token": "", "url": "", "clave": ""}, jev={})
        self.assertEqual(http.llamadas, [])
        self.assertIsNone(d["hoy"])

    def test_cambio_de_dia_cierra_el_anterior_y_poda(self):
        http = Falso(dia=dia_con(100))
        self.vuelta("2026-09-29T23:50:00", http)
        http.dia = dia_con(120)  # la relectura completa de ayer trae los últimos minutos
        self.vuelta("2026-09-30T00:10:00", http)
        with open(self.rutas["historial"], encoding="utf-8") as f:
            h = json.load(f)
        self.assertEqual(h["dias"]["2026-09-29"]["peticiones"], 120)
        self.assertTrue(h["dias"]["2026-09-29"]["cerrado"])
        self.assertEqual(h["dias"]["2026-09-29"]["cierre"], "completo")
        self.assertFalse(h["dias"]["2026-09-30"]["cerrado"])
        # Se relee una sola vez.
        n = len(http.llamadas)
        self.vuelta("2026-09-30T00:25:00", http)
        self.assertEqual(len(http.llamadas) - n, 2)
        # Solo 45 días.
        h["dias"] = {(dt.date(2026, 7, 1) + dt.timedelta(days=i)).isoformat(): {"peticiones": 1, "cerrado": True}
                     for i in range(60)}
        with open(self.rutas["historial"], "w", encoding="utf-8") as f:
            json.dump(h, f)
        self.vuelta("2026-09-30T00:40:00", http)
        with open(self.rutas["historial"], encoding="utf-8") as f:
            self.assertEqual(len(json.load(f)["dias"]), V.DIAS_HISTORIAL)

    def test_bucle_avisa_y_no_repite_en_tres_horas(self):
        filas = [{"ruta": "/rest/v1/os_mesh_relay", "ua": "Chrome", "st": "200", "n": 2100}]
        http = Falso(hora=filas, dia=dia_con(100))
        d = self.vuelta("2026-09-29T10:00:00", http)
        self.assertEqual(d["ultimo_bucle"]["ruta"], "/rest/v1/os_mesh_relay")
        self.vuelta("2026-09-29T10:15:00", http)
        self.assertEqual(sum(a.startswith("BUCLE") for a in self.avisos), 1)
        self.vuelta("2026-09-29T13:30:00", http)
        self.assertEqual(sum(a.startswith("BUCLE") for a in self.avisos), 2)

    def test_ninguna_clave_en_lo_escrito(self):
        filas = [{"ruta": "/auth/v1/user", "ua": "node " + CLAVE_SERVICIO, "st": "200", "n": 2000}]
        self.vuelta("2026-09-29T20:00:00", Falso(hora=filas, dia=dia_con(26000)))
        for k in ("salida", "historial", "presupuestos"):
            with open(self.rutas[k], encoding="utf-8") as f:
                texto = f.read()
            self.assertNotIn("firmaSecreta", texto)
            self.assertNotIn(CRED["token"], texto)
        self.assertFalse(any("firmaSecreta" in a for a in self.avisos))

    def test_seco_no_escribe_ni_avisa(self):
        http = Falso(dia=dia_con(26000))
        self.vuelta("2026-09-29T20:00:00", http, seco=True)
        self.assertEqual(http.escrituras(), [])
        self.assertEqual(self.avisos, [])


if __name__ == "__main__":
    unittest.main()
