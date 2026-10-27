# -*- coding: utf-8 -*-
"""CAP1026N (2026-10-26) · las puertas de lo que trae la nube, en GitHub: rama, veredicto y flujo asíncrono."""
import json
import os
import sys
import tempfile
import unittest
from unittest import mock

DIR = os.path.dirname(os.path.abspath(__file__))
if DIR not in sys.path:
    sys.path.insert(0, DIR)

import comprobar_en_github as G  # noqa: E402

BASE = "a" * 40
ARBOL = "b" * 40
CABEZA = "c" * 40
T = 1_800_000_000.0


class Puro(unittest.TestCase):
    def test_la_rama_lleva_la_base_entera(self):
        self.assertEqual(G.rama_para(BASE, ARBOL), "comprobar/%s/%s" % (BASE, "b" * 16))

    def test_veredictos(self):
        self.assertEqual(G.veredicto({"status": "in_progress"}, []), ("en_curso", ""))
        self.assertEqual(G.veredicto({"status": "completed", "conclusion": "success"}, []), ("ok", ""))
        tsc = [{"steps": [{"name": "Qué cambia", "conclusion": "success"}, {"name": "tsc", "conclusion": "failure"}]}]
        self.assertEqual(G.veredicto({"status": "completed", "conclusion": "failure"}, tsc), ("fallo", "tsc"))
        npm = [{"steps": [{"name": "Dependencias", "conclusion": "failure"}]}]
        self.assertEqual(G.veredicto({"status": "completed", "conclusion": "failure"}, npm), ("medio", "Dependencias"))
        self.assertEqual(G.veredicto({"status": "completed", "conclusion": "cancelled"}, []), ("medio", "cancelled"))

    def test_podar(self):
        e = {"viejo": {"estado": "ok", "t": T - G.OLVIDO_S - 1}, "perdido": {"estado": "en_curso", "t": T - G.CADUCA_S - 1},
             "vivo": {"estado": "en_curso", "t": T - 60}, "bueno": {"estado": "ok", "t": T - 3600}}
        self.assertEqual(sorted(G.podar(e, T)), ["bueno", "vivo"])
        self.assertEqual(G.en_vuelo(G.podar(e, T)), 1)


