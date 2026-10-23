# -*- coding: utf-8 -*-
"""TSC1021A: una tarea cuyo diff no toca TypeScript no hace cola por un tsc completo.

Caso medido el 2026-10-21 en la Mac de 8 GB (swap al 94 %): VAR1021A solo tocaba
scripts/puente/*.py y esperó 49 min el turno de tsc por nada. La decisión vive
pura en `diff_necesita_tsc()`; aquí se prueba el veredicto suelto y el cableado
de la puerta `tsc(cwd, log)` del orquestador.
"""
import contextlib
import importlib.util
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

RUTA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "starseed-enjambre.py")
ESPEC = importlib.util.spec_from_file_location("enjambre_diff_tsc", RUTA)
enjambre = importlib.util.module_from_spec(ESPEC)
sys.modules["enjambre_diff_tsc"] = enjambre
ESPEC.loader.exec_module(enjambre)


class Pura(unittest.TestCase):
    """El veredicto de `diff_necesita_tsc(archivos)` sin probar git ni la puerta."""

    def test_python_md_y_json_de_datos_no_necesitan(self):
        # El caso de VAR1021A: solo .py del puente; nada aquí mueve el veredicto de tsc.
        self.assertFalse(enjambre.diff_necesita_tsc(["scripts/puente/var.py"]))
        self.assertFalse(enjambre.diff_necesita_tsc(["scripts/enjambre/t.py", "memory/state.md", "config/capas-astraura.json", "README.md"]))
        self.assertFalse(enjambre.diff_necesita_tsc(["Scripts.PY"]))

    def test_fuentes_ts_js_necesitan(self):
        for fuente in (
            "src/lib/a.ts",
            "app/page.tsx",
            "cap/s/a.mts",
            "cap/s/b.cts",
            "lib/c.js",
            "comp/d.jsx",
            "net/e.mjs",
            "net/f.cjs",
            "next-env.d.ts",
            "types/profundos/algo.js",
        ):
            self.assertTrue(enjambre.diff_necesita_tsc([fuente]), fuente)
        # Una sola fuente entre archivos inocuos basta para preguntar por el turno.
        self.assertTrue(enjambre.diff_necesita_tsc(["scripts/puente/var.py", "src/lib/a.ts"]))

    def test_config_del_compilador_necesita(self):
        for archivo in (
            "tsconfig.json",
            "tsconfig.eslint.json",
            "sub/tsconfig.test.json",
            "package.json",
            "package-lock.json",
            "deploy/nube/package.json",
        ):
            self.assertTrue(enjambre.diff_necesita_tsc([archivo]), archivo)

    def test_nada_bajo_src_o_types(self):
        # Aunque el archivo en sí sea un JSON de datos: vive bajo src/ o types/.
        self.assertTrue(enjambre.diff_necesita_tsc(["src/lib/memo.json"]))
        self.assertTrue(enjambre.diff_necesita_tsc(["types/algo.data.json"]))

    def test_duda_devuelve_true(self):
        # Sin diff no hay veredicto: la puerta corre tsc como hoy.
        self.assertTrue(enjambre.diff_necesita_tsc([]))
        self.assertTrue(enjambre.diff_necesita_tsc(["  "]))
        # Ruta escapada por git (nombre con espacios) o una carpeta: duda.
        self.assertTrue(enjambre.diff_necesita_tsc(['"nombre con espacio.md"']))
        self.assertTrue(enjambre.diff_necesita_tsc(["carpeta/"]))
        self.assertTrue(enjambre.diff_necesita_tsc([None]))


