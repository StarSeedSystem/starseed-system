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
import time
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

    con_github_real = False

    def _pila(self, doble_sh, comprobar=None, en_github=None):
        """Parches: la puerta fija, el evento silenciado y el cerrojo pesado sin efectos."""
        pila = contextlib.ExitStack()
        pila.enter_context(mock.patch.object(enjambre, "sh", doble_sh))
        if comprobar is not None:
            pila.enter_context(mock.patch.object(enjambre, "_comprobar_en_a1", return_value=comprobar))
        if en_github is not None or not self.con_github_real:
            pila.enter_context(mock.patch.object(enjambre, "_comprobar_en_github", return_value=en_github))
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


    # ── (CAP1026P) GitHub primero ──
    def _github(self, veredicto):
        llamadas = []

        def en_github(base, cambiados, cwd):
            llamadas.append((base, cambiados, cwd))
            if isinstance(veredicto, Exception):
                raise veredicto
            return veredicto
        return en_github, llamadas

    def test_github_verde_no_pregunta_al_a1_ni_compila_aqui(self):
        doble_sh, locales, peticiones, comprobar = self._dobles((True, "no debería llamarme", False))
        en_github, llamadas = self._github((True, "tsc en verde en GitHub (run 7)"))
        with self._pila(doble_sh, comprobar, en_github):
            self.assertEqual(enjambre.tsc(self.wt, self.log), (0, []))
        self.assertEqual((locales, peticiones), ([], []))
        self.assertEqual(llamadas[0][1], ["a.ts"])  # la foto con lo sin commitear
        self.assertNotEqual(llamadas[0][2], self.wt)

    def test_github_rojo_devuelve_sus_errores(self):
        detalle = "en GitHub (run 8) falla «tsc»: src/a.ts(1,1): error TS2322: no encaja\nError: Process completed"
        doble_sh, locales, peticiones, comprobar = self._dobles((True, "no", False))
        en_github, _ = self._github((False, detalle))
        with self._pila(doble_sh, comprobar, en_github):
            self.assertEqual(enjambre.tsc(self.wt, self.log), (1, ["en GitHub (run 8) falla «tsc»: src/a.ts(1,1): error TS2322: no encaja"]))
        self.assertEqual((locales, peticiones), ([], []))

    def test_github_sin_veredicto_o_roto_sigue_con_el_a1(self):
        for veredicto in (None, RuntimeError("gh no está")):
            doble_sh, locales, peticiones, comprobar = self._dobles((True, "verde en el A1", False))
            en_github, llamadas = self._github(veredicto)
            with self._pila(doble_sh, comprobar, en_github):
                self.assertEqual(enjambre.tsc(self.wt, self.log), (0, []))
            self.assertEqual((len(llamadas), len(peticiones), locales), (1, 1, []))

    def test_github_sin_veredicto_y_sin_a1_compila_aqui(self):
        doble_sh, locales, _, _ = self._dobles(None)
        en_github, _ = self._github(None)
        with self._pila(doble_sh, None, en_github), mock.patch.object(enjambre, "_comprobar_en_a1", return_value=None):
            self.assertEqual(enjambre.tsc(self.wt, self.log), (0, []))
        self.assertEqual(len(locales), 1)


