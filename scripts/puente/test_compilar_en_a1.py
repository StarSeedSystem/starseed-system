#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas de compilar_en_a1 (GEN1030A): lo REMOTO es PURA y probado; del
`.env.local` solo viajan las líneas NEXT_PUBLIC_* a `.env.production.local`,
es decir, un `.env` entero NUNCA va al A1."""
from __future__ import annotations

import hashlib
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


class HuellaCompartidaConElGuardian(unittest.TestCase):
    """OPS1031C: el guardián del A1 (`oracle_a1.py` y `deploy/oracle/nodo/preparar-a1.sh`)
    marca `node_modules/.huella-lock` con `sha256sum package-lock.json | cut -c1-16`.
    Si `compilar_en_a1` habla otro idioma, cada uno ve «cambió» y repite `npm ci` en bucle
    en el checkout del medio: los dos tienen que usar la MISMA forma."""

    TEXTO = '{"lockfileVersion": 3}'

    def _sha(self):
        return hashlib.sha256(self.TEXTO.encode("utf-8")).hexdigest()

    def test_la_huella_tiene_la_forma_del_guardian(self):
        self.assertEqual(C.huella_lock(self.TEXTO), self._sha()[:16])
        self.assertEqual(len(C.huella_lock(self.TEXTO)), 16)

    def test_la_marca_del_guardian_no_reinstala(self):
        self.assertFalse(C.pide_instalacion(self._sha()[:16], C.huella_lock(self.TEXTO), existe=True))

    def test_una_marca_vieja_de_64_hex_tampoco_reinstala(self):
        self.assertFalse(C.pide_instalacion(self._sha(), C.huella_lock(self.TEXTO), existe=True))

    def test_un_lock_distinto_si_reinstala(self):
        self.assertTrue(C.pide_instalacion(self._sha()[:16], C.huella_lock("{}"), existe=True))


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
        ssh = mock.patch.object(C.oracle_nodo, "ssh", side_effect=[(0, ""), (0, "abc123\n"), (0, ""), (0, ""),
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
        self.assertEqual((self.ssh.call_count, self.rsync.call_count), (0, 0))
        self.estado.return_value = ({"fase": "espera"}, {}, [])
        C.compilar(raiz=self.raiz)
        self.assertFalse(any(C.GOBERNADOR_A1 in o or o == C.ORDEN_GUION for o in self._ordenes()))
        self.assertEqual(self._ordenes()[0], C.orden_preparar_arbol())  # el árbol aparte, también sin urgencia
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
        self.assertTrue(C.GOBERNADOR_A1 in ordenes[0] and "touch -d @" in ordenes[0])  # el freno, lo primero
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




