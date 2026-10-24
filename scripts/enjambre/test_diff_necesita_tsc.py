# -*- coding: utf-8 -*-
"""El diff decide si la puerta tsc corre (TSC1021A · 2026-10-21).

Caso medido (10:30 UTC, Mac de 8 GB con la swap al 94 % y presión del núcleo 2): tres tareas
llevaban 5, 30 y 49 min en la fase «tsc» haciendo cola para un tsc completo, y en 3 h la Mac no
integró nada. Una de ellas, VAR1021A, solo tocaba .py de `scripts/puente/`: su diff no puede
cambiar el resultado de tsc, porque cada worktree se pone al día con main (`poner_al_dia`) y
main está en verde. Ante la menor duda se corre tsc como hoy.
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
        self.assertIs(
            enjambre.diff_necesita_tsc(
                [
                    "scripts/puente/var.py",
                    "README.md",
                    "memory/orquestacion-economica.md",
                    "starseed.config.json",
                ]
            ),
            False,
        )


class DecisionPuraMas:
    pass


class ExtensionesQuePidenTsc(unittest.TestCase):
    """Cualquier .ts/.js y sus variantes (incluido .d.ts) puede cambiar el resultado."""

    def test_todas_las_extensiones_compilables_piden_tsc(self):
        for ruta in [
            "app.ts",
            "a/b.tsx",
            "c.mts",
            "d.cts",
            "e.js",
            "f.jsx",
            "g.mjs",
            "h.cjs",
            "tipos/utils.d.ts",
        ]:
            self.assertIs(enjambre.diff_necesita_tsc([ruta]), True, ruta)

    def test_las_configs_de_compilacion_piden_tsc(self):
        for ruta in [
            "tsconfig.json",
            "tsconfig.app.json",
            "package.json",
            "package-lock.json",
            "next-env.d.ts",
        ]:
            self.assertIs(enjambre.diff_necesita_tsc([ruta]), True, ruta)

    def test_todo_lo_bajo_src_o_types_pide_tsc(self):
        for ruta in ["src/lib/x.ts", "src/leeme.md", "types/global.d"]:
            self.assertIs(enjambre.diff_necesita_tsc([ruta]), True, ruta)

    def test_una_ruta_anidada_bajo_src_o_types_tambien(self):
        for ruta in ["scripts/puente/src/a.py", "externos/mi/types/no.py"]:
            self.assertIs(enjambre.diff_necesita_tsc([ruta]), True, ruta)

    def test_mezcla_se_decide_por_lo_peligroso(self):
        self.assertIs(enjambre.diff_necesita_tsc(["scripts/puente/x.py", "src/lib/y.ts"]), True)
        self.assertIs(enjambre.diff_necesita_tsc(["src/uno.md", "scripts/puente/y.py"]), True)


class LaMenorDudaEsTsc(unittest.TestCase):
    """Git falló o la lista sale vacía: sin diff claro NO se salta la puerta."""

    def test_lista_vacia_pide_tsc(self):
        self.assertIs(enjambre.diff_necesita_tsc([]), True)

    def test_sin_lista_pide_tsc(self):
        self.assertIs(enjambre.diff_necesita_tsc(None), True)

    def test_rutas_vacias_o_de_basura_piden_tsc(self):
        self.assertIs(enjambre.diff_necesita_tsc(["", "   ", None]), True)

    def test_extensiones_parecidas_no_ganan(self):
        """«.tsv» no es «.ts»: sin coincidencia de extensión exacta el diff no dispara tsc."""
        self.assertIs(enjambre.diff_necesita_tsc(["datos.tsv", "public/logo.svg"]), False)

    def test_los_nombres_se_miran_por_componente_y_no_por_prefijo(self):
        """«srcs/» o «starseed.config.json» no son «src/» ni «tsconfig.json»."""
        self.assertIs(enjambre.diff_necesita_tsc(["srcs/a.py"]), False)
        self.assertIs(enjambre.diff_necesita_tsc(["mios/tsconfig-viejo.json.bak"]), False)


class PuertaEnTsc(unittest.TestCase):
    """`tsc(cwd, log)`: el salto con diff no-TS, y tsc como hoy ante la menor duda."""

    def setUp(self):
        self.d = tempfile.mkdtemp(prefix="enj-tsc1021a-")
        self.addCleanup(shutil.rmtree, self.d, ignore_errors=True)
        with open(os.path.join(self.d, "tsconfig.json"), "w") as f:
            f.write("{}\n")

    def test_diff_solo_python_no_lanza_tsc_y_lo_anota_en_el_log(self):
        log_ruta = os.path.join(self.d, "tarea.log")
        llamadas = []

        def sh_falso(cmd, **_kw):
            llamadas.append(cmd)
            return 0, "scripts/puente/var.py\nREADME.md\n"

        with mock.patch.object(enjambre, "sh", side_effect=sh_falso):
            resultado = enjambre.tsc(self.d, log_ruta)
        self.assertEqual(resultado, (0, []))
        self.assertEqual(len(llamadas), 1)
        self.assertIn("git diff", llamadas[0])
        with open(log_ruta, encoding="utf-8") as f:
            self.assertIn("tsc no hace falta: el diff no toca TypeScript", f.read())

    def _correr_con_salidas(self, salidas, llamadas):
        """Corre `tsc` con un `sh` que devuelve esas salidas en orden (A1 fuera: None)."""

        def sh_falso(cmd, **_kw):
            llamadas.append(cmd)
            return salidas.pop(0)

        with mock.patch.object(enjambre, "sh", side_effect=sh_falso), \
                mock.patch.object(enjambre, "tsc_en_a1", return_value=None), \
                mock.patch.object(
                    enjambre,
                    "cerrojo",
                    side_effect=lambda *_a, **_k: contextlib.nullcontext(),
                ):
            return enjambre.tsc(self.d, None)

    def test_diff_con_un_ts_corre_tsc_como_hoy(self):
        llamadas = []
        resultado = self._correr_con_salidas(
            [(0, "scripts/puente/var.py\nsrc/lib/y.ts\n"), (0, "")], llamadas
        )
        self.assertEqual(resultado, (0, []))
        self.assertEqual(len(llamadas), 2)
        self.assertIn("git diff", llamadas[0])
        self.assertIn("npx tsc", llamadas[1])

    def test_git_que_falla_es_duda_y_corre_tsc(self):
        llamadas = []
        resultado = self._correr_con_salidas([(1, ""), (0, "")], llamadas)
        self.assertEqual(resultado, (0, []))
        self.assertEqual(len(llamadas), 2)
        self.assertIn("npx tsc", llamadas[1])

    def test_diff_vacio_es_duda_y_corre_tsc(self):
        llamadas = []
        resultado = self._correr_con_salidas([(0, ""), (0, "")], llamadas)
        self.assertEqual(resultado, (0, []))
        self.assertEqual(len(llamadas), 2)
        self.assertIn("npx tsc", llamadas[1])


if __name__ == "__main__":
    unittest.main()
