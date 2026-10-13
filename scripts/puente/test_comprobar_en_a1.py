#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""(2026-10-13) comprobar_en_a1 + comprobar_a1_remoto: lo que trae la nube se comprueba en el A1
de verdad (paquete git sobre el main de la Mac que el A1 ya tiene, clon aparte, node_modules solo
con el mismo lock, turno de lo pesado sin forzar) y todo fallo de la máquina es «del medio»."""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import comprobar_a1_remoto as R  # noqa: E402
import comprobar_en_a1 as C  # noqa: E402

SHA = "a" * 40


def _git(cwd, *args):
    subprocess.run(["git", "-c", "user.email=p@p", "-c", "user.name=p", *args], cwd=cwd, check=True,
                   capture_output=True, text=True)


class Peticion(unittest.TestCase):
    def test_ts_codigo_y_pruebas_del_puente(self):
        pet = C.peticion("x", SHA, [SHA], ["src/lib/a.ts", "scripts/puente/b.py", "README.md"],
                         lambda r: r == "scripts/puente/test_b.py")
        self.assertTrue(pet["ts"])
        self.assertEqual(pet["codigo"], ["src/lib/a.ts"])
        self.assertEqual(pet["py"], ["scripts/puente/test_b.py"])

    def test_motivos_para_no_ir_son_del_medio(self):
        bien = {"fase": "cola", "main_mac": {"sha": SHA}}
        self.assertEqual(C.motivo_para_no_ir(bien, ["src/a.ts"]), "")  # con cola SÍ va (decide la memoria)
        self.assertIn("no responde", C.motivo_para_no_ir({}, ["src/a.ts"]))
        self.assertIn("guardián", C.motivo_para_no_ir({"fase": "guardian", "main_mac": {"sha": SHA}}, ["src/a.ts"]))
        self.assertIn("dependencias", C.motivo_para_no_ir(bien, ["package-lock.json", "src/a.ts"]))
        self.assertIn("main de la Mac", C.motivo_para_no_ir({"fase": "espera", "main_mac": {}}, ["src/a.ts"]))


class Veredicto(unittest.TestCase):
    def test_verde(self):
        ok, detalle, medio = C.veredicto({"medio": "", "pasos": [{"paso": "tsc", "rc": 0, "s": 200},
                                                                {"paso": "pytest", "rc": 5, "s": 1}]})
        self.assertEqual((ok, medio), (True, False))
        self.assertIn("en verde en el A1", detalle)

    def test_error_de_la_tarea_no_es_del_medio(self):
        ok, detalle, medio = C.veredicto({"pasos": [{"paso": "tsc", "rc": 2, "cola": "src/a.ts(3,1): error TS2322"}]})
        self.assertEqual((ok, medio), (False, False))
        self.assertTrue(detalle.startswith("en el A1: tsc"))

    def test_memoria_tiempo_y_turno_son_del_medio(self):
        for res in ({"medio": "el A1 está compilando (turno ocupado)"},
                    {"pasos": [{"paso": "tsc", "rc": 124, "cola": ""}]},
                    {"pasos": [{"paso": "tsc", "rc": 134, "cola": "FATAL ERROR: heap out of memory"}]},
                    {"pasos": [{"paso": "pytest", "rc": 1, "cola": "No module named pytest"}]},
                    None):
            self.assertTrue(C.veredicto(res)[2], res)

    def test_resultado_es_la_ultima_linea(self):
        salida = "ruido\n@@RESULTADO {\"medio\": \"x\"}\nmás ruido\n@@RESULTADO {\"medio\": \"\", \"pasos\": []}\n"
        self.assertEqual(C.resultado_de(salida), {"medio": "", "pasos": []})
        self.assertIsNone(C.resultado_de("Permission denied"))


class ComprobarConSshSimulado(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        _git(self.tmp, "init", "-q")
        for i in (1, 2):
            with open(os.path.join(self.tmp, "f%d.ts" % i), "w") as f:
                f.write("export const a = %d\n" % i)
            _git(self.tmp, "add", ".")
            _git(self.tmp, "commit", "-qm", "c%d" % i)
        self.base = subprocess.run(["git", "rev-parse", "HEAD~1"], cwd=self.tmp, capture_output=True,
                                   text=True).stdout.strip()

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_manda_paquete_y_lee_el_veredicto(self):
        llamadas = []

        def ssh(orden, entrada=None, timeout=120):
            llamadas.append(orden)
            pet = json.loads(orden.split(" - ", 1)[1].strip("'"))
            self.assertIn("@@RESULTADO", entrada)  # va el código del remoto
            self.assertEqual(pet["prerrequisitos"], [self.base])
            return 0, "@@RESULTADO " + json.dumps({"medio": "", "pasos": [{"paso": "tsc", "rc": 0, "s": 3}]})

        paquetes = []
        with mock.patch.object(C.oracle_nodo, "estado", return_value=({"fase": "cola", "main_mac": {"sha": self.base}}, {}, [])), \
                mock.patch.object(C.oracle_nodo, "_ssh_bytes", side_effect=lambda o, d, timeout=300: paquetes.append(d) or (0, "")), \
                mock.patch.object(C.oracle_nodo, "ssh", side_effect=ssh):
            ok, detalle, medio = C.comprobar(self.base, ["x"], ["f2.ts"], cwd=self.tmp)
        self.assertEqual((ok, medio), (True, False), detalle)
        self.assertTrue(paquetes and paquetes[0].startswith(b"# v"))  # un paquete git de verdad
        self.assertIn("sudo -u starseed -H python3 - ", llamadas[0])

    def test_sin_carpeta_o_sin_a1_es_del_medio_sin_ssh(self):
        with mock.patch.object(C.oracle_nodo, "ssh") as ssh:
            self.assertTrue(C.comprobar("b", ["s"], ["a.ts"], cwd=None)[2])
            with mock.patch.object(C.oracle_nodo, "estado", return_value=({}, {}, [])):
                self.assertEqual(C.comprobar("b", ["s"], ["a.ts"], cwd=self.tmp), (False, "A1: A1 no responde", True))
        ssh.assert_not_called()

    def test_si_el_a1_ya_tiene_head_no_viaja_paquete(self):
        cabeza = subprocess.run(["git", "rev-parse", "HEAD"], cwd=self.tmp, capture_output=True, text=True).stdout.strip()
        with mock.patch.object(C.oracle_nodo, "estado", return_value=({"fase": "espera", "main_mac": {"sha": cabeza}}, {}, [])), \
                mock.patch.object(C.oracle_nodo, "_ssh_bytes") as subir, \
                mock.patch.object(C.oracle_nodo, "ssh", return_value=(0, '@@RESULTADO {"medio": "", "pasos": []}')) as ssh:
            self.assertEqual(C.comprobar(self.base, [], ["f2.ts"], cwd=self.tmp)[0], True)
        subir.assert_not_called()
        self.assertIn('"sin_paquete": true', ssh.call_args[0][0])

    def test_si_la_mac_no_tiene_el_main_del_a1_no_manda_nada(self):
        with mock.patch.object(C.oracle_nodo, "estado", return_value=({"fase": "espera", "main_mac": {"sha": "b" * 40}}, {}, [])), \
                mock.patch.object(C.oracle_nodo, "_ssh_bytes") as subir:
            ok, detalle, medio = C.comprobar("b", ["s"], ["f2.ts"], cwd=self.tmp)
        self.assertTrue(medio)
        subir.assert_not_called()


class Remoto(unittest.TestCase):
    """El guion que corre en el A1, de punta a punta sobre repos de prueba (sin npx ni /proc)."""

    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.a1 = os.path.join(self.tmp, "a1")
        os.makedirs(self.a1)
        _git(self.a1, "init", "-q")
        with open(os.path.join(self.a1, "package-lock.json"), "w") as f:
            f.write("{}\n")
        _git(self.a1, "add", ".")
        _git(self.a1, "commit", "-qm", "base")
        os.makedirs(os.path.join(self.a1, "node_modules"))
        with open(os.path.join(self.a1, "node_modules", ".huella-lock"), "w") as f:
            f.write(R._huella_lock(os.path.join(self.a1, "package-lock.json")))
        self.base = subprocess.run(["git", "rev-parse", "HEAD"], cwd=self.a1, capture_output=True, text=True).stdout.strip()
        # La «Mac»: otro repo con la misma base y un commit nuevo.
        self.mac = os.path.join(self.tmp, "mac")
        _git(self.tmp, "clone", "-q", self.a1, self.mac)
        with open(os.path.join(self.mac, "nuevo.ts"), "w") as f:
            f.write("export const b = 1\n")
        _git(self.mac, "add", ".")
        _git(self.mac, "commit", "-qm", "nuevo")
        self.sha = subprocess.run(["git", "rev-parse", "HEAD"], cwd=self.mac, capture_output=True, text=True).stdout.strip()
        self.comp = os.path.join(self.tmp, "comprobar")
        os.makedirs(self.comp)
        subprocess.run(["git", "bundle", "create", "-q", os.path.join(self.comp, "t1.bundle"), "HEAD", "^" + self.base],
                       cwd=self.mac, check=True)
        self.parches = [mock.patch.object(R, "RAIZ_A1", self.a1), mock.patch.object(R, "BASE", self.comp),
                        mock.patch.object(R, "TURNO", os.path.join(self.tmp, "cerrojos", "pesado.lock"))]
        for p in self.parches:
            p.start()

    def tearDown(self):
        for p in self.parches:
            p.stop()
        shutil.rmtree(self.tmp, ignore_errors=True)

    def _cfg(self, **extra):
        cfg = {"id": "t1", "sha": self.sha, "prerrequisitos": [self.base], "ts": True, "codigo": [], "py": [],
               "minimo_mb": 0, "espera_turno_s": 1}
        cfg.update(extra)
        return cfg

    def test_clona_aplica_comprueba_y_limpia(self):
        orden = [("tsc", ["sh", "-c", "test -f nuevo.ts && test -d node_modules/ && echo bien"], 30)]
        with mock.patch.object(R, "ordenes", return_value=orden):
            res = R.comprobar(self._cfg())
        self.assertEqual(res["medio"], "", res)
        self.assertEqual([p["rc"] for p in res["pasos"]], [0], res)
        self.assertIn("bien", res["pasos"][0]["cola"])
        self.assertFalse(os.path.exists(os.path.join(self.comp, "t1")))  # limpio
        self.assertFalse(os.path.exists(os.path.join(self.comp, "t1.bundle")))
        self.assertFalse(os.path.exists(R.TURNO))  # turno soltado
        self.assertEqual(subprocess.run(["git", "worktree", "list"], cwd=self.a1, capture_output=True,
                                        text=True).stdout.count("\n"), 1)  # el A1 sin worktrees nuevos

    def test_sin_paquete_si_el_a1_ya_lo_tiene(self):
        os.remove(os.path.join(self.comp, "t1.bundle"))
        with mock.patch.object(R, "ordenes", return_value=[("tsc", ["sh", "-c", "git log -1 --format=%s"], 30)]):
            res = R.comprobar(self._cfg(sha=self.base, sin_paquete=True))
        self.assertEqual(res["medio"], "", res)
        self.assertIn("base", res["pasos"][0]["cola"])

    def test_paso_real_con_un_error_de_la_tarea(self):
        with mock.patch.object(R, "ordenes", return_value=[("tsc", ["sh", "-c", "echo 'error TS2322' && exit 2"], 30)]):
            res = R.comprobar(self._cfg())
        self.assertEqual(res["pasos"][0]["rc"], 2)
        self.assertIn("TS2322", res["pasos"][0]["cola"])
        self.assertEqual(C.veredicto(res)[2], False)

    def test_otro_lock_es_del_medio(self):
        with open(os.path.join(self.a1, "node_modules", ".huella-lock"), "w") as f:
            f.write("otra")
        res = R.comprobar(self._cfg())
        self.assertIn("package-lock", res["medio"])

    def test_turno_de_otro_vivo_no_se_fuerza(self):
        os.makedirs(R.TURNO)
        with open(os.path.join(R.TURNO, "dueno"), "w") as f:
            f.write("%d 0" % os.getpid())  # vivo: nosotros mismos
        with mock.patch.object(R, "ordenes", return_value=[("tsc", ["true"], 30)]):
            res = R.comprobar(self._cfg())
        self.assertIn("turno ocupado", res["medio"])
        self.assertTrue(os.path.isdir(R.TURNO))  # sigue siendo suyo

    def test_sin_memoria_es_del_medio(self):
        with mock.patch.object(R, "_leer", return_value="MemAvailable:    1024000 kB\n"):
            res = R.comprobar(self._cfg(minimo_mb=4500))
        self.assertIn("1000 MB libres", res["medio"])

    def test_peticion_con_rutas_raras_no_entra(self):
        for malo in ({"codigo": ["../../etc/passwd"]}, {"py": ["-rf"]}, {"id": "a b"}, {"sha": "zz"}):
            self.assertIn("no válid", R.comprobar(self._cfg(**malo))["medio"])

    def test_memoria_libre(self):
        self.assertEqual(R.memoria_libre_mb("MemTotal: 1 kB\nMemAvailable:    6583424 kB\n"), 6429)
        self.assertEqual(R.memoria_libre_mb(""), 0)

    def test_main_siempre_imprime_resultado(self):
        with mock.patch("builtins.print") as imprimir:
            R.main(["x", "no es json"])
        self.assertTrue(imprimir.call_args[0][0].startswith("@@RESULTADO "))


if __name__ == "__main__":
    unittest.main()
