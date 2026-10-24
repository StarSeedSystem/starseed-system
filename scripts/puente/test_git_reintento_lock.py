"""El Git de main espera un index.lock breve sin borrar nunca el candado."""
import importlib.util
import os
from pathlib import Path
import subprocess
import sys
import unittest
from unittest.mock import patch

import traer_nube as traer

RAIZ = Path(__file__).resolve().parents[2]
os.environ["STARSEED_ROOT"] = str(RAIZ)
sys.path.insert(0, str(RAIZ / "scripts" / "enjambre"))
spec = importlib.util.spec_from_file_location(
    "starseed_enjambre_test", RAIZ / "scripts" / "enjambre" / "starseed-enjambre.py"
)
enjambre = importlib.util.module_from_spec(spec)
spec.loader.exec_module(enjambre)


class GitReintentoLock(unittest.TestCase):
    def test_traer_nube_reintenta_lock_y_acaba_bien(self):
        lock = subprocess.CompletedProcess([], 128, "", "Unable to create .git/index.lock: File exists")
        ok = subprocess.CompletedProcess([], 0, "main-sha", "")
        with patch.object(traer.subprocess, "run", side_effect=[lock, ok]) as ejecutar, \
             patch.object(traer.time, "sleep") as dormir:
            rc, salida = traer._git(["rev-parse", "main"])
        self.assertEqual((rc, salida), (0, "main-sha"))
        self.assertEqual(ejecutar.call_count, 2)
        dormir.assert_called_once_with(1)

    def test_orquestador_reintenta_solo_git_sobre_root(self):
        resultados = [(128, "", "fatal: .git/index.lock: File exists"), (0, "ok", "")]

        class Proceso:
            def __init__(self, resultado, **_):
                self.returncode, self.salida, self.error = resultado

            def communicate(self, timeout):
                return self.salida, self.error

        with patch.object(enjambre.subprocess, "Popen", side_effect=lambda *a, **k: Proceso(resultados.pop(0))), \
             patch.object(enjambre.time, "sleep") as dormir:
            rc, salida = enjambre.sh(["git", "merge", "--ff-only", "ola/X"])
        self.assertEqual((rc, salida), (0, "ok"))
        dormir.assert_called_once_with(1)

    def test_no_reintenta_otros_errores_ni_git_de_worktree(self):
        fallo = subprocess.CompletedProcess([], 128, "", "fatal: not a git repository")
        with patch.object(traer.subprocess, "run", return_value=fallo) as ejecutar, \
             patch.object(traer.time, "sleep") as dormir:
            rc, _ = traer._git(["status"])
        self.assertEqual(rc, 128)
        ejecutar.assert_called_once()
        dormir.assert_not_called()

        class Proceso:
            returncode = 128

            def communicate(self, timeout):
                return "", "fatal: .git/index.lock: File exists"

        with patch.object(enjambre.subprocess, "Popen", return_value=Proceso()) as lanzar, \
             patch.object(enjambre.time, "sleep") as dormir:
            rc, _ = enjambre.sh(["git", "status"], cwd=str(RAIZ / "starseed-wt" / "X"))
        self.assertEqual(rc, 128)
        lanzar.assert_called_once()
        dormir.assert_not_called()

    def test_el_reintento_tiene_un_tope_de_60_esperas(self):
        fallo = subprocess.CompletedProcess([], 128, "", "fatal: .git/index.lock: File exists")
        with patch.object(traer.subprocess, "run", return_value=fallo) as ejecutar, \
             patch.object(traer.time, "sleep") as dormir:
            rc, _ = traer._git(["status"])
        self.assertEqual(rc, 128)
        self.assertEqual(ejecutar.call_count, 61)
        self.assertEqual(dormir.call_count, 60)


if __name__ == "__main__":
    unittest.main()
