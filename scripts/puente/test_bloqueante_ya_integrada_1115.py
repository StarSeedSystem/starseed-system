#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas del residuo «bloqueante» (DR1115-1, 2026-11-15).

Una revisión bloqueante cuya objeción ya resolvió una sucesora NO puede volver
a la cola de reparación: DR1115-1 siguió tres intentos «bloqueante» DESPUÉS de
estar su código ya dentro de main como DR1115-1b (82a726ca7).

Dos cosas:
  · `clasificar_puertas` ignora las tareas ya integradas.
  · `tarea_ya_integrada` lo decide con git (rama/sha ancestro de main).
  · El orquestador, al integrar, cierra la puerta: `revisor` y `motivo_vb` no
    quedan puestos.
"""

import os
import subprocess
import sys
import time
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import desatascar as d


def _hace(minutos, ahora):
    return time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(ahora - minutos * 60))


class TestPuertasYaIntegradas(unittest.TestCase):
    """La puerta de una tarea ya dentro de main no se repara ni se escala."""

    def _progreso(self, ahora, estado="esperando_aprobacion"):
        return {
            "DR1115-1": {
                "estado": estado,
                "revisor": "bloqueante",
                "motivo_vb": "revisión bloqueante confirmada",
                "t": _hace(30, ahora),
            }
        }

    def test_bloqueante_ya_integrada_no_se_escala(self):
        ahora = time.time()
        _, _, bloqueantes = d.clasificar_puertas(
            self._progreso(ahora), ahora, {}, ya_integradas={"DR1115-1"}
        )
        self.assertEqual(bloqueantes, [])

    def test_bloqueante_no_integrada_sigue_escalando(self):
        """Sin el sello de «ya integrada», el comportamiento NO cambia."""
        ahora = time.time()
        _, _, bloqueantes = d.clasificar_puertas(
            self._progreso(ahora), ahora, {}, ya_integradas=set()
        )
        self.assertEqual(len(bloqueantes), 1)
        self.assertEqual(bloqueantes[0][0], "DR1115-1")

    def test_ya_integrada_tambien_excluye_el_alcance_parcial(self):
        ahora = time.time()
        prog = {
            "DR1115-1": {
                "estado": "esperando_aprobacion",
                "revisor": "respondio",
                "faltan": ["src/a.ts"],
                "t": _hace(30, ahora),
            }
        }
        _, parciales, _ = d.clasificar_puertas(
            prog, ahora, {"DR1115-1": ["src/a.ts", "src/b.ts"]},
            ya_integradas={"DR1115-1"},
        )
        self.assertEqual(parciales, [])

    def test_el_por_defecto_no_filtra_nada(self):
        """Sin `ya_integradas`, la función se comporta como antes."""
        ahora = time.time()
        _, _, bloqueantes = d.clasificar_puertas(self._progreso(ahora), ahora, {})
        self.assertEqual(len(bloqueantes), 1)


class TestTareaYaIntegrada(unittest.TestCase):
    """`tarea_ya_integrada` lo decide con git, sobre un repo de verdad."""

    def setUp(self):
        self.repo = os.path.join(
            os.environ.get("TMPDIR", "/tmp"), "test-ya-integrada-%d" % os.getpid()
        )
        os.makedirs(self.repo, exist_ok=True)
        self._git("init", "-q", "-b", "main")
        self._git("config", "user.email", "t@t.local")
        self._git("config", "user.name", "t")
        with open(os.path.join(self.repo, "a.txt"), "w", encoding="utf-8") as f:
            f.write("uno\n")
        self._git("add", "-A")
        self._git("commit", "-q", "-m", "base")
        self.rama = self._git("rev-parse", "HEAD").strip()

    def tearDown(self):
        subprocess.run(["rm", "-rf", self.repo], capture_output=True)

    def _git(self, *args):
        p = subprocess.run(
            ["git"] + list(args), cwd=self.repo, capture_output=True, text=True
        )
        return (p.stdout or "") + (p.stderr or "")

    def test_sha_en_main_esta_integrada(self):
        prog = {"X": {"sha": self.rama}}
        self.assertTrue(d.tarea_ya_integrada("X", raiz=self.repo, progreso=prog))

    def test_sha_fuera_de_main_no_esta_integrada(self):
        # El commit nuevo vive en una rama aparte: main se queda atrás.
        self._git("checkout", "-q", "-b", "otra")
        with open(os.path.join(self.repo, "b.txt"), "w", encoding="utf-8") as f:
            f.write("dos\n")
        self._git("add", "-A")
        self._git("commit", "-q", "-m", "otro")
        otro = self._git("rev-parse", "HEAD").strip()
        self._git("checkout", "-q", "main")
        prog = {"X": {"sha": otro}}
        self.assertFalse(d.tarea_ya_integrada("X", raiz=self.repo, progreso=prog))

    def test_rama_ola_ya_fusionada_esta_integrada(self):
        self._git("checkout", "-q", "-b", "ola/X")
        with open(os.path.join(self.repo, "c.txt"), "w", encoding="utf-8") as f:
            f.write("tres\n")
        self._git("add", "-A")
        self._git("commit", "-q", "-m", "de la tarea")
        self._git("checkout", "-q", "main")
        self._git("merge", "-q", "--ff-only", "ola/X")
        self.assertTrue(d.tarea_ya_integrada("X", raiz=self.repo, progreso={}))

    def test_sin_sha_ni_rama_no_se_afirma_nada(self):
        self.assertFalse(d.tarea_ya_integrada("X", raiz=self.repo, progreso={}))

    def test_tareas_ya_integradas_filtra_el_conjunto(self):
        prog = {"A": {"sha": self.rama}, "B": {"sha": "0" * 40}}
        resultado = d.tareas_ya_integradas(["A", "B"], raiz=self.repo, progreso=prog)
        self.assertEqual(resultado, {"A"})


class TestOrquestadorCierraLaPuerta(unittest.TestCase):
    """El orquestador no deja «bloqueante» puesto después de integrar."""

    def test_el_orchestrator_cierra_la_puerta_al_integrar(self):
        raiz = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        ruta = os.path.join(raiz, "enjambre", "starseed-enjambre.py")
        with open(ruta, encoding="utf-8") as f:
            texto = f.read()
        self.assertIn('motivo_vb=""', texto)
        # Y el set_estado de la integración debe llevar revisor y motivo_vb
        i = texto.find('estado="commit"')
        self.assertGreater(i, 0)
        bloque = texto[i:i + 700]
        self.assertIn("revisor=", bloque)
        self.assertIn("motivo_vb=", bloque)


if __name__ == "__main__":
    unittest.main()
