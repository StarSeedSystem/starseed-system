# -*- coding: utf-8 -*-
"""Pruebas de agentes_huerfanos.py, con los procesos reales del 16/09."""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import agentes_huerfanos as A

CODEX = "codex exec -m gpt-5.6-sol -s workspace-write --skip-git-repo-check -C /tmp/t"
OPENCODE = "/Users/alex/.opencode/bin/opencode run RAIZ DEL REPOSITORIO: /tmp/t"


class TestEsAgente(unittest.TestCase):
    def test_reconoce_los_dos_medios(self):
        self.assertTrue(A.es_agente(CODEX))
        self.assertTrue(A.es_agente(OPENCODE))

    def test_no_confunde_al_orquestador_con_un_agente(self):
        self.assertFalse(A.es_agente("python -u /Users/alex/.local/bin/starseed-enjambre.py"))

    def test_no_confunde_un_grep(self):
        self.assertFalse(A.es_agente("grep codex"))

    def test_vacio(self):
        self.assertFalse(A.es_agente(""))
        self.assertFalse(A.es_agente(None))


class TestHuerfanos(unittest.TestCase):
    def test_el_caso_real_de_esta_noche(self):
        # Tras matar al orquestador 24619, init adoptó a sus dos codex.
        filas = [
            (45192, 1, CODEX),
            (75186, 1, CODEX),
            (79001, 77398, OPENCODE),      # este sí tiene dueño vivo
        ]
        self.assertEqual(A.huerfanos(filas, vivos=[77398]), [45192, 75186])

    def test_con_dueno_vivo_no_se_toca(self):
        filas = [(10, 99, CODEX)]
        self.assertEqual(A.huerfanos(filas, vivos=[99]), [])

    def test_padre_intermedio_muerto_tambien_es_huerfano(self):
        filas = [(10, 555, OPENCODE)]      # 555 ya no existe
        self.assertEqual(A.huerfanos(filas, vivos=[77398]), [10])

    def test_no_mata_al_orquestador(self):
        filas = [(77398, 1, "python -u /Users/alex/.local/bin/starseed-enjambre.py")]
        self.assertEqual(A.huerfanos(filas, vivos=[77398]), [])

    def test_sin_orquestadores_vivos_todo_agente_es_huerfano(self):
        filas = [(10, 1, CODEX), (11, 12, OPENCODE)]
        self.assertEqual(A.huerfanos(filas, vivos=[]), [10, 11])

    def test_no_repite_pids(self):
        filas = [(10, 1, CODEX), (10, 1, CODEX)]
        self.assertEqual(A.huerfanos(filas, vivos=[]), [10])

    def test_filas_con_basura_no_revientan(self):
        filas = [("x", "y", CODEX), (10, 1, CODEX)]
        self.assertEqual(A.huerfanos(filas, vivos=[]), [10])


class TestResumen(unittest.TestCase):
    def test_dice_el_medio_y_el_pid_sin_volcar_la_orden(self):
        filas = [(45192, 1, CODEX), (11, 1, OPENCODE)]
        r = A.resumen(filas, [45192, 11])
        self.assertEqual(r, "codex (pid 45192), opencode (pid 11)")
        self.assertNotIn("gpt-5.6-sol", r)


class TrabajadoresDePuertaHuerfanos(unittest.TestCase):
    """(2026-09-23) Los cinco `node (vitest N)` de 2,2 GB que tumbaron Genesis."""

    FILAS = [
        (39558, 1, "node (vitest 2)     "),
        (40176, 1, "node (vitest 1)"),
        (41000, 40999, "node (vitest 3)"),  # su vitest vive: no se toca
        (195, 99899, "next-server (v15.5.21)"),
        (500, 1, "/opt/homebrew/bin/node /repo/node_modules/.bin/vitest run"),  # el principal
        (501, 1, "grep (vitest 2)"),
    ]

    def test_solo_los_adoptados_por_init(self):
        self.assertEqual(A.trabajadores_huerfanos(self.FILAS), [39558, 40176])

    def test_reconoce_el_titulo(self):
        self.assertTrue(A.es_trabajador_de_puerta("node (vitest 7)"))
        self.assertTrue(A.es_trabajador_de_puerta("/usr/local/bin/node (vitest)"))
        self.assertFalse(A.es_trabajador_de_puerta("vitest run"))
        self.assertFalse(A.es_trabajador_de_puerta(""))
        self.assertFalse(A.es_trabajador_de_puerta(None))

    def test_filas_rotas(self):
        self.assertEqual(A.trabajadores_huerfanos([("x", 1, "node (vitest 1)"), None, (1, 2)]), [])