class Cableado(unittest.TestCase):
    """`tsc(cwd, log)` da el verde sin lanzar tsc cuando el diff de la tarea no lo pide.

    El git de la puerta corre DE VERDAD en un repo temporal (como test_tsc_remoto.py);
    solo el `npx tsc` se finge, con las salidas que la prueba quiera.
    """

    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="enj-diff-tsc-")
        self.wt = os.path.join(self.tmp, "wt")
        os.mkdir(self.wt)
        self.log = os.path.join(self.tmp, "puerta.log")
        self._git("init", "-q", "-b", "main")
        self._git("config", "user.email", "test@starseed.local")
        self._git("config", "user.name", "Test Enjambre")

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def _escribir(self, rel, contenido, anadir=False):
        ruta = os.path.join(self.wt, rel)
        os.makedirs(os.path.dirname(ruta), exist_ok=True)
        with open(ruta, "a", encoding="utf-8") as f:
            f.write(contenido)
        if anadir:
            self._git("add", ".")

    def _git(self, *args):
        subprocess.run(
            ["git"] + list(args), cwd=self.wt, check=True, capture_output=True, text=True
        )

    def _base(self):
        """Repo con tsconfig.json + a.ts + scripts/puente/var.py commiteados en main."""
        self._escribir("tsconfig.json", "{}\n")
        self._escribir("a.ts", "const x: number = 1\n")
        self._escribir(os.path.join("scripts", "puente", "var.py"), "VALOR = 1\n")
        self._git("add", ".")
        self._git("commit", "-qm", "base")

    def _puerta(self, local=(0, "")):
        """`sh` doble: solo el `npx tsc` se finge; el git de la puerta corre de verdad."""
        locales = []
        real_sh = enjambre.sh

        def doble_sh(cmd, cwd=None, timeout=120, env=None, log=None):
            texto = cmd if isinstance(cmd, str) else " ".join(cmd)
            if "npx tsc" in texto:
                locales.append(texto)
                return local
            return real_sh(cmd, cwd=cwd, timeout=timeout, env=env, log=log)

        pila = contextlib.ExitStack()
        pila.enter_context(mock.patch.object(enjambre, "sh", doble_sh))
        ev = mock.MagicMock()
        pila.enter_context(mock.patch.object(enjambre, "evento", ev))
        pila.enter_context(mock.patch.object(enjambre, "SEM_PESADO"))
        pila.enter_context(mock.patch.object(enjambre, "cerrojo"))
        return pila, locales, ev

    def _nota(self):
        with open(self.log, encoding="utf-8") as f:
            return f.read()

    def test_py_sin_commit_da_verde_sin_tsc(self):
        # Cambio py sin commitear (como VAR1021A): se pide el diff, se salta el turno.
        self._base()
        self._escribir(os.path.join("scripts", "puente", "var.py"), "VALOR = 2\n")
        pila, locales, ev = self._puerta()
        with pila:
            self.assertEqual(enjambre.tsc(self.wt, self.log), (0, []))
        self.assertEqual(locales, [])
        self.assertIn("tsc no hace falta", self._nota())
        ev.assert_called_once()

    def test_py_caracterizado_en_rama_tambien_salta(self):
        # El salvavidas commitea antes de las puertas: main...HEAD lleva el diff.
        self._base()
        self._git("checkout", "-qb", "ola/tscx")
        self._escribir(os.path.join("scripts", "puente", "var.py"), "VALOR = 3\n")
        self._git("add", ".")
        self._git("commit", "-qm", "TSCX: valor")
        pila, locales, ev = self._puerta()
        with pila:
            self.assertEqual(enjambre.tsc(self.wt, self.log), (0, []))
        self.assertEqual(locales, [])
        self.assertIn("tsc no hace falta", self._nota())

    def test_ts_en_el_diff_corre_tsc(self):
        self._base()
        self._escribir("a.ts", "const y: number = 2\n")
        pila, locales, ev = self._puerta()
        with pila:
            self.assertEqual(enjambre.tsc(self.wt, self.log), (0, []))
        self.assertEqual(len(locales), 1)
        ev.assert_not_called()

    def test_dif_vacio_corre_tsc_como_hoy(self):
        # Sin diff no hay veredicto: la puerta corre tsc como hoy.
        self._base()
        pila, locales, ev = self._puerta()
        with pila:
            self.assertEqual(enjambre.tsc(self.wt, self.log), (0, []))
        self.assertEqual(len(locales), 1)
        ev.assert_not_called()


class PuertaGitRoto(unittest.TestCase):
    """Si git falla, ante la menor duda se corre tsc como siempre."""

    def test_git_falla_y_corre_tsc(self):
        llamadas = []
        salidas = [(1, "fatal: no es un repositorio git"), (0, "")]

        def falso_sh(cmd, cwd=None, timeout=None, env=None, log=None):
            llamadas.append(cmd if isinstance(cmd, str) else " ".join(cmd))
            return salidas.pop(0)

        ev = mock.MagicMock()
        with mock.patch.object(enjambre, "repo_es_python", return_value=False), \
                mock.patch.object(enjambre, "sh", side_effect=falso_sh), \
                mock.patch.object(enjambre, "evento", ev), \
                mock.patch.object(enjambre, "SEM_PESADO"), \
                mock.patch.object(enjambre, "cerrojo"), \
                mock.patch.object(enjambre.time, "sleep"):
            self.assertEqual(enjambre.tsc("/tmp/wt", None), (0, []))
        self.assertTrue(llamadas[0].startswith("git diff --name-only main...HEAD"))
        self.assertIn("npx tsc", llamadas[1])
        ev.assert_not_called()


if __name__ == "__main__":
    unittest.main()
