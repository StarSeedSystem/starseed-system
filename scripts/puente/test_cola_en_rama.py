#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""El reparto a la nube ya no deja commits en main (2026-09-24).

36 de 40 commits sin publicar eran el mismo reparto repetido. Estas pruebas vigilan
que el commit de la cola sea SUELTO: main, el índice y el árbol quedan como estaban.
"""

import os
import subprocess
import tempfile
import unittest
from unittest import mock

from cola_en_rama import commit_suelto_con_cola

ENTORNO = dict(
    os.environ,
    GIT_AUTHOR_NAME="Prueba",
    GIT_AUTHOR_EMAIL="prueba@example.invalid",
    GIT_COMMITTER_NAME="Prueba",
    GIT_COMMITTER_EMAIL="prueba@example.invalid",
)


def git(raiz, *args):
    return subprocess.run(
        ["git", *args], cwd=raiz, env=ENTORNO, capture_output=True, text=True, check=True
    ).stdout.strip()


class CommitSueltoConCola(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.raiz = self._tmp.name
        git(self.raiz, "init", "-q", "-b", "main")
        os.makedirs(os.path.join(self.raiz, "enjambre", "colas"))
        with open(os.path.join(self.raiz, ".gitignore"), "w") as f:
            f.write("enjambre/colas/cola-nube-*.json\n")
        with open(os.path.join(self.raiz, "codigo.txt"), "w") as f:
            f.write("código de la Mac\n")
        git(self.raiz, "add", "-A")
        git(self.raiz, "commit", "-q", "-m", "base")
        self.cola = "enjambre/colas/cola-nube-20260924-1500.json"
        with open(os.path.join(self.raiz, self.cola), "w") as f:
            f.write('{"tareas": [{"id": "T1"}]}\n')
        # Algo a medias en el índice real: no debe colarse ni perderse.
        with open(os.path.join(self.raiz, "codigo.txt"), "a") as f:
            f.write("cambio a medias\n")
        git(self.raiz, "add", "codigo.txt")

    def tearDown(self):
        self._tmp.cleanup()

    def test_main_el_indice_y_el_arbol_no_se_tocan(self):
        head = git(self.raiz, "rev-parse", "HEAD")
        estado = git(self.raiz, "status", "--porcelain", "-uall")
        with mock.patch.dict(os.environ, ENTORNO):
            sha = commit_suelto_con_cola(self.raiz, self.cola, "reparto")
        self.assertEqual(git(self.raiz, "rev-parse", "HEAD"), head)
        self.assertEqual(git(self.raiz, "status", "--porcelain", "-uall"), estado)
        # El commit suelto lleva la cola, cuelga de HEAD y NO lleva el cambio a medias.
        self.assertEqual(git(self.raiz, "rev-parse", sha + "^"), head)
        self.assertIn('"T1"', git(self.raiz, "show", "%s:%s" % (sha, self.cola)))
        self.assertEqual(git(self.raiz, "show", sha + ":codigo.txt"), "código de la Mac")
        self.assertEqual(
            git(self.raiz, "diff", "--name-only", head, sha), self.cola
        )

    def test_la_cola_ignorada_no_ensucia_el_arbol(self):
        """Con la regla de .gitignore, la cola nueva no cuenta como «cambios sin
        commit» (el orquestador se niega a arrancar con el árbol sucio)."""
        estado = git(self.raiz, "status", "--porcelain", "-uall")
        self.assertNotIn("cola-nube", estado)

    def test_si_git_falla_lo_dice(self):
        with self.assertRaises(RuntimeError):
            commit_suelto_con_cola(self.raiz, "enjambre/colas/no-existe.json", "x")


class QueTraer(unittest.TestCase):
    """`nube-gh.py traer` copia solo trabajo nuevo: ni repartos, ni lo que main ya tiene."""

    def test_solo_lo_nuevo_y_que_no_es_reparto(self):
        from cola_en_rama import PREFIJO_REPARTO, que_traer

        lineas = ["- aaa", "+ bbb", "+ ccc", "+ ddd", "+ eee"]
        asuntos = {
            "bbb": PREFIJO_REPARTO + "cola-nube-20260924-1407.json",
            "ccc": "salvavidas · T1: trabajo del agente",
            "ddd": "Merge branch x",
            "eee": "Ola 318 · … · T1: integrada",
        }
        self.assertEqual(que_traer(lineas, asuntos, merges={"ddd"}), ["ccc", "eee"])

    def test_rama_de_solo_repartos_no_trae_nada(self):
        from cola_en_rama import PREFIJO_REPARTO, que_traer

        asuntos = {"x1": PREFIJO_REPARTO + "a.json", "x2": PREFIJO_REPARTO + "b.json"}
        self.assertEqual(que_traer(["+ x1", "+ x2", "- y"], asuntos), [])


if __name__ == "__main__":
    unittest.main()
