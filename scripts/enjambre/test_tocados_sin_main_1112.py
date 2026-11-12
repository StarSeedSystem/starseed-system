"""Pruebas para SUP1112B: la puerta de Python ya no prueba archivos que main ganó mientras la tarea corría."""

import os
import sys
import tempfile
import unittest
from unittest import mock
import contextlib
import importlib
import subprocess


ENJAMBRE_DIR = os.path.dirname(os.path.abspath(__file__))
if ENJAMBRE_DIR not in sys.path:
    sys.path.insert(0, ENJAMBRE_DIR)

PUENTE_DIR = os.path.join(os.path.dirname(ENJAMBRE_DIR), "puente")
if PUENTE_DIR not in sys.path:
    sys.path.insert(0, PUENTE_DIR)

enjambre = importlib.import_module("starseed-enjambre")


@contextlib.contextmanager
def _repo_git():
    """Repo de prueba real con git, worktree y main que avanza mientras la tarea corre."""
    with tempfile.TemporaryDirectory() as tmp:
        repo = os.path.join(tmp, "repo")
        os.makedirs(repo)
        wt = os.path.join(tmp, "wt")

        # git init -b main
        subprocess.run(["git", "init", "-b", "main"], cwd=repo, check=True, capture_output=True)
        subprocess.run(["git", "config", "user.name", "t"], cwd=repo, check=True)
        subprocess.run(["git", "config", "user.email", "t@t"], cwd=repo, check=True)

        # Commit base en main
        base_py = os.path.join(repo, "scripts", "puente", "base.py")
        os.makedirs(os.path.dirname(base_py), exist_ok=True)
        with open(base_py, "w", encoding="utf-8") as f:
            f.write("x = 1\n")
        subprocess.run(["git", "add", "-A"], cwd=repo, check=True)
        subprocess.run(["git", "commit", "-m", "base"], cwd=repo, check=True)

        # Worktree de la tarea
        subprocess.run(["git", "worktree", "add", "-b", "ola/T1", wt], cwd=repo, check=True)

        # En el worktree: commit de tarea.py, modificación SIN commit de base.py, archivo nuevo suelto.py
        tarea_py = os.path.join(wt, "scripts", "puente", "tarea.py")
        os.makedirs(os.path.dirname(tarea_py), exist_ok=True)
        with open(tarea_py, "w", encoding="utf-8") as f:
            f.write("y = 2\n")
        subprocess.run(["git", "add", "scripts/puente/tarea.py"], cwd=wt, check=True)
        subprocess.run(["git", "commit", "-m", "tarea"], cwd=wt, check=True)

        # Modificación sin commit de base.py (en el worktree, no en main)
        base_py_wt = os.path.join(wt, "scripts", "puente", "base.py")
        with open(base_py_wt, "w", encoding="utf-8") as f:
            f.write("x = 2\n")

        # Archivo nuevo sin seguimiento
        suelto_py = os.path.join(wt, "scripts", "puente", "suelto.py")
        os.makedirs(os.path.dirname(suelto_py), exist_ok=True)
        with open(suelto_py, "w", encoding="utf-8") as f:
            f.write("z = 3\n")

        # DESPUÉS, en main (repo principal), commit con nuevo_en_main.py
        nuevo_main_py = os.path.join(repo, "scripts", "puente", "nuevo_en_main.py")
        os.makedirs(os.path.dirname(nuevo_main_py), exist_ok=True)
        with open(nuevo_main_py, "w", encoding="utf-8") as f:
            f.write("w = 4\n")
        subprocess.run(["git", "add", "-A"], cwd=repo, check=True)
        subprocess.run(["git", "commit", "-m", "nuevo en main"], cwd=repo, check=True)

        yield repo, wt


@contextlib.contextmanager
def _arbol(archivos):
    """Un árbol de trabajo temporal con esos archivos ({ruta: texto})."""
    with tempfile.TemporaryDirectory() as wt:
        for ruta, texto in archivos.items():
            destino = os.path.join(wt, ruta)
            os.makedirs(os.path.dirname(destino), exist_ok=True)
            with open(destino, "w", encoding="utf-8") as f:
                f.write(texto)
        yield wt


class TestTocadosSinMain(unittest.TestCase):
    """(a) _tocados_por_la_tarea no incluye lo que main ganó después de la bifurcación."""

    def test_tocados_no_incluye_nuevo_en_main(self):
        with _repo_git() as (repo, wt):
            tocados = enjambre._tocados_por_la_tarea(wt)
            self.assertIn("scripts/puente/tarea.py", tocados)
            self.assertIn("scripts/puente/base.py", tocados)
            self.assertIn("scripts/puente/suelto.py", tocados)
            self.assertNotIn("scripts/puente/nuevo_en_main.py", tocados,
                             "nuevo_en_main.py se añadió a main DESPUÉS de la bifurcación")


class TestPuertaPythonFiltraArchivosInexistentes(unittest.TestCase):
    """(b) y (c) _puerta_python filtra archivos que no existen en el worktree."""

    def test_puerta_python_no_llama_sh_si_archivo_no_existe(self):
        """(b) py_tocados = ['no_existe.py'] -> devuelve (0, '') y no llama a sh."""
        with _arbol({"scripts/puente/x.py": "", "scripts/puente/test_x.py": ""}) as wt:
            with mock.patch.object(enjambre, "_tocados_por_la_tarea", return_value=["scripts/puente/no_existe.py"]):
                with mock.patch.object(enjambre, "sh") as mock_sh:
                    rc, out = enjambre._puerta_python(wt, tid="t")
                    self.assertEqual(rc, 0)
                    self.assertEqual(out, "")
                    mock_sh.assert_not_called()

    def test_puerta_python_no_pasa_no_existe_a_sh(self):
        """(c) py_tocados = ['x.py', 'no_existe.py'] -> sh no recibe no_existe.py."""
        with _arbol({"scripts/puente/x.py": "", "scripts/puente/test_x.py": ""}) as wt:
            with mock.patch.object(enjambre, "_tocados_por_la_tarea", return_value=["scripts/puente/x.py", "scripts/puente/no_existe.py"]):
                with mock.patch.object(enjambre, "sh", return_value=(0, "Ran 1 test OK")) as mock_sh:
                    rc, out = enjambre._puerta_python(wt, tid="t")
                    self.assertEqual(rc, 0)
                    self.assertEqual(mock_sh.call_count, 1)
                    cmd = mock_sh.call_args[0][0]
                    self.assertNotIn("no_existe.py", " ".join(cmd))


if __name__ == "__main__":
    unittest.main()