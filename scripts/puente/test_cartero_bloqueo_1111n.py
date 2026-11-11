# -*- coding: utf-8 -*-
"""DIR1111N · una entrega lenta no frena a las rápidas; llamadas acotadas; cola con retroceso; lectura
de límites vieja avisada una vez. Todo con proveedores FALSOS, reloj falso y carpetas temporales."""

import json
import os
import sys
import tempfile
import threading
import time
import unittest
from datetime import datetime, timedelta, timezone
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import cartero_director as C
import director_chat as dc
import director_presidente as P
import medidor_claude_terminal as MCT
import motores_director as M
import vigia_medidores as V

AHORA = datetime(2026, 11, 11, 12, tzinfo=timezone.utc).timestamp()


def limites(hace_min=10, t0=AHORA):
    t = datetime.fromtimestamp(t0, timezone.utc)
    return {"lecturas": [{
        "t": (t - timedelta(minutes=hace_min)).isoformat(),
        "sesion_pct": 20, "sesion_reinicio": (t + timedelta(hours=3)).isoformat(),
        "semana_pct": 30, "semana_reinicio": (t + timedelta(days=3)).isoformat(),
    }]}


class TestRapidasNoEsperan(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.raiz = self.tmp.name
        self.suelta = threading.Event()
        self.en_llamada = threading.Event()
        self.ordenes = []
        # Se parchea `_correr` (lo de dentro) para que el gancho que suelta el cerrojo sea el de verdad.
        for p in (mock.patch.object(M, "_correr", side_effect=self.correr),
                  mock.patch.object(M, "direccion_motor", return_value={"motor": "claude", "sesion": None})):
            p.start()
            self.addCleanup(p.stop)
        self.estado = {"atendidos": [], "sesion_claude": None, "opus_fecha": "", "opus_hoy": 0,
                       "ultimo_informe": time.time()}
        self.desp = C.Despachador()
        self.addCleanup(self.suelta.set)

    def tearDown(self):
        self.suelta.set()
        self.tmp.cleanup()

    def correr(self, orden, entrada, segundos, env, cwd):
        self.ordenes.append((orden[0], orden[1] if len(orden) > 1 else "", segundos))
        if orden[:2] == ["hermes", "send"]:
            return 0, "enviado"
        self.en_llamada.set()
        self.suelta.wait(10)  # el proveedor lento
        return 0, "respuesta lenta"

    def publicar(self, texto, canal):
        return dc.publicar(texto, de="alex", rol="alex", tipo="mensaje", canales=[canal], raiz=self.raiz)

    def estados(self, idm):
        return [r["estado"] for r in dc.leer(limite=500, raiz=self.raiz)
                if r.get("tipo") == "entrega" and r.get("de_id") == idm]

    def test_telegram_sale_mientras_un_proveedor_esta_en_llamada(self):
        lento = self.publicar("pregunta a Hermes", "hermes")
        self.assertTrue(self.en_llamada.wait(0) is False)
        C.pasada(self.estado, raiz=self.raiz, despachador=self.desp)
        self.assertTrue(self.en_llamada.wait(5), "la llamada lenta debió empezar")
        aviso = self.publicar("prueba.37 lista", "telegram")  # llega MIENTRAS corre la llamada
        t0 = time.time()
        C.pasada(self.estado, raiz=self.raiz, despachador=self.desp)
        self.assertLess(time.time() - t0, 2, "la pasada no espera al proveedor")
        self.assertIn("entregado", self.estados(aviso["id"]))
        self.assertEqual([], self.estados(lento["id"]), "la lenta sigue sin terminar")
        self.assertIn("%s|telegram" % aviso["id"], self.estado["atendidos"])
        # El estado se guarda aunque la llamada siga en el aire.
        guardado = C.cargar_estado(self.raiz)
        self.assertIn("%s|telegram" % aviso["id"], guardado["atendidos"])
        # Una segunda pasada no vuelve a lanzar la misma entrega (en vuelo).
        C.pasada(self.estado, raiz=self.raiz, despachador=self.desp)
        self.assertEqual(1, sum(1 for o in self.ordenes if o[0] == "hermes" and o[1] == "-z"))
        self.suelta.set()
        self.desp.esperar()
        self.assertEqual(["respondido"], self.estados(lento["id"]))
        self.assertIn("%s|hermes" % lento["id"], self.estado["atendidos"])

    def test_sin_despachador_las_rapidas_van_antes_que_las_lentas(self):
        self.suelta.set()
        self.publicar("lenta primero", "hermes")
        self.publicar("rápida después", "telegram")
        C.pasada(self.estado, raiz=self.raiz)
        primeros = [o[0] + (" " + o[1]) for o in self.ordenes]
        self.assertEqual("hermes send", primeros[0])

    def test_no_se_entrega_dos_veces_si_acaba_justo_entre_decidir_y_lanzar(self):
        m = self.publicar("ya atendida", "hermes")
        self.estado["atendidos"].append("%s|hermes" % m["id"])
        ejecutado = []
        self.desp.lanzar(C.CARRIL_DIRECTO, (m["id"], "hermes"), lambda: ejecutado.append(1), self.estado)
        self.desp.esperar()
        self.assertEqual([], ejecutado)


class TestCerrojo(unittest.TestCase):
    def test_suelta_solo_para_su_dueno(self):
        c = C.CerrojoEstado()
        with c:
            with c.soltar():
                self.assertTrue(c._lock.acquire(timeout=1))  # otro hilo podría entrar
                c._lock.release()
        # Un hilo que no es dueño: soltar no hace nada y no revienta.
        with c.soltar():
            pass
        self.assertFalse(c._lock.locked())


class TestTiempoLimite(unittest.TestCase):
    def test_correr_mata_lo_que_pasa_del_limite(self):
        t0 = time.time()
        rc, salida = M.correr(["sleep", "30"], segundos=1)
        self.assertEqual(-9, rc)
        self.assertIn("tiempo agotado", salida)
        self.assertLess(time.time() - t0, 6)

    def test_limites_de_las_llamadas_del_presidente(self):
        self.assertLessEqual(M.SEGUNDOS_PROVEEDOR_PRESIDENTE, 120)
        self.assertLessEqual(M.SEGUNDOS_SESION_FRESCA, 120)
        self.assertLessEqual(M.SEGUNDOS_AVISO_TELEGRAM, 60)
        vistos = []

        def falso(orden, entrada=None, segundos=300, env=None, cwd=None):
            vistos.append((orden[0], segundos))
            if orden[0] == "claude":
                return 0, json.dumps({"result": "", "is_error": True})
            return (1, "") if orden[0] == "hermes" else (1, "")

        with tempfile.TemporaryDirectory() as raiz:
            m = dc.publicar("hola", de="alex", rol="alex", tipo="mensaje", canales=[P.CANAL], raiz=raiz)
            P.atender(m, {"atendidos": []}, raiz=raiz, correr=falso, existe=lambda n: True,
                      limites=limites(), ahora=AHORA, sesion_hermes=None)
        self.assertEqual({"claude", "hermes", "codex"}, {v[0] for v in vistos})
        self.assertTrue(all(s <= 120 for _, s in vistos), vistos)

    def test_la_sesion_nueva_de_hermes_en_el_cartero_dura_dos_minutos_como_mucho(self):
        aviso = "⏸ This chat is paused. Hermes couldn't confirm how the last turn ended. " \
                "run `hermes sessions discard 20260909_210504_867626 --yes`. Your message was not sent."
        vistos = []

        def falso(orden, **k):
            vistos.append(("--resume" in orden, k.get("segundos")))
            return (3, aviso) if "--resume" in orden else (0, "contesta")

        with tempfile.TemporaryDirectory() as raiz, \
                mock.patch.object(C.motores_director, "correr", side_effect=falso), \
                mock.patch.object(C.motores_director, "direccion_motor",
                                  return_value={"motor": "hermes", "sesion": "20260909_210504_867626"}):
            m = dc.publicar("¿estado?", de="alex", rol="alex", tipo="mensaje", canales=["hermes"], raiz=raiz)
            C.atender(m, "hermes", {"atendidos": []}, raiz=raiz)
        self.assertEqual([(True, 600), (False, M.SEGUNDOS_SESION_FRESCA)], vistos)


class TestColaConRetroceso(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.raiz = self.tmp.name
        self.m = dc.publicar("¿Qué toca?", de="alex", rol="alex", tipo="mensaje", canales=[P.CANAL], raiz=self.raiz)
        self.estado = {"atendidos": []}
        self.llamadas = []
        self.hermes_vivo = False

    def tearDown(self):
        self.tmp.cleanup()

    def correr(self, orden, **k):
        self.llamadas.append(orden[0])
        if orden[0] == "hermes" and self.hermes_vivo:
            return 0, "Hermes contesta"
        return 1, ""

    def atender(self, ahora, lim=None, solo_hermes=True):
        return P.atender(self.m, self.estado, raiz=self.raiz, correr=self.correr,
                         existe=lambda n: n == "hermes", limites={} if lim is None else lim, ahora=ahora)

    def entrada(self):
        return self.estado["presidente"]["cola"][self.m["id"]]

    def test_la_secuencia_crece_hasta_el_techo(self):
        self.assertEqual([120, 240, 480, 900, 900, 900], [P.intervalo_cola(n) for n in range(1, 7)])
        ahora, huecos = AHORA, []
        for _ in range(6):
            self.assertEqual("cola", self.atender(ahora))
            huecos.append(self.entrada()["proximo"] - ahora)
            ahora = self.entrada()["proximo"]
        self.assertEqual([120, 240, 480, 900, 900, 900], huecos)

    def test_antes_del_proximo_intento_espera_sin_llamar(self):
        self.atender(AHORA)
        n = len(self.llamadas)
        self.assertEqual("espera", self.atender(AHORA + 60))
        self.assertEqual(n, len(self.llamadas))

    def test_el_estado_visible_dice_motivo_intento_y_proximo(self):
        self.atender(AHORA)
        ultima = [r for r in dc.leer(limite=500, raiz=self.raiz) if r.get("tipo") == "entrega"][-1]
        self.assertEqual("pendiente", ultima["estado"])
        d = ultima["detalle"]
        self.assertTrue(d.startswith("En cola:"))
        self.assertIn("Hermes", d)  # el motivo
        self.assertIn("Intento 1", d)
        self.assertIn("hacia las", d)
        self.assertIn("en 2 min", d)

    def test_responde_en_cuanto_vuelve_un_proveedor_sin_esperar_el_intervalo(self):
        ahora = AHORA
        for _ in range(4):
            self.atender(ahora)
            ahora = self.entrada()["proximo"]
        # Hermes vuelve; aún faltan 15 min para el siguiente intento, pero hay una lectura nueva de límites
        self.hermes_vivo = True
        self.assertEqual("espera", self.atender(ahora - 600))
        self.assertEqual("respondido", self.atender(ahora - 600, lim=limites(t0=ahora - 600, hace_min=1)))
        self.assertNotIn(self.m["id"], self.estado["presidente"]["cola"])

    def test_una_respuesta_de_otro_proveedor_despierta_la_cola(self):
        self.atender(AHORA)
        self.assertEqual("espera", self.atender(AHORA + 30))
        self.hermes_vivo = True
        P.despertar_cola(self.estado, ahora=AHORA + 40)  # p. ej. Hermes contestó en el canal directo
        self.assertEqual("respondido", self.atender(AHORA + 50))

    def test_tras_volver_y_caer_otra_vez_la_cuenta_empieza_de_nuevo(self):
        ahora = AHORA
        for _ in range(3):
            self.atender(ahora)
            ahora = self.entrada()["proximo"]
        P.despertar_cola(self.estado, ahora=ahora - 10)
        self.assertEqual("cola", self.atender(ahora - 5))
        self.assertEqual(1, self.entrada()["intentos"])


class TestLecturaVieja(unittest.TestCase):
    def test_se_avisa_una_vez_y_se_rearma_con_una_lectura_fresca(self):
        ahora = datetime.fromtimestamp(AHORA, timezone.utc)
        vieja = limites(hace_min=5 * 1440)
        txt, est = V.aviso_lectura_claude(vieja, ahora, {}, "claude -p /usage solo da el coste")
        self.assertIn("hace 5 días", txt)
        self.assertIn("no elige a Claude", txt)
        self.assertIn("solo da el coste", txt)
        txt2, est2 = V.aviso_lectura_claude(vieja, ahora + timedelta(hours=1), est)
        self.assertIsNone(txt2)
        self.assertEqual(est, est2)
        txt3, est3 = V.aviso_lectura_claude(limites(hace_min=5), ahora, est2)
        self.assertIsNone(txt3)
        self.assertEqual({}, est3)
        txt4, _ = V.aviso_lectura_claude(vieja, ahora, est3)
        self.assertIsNotNone(txt4)

    def test_una_lectura_de_hace_una_hora_no_avisa(self):
        ahora = datetime.fromtimestamp(AHORA, timezone.utc)
        self.assertIsNone(V.aviso_lectura_claude(limites(hace_min=100), ahora, {})[0])

    def test_sin_ninguna_lectura_avisa(self):
        ahora = datetime.fromtimestamp(AHORA, timezone.utc)
        txt, _ = V.aviso_lectura_claude({}, ahora, {})
        self.assertIn("no hay ninguna lectura", txt)

    def test_vigilar_publica_una_sola_vez_con_archivos_temporales(self):
        ahora = datetime.fromtimestamp(AHORA, timezone.utc)
        publicados = []
        with tempfile.TemporaryDirectory() as d:
            ruta = os.path.join(d, "aviso.json")
            med = os.path.join(d, "medidores.json")
            with open(med, "w") as f:
                json.dump({"medidores": {"claude": {"error": "claude no está usando la suscripción"}}}, f)
            args = dict(ahora=ahora, leer_limites=lambda: limites(hace_min=3000), ruta=ruta,
                        publicar=publicados.append, ruta_medidores=med)
            self.assertEqual("avisado", V.vigilar_lectura_claude(**args))
            self.assertEqual("vieja, ya avisada", V.vigilar_lectura_claude(**args))
            self.assertEqual("vieja, ya avisada", V.vigilar_lectura_claude(**args))
        self.assertEqual(1, len(publicados))
        self.assertIn("suscripción", publicados[0])


class TestLectorTerminal(unittest.TestCase):
    def test_solo_coste_se_dice_claro(self):
        salida = "Total cost:            $0.0000\nTotal duration (API):  0s\nUsage: 0 input, 0 output\n"
        r = MCT.interpretar(salida, datetime(2026, 11, 11, 12, tzinfo=timezone.utc))
        self.assertFalse(r["ok"])
        self.assertIn("solo da el coste", r["error"])
        self.assertIn("claude auth status", r["error"])


if __name__ == "__main__":
    unittest.main()