class EnLaMacTest(unittest.TestCase):
    """(2026-11-02, SUP0211L) Las puertas tsc de fuera se usan desde la Mac aunque la tanda la lance Genesis
    (STARSEED_MEDIO=mando, STARSEED_DONDE=mac). Antes solo con MEDIO=mac: ninguna tanda de Genesis las usó."""

    def entorno(self, medio=None, donde=None, plataforma="darwin"):
        pila = contextlib.ExitStack()
        cambios = {k: v for k, v in (("STARSEED_MEDIO", medio), ("STARSEED_DONDE", donde)) if v is not None}
        pila.enter_context(mock.patch.dict(os.environ, cambios))
        for k, v in (("STARSEED_MEDIO", medio), ("STARSEED_DONDE", donde)):
            if v is None:
                os.environ.pop(k, None)
        pila.enter_context(mock.patch.object(enjambre.sys, "platform", plataforma))
        return pila

    def test_quien_es_la_mac(self):
        casos = [
            (("mando", "mac", "darwin"), True),    # Genesis: lanzarAqui y suenos.ts
            (("mac", "mac", "darwin"), True),      # lanzar-enjambre.sh
            (("mac", None, "linux"), True),        # MEDIO=mac explícito, como antes
            (("mando", "nube", "linux"), False),   # la nube (lanzador.py)
            (("oracle", "oracle", "linux"), False),  # el A1
            (("mando", "mac", "linux"), False),    # DONDE=mac copiado a otra máquina
            ((None, None, "darwin"), False),       # sin decir dónde corre
        ]
        for (medio, donde, plataforma), esperado in casos:
            with self.subTest(medio=medio, donde=donde, plataforma=plataforma):
                with self.entorno(medio, donde, plataforma):
                    self.assertIs(enjambre._en_la_mac(), esperado)

    def test_las_dos_puertas_de_fuera_se_abren_para_genesis(self):
        tmp = tempfile.mkdtemp(prefix="enj-mac-")
        self.addCleanup(shutil.rmtree, tmp, ignore_errors=True)
        puente = os.path.join(tmp, "scripts", "puente")
        os.makedirs(puente)
        with open(os.path.join(puente, "comprobar_en_a1.py"), "w", encoding="utf-8") as f:
            f.write("def comprobar(*a, **k):\n    return 'a1-falso'\n")
        with open(os.path.join(puente, "comprobar_en_github.py"), "w", encoding="utf-8") as f:
            f.write("def esperar_tsc(*a):\n    return 'github-falso'\n")
        for medio, donde, abiertas in (("mando", "mac", True), ("mando", "nube", False)):
            with self.subTest(medio=medio, donde=donde):
                with self.entorno(medio, donde), mock.patch.object(enjambre, "ROOT", tmp), \
                        mock.patch.dict(sys.modules), mock.patch.object(sys, "path", list(sys.path)):
                    sys.modules.pop("comprobar_en_a1", None)
                    sys.modules.pop("comprobar_en_github", None)
                    os.environ.pop("STARSEED_COMPROBAR_GITHUB", None)
                    a1, gh = enjambre._comprobar_en_a1(), enjambre._comprobar_en_github()
                    if abiertas:
                        self.assertEqual(a1(), "a1-falso")
                        self.assertEqual(gh("base", ["a.ts"], tmp), "github-falso")
                    else:
                        self.assertEqual((a1, gh), (None, None))


class HayQueRecargarTest(unittest.TestCase):
    """Pruebas de la función pura `hay_que_recargar`."""

    def test_none_visto_false(self):
        self.assertFalse(enjambre.hay_que_recargar(None, 123.0))

    def test_none_ahora_false(self):
        self.assertFalse(enjambre.hay_que_recargar(123.0, None))

    def test_ambos_none_false(self):
        self.assertFalse(enjambre.hay_que_recargar(None, None))

    def test_iguales_false(self):
        self.assertFalse(enjambre.hay_que_recargar(123.0, 123.0))

    def test_distintos_true(self):
        self.assertTrue(enjambre.hay_que_recargar(123.0, 124.0))


