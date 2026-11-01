#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas de compilar_en_a1 (GEN1030A): lo REMOTO es PURA y probado; del
`.env.local` solo viajan las líneas NEXT_PUBLIC_* a `.env.production.local`,
es decir, un `.env` entero NUNCA va al A1."""
from __future__ import annotations

import json
import os
import shlex
import subprocess
import tempfile
import sys
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import compilar_en_a1 as C  # noqa: E402

IP = "1.2.3.4"
TRANS = "ssh -i /tmp/llave"
ENV = """# privado de verdad
SUPABASE_SERVICE_KEY=secreto-no-viaja
STARSEED_ROOT=/Users/alex/starseed-os-main
NEXT_PUBLIC_SUPABASE_URL=https://ejemplo.supabase.co
  NEXT_PUBLIC_MAPA=pantalla-limpia

NEXT_PUBLIC_VACIA=
"""
RAIZ_A1 = C.RAIZ_A1


class EnvQueViaja(unittest.TestCase):
    def test_solo_next_public(self):
        filas = C.filas_publicas(ENV)
        self.assertTrue(all(l.strip().startswith("NEXT_PUBLIC_") for l in filas))
        self.assertEqual([f.strip() for f in filas],
                         ["NEXT_PUBLIC_SUPABASE_URL=https://ejemplo.supabase.co",
                          "NEXT_PUBLIC_MAPA=pantalla-limpia", "NEXT_PUBLIC_VACIA="])

    def test_el_secreto_no_lo_deja_salir(self):
        self.assertNotIn("SUPABASE_SERVICE_KEY", " ".join(C.filas_publicas(ENV)))

    def test_exclusiones_prohiben_todos_los_env(self):
        ex = C.exclusiones()
        for n in (".git", ".next*", "starseed_memory_root", ".codegraph", ".transfer",
                  ".env*", "node_modules"):
            self.assertIn("--exclude=" + n, ex)


class ArgsRsync(unittest.TestCase):
    def test_envio_tiene_borrado_suave_y_sudo(self):
        args = C.args_envio("/raiz", IP, transporte=TRANS)
        self.assertIn("rsync", args)
        self.assertIn("--delete", args)
        self.assertNotIn("--delete-excluded", args)
        self.assertIn("sudo -u starseed rsync", args)
        self.assertIn(TRANS, args)
        self.assertIn("/raiz/", args)
        self.assertEqual(args[-1], C.USUARIO + "@" + IP + ":" + RAIZ_A1)

    def test_traer_lo_trae_limpio(self):
        args = C.args_traer(RAIZ_A1 + "/" + C.DIST_BUILD, IP, "/tmp/build", transporte=TRANS)
        self.assertIn("--exclude=standalone", args)
        self.assertIn("--exclude=cache", args)
        self.assertTrue(args[-1] == "/tmp/build", args[-1])
        self.assertTrue(args[-2].endswith(C.DIST_BUILD + "/"), args[-2])
        self.assertIn(TRANS, args)



class OrdenRemota(unittest.TestCase):
    def test_env_es_umask_077(self):
        orden = C.orden_env(RAIZ_A1 + "/.env.production.local")
        self.assertIn("umask 077", orden)
        self.assertIn("chmod 600", orden)
        self.assertIn(".env.production.local", orden)

    def test_limpiar_env_borra_y_no_mas(self):
        o = C.orden_limpiar_env(RAIZ_A1 + "/.env.production.local")
        self.assertIn("rm -f", o)
        self.assertIn(".env.production.local", o)

    def test_instalar_con_ignore_scripts(self):
        self.assertIn("npm ci --ignore-scripts", C.orden_instalar(raiz="/n"))
        self.assertIn("cd /n &&", C.orden_instalar(raiz="/n"))

    def test_compilar_con_dist_aparte_nice_y_heap(self):
        o = C.orden_compilar(raiz="/n", dist=".next-build", heap=4096)
        self.assertIn("next build", o)
        self.assertIn("STARSEED_DIST=.next-build", o)
        self.assertIn("nice -n 10", o)
        self.assertIn("--max-old-space-size=4096", o)
        self.assertIn("rm -rf .next-build", o)

    def test_huella_lock_instalada_y_cada_nueva(self):
        i = C.orden_huella_lock_instalada(raiz="/n")
        self.assertIn("cat", i)
        self.assertIn("node_modules/.huella-lock", i)
        m = C.orden_marcar_lock("abcd", raiz="/n")
        self.assertIn("abcd", m)
        self.assertIn("node_modules/.huella-lock", m)


class Decisiones(unittest.TestCase):
    def test_huella_envio_cambia_con_el_cabeza_y_con_worktree(self):
        a = C.huella_envio("sha1", "")
        self.assertNotEqual(a, C.huella_envio("sha2", ""))
        self.assertNotEqual(a, C.huella_envio("sha1", "src/x.ts"))

    def test_huella_lock_y_pide_instalacion(self):
        self.assertEqual(C.huella_lock("x")[:10], C.huella_lock("x")[:10])
        self.assertTrue(C.pide_instalacion("", "huevo", existe=True))
        self.assertTrue(C.pide_instalacion("", "huevo", existe=False))
        self.assertTrue(C.pide_instalacion("vieja", "nueva", existe=True))
        self.assertFalse(C.pide_instalacion("igual", "igual", existe=True))

    def test_se_puede_compilar(self):
        ok, motivo = C.se_puede_compilar({}, 0, vivo=False)
        self.assertFalse(ok)
        self.assertEqual(motivo, "el nodo del A1 no late")
        ok, motivo = C.se_puede_compilar({"fase": "guardian"}, 0, vivo=True)
        self.assertFalse(ok)
        self.assertIn("guardian", motivo)
        ok, motivo = C.se_puede_compilar({"fase": "cola"}, 0, vivo=True)
        self.assertFalse(ok)
        self.assertIn("cola", motivo)
        ok, _ = C.se_puede_compilar({"fase": "espera"}, 0, vivo=True)
        self.assertTrue(ok)
        # Sin vivo inyectado usa el latido real del nodo.
        with mock.patch.object(C.oracle_nodo, "nodo_vivo", return_value=False) as nv:
            ok, _ = C.se_puede_compilar({}, 999)
            self.assertFalse(ok)
            nv.assert_called_once()


class Cola(unittest.TestCase):
    def test_cola_corta_por_el_final(self):
        self.assertEqual(C.cola("0123456789", n=4), "6789")
        self.assertEqual(C.cola(None), "")


class Flujo(unittest.TestCase):
    """compilar() entero con el A1 y el sistema maquetados: nada va fuera."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        raiz = self.tmp.name
        with open(os.path.join(raiz, ".env.local"), "w", encoding="utf-8") as f:
            f.write(ENV + "BOTONERA_MISION=no-viaja\n")
        with open(os.path.join(raiz, "package-lock.json"), "w", encoding="utf-8") as f:
            f.write("{}")
        build = os.path.join(raiz, C.DIST_BUILD)
        os.makedirs(build)
        with open(os.path.join(build, "BUILD_ID"), "w", encoding="utf-8") as f:
            f.write("id-bueno")
        self.raiz = raiz
        self.mandado = []
        self.getu = mock.patch.object(C.oracle_nodo, "_ip", return_value=IP).start()
        self.estado = mock.patch.object(
            C.oracle_nodo, "estado", return_value=({}, {}, [])).start()
        self.ssh = mock.patch.object(
            C.oracle_nodo, "ssh", return_value=(0, "abc123\n")).start()
        self.bytes = mock.patch.object(
            C.oracle_nodo, "_ssh_bytes", return_value=(0, "")).start()
        self.rsync = mock.patch.object(C, "_rsync", return_value=(0, "")).start()
        self.git = mock.patch.object(C, "_git_local", return_value=(0, "SHA1")).start()
        self.guardar = mock.patch.object(C.RM, "_guardar", side_effect=self._anotar).start()
        self.listo = mock.patch.object(C.RM, "marcar_listo").start()
        self.reiniciar = mock.patch.object(C.RM, "reiniciar_mando").start()
        self.huerfano = mock.patch.object(C.RM, "_leer_estado", return_value={}).start()

    def tearDown(self):
        mock.patch.stopall()
        self.tmp.cleanup()

    def _anotar(self, datos):
        self.guardado = datos

    def _con_build_traido(self, args, timeout, ip):
        """El rsync de TRAER deja BUILD_ID en el destino local (mocked)."""
        if os.path.isdir(args[-1]) or args[-1].endswith(C.DIST_BUILD):
            if args[-1].startswith(self.tmp.name):
                os.makedirs(args[-1], exist_ok=True)
                with open(os.path.join(args[-1], "BUILD_ID"), "w", encoding="utf-8") as f:
                    f.write("traido")
        return 0, ""

    def test_dia_completo(self):
        mock.patch.object(C.oracle_nodo, "nodo_vivo", return_value=True).start()
        self.rsync.stop()
        self.rsync = mock.patch.object(C, "_rsync", side_effect=self._con_build_traido).start()
        ok, detalle = C.compilar(raiz=self.raiz)
        self.assertTrue(ok, detalle)
        # Cambio completo: listo con la hora del envío, estado al-dia y reinicio.
        self.listo.assert_called_once()
        self.reiniciar.assert_called_once()
        self.assertEqual(self.guardado.get("estado"), "al-dia")
        self.assertTrue(self.guardado.get("ok"))
        self.assertEqual(self.guardado.get("huella_construida"),
                         C.huella_envio("SHA1", "SHA1"))
        # El env que viaja: SOLO NEXT_PUBLIC, ni el secreto.
        contenido = self.bytes.call_args_list[0][0][1].decode("utf-8")
        self.assertIn("NEXT_PUBLIC_SUPABASE_URL", contenido)
        self.assertNotIn("no-viaja", contenido)
        orden_env = self.bytes.call_args_list[0][0][0]
        self.assertIn(".env.production.local", orden_env)
        self.assertIn("umask 077", orden_env)
        # La orden de compilar y la de borrar la clave: por ssh de verdad (tachada).
        ordenes = [c[0][0] for c in self.ssh.call_args_list if c[0]]
        self.assertTrue(any("next build" in o for o in ordenes))
        self.assertTrue(any("rm -f" in o for o in ordenes))
        self.assertTrue(any("npm ci --ignore-scripts" in o for o in ordenes))
        # El rsync de traer excluye cache y standalone.
        traer = self.rsync.call_args_list[-1][0][0]
        self.assertIn("--exclude=standalone", traer)
        self.assertIn("--exclude=cache", traer)

    def test_build_muerto_no_cambia_nada(self):
        mock.patch.object(C.oracle_nodo, "nodo_vivo", return_value=True).start()
        # (SUP0111A) la primera orden pregunta por un build previo del A1: sin marca, se compila.
        ssh = mock.patch.object(C.oracle_nodo, "ssh", side_effect=[(0, "marca=\nbuild=\n"), (0, ""), (0, "abc123\n"),
                                                                  (0, ""), (0, ""),
                                                                  (1, "muerte a los 814 s")]).start()
        ok, detalle = C.compilar(raiz=self.raiz)
        self.assertFalse(ok)
        self.assertIn("next build en el A1", detalle)
        self.assertIn("muerte a los 814 s", detalle)
        # Sin estado falso «al-dia»: un build rojo no marca ni reinicia.
        self.guardar.assert_not_called()
        self.listo.assert_not_called()
        self.reiniciar.assert_not_called()
        ssh.stop()

    def test_a1_ocupado_o_muerto_no_envia_nada(self):
        mock.patch.object(C.oracle_nodo, "nodo_vivo", return_value=False).start()
        ok, detalle = C.compilar(raiz=self.raiz)
        self.assertFalse(ok)
        self.assertIn("no late", detalle)
        self.rsync.assert_not_called()

    def _ordenes(self, ssh=None):  # GEN1031A: con urgencia el A1 da turno; sin ella, como hoy
        return [c[0][0] for c in (ssh or self.ssh).call_args_list]

    def test_sin_urgencia_como_hoy(self):
        mock.patch.object(C.oracle_nodo, "nodo_vivo", return_value=True).start()
        self.estado.return_value = ({"fase": "cola"}, {}, [])
        self.assertIn("fase cola", C.compilar(raiz=self.raiz)[1])
        # (SUP0111A) solo la pregunta por un build previo (lectura): ni envío ni build
        self.assertEqual((self._ordenes(), self.rsync.call_count), ([C.orden_build_previo()], 0))
        self.estado.return_value = ({"fase": "espera"}, {}, [])
        C.compilar(raiz=self.raiz)
        self.assertFalse(any(C.GOBERNADOR_A1 in o or o == C.ORDEN_GUION for o in self._ordenes()))
        self.assertEqual(self._ordenes()[2], C.orden_preparar_arbol())  # el árbol aparte, también sin urgencia
        self.assertEqual((RAIZ_A1, RAIZ_A1 != C.oracle_nodo.REPO_A1), (C.RM.RAIZ, True))
        self.assertEqual(C.orden_preparar_arbol("/n"),  # chown solo si no es ya de starseed: idempotente
                         'sudo mkdir -p /n && { [ "$(stat -c %U /n)" = starseed ] || sudo chown -R starseed:starseed /n; }')

    def test_urgente_en_cola_da_turno_en_arbol_aparte_y_lo_quita(self):
        mock.patch.object(C.oracle_nodo, "nodo_vivo", return_value=True).start()
        self.estado.return_value = ({"fase": "cola"}, {}, [])
        self.rsync.side_effect = self._con_build_traido
        ok, detalle = C.compilar(raiz=self.raiz, urgente="Genesis está caído")
        self.assertTrue(ok and "dio turno" in detalle, detalle)
        ordenes = self._ordenes()
        self.assertEqual(ordenes[0], C.orden_build_previo())  # (SUP0111A) mirar si ya hay uno hecho
        self.assertTrue(C.GOBERNADOR_A1 in ordenes[1] and "touch -d @" in ordenes[1])  # el freno, lo primero
        self.assertEqual(ordenes[-1], C.orden_quitar_turno())  # y quitarlo, lo último
        (guion,) = [c[1]["entrada"] for c in self.ssh.call_args_list if c[0][0] == C.ORDEN_GUION]  # uno solo
        self.assertTrue(all(s in guion for s in ("nice -n 10", "STARSEED_BUILD_LIGERO=1", "cd " + RAIZ_A1,
                                                  C.PESADO_A1, "guardian")), guion)
        self.assertIn(RAIZ_A1 + "/" + C.DIST_BUILD, self.rsync.call_args_list[-1][0][0][-2])
        prohibido = ("pkill", "killall", "kill -9", "kill -TERM", "systemctl")  # nunca se mata al enjambre
        self.assertEqual([o for o in ordenes + [guion] if any(p in o for p in prohibido)], [])

    def test_urgente_roto_sin_turno_o_reventado_quita_el_freno(self):
        mock.patch.object(C.oracle_nodo, "nodo_vivo", return_value=True).start()
        for rc, texto in ((1, "next build en el A1"), (C.SIN_TURNO, "sin turno en el A1"), (255, "freno del A1")):
            ssh = mock.patch.object(C.oracle_nodo, "ssh", side_effect=lambda o, entrada=None, timeout=0, rc=rc: (
                (rc, "muerte") if o == C.ORDEN_GUION or (rc == 255 and "touch" in o) else (0, ""))).start()
            ok, detalle = C.compilar(raiz=self.raiz, urgente="la pantalla lleva 7.0 h vieja")
            self.assertTrue(not ok and texto in detalle, detalle)
            self.assertEqual(self._ordenes(ssh)[-1], C.orden_quitar_turno())
        ssh = mock.patch.object(C.oracle_nodo, "ssh", return_value=(0, "")).start()
        self.rsync.side_effect = RuntimeError("se cayó la red")
        with self.assertRaises(RuntimeError):
            C.compilar(raiz=self.raiz, urgente="Genesis está caído")
        self.assertEqual(self._ordenes(ssh)[-1], C.orden_quitar_turno())
        self.assertEqual((self.listo.call_count, self.guardar.call_count), (0, 0))

    # ── SUP0111A (01-11): la red Mac↔A1 se corta; lo hecho en el A1 no se tira ──────────────
    def test_trae_lo_ya_compilado_sin_recompilar_ni_latido(self):
        h = "cd" * 32
        mock.patch.object(C.oracle_nodo, "nodo_vivo", return_value=False).start()  # ni el latido hace falta
        self.ssh.return_value = (0, "marca=1793496180 %s\nbuild=SvBUf3-q8qHlFuF9Bh3kB\n" % h)
        self.rsync.side_effect = self._con_build_traido
        ok, detalle = C.compilar(raiz=self.raiz, urgente="la pantalla lleva 9.0 h vieja")
        self.assertTrue(ok and C.REAPROVECHADO in detalle and "SvBUf3-q8qHl" in detalle, detalle)
        self.estado.assert_not_called()
        self.assertEqual(self.rsync.call_count, 1)  # solo TRAER: no se envía nada
        self.assertIn("--exclude=standalone", self.rsync.call_args[0][0])
        ordenes = self._ordenes()
        self.assertFalse(any("next build" in o or C.GOBERNADOR_A1 in o for o in ordenes), ordenes)
        self.listo.assert_called_once_with(raiz=self.raiz, dist=C.DIST_BUILD, inicio=1793496180)
        self.assertEqual(self.guardado.get("huella_construida"), h)
        self.reiniciar.assert_called_once()

    def test_traer_reanuda_sin_vaciar_y_reintenta(self):
        destino = os.path.join(self.raiz, C.DIST_BUILD)
        with open(os.path.join(destino, "medio.js"), "w", encoding="utf-8") as f:
            f.write("9 MB de 466")
        with open(os.path.join(destino, C.RM.MARCA_LISTO), "w", encoding="utf-8") as f:
            f.write("viejo")
        vistos = []

        def red(args, timeout, ip):
            vistos.append((os.path.exists(os.path.join(destino, "medio.js")),
                           os.path.exists(os.path.join(destino, C.RM.MARCA_LISTO))))
            return (255, "Connection reset by peer") if len(vistos) < 3 else (0, "")
        self.rsync.side_effect = red
        ok, detalle = C.traer_y_cambiar(IP, "ef" * 32, 1000, raiz=self.raiz, intentos=4, pausa_s=0)
        self.assertTrue(ok, detalle)
        self.assertEqual(vistos, [(True, False)] * 3)  # lo traído sigue ahí; la marca de «entero», no
        self.listo.assert_called_once()
        self.reiniciar.assert_called_once()

    def test_traer_agotado_no_cambia_y_deja_lo_traido(self):
        self.rsync.side_effect = lambda args, timeout, ip: (255, "Operation timed out")
        ok, detalle = C.traer_y_cambiar(IP, "ef" * 32, 1000, raiz=self.raiz, intentos=3, pausa_s=0)
        self.assertFalse(ok)
        self.assertTrue("3 intentos" in detalle and "reanudar" in detalle, detalle)
        self.assertEqual(self.rsync.call_count, 3)
        self.assertTrue(os.path.exists(os.path.join(self.raiz, C.DIST_BUILD, "BUILD_ID")))  # nada se borró
        self.assertEqual((self.listo.call_count, self.reiniciar.call_count, self.guardar.call_count), (0, 0, 0))
        self.assertTrue(any("rm -f" in o for o in self._ordenes()))  # el .env prestado se limpia igual

    def test_la_build_deja_la_marca_del_envio(self):
        mock.patch.object(C.oracle_nodo, "nodo_vivo", return_value=True).start()
        self.rsync.side_effect = self._con_build_traido
        ok, detalle = C.compilar(raiz=self.raiz)
        self.assertTrue(ok, detalle)
        (build,) = [o for o in self._ordenes() if "next build" in o]
        self.assertTrue(C.MARCA_A1 in build and C.huella_envio("SHA1", "SHA1") in build, build)
        self.assertNotIn(C.REAPROVECHADO, detalle)


