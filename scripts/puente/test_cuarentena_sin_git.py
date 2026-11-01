# -*- coding: utf-8 -*-
"""Pruebas de la cuarentena de código SIN git que no compila (SUP0111B).

El 31-10 un `src/app/mando/page.tsx` sin git y con JSX inválido tumbó todas las
builds durante horas. Aquí se fija: se aparta lo roto sin git, no se toca lo que
está en git, lo válido se queda, y sin esbuild no se decide nada.
"""
import importlib.util
import os
import shutil
import subprocess
import tempfile
import unittest

CARPETA = os.path.dirname(os.path.abspath(__file__))
_ruta = os.path.join(CARPETA, "cuarentena_sin_git.py")
_spec = importlib.util.spec_from_file_location("cuarentena_sin_git", _ruta)
_cargador = getattr(_spec, "loader", None)
assert _spec is not None and _cargador is not None
CS = importlib.util.module_from_spec(_spec)
_cargador.exec_module(CS)

ESBUILD_REAL = os.path.abspath(
    os.path.join(CARPETA, "..", "..", "node_modules", ".bin", "esbuild"))

ROTO = "export default function P() { return (<div>a</div><div>b</div>); }\n"
BUENO = "export default function P() { return <div>hola</div>; }\n"


class Repo(unittest.TestCase):
    def setUp(self):
        self.raiz = tempfile.mkdtemp(prefix="cuarentena-prueba-")
        self.cuarentena = tempfile.mkdtemp(prefix="cuarentena-destino-")
        self._antes = os.environ.get("STARSEED_CUARENTENA")
        os.environ["STARSEED_CUARENTENA"] = self.cuarentena
        subprocess.run(["git", "init", "-q"], cwd=self.raiz, check=True,
                       capture_output=True)
        os.makedirs(os.path.join(self.raiz, "src", "app"), exist_ok=True)

    def tearDown(self):
        if self._antes is None:
            os.environ.pop("STARSEED_CUARENTENA", None)
        else:
            os.environ["STARSEED_CUARENTENA"] = self._antes
        shutil.rmtree(self.raiz, ignore_errors=True)
        shutil.rmtree(self.cuarentena, ignore_errors=True)

    def _escribe(self, nombre, texto):
        ruta = os.path.join(self.raiz, "src", "app", nombre)
        with open(ruta, "w", encoding="utf-8") as f:
            f.write(texto)
        return ruta

    def _con_esbuild(self):
        binario = os.path.join(self.raiz, "node_modules", ".bin")
        os.makedirs(binario, exist_ok=True)
        os.symlink(ESBUILD_REAL, os.path.join(binario, "esbuild"))

    def _apartados(self):
        fuera = []
        for base, _dirs, ficheros in os.walk(self.cuarentena):
            for fichero in ficheros:
                fuera.append(os.path.relpath(os.path.join(base, fichero),
                                             self.cuarentena))
        return fuera


class TestCandidatos(unittest.TestCase):
    def test_solo_codigo_que_compila_y_sin_duplicados(self):
        lineas = ["src/a.ts", "src/b.tsx", "src/c.js", "src/d.jsx",
                  "src/e.mjs", "src/f.css", "src/g.md", "", "src/a.ts"]
        self.assertEqual(
            ["src/a.ts", "src/b.tsx", "src/c.js", "src/d.jsx", "src/e.mjs"],
            CS.candidatos(lineas))


class TestCuarentena(Repo):
    def test_tsx_roto_sin_git_se_aparta(self):
        ruta = self._escribe("page.tsx", ROTO)
        self._con_esbuild()
        movidos = CS.revisar(self.raiz)
        self.assertEqual(["src/app/page.tsx"], movidos)
        self.assertFalse(os.path.exists(ruta))
        self.assertTrue(any(f.endswith(os.path.join("src", "app", "page.tsx"))
                            for f in self._apartados()))

    def test_tsx_valido_sin_git_se_queda(self):
        ruta = self._escribe("page.tsx", BUENO)
        self._con_esbuild()
        self.assertEqual([], CS.revisar(self.raiz))
        self.assertTrue(os.path.exists(ruta))
        self.assertEqual([], self._apartados())

    def test_lo_que_esta_en_git_nunca_se_toca(self):
        ruta = self._escribe("page.tsx", ROTO)
        subprocess.run(["git", "add", "src/app/page.tsx"], cwd=self.raiz,
                       check=True, capture_output=True)
        self._con_esbuild()
        self.assertEqual([], CS.revisar(self.raiz))
        self.assertTrue(os.path.exists(ruta))

    def test_sin_esbuild_no_se_mueve_nada(self):
        ruta = self._escribe("page.tsx", ROTO)
        self.assertIsNone(CS.transpila(self.raiz, "src/app/page.tsx"))
        self.assertEqual([], CS.revisar(self.raiz))
        self.assertTrue(os.path.exists(ruta))
        self.assertEqual([], self._apartados())
