# -*- coding: utf-8 -*-
"""Pruebas de la puerta tsc del orquestador hecha en el A1 (TRA1012Bc-d2, parte 2 de 2).

Sin red: `comprobar` es la FAKE inyectable de `tsc_en_a1` (no se importa comprobar_en_a1) y git
corre de verdad en un repositorio temporal, como hace test_alcance.py. Los tres veredictos del
TRA1012Bc-d1: verde del A1 → no lanza el tsc local de la Mac (~3,5 GB); rojo → devuelve los
errores en el formato que la reparación automática espera; avería del medio (A1 sin respuesta)
→ cae al tsc local de siempre.
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
ESPEC = importlib.util.spec_from_file_location("enjambre_tsc_remoto", RUTA)
if ESPEC is None or ESPEC.loader is None:
    raise RuntimeError("no pude cargar starseed-enjambre.py")
enjambre = importlib.util.module_from_spec(ESPEC)
sys.modules["enjambre_tsc_remoto"] = enjambre
ESPEC.loader.exec_module(enjambre)


class TscRemotoTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="enj-tsc-a1-")
        self.wt = os.path.join(self.tmp, "wt")
        os.mkdir(self.wt)
        self._git("init", "-q", "-b", "main")
        self._git("config", "user.email", "test@starseed.local")
        self._git("config", "user.name", "Test Enjambre")
        with open(os.path.join(self.wt, "tsconfig.json"), "w", encoding="utf-8") as f:
            f.write("{}\n")
        self._git("add", ".")
        self._git("commit", "-qm", "base")
        # Cambio sin commitear: la foto del árbol que va al A1 debe incluirlo.
        with open(os.path.join(self.wt, "a.ts"), "w", encoding="utf-8") as f:
            f.write("// cambio de la tarea\n")
        self.log = os.path.join(self.tmp, "puerta.log")

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def _git(self, *args):
        subprocess.run(["git"] + list(args), cwd=self.wt, check=True, capture_output=True, text=True)

    def _dobles(self, veredicto, local=(0, "")):
        """`sh` doble: al tsc local lo responde sin correrlo; el git sí corre de verdad."""
        real_sh = enjambre.sh
        locales, peticiones = [], []

        def comprobar(base, shas, cambiados, timeout=900, cwd=None):
            peticiones.append((base, shas, cambiados, cwd))
            return veredicto

        def doble_sh(cmd, cwd=None, timeout=120, env=None, log=None):
            texto = cmd if isinstance(cmd, str) else " ".join(cmd)
            if "npx tsc" in texto:
                locales.append(texto)
                return local  # el tsc completo de la Mac nunca corre en las pruebas
            return real_sh(cmd, cwd=cwd, timeout=timeout, env=env, log=log)

        return doble_sh, locales, peticiones, comprobar

    def _pila(self, doble_sh, comprobar=None):
        """Parches: la puerta fija, el evento silenciado y el cerrojo pesado sin efectos."""
        pila = contextlib.ExitStack()
        pila.enter_context(mock.patch.object(enjambre, "sh", doble_sh))
        if comprobar is not None:
            pila.enter_context(mock.patch.object(enjambre, "_comprobar_en_a1", return_value=comprobar))
        pila.enter_context(mock.patch.object(enjambre, "evento"))
        pila.enter_context(mock.patch.object(enjambre, "SEM_PESADO"))
        pila.enter_context(mock.patch.object(enjambre, "cerrojo"))
        return pila

    def test_verde_remoto_no_lanza_tsc_local(self):
        doble_sh, locales, peticiones, comprobar = self._dobles((True, "tsc + pytest en verde en el A1 (21 s)", False))
        with self._pila(doble_sh, comprobar):
            self.assertEqual(enjambre.tsc(self.wt, self.log), (0, []))
        self.assertEqual(locales, [])  # el tsc completo de la Mac no corrió
        base, shas, cambiados, cwd = peticiones[0]
        self.assertEqual(cambiados, ["a.ts"])  # la foto incluye lo sin commitear
        self.assertEqual(len(shas), 1)  # la tarea llega por shas, no por rama
        self.assertNotEqual(cwd, self.wt)  # se manda una copia desacoplada, no el worktree del agente

    def test_rojo_remoto_devuelve_los_errores(self):
        detalle = "en el A1: tsc: src/lib/a.ts: error TS2345 falta un argumento"
        doble_sh, locales, _, comprobar = self._dobles((False, detalle, False))
        with self._pila(doble_sh, comprobar):
            self.assertEqual(enjambre.tsc(self.wt, self.log), (1, [detalle]))
        self.assertEqual(locales, [])  # el veredicto del A1 es la puerta: local no corrió

    def test_rojo_sin_error_ts_da_el_texto(self):
        doble_sh, _, _, comprobar = self._dobles((False, "el A1 dio rojo sin detalle", False))
        with self._pila(doble_sh, comprobar):
            self.assertEqual(enjambre.tsc(self.wt, self.log), (1, ["el A1 dio rojo sin detalle"]))

    def test_medio_remoto_cae_al_local(self):
        doble_sh, locales, peticiones, comprobar = self._dobles((False, "A1: no responde", True))
        with self._pila(doble_sh, comprobar):
            self.assertEqual(enjambre.tsc(self.wt, self.log), (0, []))
        self.assertEqual(len(locales), 1)  # la puerta volvió al tsc de la Mac como siempre
        self.assertEqual(peticiones[0][2], ["a.ts"])

    def test_medio_que_no_es_mac_nada_viaja_y_va_al_local(self):
        doble_sh, locales, peticiones, _ = self._dobles((True, "no debería llamarme", False))
        with self._pila(doble_sh):
            with mock.patch.dict(os.environ, {"STARSEED_MEDIO": "nube"}):
                self.assertEqual(enjambre.tsc(self.wt, self.log), (0, []))
        self.assertEqual(len(locales), 1)
        self.assertEqual(peticiones, [])  # desde la nube ni se pregunta al A1


if __name__ == "__main__":
    unittest.main()
