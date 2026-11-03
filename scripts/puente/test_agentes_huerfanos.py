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
    """(SUP0111K) El tsc de un agente muerto: el 31-10 siguió 3 h con 4,6 GB en la Mac de 8."""

    NPM = "npm exec tsc --noEmit --skipLibCheck    "   # `ps` deja los espacios finales del título
    NODE = "node /repo/node_modules/.bin/tsc --noEmit --skipLibCheck"
    TURNO = "bash scripts/enjambre/tsc-turno.sh"
    ORQ = "/opt/homebrew/bin/python3 -u /Users/alex/.local/bin/starseed-enjambre.py cola.json --workers 3"

    def arbol(self, padre_del_zsh, zsh="zsh -c bash scripts/enjambre/tsc-turno.sh 2>&1 | tail -40"):
        """La cadena del 31-10; `padre_del_zsh` 1 = su agente ya murió y init adoptó al zsh."""
        return [(2001, padre_del_zsh, zsh), (2002, 2001, self.TURNO), (2003, 2001, "tail -40"),
                (2004, 2002, self.NPM), (2005, 2004, self.NODE)]

    def test_el_caso_del_31_10_el_zsh_c_adoptado_por_init(self):
        # Solo el tsc: ni el zsh, ni el tsc-turno, ni el tail (se acaban solos al caer el tsc).
        self.assertEqual(A.tsc_huerfanos(self.arbol(1)), [2004, 2005])

    def test_con_su_agente_vivo_no_se_toca(self):
        filas = self.arbol(900) + [(900, 800, OPENCODE), (800, 1, self.ORQ)]
        self.assertEqual(A.tsc_huerfanos(filas), [])

    def test_la_puerta_del_orquestador_no_se_toca_aunque_tenga_ppid_1(self):
        filas = [(800, 1, self.ORQ), (801, 800, self.NPM), (802, 801, self.NODE)]
        self.assertEqual(A.tsc_huerfanos(filas), [])
        por_un_shell = [(800, 1, self.ORQ), (801, 800, "sh -c npx tsc --noEmit"),
                        (802, 801, self.NPM), (803, 802, self.NODE)]
        self.assertEqual(A.tsc_huerfanos(por_un_shell), [])

    def test_un_tsc_de_una_terminal_no_se_toca(self):
        terminal = [(300, 1, "login -pf alex"), (301, 300, "-zsh")]
        self.assertEqual(A.tsc_huerfanos(terminal + [(302, 301, self.NPM), (303, 302, self.NODE)]), [])
        con_turno = terminal + [(304, 301, self.TURNO), (305, 304, self.NPM), (306, 305, self.NODE)]
        self.assertEqual(A.tsc_huerfanos(con_turno), [])

    def test_un_tsc_con_padre_init_es_huerfano(self):
        self.assertEqual(A.tsc_huerfanos([(400, 1, self.NPM), (401, 400, self.NODE)]), [400, 401])
        self.assertEqual(A.tsc_huerfanos([(402, 1, self.NODE)]), [402])
        self.assertEqual(A.tsc_huerfanos([("403", "1", self.NPM)]), [403])   # como llegan del guardia

    def test_cualquier_shell_con_c_adoptado_por_init_vale_pero_no_un_shell_de_login(self):
        for zsh in ("/bin/bash -c bash /repo/scripts/enjambre/tsc-turno.sh", "sh -c bash scripts/enjambre/tsc-turno.sh",
                    "zsh -lc bash scripts/enjambre/tsc-turno.sh | tail -40"):
            self.assertEqual(A.tsc_huerfanos(self.arbol(1, zsh)), [2004, 2005], zsh)
        self.assertEqual(A.tsc_huerfanos(self.arbol(1, "-zsh")), [])

    def test_un_tsc_turno_lanzado_directamente_por_init_si_espera_alguien(self):
        # Igual que `_sin_quien_espere` de tsc-turno.sh: «lanzado directamente por launchd» no es un agente muerto.
        filas = [(500, 1, self.TURNO), (501, 500, self.NPM), (502, 501, self.NODE)]
        self.assertEqual(A.tsc_huerfanos(filas), [])

    def test_solo_el_tsc_no_los_programas_que_lo_nombran(self):
        filas = [(600, 1, "grep -r tsc /repo"), (601, 1, "node /repo/node_modules/.bin/tsc-watch"),
                 (602, 1, "npm exec tsc-watch"), (603, 1, OPENCODE + " ejecuta npm exec tsc --noEmit"),
                 (604, 1, "node /repo/node_modules/.bin/vitest run")]
        self.assertEqual(A.tsc_huerfanos(filas), [])
        self.assertTrue(A.es_tsc("npx tsc --noEmit") and A.es_tsc("/opt/homebrew/bin/node /r/typescript/bin/tsc -p ."))
        self.assertFalse(A.es_tsc(None) or A.es_tsc("npm run tsc") or A.es_tsc("node /repo/server.js"))

    def test_trabajadores_huerfanos_lo_incluye_sin_repetir(self):
        filas = [(39558, 1, "node (vitest 2)")] + self.arbol(1)
        self.assertEqual(A.trabajadores_huerfanos(filas), [39558, 2004, 2005])
        self.assertEqual(A.trabajadores_huerfanos(iter(filas)), [39558, 2004, 2005])
        vivo = self.arbol(900) + [(900, 800, OPENCODE), (800, 1, self.ORQ)]
        self.assertEqual(A.trabajadores_huerfanos(vivo), [])

    def test_filas_rotas_y_ciclos_no_revientan(self):
        filas = [None, ("x", 1, self.NPM), (1, 2), (10, 11, self.NODE), (11, 10, self.NPM)]
        self.assertEqual(A.tsc_huerfanos(filas), [])