class RecargaModuloTest(unittest.TestCase):
    """Pruebas de recarga automática de los módulos de comprobación remota."""

    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="enj-recarga-")
        self.puente = os.path.join(self.tmp, "scripts", "puente")
        os.makedirs(self.puente)

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def _escribir_modulo(self, nombre, contenido):
        with open(os.path.join(self.puente, nombre), "w", encoding="utf-8") as f:
            f.write(contenido)

    def _cargar_orquestador(self, root=None):
        """Carga el orquestador con ROOT apuntando a self.tmp."""
        root = root or self.tmp
        # No parchear sys.modules globalmente: solo limpiar los módulos específicos
        sys.modules.pop("comprobar_en_a1", None)
        sys.modules.pop("comprobar_en_github", None)
        # Reiniciar los caches del orquestador
        enjambre._COMO_A1["modulo"] = None
        enjambre._COMO_A1["mtime"] = None
        enjambre._COMO_GITHUB["modulo"] = None
        enjambre._COMO_GITHUB["mtime"] = None
        with mock.patch.object(enjambre, "ROOT", root), \
             mock.patch.object(sys, "path", list(sys.path)), \
             mock.patch.dict(os.environ, {"STARSEED_MEDIO": "mac", "STARSEED_DONDE": "mac"}), \
             mock.patch.object(enjambre.sys, "platform", "darwin"):
            a1 = enjambre._comprobar_en_a1()
            gh = enjambre._comprobar_en_github()
        return a1, gh

    def test_recarga_a1_cambio_mtime(self):
        """Un cambio en el mtime de comprobar_en_a1.py devuelve la versión nueva."""
        self._escribir_modulo("comprobar_en_a1.py", "def comprobar(*a, **k):\n    return 'v1'\n")
        self._escribir_modulo("comprobar_en_github.py", "def esperar_tsc(*a, **k):\n    return 'gh-v1'\n")

        a1, gh = self._cargar_orquestador()
        self.assertEqual(a1(), "v1")

        # Cambiar el archivo y esperar a que el mtime sea distinto
        time.sleep(0.01)
        self._escribir_modulo("comprobar_en_a1.py", "def comprobar(*a, **k):\n    return 'v2'\n")

        # Segunda llamada debe recargar y devolver la versión nueva
        with mock.patch.dict(os.environ, {"STARSEED_MEDIO": "mac", "STARSEED_DONDE": "mac"}), \
             mock.patch.object(enjambre.sys, "platform", "darwin"), \
             mock.patch.object(enjambre, "ROOT", self.tmp):
            a1_nuevo = enjambre._comprobar_en_a1()

        self.assertEqual(a1_nuevo(), "v2")

    def test_recarga_github_cambio_mtime(self):
        """Un cambio en el mtime de comprobar_en_github.py devuelve la versión nueva."""
        self._escribir_modulo("comprobar_en_a1.py", "def comprobar(*a, **k):\n    return 'a1-v1'\n")
        self._escribir_modulo("comprobar_en_github.py", "def esperar_tsc(*a, **k):\n    return 'gh-v1'\n")

        a1, gh = self._cargar_orquestador()
        self.assertEqual(gh("base", ["a.ts"], self.tmp), "gh-v1")

        time.sleep(0.01)
        self._escribir_modulo("comprobar_en_github.py", "def esperar_tsc(*a, **k):\n    return 'gh-v2'\n")

        with mock.patch.dict(os.environ, {"STARSEED_MEDIO": "mac", "STARSEED_DONDE": "mac"}), \
             mock.patch.object(enjambre.sys, "platform", "darwin"), \
             mock.patch.object(enjambre, "ROOT", self.tmp):
            _, gh_nuevo = enjambre._comprobar_en_a1(), enjambre._comprobar_en_github()

        self.assertEqual(gh_nuevo("base", ["a.ts"], self.tmp), "gh-v2")

    def test_archivo_roto_conserva_version_anterior(self):
        """Si la recarga falla (SyntaxError), se conserva la versión anterior."""
        self._escribir_modulo("comprobar_en_a1.py", "def comprobar(*a, **k):\n    return 'v1'\n")
        self._escribir_modulo("comprobar_en_github.py", "def esperar_tsc(*a, **k):\n    return 'gh-v1'\n")

        a1, _ = self._cargar_orquestador()
        self.assertEqual(a1(), "v1")

        # Escribir archivo con error de sintaxis
        time.sleep(0.01)
        self._escribir_modulo("comprobar_en_a1.py", "def comprobar(*a, **k):\n    return 'v2'\n   SyntaxError\n")

        with mock.patch.dict(os.environ, {"STARSEED_MEDIO": "mac", "STARSEED_DONDE": "mac"}), \
             mock.patch.object(enjambre.sys, "platform", "darwin"), \
             mock.patch.object(enjambre, "ROOT", self.tmp), \
             mock.patch.object(enjambre, "evento") as mock_evento:
            a1_roto = enjambre._comprobar_en_a1()

        # Debe devolver la versión anterior
        self.assertEqual(a1_roto(), "v1")
        # Debe haber emitido un aviso
        self.assertTrue(any("recarga de comprobar_en_a1 falló" in str(c) for c in mock_evento.call_args_list))

    def test_sin_archivo_previo_falla_silenciosa(self):
        """Si no hay versión anterior y la carga falla, devuelve None."""
        self._escribir_modulo("comprobar_en_a1.py", "def comprobar(*a, **k):\n    return 'v1'\n")
        self._escribir_modulo("comprobar_en_github.py", "def esperar_tsc(*a, **k):\n    return 'gh-v1'\n")

        with mock.patch.dict(os.environ, {"STARSEED_MEDIO": "mac", "STARSEED_DONDE": "mac"}), \
             mock.patch.object(enjambre.sys, "platform", "darwin"), \
             mock.patch.object(enjambre, "ROOT", self.tmp), \
             mock.patch.dict(sys.modules), \
             mock.patch.object(sys, "path", list(sys.path)), \
             mock.patch.object(enjambre, "evento"):
            sys.modules.pop("comprobar_en_a1", None)
            sys.modules.pop("comprobar_en_github", None)
            enjambre._COMO_A1["modulo"] = None
            enjambre._COMO_A1["mtime"] = None
            # Archivo con error de sintaxis desde el principio
            self._escribir_modulo("comprobar_en_a1.py", "esto es código inválido\n")
            a1 = enjambre._comprobar_en_a1()

        self.assertIsNone(a1)


if __name__ == "__main__":
    unittest.main()