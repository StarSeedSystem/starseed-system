#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""(BAN1114C) El programa de la serie con reloj, registro, medidas, ronda y director FALSOS en una carpeta temporal. Nada real."""
import json
import os
import subprocess
import sys
import tempfile
import time
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import banco_llamadas as BLL  # noqa: E402
import banco_llamadas_logica as L  # noqa: E402
import banco_pruebas_logica as BL  # noqa: E402
import director_pruebas as DP  # noqa: E402
import director_pruebas_logica as D  # noqa: E402
import ronda as R  # noqa: E402
from test_banco_llamadas import (ESC, NEU_TAB, T0, iso, l_app, llamada, lec)  # noqa: E402
from test_director_pruebas import Falso  # noqa: E402
from test_ronda import MundoFalso  # noqa: E402

U = L.Umbrales(env={}, nucleos=8)


class MundoSim(BLL.Mundo):
    """El mundo de la serie: reloj propio, registro en memoria que «escribe» la app simulada, medidas a mano y la ronda por el director de verdad
    (la petición se atiende al instante con `ronda.aplicar`, como hace el director en su pasada)."""

    def __init__(self, tmp, armada=True, t=T0):
        super().__init__(dir_estado=tmp, logs=os.path.join(tmp, "logs"))
        self.t = t
        self.rm = MundoFalso(tmp, t=t)
        self.rm.ahora = self.ahora
        self.log = []                       # [(t_visible, linea)]
        self.pendientes = []                # lo que la app irá escribiendo en el futuro [(t, linea)]
        self.lectura = lambda t: lec(t)
        self.peticiones = []
        self.ordenes_vistas = []
        self.plan = {}                      # n -> dict(llamada kwargs) | "silencio" | "rechaza:<motivo>"
        self.director_vivo = True
        self.ultimo_sondeo = None
        self.armada = armada
        self.al_dormir = None
        if armada:
            self.log.append((t - 30, l_app(t - 30, "banco armada con=%s hasta=%s restantes=40" % (NEU_TAB, iso(t + 4 * 3600)[:-5] + "Z"))))

    def ahora(self):
        return self.t

    def dormir(self, s):
        if self.al_dormir:
            self.al_dormir(self)
        self.t += s
        self.rm.t = self.t
        if self.armada and (self.ultimo_sondeo is None or self.t - self.ultimo_sondeo >= 60) and not self.pendientes:
            self.ultimo_sondeo = self.t
            self.log.append((self.t, l_app(self.t, "banco sondeo orden=ninguna")))
        self.log += [x for x in self.pendientes if x[0] <= self.t]
        self.pendientes = [x for x in self.pendientes if x[0] > self.t]
        orden = self.leer_json(BLL.ORDEN)
        if orden and orden["n"] not in [o["n"] for o in self.ordenes_vistas]:
            self.ordenes_vistas.append(orden)
            self.app_toma(orden)

    def app_toma(self, orden):
        """Lo que haría la app armada al ver la orden: marcas y registro de la llamada (a partir de dentro de 3 s)."""
        plan = self.plan.get(orden["n"], {})
        n, t0 = orden["n"], self.t + 3
        if plan == "silencio":
            return
        if isinstance(plan, str) and plan.startswith("rechaza:"):
            self.pendientes.append((t0, "%s web %s · llamada · b3 · neurona %s · banco rechaza esc=%s serie=%s n=%d motivo=%s" % (
                iso(t0 + 1), iso(t0), NEU_TAB, ESC, orden["serie"], n, plan[8:])))
            return
        texto = llamada(serie=orden["serie"], n=n, t0=t0, **plan)
        for linea in texto.splitlines():
            t_vis = BL.parse_linea(linea)["t"] + (8 if "(Maggaboard)" in linea else 0)
            self.pendientes.append((t_vis, linea))

    def leer_log(self):
        return "\n".join(x[1] for x in self.log if x[0] <= self.t) + "\n"

    def medir(self):
        return self.lectura(self.t)

    def pedir(self, accion, nota=None, minutos=None):
        self.peticiones.append(accion)
        if self.director_vivo:
            R.aplicar(self.rm, accion, BLL.QUIEN, nota or "x", minutos, "pet-%d" % len(self.peticiones))
        return "pet-%d" % len(self.peticiones)

    def ronda_vista(self):
        return R.vista(R.normalizar(self.rm.leer_json(R.ARCHIVO)), self.t)


