# -*- coding: utf-8 -*-
"""Pruebas de `cerrojos_git`: quitar el cerrojo muerto, jamás el vivo."""

import os
import shutil
import sys
import tempfile
import time
import unittest

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
if DIRECTORIO not in sys.path:
    sys.path.insert(0, DIRECTORIO)

import cerrojos_git as C


class PruebaGitVivo(unittest.TestCase):
    def test_un_git_de_verdad_cuenta(self):
        self.assertTrue(C.hay_git_vivo(["/usr/bin/git commit -m x"]))
        self.assertTrue(C.hay_git_vivo(["git push origin main"]))

    def test_una_orden_que_solo_menciona_git_no_cuenta(self):
        # El prompt de un agente lleva la palabra «git» dentro. Esa trampa ya
        # nos hizo ver orquestadores fantasma; aquí no se repite.
        self.assertFalse(
            C.hay_git_vivo(["python3 -u agente.py 'haz commit con git al terminar'"])
        )
        self.assertFalse(C.hay_git_vivo(["/bin/zsh -l -c grep git registro.log"]))
        self.assertFalse(C.hay_git_vivo([" ", ""]))


class PruebaCerrojos(unittest.TestCase):
    def setUp(self):
        self.base = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.base, True)

    def _cerrojo(self, tarea, edad_s):
        carpeta = os.path.join(self.base, tarea)
        os.makedirs(carpeta, exist_ok=True)
        ruta = os.path.join(carpeta, "index.lock")
        open(ruta, "w").close()
        cuando = time.time() - edad_s
        os.utime(ruta, (cuando, cuando))
        return ruta

    def test_el_viejo_sale_y_el_reciente_se_queda(self):
        viejo = self._cerrojo("p323A", 3600)
        self._cerrojo("p324F", 30)
        self.assertEqual(C.cerrojos_huerfanos(self.base, []), [viejo])

    def test_con_un_git_vivo_no_se_toca_nada(self):
        self._cerrojo("p323A", 3600)
        self.assertEqual(C.cerrojos_huerfanos(self.base, ["/usr/bin/git commit"]), [])

    def test_un_worktree_sin_cerrojo_no_estorba(self):
        os.makedirs(os.path.join(self.base, "p320L"), exist_ok=True)
        viejo = self._cerrojo("p320M", 7200)
        self.assertEqual(C.cerrojos_huerfanos(self.base, []), [viejo])

    def test_carpeta_inexistente_no_revienta(self):
        self.assertEqual(C.cerrojos_huerfanos(os.path.join(self.base, "no"), []), [])

    def test_quitar_devuelve_solo_los_que_desaparecieron(self):
        viejo = self._cerrojo("p323A", 3600)
        fantasma = os.path.join(self.base, "no-existe", "index.lock")
        self.assertEqual(C.quitar([viejo, fantasma]), [viejo])
        self.assertFalse(os.path.exists(viejo))



class PruebaCerrojoPrincipal(unittest.TestCase):
    """(2026-10-10) El `.git/index.lock` del repo principal: solo un git MÁS VIEJO que el cerrojo
    puede ser su dueño; los `git log` de Genesis, que arrancan después, no lo protegen."""

    def setUp(self):
        self.dir = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.dir, True)
        self.ruta = os.path.join(self.dir, "index.lock")
        open(self.ruta, "w").close()
        hace = time.time() - 5 * 3600
        os.utime(self.ruta, (hace, hace))

    def test_etime(self):
        self.assertEqual(C.segundos_de_etime("00:05"), 5)
        self.assertEqual(C.segundos_de_etime("04:50:21"), 17421)
        self.assertEqual(C.segundos_de_etime("1-02:03:04"), 93784)
        self.assertIsNone(C.segundos_de_etime("raro"))

    def test_gits_jovenes_no_lo_protegen(self):
        ps = ["   00:02 git log --oneline -10", "   00:01 /opt/homebrew/bin/git status", "04:50:21 /usr/bin/python3 x"]
        self.assertEqual(C.quitar_si_huerfano(self.ruta, ps), "300 min")
        self.assertFalse(os.path.exists(self.ruta))

    def test_un_git_mas_viejo_que_el_cerrojo_lo_protege(self):
        ps = ["06:00:00 git merge --ff-only ola/X"]
        self.assertIsNone(C.quitar_si_huerfano(self.ruta, ps))
        self.assertTrue(os.path.exists(self.ruta))

    def test_cerrojo_reciente_no_se_toca(self):
        os.utime(self.ruta, None)
        self.assertIsNone(C.quitar_si_huerfano(self.ruta, []))
        self.assertTrue(os.path.exists(self.ruta))

    def test_linea_de_git_ilegible_conserva(self):
        self.assertTrue(C.git_que_puede_tenerlo(["??? git commit"], 3600))

if __name__ == "__main__":
    unittest.main()
