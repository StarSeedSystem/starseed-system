# -*- coding: utf-8 -*-
"""Las reglas de cuarentena_sin_git.py, en un repo git temporal (SUP0111B).

Un .tsx roto sin git se aparta; uno válido sin git se queda; uno CON git nunca se toca;
sin esbuild nada se mueve. El esbuild es de cartón (1 si el nombre lleva ROTO, 0 si no).
"""

import importlib.util
import os
from contextlib import contextmanager
import subprocess
import tempfile
import unittest

_espec = importlib.util.spec_from_file_location(
    "cuarentena_sin_git",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "cuarentena_sin_git.py"))
assert _espec is not None and _espec.loader is not None
C = importlib.util.module_from_spec(_espec)
_espec.loader.exec_module(C)

ROTO = "src/app/ROTO.tsx"
BUENO = "src/app/bien.tsx"
RASTREADO = "src/app/ROTO-rastreado.tsx"
FALSO = '#!/bin/sh\ncase "$1" in *ROTO*) exit 1;; *) exit 0;; esac\n'


def _escribe(ruta, texto):
    with open(ruta, "w", encoding="utf-8") as f:
        f.write(texto)


def _repo(padre):
    """Repo git temporal con un archivo ya cometido."""
    raiz = tempfile.mkdtemp(dir=padre)
    os.makedirs(os.path.join(raiz, "src", "app"))
    _escribe(os.path.join(raiz, RASTREADO), "export const r = 1\n")
    for orden in (["git", "init", "-q"], ["git", "config", "user.email", "t@t"],
                  ["git", "config", "user.name", "t"], ["git", "add", "src"],
                  ["git", "commit", "-q", "-m", "comienzo"]):
        subprocess.run(orden, cwd=raiz, capture_output=True, text=True, check=True)
    return raiz


def _con_esbuild(raiz):
    binario = os.path.join(raiz, "node_modules", ".bin", "esbuild")
    os.makedirs(os.path.dirname(binario), exist_ok=True)
    _escribe(binario, FALSO)
    os.chmod(binario, 0o755)


@contextmanager
def _escuchando(coleccion):
    """Mientras dura, `puente.decir` guarda (quien, tipo, texto) y no toca el canal real."""
    original, C._p.decir = C._p.decir, lambda texto, quien=None, tipo="mensaje", tarea=None: (
        coleccion.append((quien, tipo, texto)) or texto)
    try:
        yield coleccion
    finally:
        C._p.decir = original


class Candidatos(unittest.TestCase):
    """PURA: solo código JS/TS de src/, sin repetidos ni ruido."""

    def test_quede_solo_codigo_sin_ruido_ni_repetidos(self):
        lineas = ["src/app/page.tsx", "README.md", "src/estilos.css", "src/legado.js",
                  "src/lib/salas.ts", "src/app/page.tsx"]
        self.assertEqual(C.candidatos(lineas),
                         ["src/app/page.tsx", "src/legado.js", "src/lib/salas.ts"])
        self.assertEqual(C.candidatos(None), [])


class EnRepoTemporal(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.raiz = _repo(self.tmp.name)
        self.destino = os.path.join(self.tmp.name, "cuarentena")
        _escribe(os.path.join(self.raiz, ROTO), "export const x = <div><span></div>\n")
        _escribe(os.path.join(self.raiz, BUENO), "export const bien = true\n")

    def test_roto_sin_git_se_aparta_a_cuarentena(self):
        _con_esbuild(self.raiz)
        self.assertEqual(C.revisar(self.raiz, self.destino), [ROTO])
        sello = os.listdir(self.destino)[0]
        self.assertTrue(sello.endswith("-sin-git"))
        self.assertTrue(os.path.isfile(os.path.join(self.destino, sello, ROTO)))

    def test_valido_sin_git_se_queda_y_con_git_nunca_se_toca(self):
        _con_esbuild(self.raiz)  # el rastreado lleva ROTO: si lo mirara, esbuild lo tumba
        self.assertEqual(C.revisar(self.raiz, self.destino), [ROTO])
        self.assertTrue(os.path.isfile(os.path.join(self.raiz, BUENO)))
        self.assertTrue(os.path.isfile(os.path.join(self.raiz, RASTREADO)))

    def test_transpila_con_esbuild_y_sin_esbuild(self):
        _con_esbuild(self.raiz)
        self.assertEqual(C.transpila(self.raiz, BUENO), True)
        self.assertEqual(C.transpila(self.raiz, ROTO), False)
        os.unlink(os.path.join(self.raiz, "node_modules", ".bin", "esbuild"))
        self.assertEqual(C.transpila(self.raiz, BUENO), None)

    def test_sin_esbuild_revisar_no_mueve_nada_ni_avisa(self):
        avistos = []
        with _escuchando(avistos):
            self.assertEqual(C.revisar(self.raiz, self.destino), [])
        self.assertEqual(avistos, [])
        self.assertTrue(os.path.isfile(os.path.join(self.raiz, ROTO)))

    def test_aviso_al_canal_cuando_aparta(self):
        _con_esbuild(self.raiz)
        avistos = []
        with _escuchando(avistos):
            C.revisar(self.raiz, self.destino)
        self.assertEqual(avistos, [("reconstruir", "aviso", C.aviso_de([ROTO]))])
        self.assertIn(ROTO, C.aviso_de([ROTO]))


if __name__ == "__main__":
    unittest.main()
