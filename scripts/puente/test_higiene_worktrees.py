#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Tests de higiene_worktrees."""

import json, os, shutil, subprocess, sys, tempfile, unittest, unittest.mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import higiene_worktrees as hw  # noqa: E402


def _git(repo, *args):
    return subprocess.run(
        ["git"] + list(args), cwd=repo, capture_output=True, text=True
    )


class TestCandidatos(unittest.TestCase):
    def test_estados(self):
        prog = {
            "A": {"estado": "commit"},
            "B": {"estado": "sustituida"},
            "C": {"estado": "en_curso"},
            "D": {"estado": "rechazada"},
        }
        nombres = ["A", "B", "C", "D", "E", "_to_delete", ".oculto"]
        self.assertEqual(hw.candidatos(prog, nombres, []), ["A", "B"])

    def test_confusion_de_prefijo(self):
        # SP09291 es candidato aunque haya un proceso en starseed-wt/SP092910/
        ps = ["python3 x.py --wt /home/starseed-wt/SP092910 "]
        self.assertEqual(
            hw.candidatos({"SP09291": {"estado": "commit"}}, ["SP09291"], ps),
            ["SP09291"],
        )

    def test_proceso_vivo_lo_excluye(self):
        ps = ["node scripts/x en starseed-wt/CDK1004 y nada mas"]
        self.assertEqual(
            hw.candidatos({"CDK1004": {"estado": "commit"}}, ["CDK1004"], ps), []
        )

    def test_sin_progreso_no_es_candidato(self):
        self.assertEqual(hw.candidatos({}, ["ZZZ"], []), [])


class TestPodar(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="hw-test-")
        self.addCleanup(shutil.rmtree, self.tmp, True)
        self.repo = os.path.join(self.tmp, "repo")
        os.makedirs(self.repo)
        _git(self.repo, "init", "-b", "main")
        _git(self.repo, "config", "user.email", "t@t.t")
        _git(self.repo, "config", "user.name", "t")
        with open(os.path.join(self.repo, "a.txt"), "w") as f:
            f.write("a")
        _git(self.repo, "add", ".")
        _git(self.repo, "commit", "-m", "init")
        olas = os.path.join(self.repo, "starseed_memory_root", "olas")
        os.makedirs(olas)
        with open(os.path.join(olas, "progreso.json"), "w") as f:
            json.dump(
                {
                    "WT1": {"estado": "commit"},
                    "WT2": {"estado": "sustituida"},
                    "WT3": {"estado": "en_curso"},
                },
                f,
            )
        self.wt_base = os.path.join(self.tmp, "starseed-wt")
        os.makedirs(self.wt_base)
        for n in ("WT1", "WT2", "WT3"):
            _git(
                self.repo,
                "worktree",
                "add",
                "-b",
                "rama-" + n,
                os.path.join(self.wt_base, n),
            )
        cerrojo = os.path.join(self.tmp, "integrar.lock")
        self.parcher = unittest.mock.patch.object(hw, "CERROJO", cerrojo)
        self.parcher.start()
        self.addCleanup(self.parcher.stop)

    def test_simular_no_quita_nada(self):
        self.assertEqual(
            hw.podar(self.repo, self.wt_base, simular=True, decir=False), ["WT1", "WT2"]
        )
        for n in ("WT1", "WT2", "WT3"):
            self.assertTrue(os.path.isdir(os.path.join(self.wt_base, n)))

    def test_podar_real(self):
        # WT2 con un archivo sin seguimiento: git se niega y se conserva.
        with open(os.path.join(self.wt_base, "WT2", "suelto.txt"), "w") as f:
            f.write("sin seguimiento")
        quitados = hw.podar(self.repo, self.wt_base, decir=False)
        self.assertEqual(quitados, ["WT1"])
        self.assertFalse(os.path.exists(os.path.join(self.wt_base, "WT1")))
        self.assertTrue(os.path.isdir(os.path.join(self.wt_base, "WT2")))
        self.assertTrue(os.path.isdir(os.path.join(self.wt_base, "WT3")))
        # La rama del worktree quitado sigue existiendo.
        ramas = _git(self.repo, "branch", "--list").stdout
        self.assertIn("rama-WT1", ramas)
        self.assertIn("rama-WT2", ramas)


if __name__ == "__main__":
    unittest.main()
