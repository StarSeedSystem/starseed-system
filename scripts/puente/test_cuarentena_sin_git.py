# -*- coding: utf-8 -*-
"""Pruebas de cuarentena_sin_git.py: el incidente del 31-10 con un repo git de verdad."""

import glob
import os
import shutil
import subprocess
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import cuarentena_sin_git as C

RAIZ_REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ESBUILD_REAL = os.path.join(RAIZ_REPO, "node_modules", ".bin", "esbuild")

ROTO = "export default function P() { return <div /><span />; }\n"
VALIDO = "export default function P() { return <div>hola</div>; }\n"


class TestCandidatos(unittest.TestCase):
    def test_solo_fuentes_que_esbuild_lee(self):
        lineas = [
            "src/app/mando/page.tsx\n",
            "src/lib/a.ts",
            "",
            "src/estilos.css",
            "src/datos.json",
            "src/app/x.mjs",
            "src/app/y.jsx",
            "src/app/z.js",
        ]
        self.assertEqual(
            C.candidatos(lineas),
            ["src/app/mando/page.tsx", "src/lib/a.ts", "src/app/x.mjs", "src/app/y.jsx", "src/app/z.js"],
        )

    def test_vacio(self):
        self.assertEqual(C.candidatos([]), [])
        self.assertEqual(C.candidatos(None), [])


class TestRevisar(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="cuarentena-")
        self.addCleanup(shutil.rmtree, self.tmp, True)
        self.repo = os.path.join(self.tmp, "repo")
        os.makedirs(os.path.join(self.repo, "src"))
        self._git("init", "-q")

    def _git(self, *args):
        subprocess.run(["git", *args], cwd=self.repo, check=True,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    def _escribe(self, relativa, texto):
        ruta = os.path.join(self.repo, relativa)
        os.makedirs(os.path.dirname(ruta), exist_ok=True)
        with open(ruta, "w", encoding="utf-8") as f:
            f.write(texto)
        return ruta

    def _con_esbuild(self):
        if not os.path.isfile(ESBUILD_REAL):
            self.skipTest("esbuild no está instalado en este repo")
        destino = os.path.join(self.repo, "node_modules", ".bin", "esbuild")
        os.makedirs(os.path.dirname(destino), exist_ok=True)
        os.symlink(ESBUILD_REAL, destino)

    def _cuarentena(self):
        return os.path.join(self.tmp, "cuarentena")

    def test_aparta_el_roto_sin_git(self):
        self._con_esbuild()
        self._escribe("src/app/mando/page.tsx", ROTO)
        movidos = C.revisar(self.repo, cuarentena=self._cuarentena())
        self.assertEqual(movidos, ["src/app/mando/page.tsx"])
        self.assertFalse(os.path.exists(os.path.join(self.repo, "src/app/mando/page.tsx")))
        apartados = glob.glob(os.path.join(
            self._cuarentena(), "*-sin-git", "src/app/mando/page.tsx"))
        self.assertEqual(len(apartados), 1)
        with open(apartados[0], encoding="utf-8") as f:
            self.assertEqual(f.read(), ROTO)

    def test_deja_el_valido_sin_git(self):
        self._con_esbuild()
        ruta = self._escribe("src/app/mando/page.tsx", VALIDO)
        movidos = C.revisar(self.repo, cuarentena=self._cuarentena())
        self.assertEqual(movidos, [])
        self.assertTrue(os.path.exists(ruta))

    def test_no_toca_uno_con_git(self):
        self._con_esbuild()
        ruta = self._escribe("src/app/mando/page.tsx", ROTO)
        self._git("add", "src/app/mando/page.tsx")
        movidos = C.revisar(self.repo, cuarentena=self._cuarentena())
        self.assertEqual(movidos, [])
        self.assertTrue(os.path.exists(ruta))

    def test_sin_esbuild_no_mueve_nada(self):
        ruta = self._escribe("src/app/mando/page.tsx", ROTO)
        movidos = C.revisar(self.repo, cuarentena=self._cuarentena())
        self.assertEqual(movidos, [])
        self.assertTrue(os.path.exists(ruta))


if __name__ == "__main__":
    unittest.main()
