# -*- coding: utf-8 -*-
"""Una puerta o un agente cortados se llevan a TODOS sus descendientes (2026-09-23).

Medido esa noche: cinco `node (vitest N)` de ~2,2 GB huérfanos 49 minutos (su vitest lo
había cortado el tiempo de la puerta, que mataba solo al hijo directo) dejaron la Mac sin
RAM y el Puente de Mando sin contestar. `sh()` y los agentes van ahora en su propio grupo de
procesos y se cortan con `matar_grupo`.
"""
import importlib.util
import os
import subprocess
import sys
import time
import unittest

RUTA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "starseed-enjambre.py")
ESPEC = importlib.util.spec_from_file_location("enjambre", RUTA)
enjambre = importlib.util.module_from_spec(ESPEC)
sys.modules["enjambre"] = enjambre
ESPEC.loader.exec_module(enjambre)


def _vivo(pid):
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    # Un zombi sigue «existiendo» hasta que alguien lo recoge: cuenta como muerto.
    estado = subprocess.run(["ps", "-o", "stat=", "-p", str(pid)], capture_output=True, text=True).stdout.strip()
    return bool(estado) and not estado.startswith("Z")


class MatarGrupoTest(unittest.TestCase):
    def test_sh_con_tiempo_agotado_no_deja_nietos(self):
        marca = os.path.join(os.path.dirname(RUTA), ".nieto-%d" % os.getpid())
        orden = "sleep 30 & echo $! > %s; sleep 30" % marca
        t0 = time.time()
        rc, salida = enjambre.sh(orden, timeout=1)
        self.assertEqual(rc, 124)
        self.assertTrue(salida.startswith("TIMEOUT"))
        self.assertLess(time.time() - t0, 15)
        try:
            with open(marca) as f:
                nieto = int(f.read().strip())
        finally:
            try:
                os.remove(marca)
            except OSError:
                pass
        time.sleep(0.5)
        self.assertFalse(_vivo(nieto), "el nieto de la puerta quedó vivo")

    def test_sh_normal_sigue_igual(self):
        rc, salida = enjambre.sh("echo hola; echo mal 1>&2", timeout=10)
        self.assertEqual(rc, 0)
        self.assertIn("hola", salida)
        self.assertIn("mal", salida)

    def test_matar_grupo_nunca_lanza(self):
        enjambre.matar_grupo(None)
        p = subprocess.Popen(["true"])
        p.wait()
        enjambre.matar_grupo(p)  # ya terminó: no lanza


    def test_recoger_grupo_mata_al_nieto_de_un_hijo_que_acabo_bien(self):
        """(2026-10-03) opencode acaba bien y su tsserver (LSP, ~2 GB) quedaba adoptado por
        init. Aquí el «motor» deja un nieto en segundo plano y sale con 0."""
        marca = os.path.join(os.path.dirname(RUTA), ".lsp-%d" % os.getpid())
        p = subprocess.Popen(["sh", "-c", "sleep 30 & echo $! > %s; exit 0" % marca],
                             start_new_session=True)
        self.assertEqual(p.wait(timeout=10), 0)
        try:
            with open(marca) as f:
                nieto = int(f.read().strip())
        finally:
            try:
                os.remove(marca)
            except OSError:
                pass
        self.assertTrue(_vivo(nieto), "la prueba necesita un nieto vivo tras acabar el hijo")
        enjambre.recoger_grupo(p)
        time.sleep(0.5)
        self.assertFalse(_vivo(nieto), "el LSP del motor sobrevivió a su opencode")

    def test_matar_grupo_con_el_jefe_muerto_recoge_igual(self):
        marca = os.path.join(os.path.dirname(RUTA), ".jefe-%d" % os.getpid())
        p = subprocess.Popen(["sh", "-c", "sleep 30 & echo $! > %s; exit 0" % marca],
                             start_new_session=True)
        p.wait(timeout=10)
        try:
            with open(marca) as f:
                nieto = int(f.read().strip())
        finally:
            try:
                os.remove(marca)
            except OSError:
                pass
        enjambre.matar_grupo(p)
        time.sleep(0.5)
        self.assertFalse(_vivo(nieto))

    def test_recoger_grupo_nunca_lanza(self):
        enjambre.recoger_grupo(None)
        p = subprocess.Popen(["true"], start_new_session=True)
        p.wait()
        enjambre.recoger_grupo(p)


if __name__ == "__main__":
    unittest.main()
