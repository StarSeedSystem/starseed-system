# -*- coding: utf-8 -*-
"""(SUP0911C) _pruebas_a_sumar: el orquestador le da a alcance_pruebas listar/leer para sumar importadoras TS.

Un repo git de verdad en un temporal, con GIT_CONFIG_GLOBAL=/dev/null, y sin red.
Pruebas con src/a/w.tsx y src/a/b/__tests__/w-render.test.tsx (importa ../../w).
"""
import contextlib
import importlib.util
import os
import shutil
import subprocess
import sys
import tempfile
import types
import unittest
from unittest import mock

RUTA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "starseed-enjambre.py")
ESPEC = importlib.util.spec_from_file_location("enjambre_alcance_0911", RUTA)
if ESPEC is None or ESPEC.loader is None:
    raise RuntimeError("no pude cargar starseed-enjambre.py")
enjambre = importlib.util.module_from_spec(ESPEC)
sys.modules["enjambre_alcance_0911"] = enjambre
ESPEC.loader.exec_module(enjambre)

PUENTE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "puente")
if PUENTE not in sys.path:
    sys.path.insert(0, PUENTE)


class PruebasAyudanteTest(unittest.TestCase):
    """Pruebas de _pruebas_a_sumar con alcances de mentira."""

    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="alcance-0911-")
        self.repo = os.path.join(self.tmp, "repo")
        os.makedirs(os.path.join(self.repo, "src", "a", "b", "__tests__"))
        self._git("init", "-q", "-b", "main")
        self._git("config", "user.email", "test@starseed.local")
        self._git("config", "user.name", "Test Enjambre")
        self._escribir("src/a/w.tsx", "export const W = 1\n")
        self._escribir("src/a/b/__tests__/w-render.test.tsx", 'import { W } from "../../w";\n')
        self._git("add", ".")
        self._git("commit", "-qm", "base")

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def _git(self, *args):
        env = os.environ.copy()
        env["GIT_CONFIG_GLOBAL"] = "/dev/null"
        subprocess.run(["git"] + list(args), cwd=self.repo, check=True, capture_output=True, text=True, env=env)

    def _escribir(self, ruta, texto):
        with open(os.path.join(self.repo, ruta), "w", encoding="utf-8") as f:
            f.write(texto)

    def _alcance_mentira(self):
        """alcance con SUFIJOS_PRUEBA y pruebas_a_sumar que guarda lo que recibe y usa listar/leer."""
        ns = types.SimpleNamespace()
        ns.SUFIJOS_PRUEBA = (".test.ts", ".test.tsx", ".spec.ts", ".spec.tsx")
        ns.recibido = {}

        def pruebas_a_sumar(rutas, existe, base=None, listar=None, leer=None):
            ns.recibido = {"rutas": rutas, "existe": existe, "base": base, "listar": listar, "leer": leer}
            if listar is None or leer is None:
                return ["vieja-prueba.test.ts"]
            pruebas = listar()
            return [p for p in pruebas if existe(p)]

        ns.pruebas_a_sumar = pruebas_a_sumar
        return ns

    def test_alcance_nuevo_recibe_listar_y_leer_y_devuelve_importadoras(self):
        alcance = self._alcance_mentira()
        tocados = ["src/a/w.tsx"]
        resultado = enjambre._pruebas_a_sumar(alcance, self.repo, tocados)
        self.assertEqual(resultado, ["src/a/b/__tests__/w-render.test.tsx"])
        self.assertIsNotNone(alcance.recibido.get("listar"))
        self.assertIsNotNone(alcance.recibido.get("leer"))
        listar_fn = alcance.recibido["listar"]
        leer_fn = alcance.recibido["leer"]
        self.assertIsInstance(listar_fn(), list)
        self.assertIn("src/a/b/__tests__/w-render.test.tsx", listar_fn())
        self.assertEqual(leer_fn("src/a/b/__tests__/w-render.test.tsx"), 'import { W } from "../../w";\n')

    def _alcance_viejo(self):
        """alcance cuya pruebas_a_sumar SOLO acepta (rutas, existe)."""
        ns = types.SimpleNamespace()
        ns.SUFIJOS_PRUEBA = (".test.ts", ".test.tsx", ".spec.ts", ".spec.tsx")

        def pruebas_a_sumar(rutas, existe):
            return ["vieja-prueba.test.ts"]

        ns.pruebas_a_sumar = pruebas_a_sumar
        return ns

    def test_alcance_viejo_sin_listar_leer_cae_a_llamada_original(self):
        alcance = self._alcance_viejo()
        tocados = ["src/a/w.tsx"]
        resultado = enjambre._pruebas_a_sumar(alcance, self.repo, tocados)
        self.assertEqual(resultado, ["vieja-prueba.test.ts"])

    def test_sin_repo_git_listar_devuelve_vacio(self):
        alcance = self._alcance_mentira()
        no_repo = os.path.join(self.tmp, "no-git")
        os.makedirs(os.path.join(no_repo, "src", "a", "b", "__tests__"))
        self._escribir_no_repo = lambda r, t: open(os.path.join(no_repo, r), "w", encoding="utf-8").write(t)
        self._escribir_no_repo("src/a/w.tsx", "export const W = 1\n")
        self._escribir_no_repo("src/a/b/__tests__/w-render.test.tsx", 'import { W } from "../../w";\n')
        tocados = ["src/a/w.tsx"]
        resultado = enjambre._pruebas_a_sumar(alcance, no_repo, tocados)
        self.assertEqual(resultado, [])
        listar_fn = alcance.recibido["listar"]
        self.assertEqual(listar_fn(), [])

    def _escribir_no_repo(self, ruta, texto):
        with open(os.path.join(self.tmp, "no-git", ruta), "w", encoding="utf-8") as f:
            f.write(texto)


class OrdenVitestConAlcanceRealTest(unittest.TestCase):
    """_orden_de_vitest con el alcance_pruebas DE ESTE árbol."""

    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="alcance-real-0911-")
        self.repo = os.path.join(self.tmp, "repo")
        os.makedirs(os.path.join(self.repo, "src", "a", "b", "__tests__"))
        self._git("init", "-q", "-b", "main")
        self._git("config", "user.email", "test@starseed.local")
        self._git("config", "user.name", "Test Enjambre")
        self._escribir("src/a/w.tsx", "export const W = 1\n")
        self._escribir("src/a/b/__tests__/w-render.test.tsx", 'import { W } from "../../w";\n')
        self._git("add", ".")
        self._git("commit", "-qm", "base")

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def _git(self, *args):
        env = os.environ.copy()
        env["GIT_CONFIG_GLOBAL"] = "/dev/null"
        subprocess.run(["git"] + list(args), cwd=self.repo, check=True, capture_output=True, text=True, env=env)

    def _escribir(self, ruta, texto):
        with open(os.path.join(self.repo, ruta), "w", encoding="utf-8") as f:
            f.write(texto)

    def test_orden_incluye_prueba_que_importa_la_fuente_tocada(self):
        import sys as _sys
        puente = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "puente")
        if puente not in _sys.path:
            _sys.path.insert(0, puente)
        import alcance_pruebas
        _sys.modules["alcance_pruebas"] = alcance_pruebas
        orden = enjambre._orden_de_vitest(self.repo, ["src/a/w.tsx"])
        self.assertIn("src/a/b/__tests__/w-render.test.tsx", orden)
        self.assertIn("npx vitest run", orden)


if __name__ == "__main__":
    unittest.main()