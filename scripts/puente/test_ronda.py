#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""(RON1112C) La ronda de aparatos con el reloj, el disco, la tabla de procesos y la carga FALSOS. Nada real."""
import json
import os
import subprocess
import sys
import tempfile
import time
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ronda as R  # noqa: E402

T0 = 1_794_450_000.0
AQUI = os.path.dirname(os.path.abspath(__file__))


class MundoFalso(R.Mundo):
    """El mundo de ronda.py sin tocar nada real: reloj, carga, núcleos, presión, procesos y dueño del cerrojo a mano."""

    def __init__(self, tmp, t=T0):
        super().__init__(dir_estado=tmp, cerrojos=os.path.join(tmp, "cerrojos"))
        self.t = t
        self.c = (0.5, 0.6, 0.7)
        self.n = 8
        self.p = 1
        self.procs = []
        self.dueno = None

    def ahora(self):
        return self.t

    def carga(self):
        return self.c

    def nucleos(self):
        return self.n

    def presion(self):
        return self.p

    def procesos(self):
        return list(self.procs)

    def dueno_pesado(self):
        return self.dueno


class Base(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.tmp = self._tmp.name
        self.w = MundoFalso(self.tmp)
        self._env = os.environ.get("STARSEED_RONDA_CARGA_MAX")
        os.environ.pop("STARSEED_RONDA_CARGA_MAX", None)

    def tearDown(self):
        if self._env is not None:
            os.environ["STARSEED_RONDA_CARGA_MAX"] = self._env
        self._tmp.cleanup()

    def iniciar(self, quien="alex", motivo="llamadas con la tableta", minutos=None):
        return R.aplicar(self.w, "ronda-iniciar", quien, motivo, minutos, "pet-1-aaaa")

    def terminar(self, quien="alex"):
        return R.aplicar(self.w, "ronda-terminar", quien, None, None, "pet-2-bbbb")

    def activa(self):
        return R.activa(self.w)


class EstadoDeLaRonda(Base):
    def test_sin_archivo_no_hay_ronda_y_se_puede_empezar(self):
        hay, linea = self.activa()
        self.assertFalse(hay)
        self.assertIn("se puede empezar", linea)

    def test_iniciar_guarda_quien_por_que_cuando_y_hasta_cuando(self):
        estado, texto = self.iniciar()
        self.assertEqual(estado, "hecha")
        r = R.leer(self.w)["ronda"]
        self.assertEqual((r["quien"], r["motivo"], r["desde"], r["hasta"]), ("alex", "llamadas con la tableta", R.a_iso(T0), R.a_iso(T0 + 30 * 60)))
        self.assertTrue(r["activa"])
        hay, linea = self.activa()
        self.assertTrue(hay)
        self.assertIn("alex", linea)
        self.assertIn("llamadas con la tableta", linea)
        self.assertIn("quedan 30 min", linea)

    def test_caduca_sola_sin_que_nadie_la_toque(self):
        self.iniciar(minutos=30)
        self.w.t = T0 + 29 * 60
        self.assertTrue(self.activa()[0])
        self.w.t = T0 + 30 * 60 + 1
        self.assertFalse(self.activa()[0])          # el archivo sigue diciendo activa=true: manda la hora

    def test_el_director_parado_no_la_alarga_y_la_siguiente_pasada_la_marca_caducada(self):
        self.iniciar(minutos=10)
        self.w.t = T0 + 11 * 60
        datos = R.pasada(self.w)
        self.assertFalse(datos["ronda"]["activa"])
        self.assertEqual(datos["ronda"]["fin_por"], "caducó")
        self.assertEqual(datos["ronda"]["fin"], R.a_iso(T0 + 10 * 60))

    def test_minutos_por_defecto_30_y_los_limites(self):
        self.assertEqual(self.iniciar()[0], "hecha")
        self.assertEqual(R.leer(self.w)["ronda"]["hasta"], R.a_iso(T0 + 1800))
        for malo in (0, 91, -5, 1.5, True, "30"):
            _, estado, texto = R.iniciar(R.archivo_vacio(), "alex", "x", malo, T0)
            self.assertEqual(estado, "rechazada", malo)
            self.assertIn("1 a 90", texto)

    def test_hace_falta_quien_y_motivo(self):
        self.assertEqual(R.iniciar(R.archivo_vacio(), "", "x", 30, T0)[1], "rechazada")
        self.assertEqual(R.iniciar(R.archivo_vacio(), "alex", "   ", 30, T0)[1], "rechazada")
        self.assertEqual(R.iniciar(R.archivo_vacio(), "alex", "x" * 201, 30, T0)[1], "rechazada")

    def test_renovar_alarga_pero_nunca_pasa_de_90_min_desde_que_empezo(self):
        self.iniciar(minutos=30)
        self.w.t = T0 + 25 * 60
        estado, texto = self.iniciar(quien="claude", minutos=30)        # iniciar con una activa = renovar
        self.assertEqual(estado, "hecha")
        r = R.leer(self.w)["ronda"]
        self.assertEqual(r["hasta"], R.a_iso(T0 + 55 * 60))
        self.assertEqual((r["renovaciones"], r["renovada_por"], r["quien"]), (1, "claude", "alex"))
        self.w.t = T0 + 50 * 60
        self.iniciar(minutos=90)
        r = R.leer(self.w)["ronda"]
        self.assertEqual(r["hasta"], R.a_iso(T0 + 90 * 60))             # recortada al tope
        self.assertIn("máximo", R.aplicar(self.w, "ronda-iniciar", "alex", "x", 30, None)[1])
        self.w.t = T0 + 90 * 60 + 1
        self.assertFalse(self.activa()[0])

    def test_un_archivo_con_un_hasta_mas_lejano_que_el_tope_no_alarga_nada(self):
        self.iniciar(minutos=30)
        datos = self.w.leer_json(R.ARCHIVO)
        datos["ronda"]["hasta"] = R.a_iso(T0 + 10 * 3600)               # editado a mano
        self.w.escribir_json(R.ARCHIVO, datos)
        self.w.t = T0 + 91 * 60
        self.assertFalse(self.activa()[0])
        self.w.t = T0 + 89 * 60
        self.assertTrue(self.activa()[0])

    def test_renovar_una_que_ya_dura_lo_pedido_no_cambia_nada_y_lo_dice(self):
        self.iniciar(minutos=30)
        estado, texto = self.iniciar(minutos=10)
        self.assertEqual(estado, "hecha")
        self.assertIn("no hace falta", texto)
        self.assertEqual(R.leer(self.w)["ronda"]["renovaciones"], 0)

    def test_terminar_es_un_paso_y_es_idempotente(self):
        self.iniciar()
        self.w.t = T0 + 60
        estado, texto = self.terminar("hermes")
        self.assertEqual(estado, "hecha")
        self.assertFalse(self.activa()[0])
        r = R.leer(self.w)["ronda"]
        self.assertEqual((r["fin_por"], r["activa"]), ("hermes", False))
        self.assertIn("no había", self.terminar()[1])

    def test_una_ronda_nueva_tras_terminar_empieza_de_cero(self):
        self.iniciar(minutos=60)
        self.w.t = T0 + 600
        self.terminar()
        self.w.t = T0 + 1200
        self.iniciar(minutos=30)
        r = R.leer(self.w)["ronda"]
        self.assertEqual((r["desde"], r["renovaciones"], r["fin"]), (R.a_iso(T0 + 1200), 0, None))

    def test_un_archivo_ilegible_o_con_basura_deja_pasar(self):
        os.makedirs(self.tmp, exist_ok=True)
        with open(os.path.join(self.tmp, R.ARCHIVO), "w") as f:
            f.write("{no es json")
        self.assertFalse(self.activa()[0])
        self.w.escribir_json(R.ARCHIVO, {"formato": 1, "ronda": {"activa": True, "desde": "ayer", "hasta": 5}})
        self.assertFalse(self.activa()[0])
        self.w.escribir_json(R.ARCHIVO, [1, 2])
        self.assertFalse(self.activa()[0])


class ElSilencioDeLaMac(Base):
    def test_un_type_check_que_empezo_antes_sigue_vivo_y_se_dice_cuanto_falta(self):
        self.w.escribir_json(R.DURACIONES, {"duraciones": {"tsc": [300, 280, 320]}})
        self.w.procs = [(4242, 120, "node /repo/node_modules/.bin/tsc --noEmit --skipLibCheck")]
        self.iniciar()
        d = R.pasada(self.w)
        s = d["silencio"]
        self.assertFalse(s["tranquila"])
        self.assertEqual(s["pesados"][0]["tipo"], "tsc")
        self.assertEqual((s["pesados"][0]["lleva_s"], s["pesados"][0]["suele_s"], s["pesados"][0]["faltan_s"]), (120, 300, 180))
        self.assertEqual(s["linea"], "espera a que termine el type check, unos 3 min")

    def test_sin_historia_dice_que_no_sabe_cuanto_tarda_no_lo_inventa(self):
        self.w.procs = [(1, 90, "node /x/node_modules/vitest/vitest.mjs run")]
        s = R.pasada(self.w)["silencio"]
        self.assertIsNone(s["pesados"][0]["faltan_s"])
        self.assertIn("no sé cuánto suele tardar", s["linea"])

    def test_carga_alta_sin_trabajo_conocido_lo_dice_sin_adivinar(self):
        self.w.c = (34.0, 20.0, 9.0)
        s = R.pasada(self.w)["silencio"]
        self.assertFalse(s["tranquila"])
        self.assertEqual(s["pesados"], [])
        self.assertIn("carga es 34,0", s["linea"])
        self.assertIn("algo más trabaja", s["linea"])

    def test_tranquila_solo_con_nada_pesado_y_carga_baja(self):
        s = R.pasada(self.w)["silencio"]
        self.assertTrue(s["tranquila"])
        self.assertIn("tranquila", s["linea"])
        self.w.p = 2
        self.assertFalse(R.pasada(self.w)["silencio"]["tranquila"])

    def test_sin_lectura_de_la_carga_no_afirma_que_este_tranquila(self):
        self.w.c = None
        s = R.pasada(self.w)["silencio"]
        self.assertIsNone(s["tranquila"])
        self.assertIn("no sé si está tranquila", s["linea"])

    def test_el_cerrojo_pesado_con_dueno_vivo_cuenta_aunque_no_se_vea_el_proceso(self):
        self.w.dueno = (True, int(T0) - 200)
        s = R.pasada(self.w)["silencio"]
        self.assertEqual(s["pesados"][0]["tipo"], "turno")
        self.assertFalse(s["tranquila"])
        self.w.dueno = (False, int(T0) - 200)                   # dueño muerto: no es un trabajo vivo
        self.assertTrue(R.pasada(self.w)["silencio"]["tranquila"])

    def test_los_procesos_propios_y_los_envoltorios_no_cuentan(self):
        self.w.procs = [(1, 5, "bash /r/scripts/enjambre/tsc-turno.sh"), (2, 5, "python3 /r/scripts/puente/ronda.py estado"),
                        (3, 5, "grep tsc"), (4, 99, "python3 -m pytest scripts/enjambre -q"), (5, 50, "npm exec next build")]
        tipos = [p["tipo"] for p in R.pasada(self.w)["silencio"]["pesados"]]
        self.assertEqual(tipos, ["pytest", "build"])

    def test_aprende_cuanto_tarda_de_verlo_terminar(self):
        self.w.procs = [(9, 150, "node tsc --noEmit")]
        R.pasada(self.w)
        self.w.t += 60
        self.w.procs = [(9, 210, "node tsc --noEmit")]
        R.pasada(self.w)
        self.w.t += 60
        self.w.procs = []                                       # terminó
        R.pasada(self.w)
        self.assertEqual(self.w.leer_json(R.DURACIONES)["duraciones"]["tsc"], [210])

    def test_etime(self):
        self.assertEqual(R.etime_a_s("05:03"), 303)
        self.assertEqual(R.etime_a_s("01:02:03"), 3723)
        self.assertEqual(R.etime_a_s("2-00:00:10"), 172810)
        self.assertIsNone(R.etime_a_s("raro"))


class LaPuertaDeAdmision(Base):
    def test_esperar_sin_ronda_no_espera(self):
        dormidas = []
        self.assertEqual(R.esperar("x", self.w, dormir=dormidas.append), 0)
        self.assertEqual(dormidas, [])

    def test_esperar_se_queda_hasta_que_la_ronda_termine_y_dice_cuanto_espero(self):
        self.iniciar(minutos=5)
        avisos = []

        def dormir(s):
            self.w.t += s

        espero = R.esperar("las pruebas", self.w, avisar=lambda t, seg: avisos.append((t, seg)), dormir=dormir, sondeo_s=10, aviso_s=60)
        self.assertGreaterEqual(espero, 300)
        self.assertLess(espero, 320)
        self.assertGreaterEqual(len(avisos), 5)
        self.assertIn("las pruebas espera", avisos[0][0])
        self.assertFalse(self.activa()[0])

    def test_esperar_termina_en_cuanto_se_pulsa_terminar(self):
        self.iniciar(minutos=30)
        pasos = []

        def dormir(s):
            self.w.t += s
            pasos.append(s)
            if len(pasos) == 3:
                self.terminar()

        espero = R.esperar("x", self.w, dormir=dormir, sondeo_s=5)
        self.assertEqual(espero, 15)

    def test_el_codigo_de_salida_de_la_orden_es_0_si_hay_ronda_y_1_si_no(self):
        env = dict(os.environ, STARSEED_PRODUCCION_DIR=self.tmp, STARSEED_CERROJOS_DIR=os.path.join(self.tmp, "c"))
        sin = subprocess.run([sys.executable, os.path.join(AQUI, "ronda.py"), "activa"], capture_output=True, text=True, env=env)
        self.assertEqual((sin.returncode, len(sin.stdout.strip().splitlines())), (1, 1))
        ahora = time.time()
        datos, _, _ = R.iniciar(R.archivo_vacio(), "alex", "llamadas", 30, ahora)
        self.w.escribir_json(R.ARCHIVO, datos)
        con = subprocess.run([sys.executable, os.path.join(AQUI, "ronda.py"), "activa"], capture_output=True, text=True, env=env)
        self.assertEqual((con.returncode, len(con.stdout.strip().splitlines())), (0, 1))
        self.assertIn("ronda de aparatos activa", con.stdout)

    def test_turno_pesado_no_toma_el_turno_mientras_hay_ronda_y_no_gasta_su_plazo(self):
        import turno_pesado as TP
        ahora = time.time()
        datos, _, _ = R.iniciar(R.archivo_vacio(), "alex", "llamadas", 1, ahora - 59.0)       # le queda ~1 s
        self.w.escribir_json(R.ARCHIVO, datos)
        antes = (os.environ.get("STARSEED_PRODUCCION_DIR"), TP.CERROJOS)
        os.environ["STARSEED_PRODUCCION_DIR"] = self.tmp
        TP.CERROJOS = os.path.join(self.tmp, "cerrojos")
        sondeo, R.SONDEO_S = R.SONDEO_S, 0.1
        try:
            avisos = []
            t0 = time.time()
            with TP.turno(espera_s=0.5, reintento_s=0.05, avisar_ronda=lambda t, s: avisos.append(t)):
                tomado = os.path.isdir(os.path.join(TP.CERROJOS, "pesado.lock"))
            self.assertTrue(tomado)
            self.assertTrue(avisos)                                # esperó la ronda y lo dijo
        finally:
            R.SONDEO_S = sondeo
            TP.CERROJOS = antes[1]
            if antes[0] is None:
                os.environ.pop("STARSEED_PRODUCCION_DIR", None)
            else:
                os.environ["STARSEED_PRODUCCION_DIR"] = antes[0]

    def test_tsc_turno_sh_espera_a_la_ronda_y_con_la_ronda_terminada_compila(self):
        raiz = os.path.dirname(os.path.dirname(AQUI))
        guion = os.path.join(raiz, "scripts", "enjambre", "tsc-turno.sh")
        casa = os.path.join(self.tmp, "casa")
        repo = os.path.join(self.tmp, "repo")
        bin_ = os.path.join(self.tmp, "bin")
        os.makedirs(bin_)
        os.makedirs(repo)
        os.makedirs(os.path.join(casa, ".starseed", "produccion"))
        marca = os.path.join(self.tmp, "tsc-corrio")
        with open(os.path.join(bin_, "npx"), "w") as f:
            f.write('#!/bin/sh\necho corrio > "%s"\nexit 0\n' % marca)
        os.chmod(os.path.join(bin_, "npx"), 0o755)
        subprocess.run(["git", "init", "-q"], cwd=repo, check=True)
        env = dict(os.environ, HOME=casa, PATH=bin_ + ":" + os.environ["PATH"], STARSEED_RONDA_PY=os.path.join(AQUI, "ronda.py"),
                   STARSEED_PRODUCCION_DIR=os.path.join(casa, ".starseed", "produccion"), STARSEED_TSC_DISCO_MIN_MB="0")
        w = MundoFalso(os.path.join(casa, ".starseed", "produccion"))
        datos, _, _ = R.iniciar(R.archivo_vacio(), "alex", "llamadas", 30, time.time())
        w.escribir_json(R.ARCHIVO, datos)
        salida = os.path.join(self.tmp, "salida.txt")
        with open(salida, "w") as sal:
            p = subprocess.Popen(["bash", guion], cwd=repo, env=env, stdout=sal, stderr=sal, start_new_session=True)
            try:
                p.wait(timeout=4)
                self.fail("tsc-turno.sh no esperó a la ronda")
            except subprocess.TimeoutExpired:
                pass
            finally:
                os.killpg(p.pid, 9)
                p.wait()
        self.assertIn("ronda de aparatos", open(salida).read())
        self.assertFalse(os.path.exists(marca))
        datos, _, _ = R.terminar(datos, "alex", time.time())
        w.escribir_json(R.ARCHIVO, datos)
        r = subprocess.run(["bash", guion], cwd=repo, env=env, capture_output=True, text=True, timeout=60)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertTrue(os.path.exists(marca))


class TextoParaUnaPersona(Base):
    def test_estado_con_ronda_y_tipo_de_espera(self):
        self.w.procs = [(4242, 120, "node tsc --noEmit")]
        self.w.escribir_json(R.DURACIONES, {"duraciones": {"tsc": [300]}})
        self.iniciar()
        datos = R.leer(self.w)
        sil, _ = R.silencio_ahora(self.w)
        texto = R.texto_estado(datos, sil, self.w.t)
        self.assertIn("pedida por alex", texto)
        self.assertIn("Ronda pedida: espera a que termine el type check, unos 3 min", texto)


if __name__ == "__main__":
    unittest.main()
