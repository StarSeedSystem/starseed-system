# -*- coding: utf-8 -*-
"""Un diff que no toca TypeScript no debe hacer cola para un tsc completo (2026-10-21).

Caso medido: tres tareas 5, 30 y 49 min esperando el turno de tsc en una Mac de 8 GB al 94 %
de swap, y VAR1021A —solo .py de scripts/puente/— no podía cambiar el resultado. Aquí se
prueba `diff_necesita_tsc` (pura) y el corte dentro de `tsc(cwd, log)`.
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


class Pura(unittest.TestCase):
    """diff_necesita_tsc(archivos) -> bool."""

    def test_python_markdown_y_json_de_datos_no_tocan(self):
        self.assertFalse(
            enjambre.diff_necesita_tsc(
                ["scripts/puente/varios.py", "memory/orquestacion-economica.md"]
            )
        )
        self.assertFalse(enjambre.diff_necesita_tsc(["scripts/puente/balance.json"]))

    def test_ts_y_camaradas_tocan(self):
        self.assertTrue(enjambre.diff_necesita_tsc(["app.ts"]))
        self.assertTrue(enjambre.diff_necesita_tsc(["src/lib/salas.ts"]))
        self.assertTrue(enjambre.diff_necesita_tsc(["componentes/uno.tsx"]))
        self.assertTrue(enjambre.diff_necesita_tsc(["scripts/enjambre/guion.mjs"]))
        self.assertTrue(enjambre.diff_necesita_tsc(["tipos/api.d.ts"]))

    def test_configuraciones_tocan(self):
        self.assertTrue(enjambre.diff_necesita_tsc(["tsconfig.json"]))
        self.assertTrue(enjambre.diff_necesita_tsc(["tsconfig.build.json"]))
        self.assertTrue(enjambre.diff_necesita_tsc(["package.json"]))
        self.assertTrue(enjambre.diff_necesita_tsc(["package-lock.json"]))
        self.assertTrue(enjambre.diff_necesita_tsc(["next-env.d.ts"]))

    def test_nada_debajo_de_src_o_types_toca(self):
        self.assertTrue(enjambre.diff_necesita_tsc(["src/datos/plan.json"]))
        self.assertTrue(enjambre.diff_necesita_tsc(["types/api.d.ts"]))

    def test_lista_vacia_es_duda(self):
        self.assertTrue(enjambre.diff_necesita_tsc([]))

    def test_el_caso_medido_var1021a(self):
        self.assertFalse(
            enjambre.diff_necesita_tsc(
                ["scripts/puente/veredictos.py", "scripts/puente/README.md"]
            )
        )


class PuertaTsc(unittest.TestCase):
    """El corte dentro de tsc(cwd, log): salta el tsc solo con detalle y diff sin TypeScript."""

    def _tsc(self, salidas, tsconfig=True):
        llamadas = []

        def falso_sh(cmd, cwd=None, timeout=None, env=None, log=None):
            llamadas.append(cmd if isinstance(cmd, str) else " ".join(cmd))
            return salidas.pop(0)

        with mock.patch.object(enjambre, "repo_es_python", return_value=False), \
                mock.patch.object(enjambre, "sh", side_effect=falso_sh), \
                mock.patch.object(enjambre.os.path, "exists", return_value=tsconfig), \
                mock.patch.object(
                    enjambre,
                    "tsc_en_a1",
                    return_value=None,
                ), \
                mock.patch.object(
                    enjambre,
                    "cerrojo",
                    side_effect=lambda *_args, **_kwargs: contextlib.nullcontext(),
                ):
            return enjambre.tsc("/tmp/wt", None), llamadas

    def test_diff_solo_python_no_arranca_tsc(self):
        (rc, errs), llamadas = self._tsc([(0, "scripts/puente/una.py\n")])
        self.assertEqual((rc, errs), (0, []))
        self.assertEqual(len(llamadas), 1)
        self.assertIn("git diff --name-only", llamadas[0])

    def test_diff_con_ts_arranca_tsc(self):
        (_rc, _errs), llamadas = self._tsc([(0, "src/lib/salas.ts\n"), (0, "")])
        self.assertEqual(len(llamadas), 2)
        self.assertIn("npx tsc", llamadas[1])

    def test_git_falla_se_corre_tsc_como_hoy(self):
        (_rc, _errs), llamadas = self._tsc([(1, "fatal: no es un repo\n"), (0, "")])
        self.assertEqual(len(llamadas), 2)

    def test_diff_vacio_se_corre_tsc_como_hoy(self):
        (_rc, _errs), llamadas = self._tsc([(0, ""), (0, "")])
        self.assertEqual(len(llamadas), 2)

    def test_sin_tsconfig_no_se_mira_el_diff(self):
        (_rc, _errs), llamadas = self._tsc([(0, "scripts/puente/una.py\n")], tsconfig=False)
        self.assertTrue(all("git diff" not in c for c in llamadas))
        self.assertTrue(any("npx tsc" in c for c in llamadas))

    def test_la_renuncia_queda_anotada_en_el_log(self):
        registro = os.path.join("/tmp/opencode", "prueba-tsc.log")

        def falso_sh(cmd, cwd=None, timeout=None, env=None, log=None):
            self.assertEqual(log, registro)
            return 0, "scripts/puente/una.py\n"

        with mock.patch.object(enjambre, "repo_es_python", return_value=False), \
                mock.patch.object(enjambre, "sh", side_effect=falso_sh), \
                mock.patch.object(enjambre.os.path, "exists", return_value=True), \
                mock.patch.object(enjambre, "tsc_en_a1", return_value=(0, [])):
            os.makedirs("/tmp/opencode", exist_ok=True)
            with open(registro, "w", encoding="utf-8") as f:
                f.write("")
            self.assertEqual(enjambre.tsc("/tmp/wt", registro), (0, []))
        with open(registro, encoding="utf-8") as f:
            contenido = f.read()
        self.assertIn("tsc no hace falta: el diff no toca TypeScript", contenido)


if __name__ == "__main__":
    unittest.main()
