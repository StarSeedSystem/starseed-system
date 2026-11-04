# -*- coding: utf-8 -*-
"""(SUP0411D) Un `git worktree add` cortado por el plazo no se reutiliza a medias: se termina sin pisar nada.

04-11 (medido): con la Mac a carga 50–60, `git worktree add` (120 s) se cortaba y dejaba la carpeta a medias,
«locked: initializing» y sin índice (MVD1027F-d3b: 3 025 de 8 289 archivos y un índice de 65 bytes). La vuelta
siguiente `worktree()` la daba por buena y la tarea corría sus puertas sobre un árbol al que le faltaba casi
todo («tsc sigue con N errores», «tests python fallan»). Git corre de verdad en un repositorio temporal.
"""
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from test_progreso_irreversible import enjambre

PUENTE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "puente")
if PUENTE not in sys.path:
    sys.path.insert(0, PUENTE)
import revisor_bloqueadas_logica as rev  # noqa: E402

ARCHIVOS = {"a.txt": "a de main\n", "b.txt": "b de main\n", "dir/c.txt": "c de main\n"}


class WorktreeCortadoTest(unittest.TestCase):
    def setUp(self):
        self.temporal = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporal.cleanup)
        tmp = Path(os.path.realpath(self.temporal.name))  # en macOS /tmp es /private/tmp: `worktree()` da la real
        self.raiz = tmp / "repo"
        self.raiz.mkdir()
        self.base = tmp / "arboles"
        self.git("init", "-b", "main")
        self.git("config", "user.name", "Prueba local")
        self.git("config", "user.email", "prueba@example.invalid")
        for nombre, texto in ARCHIVOS.items():
            (self.raiz / nombre).parent.mkdir(parents=True, exist_ok=True)
            (self.raiz / nombre).write_text(texto)
        self.git("add", ".")
        self.git("commit", "-q", "-m", "base")
        for nombre, valor in (("ROOT", str(self.raiz)), ("WT_BASE", str(self.base))):
            parche = patch.object(enjambre, nombre, valor)
            parche.start()
            self.addCleanup(parche.stop)
        parche = patch.object(enjambre, "evento")
        self.evento = parche.start()
        self.addCleanup(parche.stop)

    def git(self, *args, cwd=None):
        return subprocess.run(["git", *args], cwd=cwd or self.raiz,
                              check=True, capture_output=True, text=True).stdout.strip()

    def cortar(self, wt, nuevo=True):
        """Lo que deja un `git worktree add` cortado: registro «locked: initializing», `.git` y HEAD, sin
        índice y con solo parte de los archivos (aquí, ninguno: los que haga falta se escriben aparte)."""
        self.base.mkdir(exist_ok=True)
        args = ["worktree", "add", "--no-checkout"] + (["-b", "ola/T1", str(wt), "HEAD"] if nuevo else [str(wt), "ola/T1"])
        self.git(*args)
        self.git("worktree", "lock", "--reason", "initializing", str(wt))

    def bloqueado(self, wt):
        lista = self.git("worktree", "list", "--porcelain")
        bloque = [b for b in lista.split("\n\n") if b.startswith("worktree %s" % os.path.realpath(wt))]
        return bool(bloque) and "\nlocked" in bloque[0]

    def test_un_add_cortado_se_termina_sin_pisar_lo_que_hay(self):
        wt = self.base / "T1"
        self.cortar(wt)
        (wt / "a.txt").write_text("a del agente\n")  # lo que ya estaba (o cambió el agente) no se pisa
        self.assertEqual(enjambre.worktree("T1"), str(wt))
        self.assertEqual((wt / "a.txt").read_text(), "a del agente\n")
        self.assertEqual((wt / "b.txt").read_text(), ARCHIVOS["b.txt"])
        self.assertEqual((wt / "dir" / "c.txt").read_text(), ARCHIVOS["dir/c.txt"])
        self.assertFalse(self.bloqueado(wt))
        self.assertEqual(self.git("status", "--porcelain", cwd=wt), "M a.txt")
        avisos = [str(c.args[2]) for c in self.evento.call_args_list if len(c.args) > 2]
        self.assertTrue(any("cortado" in a for a in avisos), avisos)

    def test_el_add_que_se_corta_al_crearlo_se_termina_en_la_misma_vuelta(self):
        real_sh = enjambre.sh

        def sh_que_corta(cmd, cwd=None, timeout=120, env=None, log=None):
            if isinstance(cmd, list) and cmd[:3] == ["git", "worktree", "add"]:
                self.cortar(Path(cmd[-2]))  # como si el plazo matara a git a mitad del checkout
                return 124, "TIMEOUT %ss\n" % timeout
            return real_sh(cmd, cwd=cwd, timeout=timeout, env=env, log=log)

        with patch.object(enjambre, "sh", sh_que_corta):
            wt = Path(enjambre.worktree("T1"))
        self.assertEqual(sorted(p.relative_to(wt).as_posix() for p in wt.rglob("*.txt")), sorted(ARCHIVOS))
        self.assertFalse(self.bloqueado(wt))
        self.assertEqual(self.git("symbolic-ref", "--short", "HEAD", cwd=wt), "ola/T1")

    def test_si_no_se_puede_terminar_lo_dice_y_lo_conserva_todo(self):
        wt = self.base / "T1"
        self.cortar(wt)
        (wt / "a.txt").write_text("a del agente\n")
        real_sh = enjambre.sh

        def sh_sin_tiempo(cmd, cwd=None, timeout=120, env=None, log=None):
            if isinstance(cmd, list) and cmd[:2] == ["git", "checkout-index"]:
                return 124, "TIMEOUT %ss\n" % timeout
            return real_sh(cmd, cwd=cwd, timeout=timeout, env=env, log=log)

        with patch.object(enjambre, "sh", sh_sin_tiempo):
            with self.assertRaises(RuntimeError) as error:
                enjambre.worktree("T1")
        texto = str(error.exception)
        self.assertEqual(rev.clase_de_fallo(texto), "medio:worktree")  # no gasta intento
        self.assertEqual(rev.clase_de_fallo("worktree: " + texto), "medio:worktree")  # el evento de `ejecutar`
        self.assertEqual((wt / "a.txt").read_text(), "a del agente\n")
        self.assertTrue(self.bloqueado(wt))  # sigue marcado: la vuelta siguiente lo termina
        self.assertEqual(enjambre.worktree("T1"), str(wt))  # y la siguiente vuelta, con tiempo, lo termina
        self.assertEqual((wt / "b.txt").read_text(), ARCHIVOS["b.txt"])
        self.assertEqual((wt / "a.txt").read_text(), "a del agente\n")

    def test_un_worktree_entero_no_se_toca(self):
        wt = Path(enjambre.worktree("T1"))
        (wt / "a.txt").write_text("avance sin commit\n")
        real_sh = enjambre.sh
        ordenes = []

        def sh_que_apunta(cmd, cwd=None, timeout=120, env=None, log=None):
            ordenes.append(" ".join(cmd) if isinstance(cmd, list) else cmd)
            return real_sh(cmd, cwd=cwd, timeout=timeout, env=env, log=log)

        with patch.object(enjambre, "sh", sh_que_apunta):
            self.assertEqual(enjambre.worktree("T1"), str(wt))
        self.assertFalse([o for o in ordenes if "checkout-index" in o or "read-tree" in o], ordenes)
        self.assertEqual((wt / "a.txt").read_text(), "avance sin commit\n")

    def test_otro_bloqueo_no_es_un_add_cortado(self):
        wt = Path(enjambre.worktree("T1"))
        self.git("worktree", "lock", "--reason", "en un disco externo", str(wt))
        self.assertFalse(enjambre._add_cortado(str(wt)))
        self.git("worktree", "unlock", str(wt))
        self.assertFalse(enjambre._add_cortado(str(wt)))

    def test_el_plazo_del_add_ya_no_es_de_120_s(self):
        self.assertGreaterEqual(enjambre.WORKTREE_ADD_S, 600)


if __name__ == "__main__":
    unittest.main()
