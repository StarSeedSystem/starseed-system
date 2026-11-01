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


class TscHuerfanos(unittest.TestCase):
    """(2026-10-31) El `tsc-turno.sh` de un agente muerto: 3 h y 4,6 GB en una Mac de 8.

    El agente lanzó `zsh -c 'bash scripts/enjambre/tsc-turno.sh … | tail -40'`, murió, launchd
    adoptó el zsh y su `npm exec tsc` → `node …/bin/tsc` siguió vivo sin dueño.
    """

    DEL_31_10 = [
        (700, 1, "zsh -c bash scripts/enjambre/tsc-turno.sh 2>&1 | tail -40"),
        (701, 700, "bash scripts/enjambre/tsc-turno.sh"),
        (702, 701, "npm exec tsc -- --noEmit"),
        (703, 702, "/usr/local/bin/node /repo/node_modules/typescript/bin/tsc --noEmit"),
    ]

    def test_el_caso_del_31_10(self):
        self.assertEqual(A.tsc_huerfanos(self.DEL_31_10), [702, 703])

    def test_la_puerta_del_orquestador_no_se_toca(self):
        # La cadena sube a starseed-enjambre.py, aunque él mismo tenga ppid 1.
        filas = [
            (800, 1, "python3 -u /Users/alex/.local/bin/starseed-enjambre.py"),
            (801, 800, "bash scripts/enjambre/tsc-turno.sh"),
            (802, 801, "npm exec tsc -- --noEmit"),
            (803, 802, "node /repo/node_modules/typescript/bin/tsc --noEmit"),
        ]
        self.assertEqual(A.tsc_huerfanos(filas), [])

    def test_un_tsc_de_una_terminal_no_se_toca(self):
        filas = [
            (900, 1, "-zsh"),
            (901, 900, "npm exec tsc -- --noEmit"),
            (902, 901, "node /repo/node_modules/typescript/bin/tsc --noEmit"),
        ]
        self.assertEqual(A.tsc_huerfanos(filas), [])

    def test_el_tsc_turno_de_un_agente_vivo_no_se_toca(self):
        filas = [
            (950, 1, "python3 -u /Users/alex/.local/bin/starseed-enjambre.py"),
            (951, 950, "zsh -c bash scripts/enjambre/tsc-turno.sh 2>&1 | tail -40"),
            (952, 951, "bash scripts/enjambre/tsc-turno.sh"),
            (953, 952, "npm exec tsc -- --noEmit"),
        ]
        self.assertEqual(A.tsc_huerfanos(filas), [])

    def test_un_tsc_con_padre_init_se_corta(self):
        filas = [
            (1000, 1, "/usr/local/bin/node /repo/node_modules/typescript/bin/tsc --noEmit"),
            (1001, 1, "npm exec tsc -- --noEmit"),
        ]
        self.assertEqual(A.tsc_huerfanos(filas), [1000, 1001])

    def test_no_confunde_otras_ordenes(self):
        filas = [
            (1100, 1, "grep tsc"),
            (1101, 1, "/opt/homebrew/bin/node /repo/node_modules/.bin/vitest run"),
            (1102, 1, "node (vitest 2)"),
        ]
        self.assertEqual(A.tsc_huerfanos(filas), [])

    def test_filas_rotas(self):
        self.assertEqual(A.tsc_huerfanos([("x", 1, "npm exec tsc"), None, (1, 2)]), [])

    def test_la_guardia_tambien_los_corta(self):
        # `guardia-memoria.py` mata lo que devuelve trabajadores_huerfanos: sin tocarlo,
        # un tsc-turno viudo tiene que salir también por ahí.
        self.assertEqual(
            A.trabajadores_huerfanos([(39558, 1, "node (vitest 2)")] + self.DEL_31_10),
            [39558, 702, 703],
        )


if __name__ == "__main__":
    unittest.main()