class RedQueSeCorta(unittest.TestCase):
    """SUP0111A: marca del envío, lectura del build previo y rsync que no se cuelga."""

    HUELLA = "ab" * 32

    def test_marca_solo_con_huella_hex_y_tras_build_verde(self):
        self.assertEqual(C.marca_envio(1793496180.9, self.HUELLA), "1793496180 " + self.HUELLA)
        self.assertIsNone(C.marca_envio(1, "no-hex; rm -rf /"))
        g = C.guion_compilar("/r", marca=C.marca_envio(5, self.HUELLA))
        self.assertTrue(g.endswith("npx next build && echo 5 %s > .next-build/.envio-a1" % self.HUELLA), g)
        self.assertNotIn(C.MARCA_A1, C.guion_compilar("/r"))
        self.assertNotIn(C.MARCA_A1, C.guion_compilar("/r", marca="5 x'; reboot"))  # nada raro entra en sh -c
        self.assertIn(C.MARCA_A1, C.orden_compilar("/r", marca=C.marca_envio(5, self.HUELLA)))

    def test_la_marca_se_escribe_de_verdad_solo_si_next_build_acaba_bien(self):
        with tempfile.TemporaryDirectory() as d:
            binario = os.path.join(d, "bin")
            os.makedirs(binario)
            for rc, queda in ((0, True), (1, False)):
                with open(os.path.join(binario, "npx"), "w", encoding="utf-8") as f:
                    f.write('#!/bin/sh\nmkdir -p "$STARSEED_DIST"\nexit %d\n' % rc)
                os.chmod(os.path.join(binario, "npx"), 0o755)
                guion = C.guion_compilar(d, marca=C.marca_envio(7, self.HUELLA))
                r = subprocess.run(["sh", "-c", guion], capture_output=True, text=True, timeout=30,
                                   env=dict(os.environ, PATH=binario + os.pathsep + os.environ.get("PATH", "")))
                self.assertEqual(r.returncode, rc, r.stderr)
                self.assertEqual(os.path.exists(os.path.join(d, C.DIST_BUILD, C.MARCA_A1)), queda)

    def test_build_previo(self):
        salida = "marca=1793496180 %s\nbuild=SvBUf3-q8qHlFuF9Bh3kB\n" % self.HUELLA
        self.assertEqual(C.build_previo(salida, None), (1793496180, self.HUELLA, "SvBUf3-q8qHlFuF9Bh3kB"))
        self.assertEqual(C.build_previo(salida, 1793496179 * 10 ** 9)[0], 1793496180)  # más nuevo que el de la Mac
        self.assertIsNone(C.build_previo(salida, 1793496180 * 10 ** 9))  # el mismo envío: ya está aquí
        for malo in ("", "abc123\n", "marca=\nbuild=SvBUf3-q8qHlFuF9Bh3kB",
                     "marca=1793496180 %s\nbuild=" % self.HUELLA,
                     "marca=ayer %s\nbuild=SvBUf3-q8qHlFuF9Bh3kB" % self.HUELLA,
                     "marca=1 zz\nbuild=SvBUf3-q8qHlFuF9Bh3kB"):
            self.assertIsNone(C.build_previo(malo, None), malo)

    def test_orden_build_previo_ejecutada(self):
        with tempfile.TemporaryDirectory() as d:
            os.makedirs(os.path.join(d, C.DIST_BUILD))
            orden = C.orden_build_previo(d)
            self.assertTrue(orden.startswith("sudo -u starseed -H sh -c "), orden)
            interior = shlex.split(orden)[-1]
            vacio = subprocess.run(["sh", "-c", interior], capture_output=True, text=True, timeout=30).stdout
            self.assertIsNone(C.build_previo(vacio, None))
            with open(os.path.join(d, C.DIST_BUILD, C.MARCA_A1), "w", encoding="utf-8") as f:
                f.write("9 %s\n" % self.HUELLA)
            with open(os.path.join(d, C.DIST_BUILD, "BUILD_ID"), "w", encoding="utf-8") as f:
                f.write("id-del-a1")
            lleno = subprocess.run(["sh", "-c", interior], capture_output=True, text=True, timeout=30).stdout
            self.assertEqual(C.build_previo(lleno, None), (9, self.HUELLA, "id-del-a1"))

    def test_rsync_corta_lo_parado(self):
        espera = "--timeout=%d" % C.RSYNC_TIMEOUT_S
        self.assertIn(espera, C.args_traer("/a", IP, "/b", transporte=TRANS))
        self.assertIn(espera, C.args_envio("/raiz", IP, transporte=TRANS))

    def test_el_reconstructor_no_apunta_la_huella_de_ahora_si_se_trajo_lo_hecho(self):
        R, guardados, antes = C.RM, [], "ef" * 32
        for detalle, esperado in (("compiló (%s, build x: sin recompilar)" % C.REAPROVECHADO, antes),
                                  ("compiló en el A1, muerte del medio evitada: build x", "h-de-ahora")):
            with mock.patch.object(R, "_guardar", side_effect=guardados.append), \
                    mock.patch.object(R, "_leer_estado", return_value={"huella_construida": antes}), \
                    mock.patch.object(R, "devolver_cache"), mock.patch("builtins.print"), \
                    mock.patch.object(C, "compilar", return_value=(True, detalle)):
                self.assertTrue(R.compilar_en_el_a1("h-de-ahora"))
            self.assertEqual(guardados[-1]["huella_construida"], esperado, detalle)