class Flujo(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.estado = os.path.join(self.tmp.name, "comprobar-github.json")
        self.p = [mock.patch.object(G, "ESTADO", self.estado), mock.patch.object(G.time, "sleep", lambda s: None)]
        for x in self.p:
            x.start()
            self.addCleanup(x.stop)
        self.empujes, self.borradas = [], []

    def _git(self, cwd, args, timeout=180):
        if args[:2] == ["rev-parse", "HEAD^{tree}"]:
            return 0, ARBOL + "\n"
        if args[:2] == ["rev-parse", "HEAD"]:
            return 0, CABEZA + "\n"
        if args[:3] == ["remote", "get-url", "origin"]:
            return 0, "https://github.com/StarSeedSystem/starseed-system.git\n"
        if args[:1] == ["push"]:
            if "--delete" in args:
                self.borradas.append(args[-1])
            else:
                self.empujes.append(args[-1])
            return 0, ""
        return 1, "?"

    def _gh_con(self, run):
        def gh(args, timeout=60):
            ruta = args[1] if len(args) > 1 else ""
            if "actions/runs?" in ruta:
                return 0, json.dumps([dict(run, name="comprobar-nube")]), ""
            if ruta.endswith("/jobs"):
                return 0, json.dumps([{"steps": [{"name": "tsc", "conclusion": run.get("paso_falla", "success")}]}]), ""
            if "actions/runs/" in ruta:
                return 0, json.dumps({"status": run["status"], "conclusion": run.get("conclusion")}), ""
            if args[:2] == ["run", "view"]:
                return 0, "puertas\ttsc\terror TS2322: Type 'x' is not assignable", ""
            return 1, "", "?"
        return gh

    def test_sin_repo_no_aplica(self):
        self.assertIsNone(G.comprobar(BASE, [], ["src/a.ts"], cwd=os.path.join(self.tmp.name, "no-existe")))
        with mock.patch.dict(os.environ, {"STARSEED_COMPROBAR_GITHUB": "0"}):
            self.assertIsNone(G.comprobar(BASE, [], ["src/a.ts"], cwd=self.tmp.name))

    def test_un_repo_de_prueba_con_otro_origin_no_empuja(self):
        def git(cwd, args, timeout=180):
            if args[:3] == ["remote", "get-url", "origin"]:
                return (0, "/tmp/bare.git\n") if cwd != G.RAIZ else (0, "https://github.com/StarSeedSystem/starseed-system.git\n")
            return self._git(cwd, args, timeout)
        with mock.patch.object(G, "_git", git), mock.patch.object(G, "_gh") as gh:
            self.assertIsNone(G.comprobar(BASE, [], ["src/a.ts"], cwd=self.tmp.name, ahora=T))
        gh.assert_not_called()
        self.assertEqual(self.empujes, [])

    def test_lanza_espera_y_lee_el_verde(self):
        with mock.patch.object(G, "_git", self._git), \
                mock.patch.object(G, "_gh", self._gh_con({"id": 77, "status": "in_progress"})):
            ok, detalle, medio = G.comprobar(BASE, [], ["src/a.ts"], cwd=self.tmp.name, ahora=T)
            self.assertEqual((ok, medio), (False, True))
            self.assertIn(G.ESPERANDO, detalle)
            self.assertEqual(self.empujes, ["%s:refs/heads/%s" % (CABEZA, G.rama_para(BASE, ARBOL))])
            # la pasada siguiente, todavía en marcha: no se vuelve a empujar
            ok, detalle, medio = G.comprobar(BASE, [], ["src/a.ts"], cwd=self.tmp.name, ahora=T + 300)
            self.assertIn(G.ESPERANDO, detalle)
            self.assertEqual(len(self.empujes), 1)
        with mock.patch.object(G, "_git", self._git), \
                mock.patch.object(G, "_gh", self._gh_con({"id": 77, "status": "completed", "conclusion": "success"})):
            ok, detalle, medio = G.comprobar(BASE, [], ["src/a.ts"], cwd=self.tmp.name, ahora=T + 900)
        self.assertEqual((ok, medio), (True, False))
        self.assertIn("run 77", detalle)
        self.assertEqual(self.borradas, [G.rama_para(BASE, ARBOL)])

    def test_un_tsc_rojo_es_de_la_tarea(self):
        with mock.patch.object(G, "_git", self._git), \
                mock.patch.object(G, "_gh", self._gh_con({"id": 78, "status": "in_progress"})):
            G.comprobar(BASE, [], ["src/a.ts"], cwd=self.tmp.name, ahora=T)
        run = {"id": 78, "status": "completed", "conclusion": "failure", "paso_falla": "failure"}
        with mock.patch.object(G, "_git", self._git), mock.patch.object(G, "_gh", self._gh_con(run)):
            ok, detalle, medio = G.comprobar(BASE, [], ["src/a.ts"], cwd=self.tmp.name, ahora=T + 900)
        self.assertEqual((ok, medio), (False, False))
        self.assertTrue(detalle.startswith("en GitHub"))
        self.assertIn("TS2322", detalle)

    def test_tope_de_comprobaciones_a_la_vez(self):
        lleno = {"k%d" % i: {"estado": "en_curso", "t": T, "rama": "comprobar/x/%d" % i} for i in range(G.MAX_EN_VUELO)}
        with open(self.estado, "w") as f:
            json.dump(lleno, f)
        with mock.patch.object(G, "_git", self._git), mock.patch.object(G, "_gh", self._gh_con({"id": 1, "status": "queued"})):
            ok, detalle, medio = G.comprobar(BASE, [], ["src/a.ts"], cwd=self.tmp.name, ahora=T + 10)
        self.assertTrue(medio)
        self.assertIn("ya hay", detalle)
        self.assertEqual(self.empujes, [])


class EnTraerNube(unittest.TestCase):
    def test_comprobandose_es_del_medio_y_no_toca_el_a1(self):
        import traer_nube as Tn

        a1 = mock.Mock()
        with mock.patch.object(G, "comprobar", return_value=(False, G.ESPERANDO + " (run 5): lanzada", True)), \
                mock.patch.dict(sys.modules, {"comprobar_en_a1": a1}), mock.patch.object(Tn, "_correr_en") as correr:
            ok, detalle = Tn._puertas("abc", ["def"], ["src/lib/x.ts"], cwd="/tmp")
        self.assertFalse(ok)
        self.assertTrue(Tn.es_fallo_del_medio(detalle))
        a1.comprobar.assert_not_called()
        correr.assert_not_called()

    def test_el_veredicto_de_github_manda(self):
        import traer_nube as Tn

        with mock.patch.object(G, "comprobar", return_value=(True, "verde en GitHub", False)):
            self.assertEqual(Tn._puertas("abc", ["def"], ["src/lib/x.ts"], cwd="/tmp"), (True, "verde en GitHub"))


if __name__ == "__main__":
    unittest.main()
