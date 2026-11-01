# -*- coding: utf-8 -*-
"""La cuarentena de .ts/.tsx SIN git que no transpilan (incidente del 31-10).

El 31-10 un `src/app/mando/page.tsx` sin git y con JSX inválido tumbó todas las
builds durante horas. Aquí se fija la regla: solo se aparta lo que NO transpila,
solo si no está versionado, y si no hay esbuild no se decide nada.
"""
import os
import shutil
import subprocess
import tempfile
import unittest
from unittest import mock

import cuarentena_sin_git as Q

RAIZ_REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ESBUILD = os.path.join(RAIZ_REPO, "node_modules", ".bin", "esbuild")

ROTO = "export default function P() { return (<div /><span />) }\n"
VALIDO = "export const x = 1\n"


class Candidatos(unittest.TestCase):
    def test_solo_codigo_que_compila(self):
        lineas = ["src/app/a.tsx", "src/lib/b.ts", "src/x.js", "src/y.jsx",
                  "src/z.mjs", "src/leeme.md", "src/datos.json", "", "  "]
        self.assertEqual(
            ["src/app/a.tsx", "src/lib/b.ts", "src/x.js", "src/y.jsx", "src/z.mjs"],
            Q.candidatos(lineas))

    def test_quita_espacios_y_saltos(self):
        self.assertEqual(["src/a.ts", "src/b.ts"],
                         Q.candidatos(["src/a.ts\n", "  src/b.ts  "]))


class RepoTemporal(unittest.TestCase):
    def setUp(self):
        self.raiz = tempfile.mkdtemp(prefix="cuarentena-")
        self.addCleanup(shutil.rmtree, self.raiz, True)
        self._git("init", "-q")
        self._git("config", "user.email", "prueba@starseed.local")
        self._git("config", "user.name", "prueba")
        self.cuarentena = os.path.join(self.raiz, "cuarentena")
        self._parche = mock.patch.object(Q._p, "decir")
        self.decir = self._parche.start()
        self.addCleanup(self._parche.stop)

    def _git(self, *args):
        subprocess.run(["git"] + list(args), cwd=self.raiz, check=True,
                       capture_output=True, text=True)

    def _escribe(self, ruta, texto):
        p = os.path.join(self.raiz, ruta)
        os.makedirs(os.path.dirname(p), exist_ok=True)
        with open(p, "w", encoding="utf-8") as f:
            f.write(texto)
        return p

    def _esbuild(self):
        destino = os.path.join(self.raiz, "node_modules", ".bin")
        os.makedirs(destino, exist_ok=True)
        os.symlink(ESBUILD, os.path.join(destino, "esbuild"))

    def test_un_tsx_roto_sin_git_se_aparta(self):
        self._esbuild()
        roto = self._escribe("src/app/roto.tsx", ROTO)
        movidos = Q.revisar(self.raiz, cuarentena=self.cuarentena)
        self.assertEqual(["src/app/roto.tsx"], movidos)
        self.assertFalse(os.path.exists(roto))
        apartado = os.path.join(self.cuarentena, os.listdir(self.cuarentena)[0],
                                "src/app/roto.tsx")
        self.assertTrue(os.path.exists(apartado))
        with open(apartado, encoding="utf-8") as f:
            self.assertEqual(ROTO, f.read())
        self.decir.assert_called_once()

    def test_un_valido_sin_git_se_queda(self):
        self._esbuild()
        valido = self._escribe("src/lib/bueno.ts", VALIDO)
        self.assertEqual([], Q.revisar(self.raiz, cuarentena=self.cuarentena))
        self.assertTrue(os.path.exists(valido))

    def test_uno_con_git_nunca_se_toca(self):
        self._esbuild()
        roto = self._escribe("src/app/versionado.tsx", ROTO)
        self._git("add", "src/app/versionado.tsx")
        self._git("commit", "-q", "-m", "roto pero versionado")
        self.assertEqual([], Q.revisar(self.raiz, cuarentena=self.cuarentena))
        self.assertTrue(os.path.exists(roto))
        self.decir.assert_not_called()

    def test_sin_esbuild_no_se_mueve_nada(self):
        roto = self._escribe("src/app/roto.tsx", ROTO)
        self.assertEqual([], Q.revisar(self.raiz, cuarentena=self.cuarentena))
        self.assertTrue(os.path.exists(roto))
