# -*- coding: utf-8 -*-
"""El mínimo cambio que salta la puerta tsc.

Estructura: clase Diff (la función pura diff_necesita_tsc) y clase PuertaTsc (en tsc()).
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


class Diff(unittest.TestCase):
    def test_python_md_y_datos_no_piden_tsc(self):
        self.assertFalse(enjambre.diff_necesita_tsc([
            "scripts/puente/var.py", "docs/acta.md", "olas/datos.json",
        ]))

    def test_typescript_y_configs_piden_tsc(self):
        self.assertTrue(enjambre.diff_necesita_tsc(["src/lib/salas.ts"]))
        self.assertTrue(enjambre.diff_necesita_tsc(["app/pagina.tsx"]))
        self.assertTrue(enjambre.diff_necesita_tsc(["lib/util.mjs", "bin/arranque.cjs"]))
        self.assertTrue(enjambre.diff_necesita_tsc(["tipos/extra.d.ts"]))

    def test_configs_del_proyecto_piden_tsc(self):
        self.assertTrue(enjambre.diff_necesita_tsc(["tsconfig.json"]))
        self.assertTrue(enjambre.diff_necesita_tsc(["tsconfig.next.json"]))
        self.assertTrue(enjambre.diff_necesita_tsc(["package.json"]))
        self.assertTrue(enjambre.diff_necesita_tsc(["package-lock.json"]))
        self.assertTrue(enjambre.diff_necesita_tsc(["next-env.d.ts"]))

    def test_todo_dentro_de_src_o_types_pide_tsc(self):
        self.assertTrue(enjambre.diff_necesita_tsc(["src/estilos/tema.css"]))
        self.assertTrue(enjambre.diff_necesita_tsc(["types/global.d.ts"]))
        # Un dato suelto con nombre parecido NO es de estas carpetas: manda el primer tramo.
        self.assertFalse(enjambre.diff_necesita_tsc(["content/srcs/dato.json"]))

    def test_lista_vacia_o_dudosa_pide_tsc(self):
        """Ante la menor duda (sin diff) se corre el tsc de hoy, no se salta."""
        self.assertTrue(enjambre.diff_necesita_tsc([]))
        self.assertTrue(enjambre.diff_necesita_tsc([""]))


class PuertaTsc(unittest.TestCase):
    def _ejecutar(self, rc_git, salida_git, archivos=None):
        """Corre tsc() con el git falso y el repo del OS (tsconfig.json presente)."""
        llamadas = []

        def falso_sh(cmd, cwd=None, timeout=None, env=None, log=None):
            llamadas.append(cmd)
            if isinstance(cmd, str) and cmd.startswith("git diff"):
                return rc_git, salida_git
            return 0, ""

        with mock.patch.object(enjambre, "repo_es_python", return_value=False), \
                mock.patch.object(enjambre.os.path, "exists", side_effect=lambda p: str(p).endswith("tsconfig.json")), \
                mock.patch.object(enjambre, "sh", side_effect=falso_sh), \
                mock.patch.object(enjambre, "tsc_en_a1", return_value=None), \
                mock.patch.object(
                    enjambre,
                    "cerrojo",
                    side_effect=lambda *_a, **_k: contextlib.nullcontext(),
                ):
            return enjambre.tsc("/tmp/wt", None), llamadas

    def test_edicion_de_pys_salta_el_turno_de_tsc(self):
        """Caso medido 2026-10-21: tres tareas 5/30/49 min esperando turno; los .py no cambian tsc."""
        (rc, errs), llamadas = self._ejecutar(
            0, "scripts/puente/var.py\nscripts/puente/otro.py\nmemory/nota.md\n"
        )
        self.assertEqual((rc, errs), (0, []))
        self.assertEqual(len(llamadas), 1)
        self.assertTrue(str(llamadas[0]).startswith("git diff"))
        # Lo anota en el log del trabajo (log es una RUTA de archivo, no una llamada).
        ruta_log = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".log-t1021a.tmp")
        self.addCleanup(lambda: os.path.exists(ruta_log) and os.remove(ruta_log))
        dif = (0, "scripts/puente/var.py\n")
        with mock.patch.object(enjambre.os.path, "exists", side_effect=lambda p: str(p).endswith("tsconfig.json")), \
                mock.patch.object(enjambre, "sh", return_value=dif), \
                mock.patch.object(enjambre, "tsc_en_a1", return_value=None):
            rc2, errs2 = enjambre.tsc("/tmp/wt", ruta_log)
        self.assertEqual((rc2, errs2), (0, []))
        with open(ruta_log, encoding="utf-8") as f:
            self.assertIn("tsc no hace falta", f.read())

    def test_ai_tocar_ts_corre_el_tsc_de_hoy(self):
        (rc, _errs), llamadas = self._ejecutar(0, "src/lib/salas.ts\n")
        self.assertEqual(rc, 0)
        self.assertEqual(len(llamadas), 2)
        self.assertIn("npx tsc", str(llamadas[1]))

    def test_git_roto_o_diff_vacio_corren_el_tsc(self):
        (rc1, _), ll1 = self._ejecutar(128, "")
        self.assertEqual(len(ll1), 2)
        (rc2, _), ll2 = self._ejecutar(0, "")
        self.assertEqual(len(ll2), 2)


if __name__ == "__main__":
    unittest.main()


if __name__ == "__main__":
    unittest.main()