class Turno(unittest.TestCase):
    """GEN1031A: urgencia, freno del orquestador y guion del turno (este, ejecutado con dobles)."""

    def test_urgencia(self):
        ahora, h = 10 ** 9, 3600
        ns = lambda horas: int((ahora - horas * h) * 1e9)  # noqa: E731
        self.assertEqual(C.urgencia(True, ns(1), [], ahora), "Genesis está caído")
        self.assertEqual(C.urgencia(False, None, [], ahora), "no hay build servido")
        vieja = [("src/a.ts", ns(1), 1), ("src/b.ts", ns(7), 1)]
        self.assertEqual(C.urgencia(False, ns(10), vieja, ahora), "la pantalla lleva 7.0 h vieja")
        self.assertIsNone(C.urgencia(False, ns(10), vieja[:1], ahora))
        self.assertIsNone(C.urgencia(False, ns(10), vieja, ahora, umbral_s=8 * h))
        self.assertIsNone(C.urgencia(False, ns(10), [("src/c.ts", ns(11), 1), ("public/version.json", ns(9), 1)], ahora))
        for fase, vivo, esperado in (("cola", True, True), ("guardian", True, True), ("cola", False, False)):
            ok, motivo = C.se_puede_compilar({"fase": fase}, 0, vivo=vivo, urgente="Genesis está caído")
            self.assertEqual((ok, "me da turno" in motivo), (esperado, esperado), motivo)

    def test_freno_a_un_trabajador_con_caducidad_y_quitar_solo_el_suyo(self):
        o = C.orden_pedir_turno(1234.9)
        self.assertTrue(o.startswith("sudo -u starseed -H sh -c "))
        trozos = shlex.split(shlex.split(o)[-1])
        self.assertEqual((json.loads(trozos[trozos.index("printf") + 2])["trabajadores"], "@1234" in trozos), (1, True))
        with tempfile.TemporaryDirectory() as d:
            ruta = os.path.join(d, "gobernador.json")
            quitar = ["sh", "-c", shlex.split(C.orden_quitar_turno(ruta))[-1]]
            self.assertEqual(subprocess.run(quitar).returncode, 0)  # sin freno: nunca falla
            for ajeno, queda in (('{"trabajadores": 2}', True), (json.dumps({"motivo": C.MARCA_TURNO}), False)):
                with open(ruta, "w", encoding="utf-8") as f:
                    f.write(ajeno)
                self.assertEqual(subprocess.run(quitar).returncode, 0)
                self.assertEqual(os.path.exists(ruta), queda)

    def _turno(self, d, fase="espera", dueno=None, tsc="false", compilar=None):
        estado, cerrojo = os.path.join(d, "estado.json"), os.path.join(d, "cerrojos", "pesado.lock")
        with open(estado, "w", encoding="utf-8") as f:
            json.dump({"fase": fase}, f, indent=1)
        if dueno is not None:
            os.makedirs(cerrojo)
            with open(os.path.join(cerrojo, "dueno"), "w", encoding="utf-8") as f:
                f.write("%d 0" % dueno)
        hecho = os.path.join(d, "compilado")
        guion = C.guion_turno(compilar or "test -d %s && touch %s" % (cerrojo, hecho), espera_s=0,
                              fase=estado, cerrojo=cerrojo, tsc_vivo=tsc, pausa_s=0)
        r = subprocess.run(["sh", "-s"], input=guion, capture_output=True, text=True, timeout=30)
        return r.returncode, os.path.exists(hecho), os.path.isdir(cerrojo)

    def test_guion_espera_al_guardian_y_al_tsc_y_suelta_siempre(self):
        muerto = int(subprocess.run(["sh", "-c", "echo $$"], capture_output=True, text=True).stdout)
        casos = ((dict(), (0, True, False)), (dict(fase="guardian"), (C.SIN_TURNO, False, False)),
                 (dict(tsc="true"), (C.SIN_TURNO, False, False)),
                 (dict(dueno=os.getpid()), (C.SIN_TURNO, False, True)),  # a un dueño vivo no se le quita
                 (dict(dueno=muerto), (0, True, False)), (dict(compilar="sh -c 'exit 3'"), (3, False, False)))
        for kw, esperado in casos:
            with tempfile.TemporaryDirectory() as d:
                self.assertEqual(self._turno(d, **kw), esperado, kw)
        self.assertIn("bin/ts[c]", C.TSC_VIVO)

    def test_el_reconstructor_le_pasa_la_urgencia(self):
        R, vistos = C.RM, []
        with mock.patch.object(R, "mtime_del_build", return_value=None), mock.patch.object(R, "_guardar"), \
                mock.patch.object(R, "_leer_estado", return_value={}), mock.patch.object(R, "devolver_cache"), \
                mock.patch("builtins.print"), \
                mock.patch.object(C, "compilar", side_effect=lambda **k: (vistos.append(k), (True, "ok"))[1]):
            self.assertEqual(R.urgencia_a1(False, []), "no hay build servido")
            self.assertTrue(R.compilar_en_el_a1("h", urgente="Genesis está caído"))
            self.assertTrue(R.compilar_en_el_a1("h"))
        self.assertEqual(vistos, [{"urgente": "Genesis está caído"}, {}])


if __name__ == "__main__":
    unittest.main()