class TscDeTurnoHuerfano(unittest.TestCase):
    """(SUP0111K, 2026-11-01) El tsc del 31-10: su shell quedó con ppid 1 y el tsc siguió 3 h
    con 4,6 GB en una Mac de 8 GB. tsc-turno.sh (SUP0111J) ya no lo permite desde dentro, pero
    no cubre un tsc-turno matado con SIGKILL ni los que corrían con el guion viejo."""

    def test_el_caso_del_31_10(self):
        filas = [
            (100, 1, "zsh -c 'bash scripts/enjambre/tsc-turno.sh 2>&1 | tail -40'"),
            (101, 100, "bash scripts/enjambre/tsc-turno.sh"),
            (102, 101, "npm exec tsc --noEmit --skipLibCheck"),
            (103, 102, "node /repo/node_modules/typescript/bin/tsc --noEmit"),
            (104, 100, "tail -40"),
        ]
        self.assertEqual(A.tsc_huerfanos(filas), [102, 103])

    def test_nunca_la_puerta_del_orquestador(self):
        filas = [
            (200, 1, "python -u /Users/alex/.local/bin/starseed-enjambre.py"),
            (201, 200, "/bin/sh -c npx tsc --noEmit --skipLibCheck"),
            (202, 201, "npm exec tsc --noEmit --skipLibCheck"),
            (203, 202, "node /repo/node_modules/typescript/bin/tsc --noEmit"),
        ]
        self.assertEqual(A.tsc_huerfanos(filas), [])

    def test_el_tsc_de_una_terminal_no_se_toca(self):
        filas = [
            (300, 299, "zsh"),
            (302, 300, "npm exec tsc --noEmit"),
            (303, 302, "node /repo/node_modules/typescript/bin/tsc"),
        ]
        self.assertEqual(A.tsc_huerfanos(filas), [])

    def test_tsc_turno_con_su_shell_vivo_no_se_toca(self):
        filas = [
            (500, 499, "zsh"),
            (501, 500, "bash scripts/enjambre/tsc-turno.sh"),
            (502, 501, "npm exec tsc"),
            (503, 502, "node /repo/node_modules/typescript/bin/tsc"),
        ]
        self.assertEqual(A.tsc_huerfanos(filas), [])

    def test_el_tsc_con_padre_init(self):
        filas = [
            (400, 1, "node /repo/node_modules/typescript/bin/tsc --noEmit"),
            (401, 1, "npm exec tsc --noEmit"),
        ]
        self.assertEqual(A.tsc_huerfanos(filas), [400, 401])

    def test_la_guardia_los_corta_con_los_trabajadores(self):
        filas = [
            (39558, 1, "node (vitest 2)"),
            (100, 1, "zsh -c 'bash scripts/enjambre/tsc-turno.sh 2>&1 | tail -40'"),
            (101, 100, "bash scripts/enjambre/tsc-turno.sh"),
            (102, 101, "npm exec tsc"),
            (103, 102, "node /repo/node_modules/typescript/bin/tsc"),
        ]
        self.assertEqual(A.trabajadores_huerfanos(filas), [39558, 102, 103])

    def test_filas_rotas_no_revientan(self):
        self.assertEqual(A.tsc_huerfanos([None, ("x", 1, "npm exec tsc"), (1, 2)]), [])


if __name__ == "__main__":
    unittest.main()
