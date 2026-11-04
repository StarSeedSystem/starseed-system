# -*- coding: utf-8 -*-
"""(SUP0411C) La puerta de vitest con la Mac ahogada: «TIMEOUT» no es un rojo.

04-11 (medido): con la Mac a carga 50–60, `npx vitest run src/lib/__tests__ …` (123 archivos) daba «TIMEOUT
600s» en cada tarea. La puerta lo tomaba por pruebas en rojo, pedía al modelo «corregir» unas pruebas que no
fallaban (900 s), repetía los 600 s y cerraba «vitest sigue fallando»: en 9 h el orquestador no integró nada.
Ahora, si GitHub dio verde (tsc + vitest related) a ESE mismo árbol en la puerta tsc, vale (con las guardas
que GitHub no ve, corridas aquí); si no, la tarea se para con «vitest no terminó» (medio:tiempo), sin reparar.

Sin red: la puerta de GitHub es una FAKE y git corre de verdad en un repositorio temporal (como test_tsc_remoto).
"""
import contextlib
import importlib.util
import inspect
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

RUTA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "starseed-enjambre.py")
ESPEC = importlib.util.spec_from_file_location("enjambre_vitest_0411", RUTA)
if ESPEC is None or ESPEC.loader is None:
    raise RuntimeError("no pude cargar starseed-enjambre.py")
enjambre = importlib.util.module_from_spec(ESPEC)
sys.modules["enjambre_vitest_0411"] = enjambre
ESPEC.loader.exec_module(enjambre)

PUENTE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "puente")
if PUENTE not in sys.path:
    sys.path.insert(0, PUENTE)
import revisor_bloqueadas_logica as rev  # noqa: E402

TIMEOUT = (124, "TIMEOUT 600s\n ✓ salas · fuzzing con semilla 10200ms\n")
GUARDA = "src/lib/genesis/__tests__/sin-node-en-cliente.test.ts"


class PurasTest(unittest.TestCase):
    def test_sin_terminar_es_solo_el_plazo(self):
        self.assertTrue(enjambre.vitest_sin_terminar(*TIMEOUT))
        self.assertFalse(enjambre.vitest_sin_terminar(1, "FAIL src/lib/__tests__/a.test.ts > x\nAssertionError"))
        self.assertFalse(enjambre.vitest_sin_terminar(0, "TIMEOUT 600s"))  # rc 0 es verde, diga lo que diga
        self.assertFalse(enjambre.vitest_sin_terminar(124, ""))

    def test_lo_que_cubre_github(self):
        self.assertTrue(enjambre.cubre_github(["src/lib/a.ts", "src/components/b.tsx"]))
        self.assertTrue(enjambre.cubre_github(["src/lib/a.ts", "scripts/puente/x.py"]))
        for no in ([], ["src/lib/catalogo.json"], ["package.json"], ["src/lib/a.ts", "docs/x.md"],
                   ["src/app/globals.css"]):
            self.assertFalse(enjambre.cubre_github(no), no)

    def _parar(self, rc, salida, **kw):
        with mock.patch.object(enjambre, "paso"), mock.patch.object(enjambre, "set_estado") as estado, \
                mock.patch.object(enjambre, "evento") as ev, \
                mock.patch.object(enjambre, "limpiar_worktree") as limpiar:
            parada = enjambre._parar_si_vitest_sin_terminar("T1", rc, salida, "nvidia/m", 0, **kw)
        return parada, estado, ev, limpiar

    def test_sin_terminar_se_para_como_fallo_del_medio(self):
        for kw in ({}, {"tras_reparacion": True}):
            with self.subTest(**kw):
                parada, estado, ev, limpiar = self._parar(*TIMEOUT, **kw)
                self.assertTrue(parada)
                nota = estado.call_args.kwargs["nota"]
                self.assertEqual(estado.call_args.kwargs["estado"], "fallo_tests")
                self.assertIn("vitest no terminó", nota)
                self.assertEqual(rev.clase_de_fallo(nota), "medio:tiempo")  # no gasta intento
                self.assertEqual(rev.clase_de_fallo(ev.call_args.args[2]), "medio:tiempo")
                limpiar.assert_called_once_with("T1", borrar_rama=False)

    def test_un_rojo_de_verdad_no_se_para_aqui(self):
        parada, estado, ev, limpiar = self._parar(1, "FAIL src/lib/__tests__/a.test.ts")
        self.assertFalse(parada)
        estado.assert_not_called()
        limpiar.assert_not_called()

    def test_ejecutar_para_antes_de_pedir_la_reparacion(self):
        """En `ejecutar`, la parada va ANTES de «vitest falló → reparación» y otra vez tras la vuelta reparada."""
        fuente = inspect.getsource(enjambre.ejecutar)
        i_parar = fuente.index("_parar_si_vitest_sin_terminar(tid, rc, vout, modelo_ok, t0)")
        i_reparar = fuente.index('"vitest falló → reparación"')
        self.assertLess(i_parar, i_reparar)
        self.assertIn("_parar_si_vitest_sin_terminar(tid, rc, vout, modelo_ok, t0, tras_reparacion=True)",
                      fuente[i_reparar:])


