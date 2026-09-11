"""Repositorios Git temporales: un fallo nunca debe borrar trabajo."""
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch
from test_progreso_irreversible import enjambre


class WorktreesConservadosTest(unittest.TestCase):
    def setUp(self):
        self.temporal = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporal.cleanup)
        self.raiz = Path(self.temporal.name) / "repo"
        self.raiz.mkdir()
        self.base = Path(self.temporal.name) / "arboles"
        self.git("init", "-b", "main")
        self.git("config", "user.name", "Prueba local")
        self.git("config", "user.email", "prueba@example.invalid")
        mensaje = Path(self.temporal.name) / "mensaje"
        mensaje.write_text("Inicio de prueba\n")
        self.git("commit", "--allow-empty", "-F", str(mensaje))
        for nombre, valor in (("ROOT", str(self.raiz)), ("WT_BASE", str(self.base))):
            parche = patch.object(enjambre, nombre, valor)
            parche.start()
            self.addCleanup(parche.stop)
        parche = patch.object(enjambre, "evento")
        parche.start()
        self.addCleanup(parche.stop)

    def git(self, *args, cwd=None):
        return subprocess.run(["git", *args], cwd=cwd or self.raiz,
                              check=True, capture_output=True, text=True).stdout.strip()

    def test_reutiliza_worktree_sucio_sin_perder_archivos(self):
        wt = Path(enjambre.worktree("T1"))
        archivo = wt / "trabajo.txt"
        archivo.write_text("avance sin commit")
        self.assertEqual(enjambre.worktree("T1"), str(wt))
        self.assertEqual(archivo.read_text(), "avance sin commit")

    def test_limpieza_no_elimina_cambios_ni_rama_en_ningun_cierre(self):
        wt = Path(enjambre.worktree("T1"))
        archivo = wt / "trabajo.txt"
        archivo.write_text("avance sin commit")
        for borrar in (False, True):
            with patch.object(enjambre, "sh") as shell:
                enjambre.limpiar_worktree("T1", borrar_rama=borrar)
                shell.assert_not_called()
            self.assertTrue((wt / ".git").exists())
            self.assertEqual(archivo.read_text(), "avance sin commit")
            self.git("show-ref", "--verify", "refs/heads/ola/T1")

    def test_directorio_huerfano_se_conserva(self):
        wt = self.base / "T1"
        wt.mkdir(parents=True)
        (wt / "avance").write_text("no borrar")
        with self.assertRaises(RuntimeError):
            enjambre.worktree("T1")
        self.assertEqual((wt / "avance").read_text(), "no borrar")

    def test_rechaza_traversal_y_enlace(self):
        for tid in ("../repo", "", "/tmp/ajeno", "T1/T2"):
            with self.assertRaises(RuntimeError):
                enjambre.worktree(tid)
        self.base.mkdir()
        (self.base / "T1").symlink_to(self.raiz, target_is_directory=True)
        with self.assertRaises(RuntimeError):
            enjambre.worktree("T1")
        self.assertTrue((self.raiz / ".git").exists())

    def test_rama_existente_no_se_reemplaza_por_head(self):
        self.git("branch", "ola/T1")
        sha = self.git("rev-parse", "ola/T1")
        wt = enjambre.worktree("T1")
        self.assertEqual(self.git("rev-parse", "HEAD", cwd=wt), sha)
        self.assertEqual(self.git("symbolic-ref", "--short", "HEAD", cwd=wt), "ola/T1")

    def test_error_git_no_crea_ni_borra(self):
        with patch.object(enjambre, "sh", return_value=(128, "fallo")) as shell:
            with self.assertRaises(RuntimeError):
                enjambre.worktree("T1")
            self.assertEqual(shell.call_count, 1)
        self.assertFalse((self.base / "T1").exists())

    def test_worktree_de_otro_repositorio_se_rechaza(self):
        ajeno = Path(self.temporal.name) / "ajeno"
        ajeno.mkdir()
        self.git("init", cwd=ajeno)
        self.git("fetch", str(self.raiz), "main", cwd=ajeno)
        self.base.mkdir()
        wt = self.base / "T1"
        self.git("worktree", "add", "-b", "ola/T1", str(wt), "FETCH_HEAD", cwd=ajeno)
        with self.assertRaises(RuntimeError):
            enjambre.worktree("T1")
        self.assertTrue((wt / ".git").exists())

    def test_status_fallido_no_avanza_a_puertas(self):
        wt = enjambre.worktree("T1")
        with patch.object(enjambre, "worktree", return_value=wt), \
             patch.object(enjambre, "LOGS", str(self.base)), \
             patch.object(enjambre, "sh", return_value=(128, "fatal: no git")), \
             patch.object(enjambre, "set_estado") as estado, \
             patch.object(enjambre, "tsc") as puerta, \
             patch.object(enjambre.sys, "argv", ["enjambre", "--reanudar"]):
            enjambre.ejecutar({"id": "T1"})
            puerta.assert_not_called()
            self.assertEqual(estado.call_args.kwargs["estado"], "fallo")
        self.assertTrue(Path(wt, ".git").exists())


if __name__ == "__main__":
    unittest.main()