class CodegraphHuerfanos(unittest.TestCase):
    """(SUP0211F) El cliente `codegraph serve --mcp` que sobrevivió a su opencode (01-11: swap al 87 %, carga 46)."""

    PAQUETE = "/Users/alex/.local/lib/node_modules/@colbymchenry/codegraph/node_modules/@colbymchenry/codegraph-darwin-arm64"
    NODE = PAQUETE + "/node --liftoff-only --disable-warning=ExperimentalWarning " + PAQUETE + "/lib/dist/bin/codegraph.js "
    LANZADOR = "node /Users/alex/.local/bin/codegraph serve --mcp --path /repo --no-watch"   # lo que abre el anfitrión
    PROXY = NODE + "serve --mcp --path /repo --no-watch"                                    # lo relanza el lanzador
    DEMONIO = NODE + "serve --mcp --path /repo"          # lo lanza el proxy aparte, en su sesión: sin --no-watch
    SYNC = "node /Users/alex/.local/bin/codegraph sync /repo"
    # `ps` enseña los saltos de línea del guion de `node -e` como \012
    VIGILA = PAQUETE + r"/node -e \012const fs = require('fs');\012const parentPid = Number(process.argv[1]);"

    def arbol(self, padre):
        """Lanzador → proxy (+ su vigilante) → demonio compartido (+ su vigilante), este lanzado por el proxy."""
        return [(900, padre, self.LANZADOR), (901, 900, self.PROXY), (902, 901, self.VIGILA),
                (903, 901, self.DEMONIO), (904, 903, self.VIGILA)]

    def test_el_caso_del_01_11_el_cliente_adoptado_por_init_con_lo_suyo_pero_sin_el_demonio(self):
        self.assertEqual(A.codegraph_huerfanos(self.arbol(1)), [900, 901, 902])
        sin_lanzador = [(f[0], 1 if f[0] == 901 else f[1], f[2]) for f in self.arbol(1)[1:]]
        self.assertEqual(A.codegraph_huerfanos(sin_lanzador), [901, 902])
        self.assertEqual(A.codegraph_huerfanos([("950", "1", self.LANZADOR)]), [950])   # como llegan del guardia

    def test_el_demonio_compartido_tiene_ppid_1_por_diseno_y_no_se_toca(self):
        # El que había vivo al medir: ppid 1, `serve --mcp` sin --no-watch, con su `node -e` vigilante.
        demonio = [(910, 1, self.DEMONIO), (911, 910, self.VIGILA)]
        self.assertEqual(A.codegraph_huerfanos(demonio), [])
        vivo = [(850, 800, OPENCODE), (851, 850, self.LANZADOR), (852, 851, self.PROXY)]
        self.assertEqual(A.codegraph_huerfanos(demonio + vivo), [])

    def test_el_sync_de_launchd_no_se_toca(self):
        filas = [(920, 1, self.SYNC), (921, 920, self.NODE + "sync /repo")]
        self.assertEqual(A.codegraph_huerfanos(filas), [])

    def test_un_cliente_con_su_opencode_vivo_no_se_toca_y_el_huerfano_si(self):
        viva = [(850, 800, OPENCODE), (851, 850, self.LANZADOR), (852, 851, self.PROXY), (853, 852, self.VIGILA)]
        self.assertEqual(A.codegraph_huerfanos(viva), [])
        self.assertEqual(A.codegraph_huerfanos(viva + self.arbol(1)), [900, 901, 902])

    def test_un_programa_que_solo_nombra_codegraph_no_se_toca(self):
        filas = [(930, 1, OPENCODE + " usa codegraph serve --mcp --path /repo --no-watch"),
                 (931, 1, "grep -r codegraph serve --mcp /repo"), (932, 1, "tail -f /tmp/starseed-codegraph-sync.log"),
                 (933, 1, "node /repo/scripts/codegraph-notas.js serve --mcp --no-watch"), (934, 1, self.VIGILA),
                 (935, 1, "node -e codegraph serve --mcp --no-watch")]
        self.assertEqual(A.codegraph_huerfanos(filas), [])

    def test_reconoce_la_orden_y_distingue_al_demonio(self):
        for si in (self.LANZADOR, self.PROXY, self.DEMONIO, "codegraph serve --mcp --path /repo"):
            self.assertTrue(A.es_codegraph_serve_mcp(si), si)
        for no in (self.SYNC, self.NODE + "sync /repo", "", None, "node /Users/alex/.local/bin/codegraph serve --path /repo",
                   "node /Users/alex/.local/bin/codegraph sync --mcp /repo"):   # el subcomando manda, no solo --mcp
            self.assertFalse(A.es_codegraph_serve_mcp(no), no)
        self.assertTrue(A.es_demonio_codegraph(self.DEMONIO))
        self.assertFalse(any(A.es_demonio_codegraph(c) for c in (self.LANZADOR, self.PROXY, self.SYNC, None)))

    def test_trabajadores_huerfanos_lo_incluye_sin_repetir(self):
        filas = [(39558, 1, "node (vitest 2)"), (2004, 1, "npm exec tsc --noEmit")] + self.arbol(1)
        esperado = [39558, 2004, 900, 901, 902]
        self.assertEqual(A.trabajadores_huerfanos(filas), esperado)
        self.assertEqual(A.trabajadores_huerfanos(iter(filas + filas)), esperado)
        self.assertEqual(A.trabajadores_huerfanos([(920, 1, self.SYNC), (910, 1, self.DEMONIO)] + self.arbol(850)), [])

    def test_filas_rotas_ciclos_y_tabla_absurda_no_revientan(self):
        filas = [None, ("x", 1, self.LANZADOR), (1, 2), (10, 11, self.LANZADOR), (11, 10, self.LANZADOR)]
        self.assertEqual(A.codegraph_huerfanos(filas), [])
        absurda = [(900, 1, self.LANZADOR), (1, 900, "/sbin/launchd"), (777, 1, "/usr/sbin/cfprefsd")]
        self.assertEqual(A.codegraph_huerfanos(absurda), [900])   # init nunca cuelga de nadie: no arrastra a sus hijos


if __name__ == "__main__":
    unittest.main()