def serie(m, rep=3, cfg=None, para=None):
    cfg = cfg or BLL.Config(env={})
    s = BLL.Serie(m, ESC, rep, "claude", para, u=U, cfg=cfg, decir=lambda x: None)
    return s, s.correr()


class Base(unittest.TestCase):
    def setUp(self):
        self._t = tempfile.TemporaryDirectory()
        self.tmp = self._t.name
        self.addCleanup(self._t.cleanup)

    def m(self, **k):
        return MundoSim(self.tmp, **k)

    def guardado(self):
        return json.load(open(os.path.join(self.tmp, "banco-llamadas", "banco-llamadas.json"), encoding="utf-8"))["series"][0]

    def assertLimpio(self, m):
        self.assertFalse(os.path.exists(m.ruta(BLL.ORDEN)), "orden.json quedó")
        self.assertFalse(R.vista(R.normalizar(m.rm.leer_json(R.ARCHIVO)), m.t)["activa"], "la ronda quedó tomada")


class Series(Base):
    def test_tres_llamadas_buenas_terminan_con_bien_simulado_y_sueltan_todo(self):
        m = self.m()
        s, est = serie(m, 3)
        self.assertEqual(est["estado"], "terminada", est["motivo_fin"])
        self.assertEqual([j["valida"] and j["cumple"] for j in est["llamadas"]], [True, True, True])
        self.assertEqual(est["veredicto"]["c2"]["veredicto"], "bien")
        self.assertEqual(est["veredicto"]["c3"]["veredicto"], "bien")
        self.assertIn("simulado", est["veredicto"]["c2"]["sugerencia"])
        self.assertIs(est["medio_real"], False)
        self.assertEqual(m.peticiones, ["ronda-iniciar", "ronda-terminar"])
        self.assertLimpio(m)
        g = self.guardado()
        self.assertEqual((g["serie"], g["estado"], len(g["llamadas"])), (s.id, "terminada", 3))
        self.assertEqual([o["n"] for o in m.ordenes_vistas], [1, 2, 3])
        self.assertTrue(all(o["para"] == NEU_TAB for o in m.ordenes_vistas))       # la neurona sale de la marca «armada»
        calma = json.load(open(m.ruta(BLL.CALMA), encoding="utf-8"))
        self.assertEqual((calma["v"], calma["serie"]), (1, s.id))

    def test_la_orden_escrita_es_la_del_contrato_y_no_dura_mas_que_la_toma(self):
        m = self.m()
        serie(m, 1)
        o = m.ordenes_vistas[0]
        self.assertEqual((o["v"], o["escenario"], o["de_n"], o["dur_s"], o["medio"], o["tipo"]), (1, ESC, 1, 120, "sin-ip-desde-inicio", "video"))
        self.assertEqual(o["guion"], [{"t_s": 120, "quien": "mac", "accion": "colgar"}])

    def test_nueve_de_diez_buenas_es_bien_y_ocho_es_falla(self):
        m = self.m()
        m.plan = {4: dict(fps=1)}
        _, est = serie(m, 10)
        self.assertEqual((est["estado"], est["veredicto"]["c2"]["veredicto"], est["veredicto"]["c2"]["cumplen"]), ("terminada", "bien", 9))
        self.assertLimpio(m)
        self._t.cleanup()
        self._t = tempfile.TemporaryDirectory()
        self.tmp = self._t.name
        m = self.m()
        m.plan = {2: dict(fps=1), 7: dict(inventado=30)}
        _, est = serie(m, 10)
        self.assertEqual(est["veredicto"]["c2"]["veredicto"], "falla")
        self.assertIn("fps recibidos", est["veredicto"]["c2"]["sugerencia"])
        self.assertEqual(est["veredicto"]["c3"]["veredicto"], "bien")

    def test_una_serie_de_diez_cabe_en_los_90_minutos_de_la_ronda(self):
        m = self.m()
        serie(m, 10)
        r = R.normalizar(m.rm.leer_json(R.ARCHIVO))["ronda"]
        gastado = R.de_iso(r["fin"]) - R.de_iso(r["desde"])
        self.assertLess(gastado, 90 * 60)
        self.assertGreater(gastado, 10 * 120)

    def test_sin_la_app_armada_no_empieza_nada(self):
        m = self.m(armada=False)
        _, est = serie(m, 10)
        self.assertEqual(est["estado"], "abortada")
        self.assertIn("la app de la Mac no está en modo banco o no sondea", est["motivo_fin"])
        self.assertEqual(est["veredicto"]["c2"]["veredicto"], "sin-veredicto")
        self.assertEqual(m.peticiones, [])
        self.assertEqual(m.ordenes_vistas, [])
        self.assertLimpio(m)

    def test_app_que_dejo_de_sondear_dice_desde_que_hora(self):
        m = self.m()
        m.t += 400                       # la última marca (armada) tiene 430 s
        m.rm.t = m.t
        _, est = serie(m, 3)
        self.assertRegex(est["motivo_fin"], r"no sondea desde las \d\d:\d\d$")

    def test_si_la_mac_no_se_calma_espera_el_limite_y_dice_que_lectura_fallo(self):
        m = self.m()
        m.lectura = lambda t: lec(t, presion=2, carga1=7.2)
        cfg = BLL.Config(env={})
        u = L.Umbrales(env={"STARSEED_BANCO_ESPERA_CALMA_S": "600"}, nucleos=8)
        s = BLL.Serie(m, ESC, 10, "claude", u=u, cfg=cfg, decir=lambda x: None)
        est = s.correr()
        self.assertEqual(est["estado"], "abortada")
        self.assertIn("no estuvo en calma", est["motivo_fin"])
        self.assertIn("presión de memoria 2", est["motivo_fin"])
        self.assertIn("carga 1 min 7,2", est["motivo_fin"].replace(".", ","))
        self.assertEqual(m.peticiones, [])            # nunca pidió la ronda
        self.assertGreaterEqual(m.t - T0, 600)
        self.assertEqual(L.Umbrales(env={}, nucleos=8).espera_calma_s, 7200.0)

    def test_espera_a_la_calma_y_empieza_cuando_llega(self):
        m = self.m()
        m.lectura = lambda t: lec(t, presion=2) if t < T0 + 400 else lec(t)
        _, est = serie(m, 1)
        self.assertEqual(est["estado"], "terminada")
        self.assertGreaterEqual(m.ordenes_vistas[0] and BL._a_epoch(m.ordenes_vistas[0]["creada"]), T0 + 400)

    def test_si_la_app_nunca_toma_la_orden_acaba_sin_veredicto_y_sin_orden(self):
        m = self.m()
        m.plan = {1: "silencio"}
        _, est = serie(m, 5)
        self.assertEqual(est["estado"], "abortada")
        self.assertIn("no hubo «banco inicio» en 90 s", est["motivo_fin"])
        self.assertEqual(est["veredicto"]["c2"]["veredicto"], "sin-veredicto")
        self.assertLimpio(m)
        self.assertEqual(m.peticiones, ["ronda-iniciar", "ronda-terminar"])

    def test_la_tableta_rechaza_y_la_serie_para_con_el_motivo(self):
        for motivo, texto in (("modo-apagado", "apagado"), ("falta-permiso", "permiso"), ("otra-llamada", "otra llamada"), ("orden-caducada", "caducada")):
            self._t.cleanup()
            self._t = tempfile.TemporaryDirectory()
            self.tmp = self._t.name
            m = self.m()
            m.plan = {1: "rechaza:" + motivo}
            _, est = serie(m, 3)
            self.assertEqual(est["estado"], "abortada", motivo)
            self.assertIn("rechazada", est["motivo_fin"])
            self.assertIn(texto, est["motivo_fin"])
            self.assertLimpio(m)

    def test_otra_ronda_activa_que_no_es_suya_no_empieza_ni_la_toca(self):
        m = self.m()
        R.aplicar(m.rm, "ronda-iniciar", "alex", "llamadas a mano", 30, "pet-x")
        _, est = serie(m, 3)
        self.assertEqual(est["estado"], "abortada")
        self.assertIn("otra ronda de aparatos activa (alex", est["motivo_fin"])
        self.assertEqual(m.peticiones, [])
        self.assertTrue(R.vista(R.normalizar(m.rm.leer_json(R.ARCHIVO)), m.t)["activa"])      # la de Alex sigue
        self.assertEqual(m.ordenes_vistas, [])

    def test_si_la_serie_no_cabe_en_la_ronda_dice_serie_incompleta_k_de_n(self):
        m = self.m()
        cfg = BLL.Config(env={"STARSEED_BANCO_CICLO_S": "4500"})          # una llamada «necesita» 75 min: con 90 de ronda caben 2 o 3
        _, est = serie(m, 10, cfg)
        self.assertEqual(est["estado"], "abortada")
        self.assertRegex(est["motivo_fin"], r"^serie incompleta: \d de 10")
        k = len(est["llamadas"])
        self.assertTrue(2 <= k <= 4, k)
        self.assertIn("serie incompleta: %d de 10" % k, est["veredicto"]["c2"]["sugerencia"])
        self.assertNotEqual(est["veredicto"]["c2"]["veredicto"], "bien")
        self.assertLimpio(m)

    def test_la_ronda_se_renueva_cuando_quedan_menos_de_15_minutos(self):
        m = self.m()
        m.rm.t = m.t
        cfg = BLL.Config(env={"STARSEED_BANCO_RENOVAR_S": "4000", "STARSEED_BANCO_RONDA_MIN": "30"})
        _, est = serie(m, 6, cfg)
        self.assertGreater(m.peticiones.count("ronda-iniciar"), 1, m.peticiones)
        self.assertEqual(m.peticiones[-1], "ronda-terminar")
        self.assertLimpio(m)

    def test_si_la_ronda_se_pierde_a_media_serie_para(self):
        m = self.m()
        def al_dormir(mm):
            if len(mm.ordenes_vistas) == 1 and mm.leer_json(BLL.ORDEN) is None and mm.t > BL._a_epoch(mm.ordenes_vistas[0]["creada"]) + 200:
                R.aplicar(mm.rm, "ronda-terminar", "alex", None, None)
        m.al_dormir = al_dormir
        _, est = serie(m, 5)
        self.assertEqual(est["estado"], "abortada")
        self.assertRegex(est["motivo_fin"], r"^serie incompleta: 1 de 5 \(la ronda de aparatos ya no es de esta serie")

    def test_si_el_director_no_toma_la_ronda_no_empieza_y_pide_soltarla(self):
        m = self.m()
        m.director_vivo = False
        _, est = serie(m, 3)
        self.assertEqual(est["estado"], "abortada")
        self.assertIn("el director no tomó la petición de ronda", est["motivo_fin"])
        self.assertEqual(m.peticiones, ["ronda-iniciar", "ronda-terminar"])      # por si el director la toma tarde

    def test_sigterm_en_mitad_de_una_llamada_suelta_la_ronda_y_borra_la_orden(self):
        m = self.m()
        def al_dormir(mm):
            if len(mm.ordenes_vistas) == 1 and mm.leer_json(BLL.ORDEN) is None and mm.t > BL._a_epoch(mm.ordenes_vistas[0]["creada"]) + 60:
                raise SystemExit(143)
        m.al_dormir = al_dormir
        s = BLL.Serie(m, ESC, 3, "claude", u=U, cfg=BLL.Config(env={}), decir=lambda x: None)
        with self.assertRaises(SystemExit):
            s.correr()
        self.assertLimpio(m)
        self.assertEqual(m.peticiones[-1], "ronda-terminar")
        g = self.guardado()
        self.assertEqual(g["estado"], "abortada")
        self.assertIn("interrumpida", g["motivo_fin"])

    def test_un_error_inesperado_tambien_suelta_todo(self):
        m = self.m()
        m.plan = {1: {}}
        def al_dormir(mm):
            if mm.ordenes_vistas:
                raise RuntimeError("se rompió")
        m.al_dormir = al_dormir
        _, est = serie(m, 3)
        self.assertEqual(est["estado"], "abortada")
        self.assertIn("error inesperado: RuntimeError", est["motivo_fin"])
        self.assertLimpio(m)

    def test_una_llamada_con_la_mac_agobiada_no_cuenta_y_queda_dicho(self):
        m = self.m()
        m.lectura = lambda t: lec(t, carga1=8.0) if (T0 + 400 <= t <= T0 + 520) else lec(t)
        m.plan = {}
        _, est = serie(m, 3)
        no_validas = [j for j in est["llamadas"] if not j["valida"]]
        self.assertEqual(len(no_validas), 1)
        self.assertIn("no estuvo en calma durante la llamada", no_validas[0]["motivos_invalida"][0])
        self.assertEqual(est["veredicto"]["c2"]["veredicto"], "sin-veredicto")       # con 3 repeticiones se piden 3 válidas
        self.assertIn("no valieron", est["veredicto"]["c2"]["sugerencia"])

    def test_las_series_se_guardan_con_las_diez_ultimas(self):
        m = self.m()
        for i in range(12):
            m.t = T0 + i * 100000
            m.rm.t = m.t
            m.log = []
            m.armada = False
            serie(m, 1)
        d = json.load(open(m.ruta(BLL.SERIES), encoding="utf-8"))
        self.assertEqual(len(d["series"]), 10)


