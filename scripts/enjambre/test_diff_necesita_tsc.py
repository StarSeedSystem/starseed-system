# -*- coding: utf-8 -*-
"""El diff decide si la puerta tsc corre (TSC1021A · 2026-10-21).

Caso medido (Mac de 8 GB, swap al 94 %, presión 2): tres tareas esperaban 5, 30 y 49 min el turno
de un tsc completo y en 3 h no se integró nada; VAR1021A solo tocaba .py de `scripts/puente/`, y
ese tsc no podía dar rojo — cada worktree se pone al día con main y main está en verde. Ante la
menor duda se corre tsc como hoy.
"""
import contextlib
import importlib.util
import os
import shutil
import sys
import tempfile
import unittest
from unittest import mock

RUTA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "starseed-enjambre.py")
ESPEC = importlib.util.spec_from_file_location("enjambre_diff_tsc", RUTA)
enjambre = importlib.util.module_from_spec(ESPEC)
sys.modules["enjambre_diff_tsc"] = enjambre
ESPEC.loader.exec_module(enjambre)


class DecisionPura(unittest.TestCase):
    """`diff_necesita_tsc`: False solo cuando el diff no toca nada que tsc mire."""

    def test_solo_python_markdown_y_datos_no_hacen_falta(self):
        self.assertFalse(enjambre.diff_necesita_tsc(
            ["scripts/puente/var.py", "README.md", "memory/x.md", "starseed.config.json"]))

    def test_extensiones_compilables_y_configs_piden_tsc(self):
        for ruta in ["app.ts", "a/b.tsx", "c.mts", "d.cts", "e.js", "f.jsx", "g.mjs",
                     "h.cjs", "tipos/utils.d.ts", "tsconfig.json", "tsconfig.app.json",
                     "package.json", "package-lock.json", "next-env.d.ts"]:
            self.assertTrue(enjambre.diff_necesita_tsc([ruta]), ruta)

    def test_todo_lo_bajo_src_o_types_y_lo_anidado_pide_tsc(self):
        for ruta in ["src/lib/x.ts", "src/leeme.md", "types/global.d",
                     "scripts/puente/src/a.py", "externos/mi/types/no.py"]:
            self.assertTrue(enjambre.diff_necesita_tsc([ruta]), ruta)

    def test_mezcla_se_decide_por_lo_peligroso(self):
        self.assertTrue(enjambre.diff_necesita_tsc(["scripts/puente/x.py", "src/lib/y.ts"]))
        self.assertTrue(enjambre.diff_necesita_tsc(["src/uno.md", "scripts/puente/y.py"]))

    def test_extensiones_parecidas_y_prefijos_no_ganan(self):
        """«.tsv» no es «.ts»; «srcs/» no es «src/»; «tsconfig-viejo.json.bak» no es tsconfig."""
        self.assertFalse(enjambre.diff_necesita_tsc(["datos.tsv", "public/logo.svg"]))
        self.assertFalse(enjambre.diff_necesita_tsc(["srcs/a.py"]))
        self.assertFalse(enjambre.diff_necesita_tsc(["mios/tsconfig-viejo.json.bak"]))


class LaMenorDudaEsTsc(unittest.TestCase):
    """Git falló o la lista sale vacía: sin diff claro NO se salta la puerta."""

    def test_lista_vacia_ausente_o_de_basura_pide_tsc(self):
        self.assertTrue(enjambre.diff_necesita_tsc([]))
        self.assertTrue(enjambre.diff_necesita_tsc(None))
        self.assertTrue(enjambre.diff_necesita_tsc(["", "   ", None]))


class PuertaEnTsc(unittest.TestCase):
    """`tsc(cwd, log)`: el salto con diff no-TS, y tsc como hoy ante la menor duda."""

    def setUp(self):
        self.d = tempfile.mkdtemp(prefix="enj-tsc1021a-")
        self.addCleanup(shutil.rmtree, self.d, ignore_errors=True)
        with open(os.path.join(self.d, "tsconfig.json"), "w") as f:
            f.write("{}\n")

    def _correr(self, salidas, llamadas):
        def sh_falso(cmd, **_kw):
            llamadas.append(cmd)
            return salidas.pop(0)

        with mock.patch.object(enjambre, "sh", side_effect=sh_falso), \
                mock.patch.object(enjambre, "tsc_en_a1", return_value=None), \
                mock.patch.object(enjambre, "cerrojo",
                                  side_effect=lambda *_a, **_k: contextlib.nullcontext()):
            return enjambre.tsc(self.d, None)

    def test_diff_solo_python_no_lanza_tsc_y_lo_anota_en_el_log(self):
        log, llamadas = os.path.join(self.d, "tarea.log"), []

        def sh_falso(cmd, **_kw):
            llamadas.append(cmd)
            return 0, "scripts/puente/var.py\nREADME.md\n"

        with mock.patch.object(enjambre, "sh", side_effect=sh_falso):
            self.assertEqual(enjambre.tsc(self.d, log), (0, []))
        self.assertEqual(len(llamadas), 1)
        self.assertIn("git diff", llamadas[0])
        with open(log, encoding="utf-8") as f:
            self.assertIn("tsc no hace falta: el diff no toca TypeScript", f.read())

    def test_diff_con_un_ts_corre_tsc_como_hoy(self):
        llamadas = []
        self.assertEqual(self._correr(
            [(0, "scripts/puente/var.py\nsrc/lib/y.ts\n"), (0, "")], llamadas), (0, []))
        self.assertEqual(len(llamadas), 2)
        self.assertIn("npx tsc", llamadas[1])

    def test_git_que_falla_o_escupe_fatal_es_duda_y_corre_tsc(self):
        for salida in [(1, ""), (128, "fatal: ambiguous argument 'main...HEAD'\n")]:
            llamadas = []
            self.assertEqual(self._correr([salida, (0, "")], llamadas), (0, []))
            self.assertEqual(len(llamadas), 2)
            self.assertIn("npx tsc", llamadas[1])

    def test_diff_vacio_es_duda_y_corre_tsc(self):
        llamadas = []
        self.assertEqual(self._correr([(0, ""), (0, "")], llamadas), (0, []))
        self.assertEqual(len(llamadas), 2)
        self.assertIn("npx tsc", llamadas[1])


if __name__ == "__main__":
    unittest.main()
