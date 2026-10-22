# -*- coding: utf-8 -*-
"""tsc no hace falta cuando el diff no toca TypeScript (2026-10-21).

Caso medido: tres tareas llevaban 5, 30 y 49 min en la fase «tsc» haciendo cola para el turno
de un tsc COMPLETO (Mac de 8 GB, swap al 94 %) y una de ellas (VAR1021A) solo había tocado .py
de scripts/puente/. main está en verde y el worktree se pone al día con main: su diff no puede
cambiar el resultado de tsc.
"""
import contextlib
import importlib.util
import os
import sys
import unittest
from unittest import mock

RUTA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "starseed-enjambre.py")
ESPEC = importlib.util.spec_from_file_location("enjambre", RUTA)
enjambre = importlib.util.module_from_spec(ESPEC)
sys.modules["enjambre"] = enjambre
ESPEC.loader.exec_module(enjambre)


class DiffNecesitaTsc(unittest.TestCase):
    """diff_necesita_tsc es pura: lista de rutas → bool (True = correr tsc)."""

    def test_solo_python_md_y_datos_json_no_necesita(self):
        self.assertFalse(
            enjambre.diff_necesita_tsc(
                [
                    "scripts/puente/var.py",
                    "docs/notas.md",
                    "starseed_memory_root/datos.json",
                    "PUENTE-DE-MANDO.md",
                    "cola",
                ]
            )
        )

    def test_ts_y_familia_necesita(self):
        for ruta in (
            "src/lib/foo.ts",
            "app/page.tsx",
            "scripts/x.mjs",
            "y.cjs",
            "z.cts",
            "w.mts",
            "next-env.d.ts",
            "a.jsx",
            "b.js",
        ):
            self.assertTrue(enjambre.diff_necesita_tsc([ruta]), ruta)

    def test_config_y_raices_que_tsc_mira(self):
        for ruta in ("tsconfig.json", "tsconfig.build.json", "package.json", "package-lock.json"):
            self.assertTrue(enjambre.diff_necesita_tsc([ruta]), ruta)

    def test_nada_bajo_src_o_types_escapa(self):
        # Aun con extensión ajena a TS: si tsc lo mira, mueve la puerta.
        self.assertTrue(enjambre.diff_necesita_tsc(["src/datos.json"]))
        self.assertTrue(enjambre.diff_necesita_tsc(["types/global.d.ts"]))

    def test_lista_vacia_es_duda_y_se_corre_tsc(self):
        self.assertTrue(enjambre.diff_necesita_tsc([]))
        self.assertTrue(enjambre.diff_necesita_tsc(None))

    def test_paths_raros_y_mezcla(self):
        # Mezcla de un diff real: cualquier .py no apaga el .tsx del mismo diff.
        self.assertTrue(enjambre.diff_necesita_tsc(["var.py", "src/lib/x.tsx"]))
        # Espacios y ./ delante no cuelgan la detección.
        self.assertFalse(enjambre.diff_necesita_tsc([" scripts/puente/a.py ", "./docs/notas.md"]))


class PuertaTscSalto(unittest.TestCase):
    """La función tsc(cwd, log) salta el turno cuando el diff es ajeno a TypeScript."""

    def _tsc(self, archivos):
        cmds = []

        def falso_sh(cmd, cwd=None, timeout=None, env=None, log=None):
            cmds.append(cmd)
            return (0, "")

        with mock.patch.object(enjambre, "repo_es_python", return_value=False), \
                mock.patch.object(enjambre, "archivos_del_diff", return_value=archivos), \
                mock.patch.object(enjambre, "sh", side_effect=falso_sh), \
                mock.patch.object(
                    enjambre,
                    "cerrojo",
                    side_effect=lambda *_args, **_kwargs: contextlib.nullcontext(),
                ), \
                mock.patch.object(enjambre.time, "sleep"):
            return enjambre.tsc("/tmp/wt", None), cmds

    def test_diff_ajeno_a_ts_salta_el_turno_sin_lanzar_tsc(self):
        (rc, errs), cmds = self._tsc(["scripts/puente/var.py", "docs/notas.md"])
        self.assertEqual((rc, errs), (0, []))
        self.assertEqual(cmds, [])

    def test_duda_lista_vacia_corre_tsc_como_hoy(self):
        (rc, errs), cmds = self._tsc([])
        self.assertEqual((rc, errs), (0, []))
        self.assertEqual(len(cmds), 1)

    def test_duda_git_falla_corre_tsc_como_hoy(self):
        (rc, errs), cmds = self._tsc(None)
        self.assertEqual((rc, errs), (0, []))
        self.assertEqual(len(cmds), 1)

    def test_diff_con_ts_corre_tsc(self):
        (_rc, _errs), cmds = self._tsc(["src/lib/foo.ts", "var.py"])
        self.assertEqual(len(cmds), 1)




if __name__ == "__main__":
    unittest.main()