class SinLaAppDeLaMac(unittest.TestCase):
    """Sin el lado de la app (TypeScript y Rust) la serie pedida acaba limpia en «sin veredicto»: proceso real, carpeta temporal."""

    def test_el_programa_real_acaba_sin_veredicto_y_sin_dejar_nada(self):
        with tempfile.TemporaryDirectory() as tmp:
            logs = os.path.join(tmp, "logs")
            os.makedirs(logs)
            open(os.path.join(logs, "enlaces.log"), "w").write("")
            env = dict(os.environ, STARSEED_PRODUCCION_DIR=tmp, STARSEED_BANCO_LOGS=logs)
            r = subprocess.run([sys.executable, BLL.__file__, "serie", "--esc", ESC, "--rep", "10", "--quien", "prueba"], env=env,
                               capture_output=True, text=True, timeout=60)
            self.assertEqual(r.returncode, 1, r.stdout + r.stderr)
            self.assertIn("sin veredicto", r.stdout)
            d = json.load(open(os.path.join(tmp, "banco-llamadas", "banco-llamadas.json"), encoding="utf-8"))["series"][0]
            self.assertEqual(d["estado"], "abortada")
            self.assertEqual(d["veredicto"]["c2"]["veredicto"], "sin-veredicto")
            self.assertFalse(os.path.exists(os.path.join(tmp, "banco-llamadas", "orden.json")))
            self.assertFalse(os.path.exists(os.path.join(tmp, "ronda-aparatos.json")))
            e = subprocess.run([sys.executable, BLL.__file__, "estado"], env=env, capture_output=True, text=True, timeout=30)
            self.assertIn("sin veredicto", e.stdout)
            self.assertIn("simulado", e.stdout)

    def test_solo_una_serie_a_la_vez(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.assertFalse(BLL.serie_viva(tmp))
            os.makedirs(os.path.join(tmp, "banco-llamadas"))
            import fcntl
            with open(os.path.join(tmp, "banco-llamadas", BLL.LOCK), "a") as f:
                fcntl.flock(f, fcntl.LOCK_EX | fcntl.LOCK_NB)
                self.assertTrue(BLL.serie_viva(tmp))
                ok, texto = BLL.lanzar_desacoplado(tmp, ESC, 10, "claude")
                self.assertFalse(ok)
                self.assertIn("ya hay una serie", texto)
            self.assertFalse(BLL.serie_viva(tmp))

    def test_lanzar_desacoplado_vuelve_al_instante_y_el_hijo_sigue_solo(self):
        with tempfile.TemporaryDirectory() as tmp:
            logs = os.path.join(tmp, "logs")
            os.makedirs(logs)
            os.environ["STARSEED_BANCO_LOGS"] = logs
            self.addCleanup(os.environ.pop, "STARSEED_BANCO_LOGS", None)
            t0 = time.time()
            ok, texto = BLL.lanzar_desacoplado(tmp, ESC, 10, "claude")
            self.assertTrue(ok, texto)
            self.assertLess(time.time() - t0, 2)
            ruta = os.path.join(tmp, "banco-llamadas", "banco-llamadas.json")
            for _ in range(100):
                if os.path.exists(ruta) and json.load(open(ruta))["series"][0]["estado"] != "en-curso":
                    break
                time.sleep(0.1)
            self.assertEqual(json.load(open(ruta))["series"][0]["estado"], "abortada")


class Director(unittest.TestCase):
    def setUp(self):
        self._t = tempfile.TemporaryDirectory()
        self.addCleanup(self._t.cleanup)
        self.m = Falso(self._t.name)
        self.m.lanzadas = []
        self.m.serie_ok = True
        outer = self.m

        def lanzar_serie_banco(esc, rep, quien):
            outer.lanzadas.append((esc, rep, quien))
            return (True, "serie lanzada (pid 1)") if outer.serie_ok else (False, "ya hay una serie de llamadas en marcha")
        self.m.lanzar_serie_banco = lanzar_serie_banco

    def pedir(self, **campos):
        pid = DP.escribir_peticion(self.m.dir, "banco-serie", "claude", self.m.t, **campos)
        return pid

    def test_banco_serie_es_una_accion_nueva_y_no_cambia_las_demas(self):
        self.assertEqual(D.ACCIONES[:8], ("compilar", "cancelar", "reintentar", "republicar", "pedir-arreglo", "app-abrir", "ronda-iniciar", "ronda-terminar"))
        self.assertEqual(D.ACCIONES[8:], ("banco-serie",))

    def test_pedir_lanza_la_serie_aparte_y_la_peticion_queda_hecha(self):
        self.pedir(esc=ESC, rep=10)
        est = DP.pasada(self.m)
        self.assertEqual(self.m.lanzadas, [(ESC, 10, "claude")])
        fila = [p for p in est["peticiones"] if p["accion"] == "banco-serie"][0]
        self.assertEqual(fila["estado"], "hecha")
        self.assertIn("serie lanzada", fila["resultado"])

    def test_si_ya_hay_una_serie_la_peticion_se_rechaza_con_el_motivo(self):
        self.m.serie_ok = False
        self.pedir(esc=ESC, rep=3)
        est = DP.pasada(self.m)
        fila = [p for p in est["peticiones"] if p["accion"] == "banco-serie"][0]
        self.assertEqual(fila["estado"], "rechazada")
        self.assertIn("ya hay una serie", fila["resultado"])

    def test_una_pasada_sin_peticiones_no_lanza_ninguna_serie(self):
        DP.pasada(self.m)
        DP.pasada(self.m)
        self.assertEqual(self.m.lanzadas, [])

    def test_peticiones_mal_hechas_no_se_escriben(self):
        for campos in (dict(esc="otro", rep=3), dict(esc=ESC), dict(esc=ESC, rep=0), dict(esc=ESC, rep=11), dict(rep=3), dict(esc=ESC, rep="3")):
            with self.assertRaises(ValueError, msg=campos):
                self.pedir(**campos)
        with self.assertRaises(ValueError):
            DP.escribir_peticion(self.m.dir, "app-abrir", "claude", self.m.t, esc=ESC, rep=3)       # solo vale para banco-serie

    def test_con_el_director_en_pausa_no_lanza_nada(self):
        self.m.pausa = lambda: "pausa de prueba"
        self.pedir(esc=ESC, rep=3)
        DP.pasada(self.m)
        self.assertEqual(self.m.lanzadas, [])

    def test_la_orden_pedir_de_la_linea_de_ordenes_acepta_esc_y_rep(self):
        with tempfile.TemporaryDirectory() as tmp:
            env = dict(os.environ, STARSEED_PRODUCCION_DIR=tmp)
            r = subprocess.run([sys.executable, DP.__file__, "pedir", "banco-serie", "--esc", ESC, "--rep", "10", "--quien", "claude"],
                               env=env, capture_output=True, text=True, timeout=30)
            self.assertEqual(r.returncode, 0, r.stderr)
            archivos = os.listdir(os.path.join(tmp, "pruebas-peticiones"))
            self.assertEqual(len(archivos), 1)
            pet = json.load(open(os.path.join(tmp, "pruebas-peticiones", archivos[0])))
            self.assertEqual((pet["accion"], pet["esc"], pet["rep"]), ("banco-serie", ESC, 10))
            r = subprocess.run([sys.executable, DP.__file__, "pedir", "banco-serie", "--esc", "ble-video-2min", "--quien", "claude"],
                               env=env, capture_output=True, text=True, timeout=30)
            self.assertEqual(r.returncode, 2)
            self.assertIn("rep", r.stderr)


if __name__ == "__main__":
    unittest.main()
