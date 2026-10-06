# -*- coding: utf-8 -*-
"""Una rama reutilizada se pone al día con main antes de escribir y de las puertas.

(2026-10-06) La ola auto-1005-211229 integró 0 de 12: las tareas reintentadas pasaban
tsc y vitest sobre ramas de hace días (571 commits por detrás) y fallaban en pruebas
que main ya había arreglado. Repositorios Git temporales: nada de esto toca el real."""
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch
from test_progreso_irreversible import enjambre


class PonerAlDiaTest(unittest.TestCase):
    def setUp(self):
        self.temporal = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporal.cleanup)
        self.raiz = Path(self.temporal.name) / "repo"
        self.raiz.mkdir()
        self.base = Path(self.temporal.name) / "arboles"
        self.git("init", "-q", "-b", "main")
        self.git("config", "user.name", "Prueba local")
        self.git("config", "user.email", "prueba@example.invalid")
        self.commit_en(self.raiz, "comun.txt", "base\n", "inicio")
        for nombre, valor in (("ROOT", str(self.raiz)), ("WT_BASE", str(self.base))):
            parche = patch.object(enjambre, nombre, valor)
            parche.start()
            self.addCleanup(parche.stop)
        self.prog = {}
        for nombre, valor in (("PROG", self.prog), ("guardar_prog", lambda p: None)):
            parche = patch.object(enjambre, nombre, valor)
            parche.start()
            self.addCleanup(parche.stop)
        self.eventos = []
        parche = patch.object(enjambre, "evento", lambda *a, **k: self.eventos.append(a))
        parche.start()
        self.addCleanup(parche.stop)

    def git(self, *args, cwd=None):
        return subprocess.run(["git", *args], cwd=cwd or self.raiz,
                              check=True, capture_output=True, text=True).stdout.strip()

    def commit_en(self, donde, archivo, texto, mensaje):
        (Path(donde) / archivo).write_text(texto)
        self.git("add", archivo, cwd=donde)
        self.git("commit", "-q", "-m", mensaje, cwd=donde)

    def avanzar_main(self, veces=3):
        for i in range(veces):
            self.commit_en(self.raiz, "main-%d.txt" % i, "nuevo %d\n" % i, "main %d" % i)

    def test_al_dia_no_toca_nada(self):
        wt = enjambre.worktree("T1")
        cima = self.git("rev-parse", "HEAD", cwd=wt)
        self.assertEqual(enjambre.poner_al_dia("T1", wt)["estado"], "al_dia")
        self.assertEqual(self.git("rev-parse", "HEAD", cwd=wt), cima)

    def test_rama_sin_trabajo_propio_avanza_hasta_main(self):
        wt = enjambre.worktree("T1")
        self.avanzar_main(4)
        r = enjambre.poner_al_dia("T1", wt)
        self.assertEqual((r["estado"], r["detras"]), ("rebase", 4))
        self.assertEqual(self.git("rev-parse", "HEAD", cwd=wt), self.git("rev-parse", "main"))

    def test_trabajo_propio_sin_choque_se_conserva_encima_de_main(self):
        wt = enjambre.worktree("T1")
        self.commit_en(wt, "tarea.txt", "mi trabajo\n", "salvavidas")
        self.avanzar_main(2)
        self.assertEqual(enjambre.poner_al_dia("T1", wt)["estado"], "rebase")
        self.assertEqual(self.git("merge-base", "HEAD", "main", cwd=wt), self.git("rev-parse", "main"))
        self.assertEqual((Path(wt) / "tarea.txt").read_text(), "mi trabajo\n")
        self.assertTrue((Path(wt) / "main-1.txt").exists())

    def test_cambios_sin_commit_se_guardan_antes_del_rebase(self):
        wt = enjambre.worktree("T1")
        (Path(wt) / "pendiente.txt").write_text("a medias\n")
        self.avanzar_main(2)
        self.assertEqual(enjambre.poner_al_dia("T1", wt)["estado"], "rebase")
        self.assertEqual((Path(wt) / "pendiente.txt").read_text(), "a medias\n")
        self.assertEqual(self.git("status", "--porcelain", cwd=wt), "")
        self.assertIn("pendiente.txt", self.git("diff", "--name-only", "main...HEAD", cwd=wt))

    def test_choque_archiva_el_intento_y_arranca_desde_main(self):
        wt = enjambre.worktree("T1")
        self.commit_en(wt, "comun.txt", "version de la tarea\n", "salvavidas viejo")
        viejo = self.git("rev-parse", "HEAD", cwd=wt)
        (Path(wt) / "MENSAJES-DEL-DIRECTOR.md").write_text("nota de Alex\n")
        self.commit_en(self.raiz, "comun.txt", "version de main\n", "main cambia lo mismo")
        r = enjambre.poner_al_dia("T1", wt)
        self.assertEqual(r["estado"], "archivada")
        self.assertEqual(self.git("rev-parse", r["ref"]), viejo)
        self.assertTrue(r["ref"].startswith("refs/archivo/ola/T1/"))
        self.assertEqual(self.git("rev-parse", "HEAD", cwd=wt), self.git("rev-parse", "main"))
        self.assertEqual(self.git("symbolic-ref", "--short", "HEAD", cwd=wt), "ola/T1")
        # Las notas del director (no versionadas) siguen ahí.
        self.assertEqual((Path(wt) / "MENSAJES-DEL-DIRECTOR.md").read_text(), "nota de Alex\n")
        # El agente lo sabe por su contexto.
        self.assertEqual(self.prog["T1"]["trabajo_archivado"]["archivos"], ["comun.txt"])
        bloque = enjambre._bloque_trabajo_archivado("T1")
        self.assertIn("INTENTO ANTERIOR ARCHIVADO", bloque)
        self.assertIn("comun.txt", bloque)

    def test_sin_intento_archivado_no_hay_bloque(self):
        self.assertEqual(enjambre._bloque_trabajo_archivado("NADA"), "")

    def test_git_que_falla_no_mueve_nada(self):
        with patch.object(enjambre, "sh", return_value=(128, "fallo")) as shell:
            self.assertEqual(enjambre.poner_al_dia("T1", str(self.raiz))["estado"], "sin_verificar")
            self.assertEqual(shell.call_count, 1)

    def test_contexto_de_la_tarea_lleva_el_bloque_y_formatea_porcentajes(self):
        self.prog["T9"] = {"trabajo_archivado": {"ref": "refs/archivo/ola/T9/x", "detras": 5,
                                                 "archivos": ["src/a-50%.ts"]}}
        with patch.object(enjambre, "contexto_inteligente", return_value=""), \
             patch.object(enjambre, "_guardar_contexto", lambda *a: None):
            texto = enjambre.contexto_tarea({"id": "T9", "titulo": "t", "prompt": "p", "archivos": []})
        self.assertIn("INTENTO ANTERIOR ARCHIVADO", texto)
        self.assertIn("src/a-50%.ts", texto)


if __name__ == "__main__":
    unittest.main()