class ConGithubTest(unittest.TestCase):
    """La puerta entera (tsc → vitest) sobre un worktree de verdad, con GitHub y vitest de mentira."""

    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="enj-vitest-0411-")
        self.wt = os.path.join(self.tmp, "T1")
        os.makedirs(os.path.join(self.wt, "src", "lib", "genesis", "__tests__"))
        self._git("init", "-q", "-b", "main")
        self._git("config", "user.email", "test@starseed.local")
        self._git("config", "user.name", "Test Enjambre")
        self._escribir("tsconfig.json", "{}\n")
        self._escribir("src/lib/a.ts", "export const a = 1\n")
        self._escribir("src/lib/datos.json", "{}\n")
        self._escribir(GUARDA, "// guarda del paquete del navegador\n")
        self._git("add", ".")
        self._git("commit", "-qm", "base")
        self._escribir("src/lib/a.ts", "export const a = 2 // cambio de la tarea\n")
        self.log = os.path.join(self.tmp, "puerta.log")
        enjambre._VERDE_GITHUB.clear()

    def tearDown(self):
        enjambre._VERDE_GITHUB.clear()
        shutil.rmtree(self.tmp, ignore_errors=True)

    def _git(self, *args):
        subprocess.run(["git"] + list(args), cwd=self.wt, check=True, capture_output=True, text=True)

    def _escribir(self, ruta, texto):
        with open(os.path.join(self.wt, ruta), "w", encoding="utf-8") as f:
            f.write(texto)

    def _pila(self, local=TIMEOUT, extras=(0, "1 passed"), github=(True, "tsc y pruebas relacionadas en verde (run 7)")):
        """`sh` doble: vitest y tsc de la Mac se responden sin correrlos; git corre de verdad."""
        real_sh = enjambre.sh
        self.llamadas = []

        def doble_sh(cmd, cwd=None, timeout=120, env=None, log=None):
            texto = cmd if isinstance(cmd, str) else " ".join(cmd)
            if "vitest run src/lib/__tests__" in texto:
                self.llamadas.append("base")
                return local
            if "vitest" in texto:
                self.llamadas.append("aquí: " + texto.split("vitest run ", 1)[-1])
                return extras
            if "npx tsc" in texto:
                self.llamadas.append("tsc de la Mac")
                return 0, ""
            return real_sh(cmd, cwd=cwd, timeout=timeout, env=env, log=log)

        pila = contextlib.ExitStack()
        pila.enter_context(mock.patch.object(enjambre, "sh", doble_sh))
        pila.enter_context(mock.patch.object(enjambre, "_comprobar_en_a1", return_value=None))
        en_github = (lambda base, cambiados, cwd: github) if github is not None else (lambda *a: None)
        pila.enter_context(mock.patch.object(enjambre, "_comprobar_en_github", return_value=en_github))
        self.evento = pila.enter_context(mock.patch.object(enjambre, "evento"))
        pila.enter_context(mock.patch.object(enjambre, "SEM_PESADO"))
        pila.enter_context(mock.patch.object(enjambre, "cerrojo"))
        return pila

    def _puertas(self, antes_de_vitest=None, **kw):
        with self._pila(**kw):
            self.assertEqual(enjambre.tsc(self.wt, self.log), (0, []))
            if antes_de_vitest:
                antes_de_vitest()
            return enjambre.vitest(self.wt, self.log)

    def test_verde_de_github_del_mismo_arbol_vale_y_corre_aqui_solo_las_guardas(self):
        rc, salida = self._puertas()
        self.assertEqual(rc, 0, salida)
        self.assertEqual(self.llamadas, ["base", "aquí: " + GUARDA])
        avisos = [str(c.args[2]) for c in self.evento.call_args_list if len(c.args) > 2]
        self.assertTrue(any(a.startswith("puerta vitest:") and "run 7" in a for a in avisos), avisos)

    def test_si_el_arbol_cambio_despues_de_github_no_vale(self):
        rc, salida = self._puertas(antes_de_vitest=lambda: self._escribir("src/lib/a.ts", "export const a = 3\n"))
        self.assertTrue(enjambre.vitest_sin_terminar(rc, salida), (rc, salida))
        self.assertEqual(self.llamadas, ["base"])

    def test_sin_veredicto_de_github_sigue_sin_terminar(self):
        rc, salida = self._puertas(github=None)
        self.assertTrue(enjambre.vitest_sin_terminar(rc, salida), (rc, salida))
        self.assertEqual(self.llamadas, ["tsc de la Mac", "base"])

    def test_con_un_json_tocado_github_no_lo_cubre(self):
        self._escribir("src/lib/datos.json", '{"nuevo": true}\n')
        rc, salida = self._puertas()
        self.assertTrue(enjambre.vitest_sin_terminar(rc, salida), (rc, salida))
        self.assertEqual(self.llamadas, ["base"])

    def test_una_guarda_en_rojo_es_un_rojo_de_verdad(self):
        rc, salida = self._puertas(extras=(1, "FAIL " + GUARDA))
        self.assertEqual(rc, 1)
        self.assertFalse(enjambre.vitest_sin_terminar(rc, salida))

    def test_una_puerta_tsc_nueva_borra_el_verde_anterior(self):
        with self._pila():
            self.assertEqual(enjambre.tsc(self.wt, self.log), (0, []))
        self.assertIn(os.path.realpath(self.wt), enjambre._VERDE_GITHUB)
        with self._pila(github=None):
            self.assertEqual(enjambre.tsc(self.wt, self.log), (0, []))
            rc, salida = enjambre.vitest(self.wt, self.log)
        self.assertTrue(enjambre.vitest_sin_terminar(rc, salida))
        self.assertNotIn(os.path.realpath(self.wt), enjambre._VERDE_GITHUB)

    def test_vitest_que_termina_no_cambia(self):
        for local in ((0, "Test Files  123 passed"), (1, "FAIL src/lib/__tests__/b.test.ts")):
            with self.subTest(local=local[0]):
                rc, salida = self._puertas(local=local)
                self.assertEqual((rc, self.llamadas), (local[0], ["base"]))


if __name__ == "__main__":
    unittest.main()
