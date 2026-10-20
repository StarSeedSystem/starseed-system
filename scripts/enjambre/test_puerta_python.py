"""Pruebas para la puerta condicional de Python (p321Jc)."""

import os
import sys
import tempfile
import unittest
from unittest import mock

# Asegurar import de starseed-enjambre.py
ENJAMBRE_DIR = os.path.dirname(os.path.abspath(__file__))
if ENJAMBRE_DIR not in sys.path:
    sys.path.insert(0, ENJAMBRE_DIR)

import contextlib
import importlib

enjambre = importlib.import_module("starseed-enjambre")

PUENTE_DIR = os.path.join(os.path.dirname(ENJAMBRE_DIR), "puente")
if PUENTE_DIR not in sys.path:
    sys.path.insert(0, PUENTE_DIR)


@contextlib.contextmanager
def _arbol(archivos):
    """Un árbol de trabajo temporal con esos archivos ({ruta: texto})."""
    with tempfile.TemporaryDirectory() as wt:
        for ruta, texto in archivos.items():
            destino = os.path.join(wt, ruta)
            os.makedirs(os.path.dirname(destino), exist_ok=True)
            with open(destino, "w", encoding="utf-8") as f:
                f.write(texto)
        yield wt


class TestPuertaPython(unittest.TestCase):
    """Pruebas unitarias de la puerta condicional de Python."""

    def test_tarea_sin_py_no_dispara_puerta(self):
        """Una tarea que cambió src/algo.tsx no dispara la puerta."""
        with mock.patch.object(
            enjambre, "_tocados_por_la_tarea", return_value=["src/algo.tsx"]
        ):
            with mock.patch.object(enjambre, "sh") as mock_sh:
                rc, out = enjambre._puerta_python("/falso/wt", tid="t1")
                self.assertEqual(rc, 0)
                self.assertEqual(out, "")
                mock_sh.assert_not_called()

    def test_tarea_con_py_en_puente_dispara_su_prueba(self):
        """Una tarea que cambió scripts/puente/x.py corre la prueba de x, no la carpeta entera."""
        with _arbol({"scripts/puente/x.py": "", "scripts/puente/test_x.py": "", "scripts/puente/test_y.py": ""}) as wt:
            with mock.patch.object(
                enjambre, "_tocados_por_la_tarea", return_value=["scripts/puente/x.py"]
            ):
                with mock.patch.object(
                    enjambre, "sh", return_value=(0, "Ran 5 tests OK")
                ) as mock_sh:
                    rc, out = enjambre._puerta_python(wt, tid="t2")
                    self.assertEqual(rc, 0)
                    self.assertIn("Ran 5 tests OK", out)
                    self.assertEqual(mock_sh.call_count, 1)
                    cmd = mock_sh.call_args[0][0]
                    self.assertIn("scripts/puente/test_x.py", cmd)
                    self.assertNotIn("scripts/puente/test_y.py", cmd)
                    self.assertNotIn("discover", cmd)

    def test_tarea_con_py_en_enjambre_dispara_su_prueba_con_pytest(self):
        """Una tarea que cambió scripts/enjambre/x.py corre la prueba de x con pytest."""
        with _arbol({"scripts/enjambre/x.py": "", "scripts/enjambre/test_x.py": ""}) as wt:
            with mock.patch.object(
                enjambre, "_tocados_por_la_tarea", return_value=["scripts/enjambre/x.py"]
            ):
                with mock.patch.object(enjambre, "sh", return_value=(0, "OK")) as mock_sh:
                    rc, out = enjambre._puerta_python(wt, tid="t3")
                    self.assertEqual(rc, 0)
                    self.assertEqual(mock_sh.call_count, 1)
                    cmd = mock_sh.call_args[0][0]
                    self.assertIn("pytest", cmd)
                    self.assertIn("scripts/enjambre/test_x.py", cmd)

    def test_suite_en_rojo_marca_fallo_con_linea_de_error(self):
        """Una suite en rojo deja la tarea en fallo_tests con la primera línea del error."""
        salida_error = "Traceback (most recent call last):\nFAIL: test_foo (test_bar.TestBar)\nAssertionError: 1 != 2"
        with mock.patch.object(
            enjambre, "_tocados_por_la_tarea", return_value=["scripts/puente/x.py"]
        ):
            with mock.patch.object(enjambre, "sh", return_value=(1, salida_error)):
                rc, out = enjambre._puerta_python("/falso/wt", tid="t4")
                self.assertNotEqual(rc, 0)
                linea = enjambre._primera_linea_error(out)
                self.assertEqual(linea, "FAIL: test_foo (test_bar.TestBar)")

    def test_suite_en_verde_deja_seguir(self):
        """Una suite en verde deja seguir."""
        with mock.patch.object(
            enjambre, "_tocados_por_la_tarea", return_value=["scripts/puente/x.py"]
        ):
            with mock.patch.object(
                enjambre, "sh", return_value=(0, "Ran 10 tests in 0.1s\nOK")
            ):
                rc, out = enjambre._puerta_python("/falso/wt", tid="t5")
                self.assertEqual(rc, 0)

    def test_lanzamiento_reventado_avisa_y_no_bloquea(self):
        """Si el lanzamiento revienta (p.ej. excentricidad/error), avisa y no bloquea."""
        with mock.patch.object(
            enjambre, "_tocados_por_la_tarea", return_value=["scripts/puente/x.py"]
        ):
            with mock.patch.object(
                enjambre, "sh", side_effect=OSError("python3 no encontrado")
            ):
                with mock.patch.object(enjambre, "evento") as mock_evento:
                    rc, out = enjambre._puerta_python("/falso/wt", tid="t6")
                    self.assertEqual(rc, 0)
                    self.assertIn("puerta python no se pudo lanzar", out)
                    mock_evento.assert_called_once()
                    self.assertEqual(mock_evento.call_args[0][0], "aviso")


class TestCadaDirectorioConSuCorredor(unittest.TestCase):
    """(2026-09-22, MEDIDO) Aquí se tiraba el trabajo de la nube entera.

    La puerta del agente corría `unittest discover` sobre `scripts/enjambre`, donde viven
    pruebas escritas para PYTEST (`test_revisores.py` usa `@pytest.fixture(autouse=True)`).
    unittest no ejecuta esas fixtures, así que saltaban siete errores del tipo:

        AttributeError: 'CandidatosTest' object has no attribute 'salud'

    Con pytest, ese mismo archivo: 10 passed. Las cinco tareas de la cola de la nube de las
    10:03 —TK1c, c313_QW4, c313_QW6, RM3, RM4— murieron con el MISMO `fallo_tests`, por una
    prueba que en la Mac estaba verde y que no tenía nada que ver con ellas.
    """

    def test_el_enjambre_se_prueba_con_pytest(self):
        orden = enjambre.orden_de_pruebas("scripts/enjambre", "python3")
        self.assertIn("pytest", orden)
        self.assertNotIn("unittest", orden)

    def test_da_igual_la_barra_final(self):
        self.assertIn("pytest", enjambre.orden_de_pruebas("scripts/enjambre/", "python3"))

    def test_el_puente_sigue_con_unittest(self):
        orden = enjambre.orden_de_pruebas("scripts/puente", "python3")
        self.assertIn("unittest", orden)
        self.assertNotIn("pytest", orden)

    def test_usa_el_python_que_se_le_pasa(self):
        self.assertEqual(enjambre.orden_de_pruebas("scripts/puente", "/usr/bin/python3")[0], "/usr/bin/python3")

    def test_con_archivos_corre_solo_esas_pruebas(self):
        """(2026-10-20, AV1011G-d1) La puerta por alcance pasa los archivos a su corredor, con la
        carpeta de la prueba en el PYTHONPATH: `python -m unittest <ruta.py>` no la mete en sys.path
        (el `discover -s` de siempre sí) y 29 de las 52 pruebas de scripts/puente que hacen
        `import modulo` sin tocar sys.path daban ModuleNotFoundError."""
        self.assertEqual(
            enjambre.orden_de_pruebas("scripts/protomolecula", "python3", ["scripts/protomolecula/test_a.py"]),
            ["env", "PYTHONPATH=scripts/protomolecula", "python3", "-m", "unittest", "-q", "scripts/protomolecula/test_a.py"],
        )
        self.assertEqual(
            enjambre.orden_de_pruebas("scripts/puente", "python3", ["scripts/puente/test_a.py"], raiz="/wt/x"),
            ["env", "PYTHONPATH=/wt/x/scripts/puente", "python3", "-m", "unittest", "-q", "scripts/puente/test_a.py"],
        )
        self.assertEqual(
            enjambre.orden_de_pruebas("scripts/puente/flujos", "python3", ["scripts/puente/flujos/test_a.py"], raiz="/wt/x", corredor="pytest"),
            ["env", "PYTHONPATH=/wt/x/scripts/puente/flujos", "python3", "-m", "pytest", "-q", "scripts/puente/flujos/test_a.py"],
        )

    def test_suma_el_pythonpath_que_ya_hubiera_en_vez_de_pisarlo(self):
        orden = enjambre.orden_de_pruebas("scripts/puente", "python3", ["scripts/puente/test_a.py"], raiz="/wt",
                                          pythonpath_previo="/otro/sitio")
        self.assertEqual(orden[1], "PYTHONPATH=/wt/scripts/puente" + os.pathsep + "/otro/sitio")
        self.assertEqual(
            enjambre.orden_de_pruebas("scripts/enjambre", "python3", ["scripts/enjambre/test_a.py"]),
            ["python3", "-m", "pytest", "scripts/enjambre/test_a.py", "-q"],
        )

    def test_es_pura_no_lee_el_entorno_del_orquestador(self):
        """(revisor) La docstring decía «PURA» pero leía os.environ["PYTHONPATH"], que no es el del hijo."""
        with mock.patch.dict(os.environ, {"PYTHONPATH": "/del/orquestador"}):
            orden = enjambre.orden_de_pruebas("scripts/puente", "python3", ["scripts/puente/test_a.py"], raiz="/wt")
        self.assertEqual(orden[1], "PYTHONPATH=/wt/scripts/puente")

    def test_la_puerta_toma_el_pythonpath_del_entorno_del_hijo(self):
        """Quien llama pasa el PYTHONPATH de `entorno_hijo()` —el entorno con el que corre `sh`—."""
        with _arbol({"scripts/puente/x.py": "", "scripts/puente/test_x.py": ""}) as wt:
            with mock.patch.object(enjambre, "entorno_hijo", return_value={"PYTHONPATH": "/del/hijo"}):
                (orden, _), = enjambre._ordenes_puerta_python(wt, ["scripts/puente/x.py"], "python3")
        self.assertEqual(orden[1], "PYTHONPATH=" + os.path.join(wt, "scripts/puente") + os.pathsep + "/del/hijo")

    def test_sin_archivos_sigue_siendo_la_carpeta_entera(self):
        self.assertIn("discover", enjambre.orden_de_pruebas("scripts/puente", "python3"))
        self.assertIn("scripts/enjambre", enjambre.orden_de_pruebas("scripts/enjambre", "python3"))


class TestPuertaPorAlcance(unittest.TestCase):
    """(2026-10-20, AV1011G-d1) La causa raíz de que AV1011G-d1 y toda tarea de Python se quedaran
    en Bloqueadas: la puerta corría `unittest discover` sobre TODA la carpeta scripts/puente con
    120 s. MEDIDO: 2813 pruebas, ~373 s, rc=124 «TIMEOUT 120s» con un cambio de UNA línea. Ahora
    corre las pruebas de lo que la tarea toca."""

    def _puerta(self, archivos, tocados, rc=0, out="OK"):
        with _arbol(archivos) as wt:
            with mock.patch.object(enjambre, "_tocados_por_la_tarea", return_value=tocados):
                with mock.patch.object(enjambre, "sh", return_value=(rc, out)) as mock_sh:
                    resultado = enjambre._puerta_python(wt, tid="t")
        return resultado, mock_sh

    def test_un_py_de_protomolecula_corre_solo_su_prueba(self):
        # scripts/protomolecula no tenía puerta; y la de puente no es asunto de esta tarea.
        archivos = {f"scripts/puente/test_{i}.py": "" for i in range(40)}
        archivos.update({
            "scripts/protomolecula/vigias_3d.py": "",
            "scripts/protomolecula/test_vigias_3d.py": "",
            "scripts/protomolecula/test_actualizar_catalogo.py": "",
        })
        (rc, _), mock_sh = self._puerta(archivos, ["scripts/protomolecula/vigias_3d.py"])
        self.assertEqual(rc, 0)
        self.assertEqual(mock_sh.call_count, 1)
        cmd = mock_sh.call_args[0][0]
        self.assertEqual(cmd[-1], "scripts/protomolecula/test_vigias_3d.py")
        self.assertNotIn("scripts/puente", " ".join(cmd))
        # con un plazo que cabe: la prueba de UN módulo, no la carpeta entera
        self.assertEqual(mock_sh.call_args[1]["timeout"], enjambre.PLAZO_PUERTA_PY_S)

    def test_el_orquestador_corre_su_carpeta_entera_con_plazo_largo(self):
        # Lo importan muchas pruebas: un cambio ahí sí puede romper a cualquiera.
        archivos = {"scripts/enjambre/starseed-enjambre.py": ""}
        for i in range(15):
            archivos[f"scripts/enjambre/test_{i}.py"] = 'import importlib\nE = importlib.import_module("starseed-enjambre")\n'
        (rc, _), mock_sh = self._puerta(archivos, ["scripts/enjambre/starseed-enjambre.py"])
        self.assertEqual(mock_sh.call_count, 1)
        self.assertEqual(mock_sh.call_args[0][0][1:], ["-m", "pytest", "scripts/enjambre", "-q"])
        self.assertEqual(mock_sh.call_args[1]["timeout"], enjambre.PLAZO_PUERTA_PY_COMPLETA_S)

    def test_un_py_sin_prueba_solo_se_comprueba_que_compila_y_lo_dice(self):
        with _arbol({"scripts/puente/solo.py": "x = 1\n"}) as wt:
            with mock.patch.object(enjambre, "_tocados_por_la_tarea", return_value=["scripts/puente/solo.py"]):
                rc, out = enjambre._puerta_python(wt, tid="t")
        self.assertEqual(rc, 0)
        self.assertIn("sin pruebas propias: solo se comprobo que compilan", out)

    def test_un_py_con_error_de_sintaxis_sin_prueba_tumba_la_puerta(self):
        with _arbol({"scripts/puente/roto.py": "def f(:\n"}) as wt:
            with mock.patch.object(enjambre, "_tocados_por_la_tarea", return_value=["scripts/puente/roto.py"]):
                rc, out = enjambre._puerta_python(wt, tid="t")
        self.assertNotEqual(rc, 0)
        self.assertIn("SyntaxError", out)

    def test_si_no_se_puede_importar_el_alcance_cae_a_la_carpeta_entera_con_plazo_largo(self):
        with mock.patch.dict(sys.modules, {"alcance_pruebas": None}):
            (rc, _), mock_sh = self._puerta({"scripts/puente/x.py": ""}, ["scripts/puente/x.py"])
        cmd = mock_sh.call_args[0][0]
        self.assertIn("discover", cmd)
        self.assertEqual(mock_sh.call_args[1]["timeout"], enjambre.PLAZO_PUERTA_PY_COMPLETA_S)

    def test_una_prueba_en_rojo_de_la_tarea_tumba_la_puerta(self):
        (rc, out), _ = self._puerta(
            {"scripts/protomolecula/v.py": "", "scripts/protomolecula/test_v.py": ""},
            ["scripts/protomolecula/v.py"], rc=1, out="FAIL: test_v (test_v.T)",
        )
        self.assertNotEqual(rc, 0)
        self.assertEqual(enjambre._primera_linea_error(out), "FAIL: test_v (test_v.T)")


class TestUnTimeoutNoEsUnFalloDeLaTarea(unittest.TestCase):
    """(2026-10-20, AV1011G-d1) La nota que dejaba el TIMEOUT era la primera línea con «Error:» de las
    pruebas AJENAS que habían alcanzado a imprimir; el revisor la clasificaba como `tarea:otro`."""

    SALIDA = (
        "TIMEOUT 120s\n"
        "....E.....\n"
        "director/orden-tareas: OSError: disco lleno\n"
    )

    def test_la_nota_dice_timeout_y_no_el_ruido_ajeno(self):
        nota = enjambre._primera_linea_error(self.SALIDA)
        self.assertTrue(nota.startswith("TIMEOUT 120s"), nota)
        self.assertNotIn("disco lleno", nota)
        self.assertLessEqual(len(nota), 120)

    def test_el_revisor_la_lee_como_fallo_del_medio(self):
        import revisor_bloqueadas_logica as rev

        clase = rev.clase_de_fallo(enjambre._primera_linea_error(self.SALIDA))
        self.assertEqual(clase, "medio:tiempo")
        self.assertTrue(rev.es_del_medio(clase))

    def test_sin_timeout_todo_sigue_como_antes(self):
        self.assertEqual(
            enjambre._primera_linea_error("Ran 3 tests\nFAIL: test_a (m.T)\nOSError: x"),
            "FAIL: test_a (m.T)",
        )
        self.assertEqual(enjambre._primera_linea_error(""), "error en tests de python")


class TestLaOrdenSeEjecutaDeVerdad(unittest.TestCase):
    """(2026-10-20, AV1011G-d1, revisor) Las pruebas de arriba simulan `sh`, así que nunca ejecutaban
    la orden: el rojo falso por «ModuleNotFoundError» (la carpeta del test fuera de sys.path) pasó
    sin que ninguna lo viera. Aquí `sh` es el de verdad, sobre un árbol temporal."""

    def _puerta(self, archivos, tocados):
        with _arbol(archivos) as wt:
            with mock.patch.object(enjambre, "_tocados_por_la_tarea", return_value=tocados):
                return enjambre._puerta_python(wt, tid="real")

    def test_una_prueba_que_hace_import_sin_tocar_sys_path_pasa(self):
        rc, out = self._puerta(
            {
                "scripts/puente/modulo_x.py": "def doble(n):\n    return n * 2\n",
                "scripts/puente/test_modulo_x.py": (
                    "import unittest\nimport modulo_x\n\n\n"
                    "class T(unittest.TestCase):\n    def test_doble(self):\n        self.assertEqual(modulo_x.doble(2), 4)\n"
                ),
            },
            ["scripts/puente/modulo_x.py"],
        )
        self.assertEqual(rc, 0, out)
        self.assertIn("Ran 1 test", out)
        self.assertNotIn("ModuleNotFoundError", out)

    def test_y_si_la_prueba_falla_de_verdad_tumba_la_puerta_con_la_asercion(self):
        rc, out = self._puerta(
            {
                "scripts/protomolecula/modulo_y.py": "VALOR = 1\n",
                "scripts/protomolecula/test_modulo_y.py": (
                    "import unittest\nimport modulo_y\n\n\n"
                    "class T(unittest.TestCase):\n    def test_valor(self):\n        self.assertEqual(modulo_y.VALOR, 2)\n"
                ),
            },
            ["scripts/protomolecula/modulo_y.py"],
        )
        self.assertNotEqual(rc, 0)
        self.assertEqual(enjambre._primera_linea_error(out), "FAIL: test_valor (scripts.protomolecula.test_modulo_y.T.test_valor)")

    def test_una_prueba_con_funciones_sueltas_se_ejecuta_con_pytest_y_no_da_un_verde_vacio(self):
        # Bajo unittest esto da «Ran 0 tests … OK»: pasaba sin comprobar nada.
        archivos = {
            "scripts/puente/modulo_z.py": "def triple(n):\n    return n * 3\n",
            "scripts/puente/test_modulo_z.py": "import modulo_z\n\n\ndef test_triple():\n    assert modulo_z.triple(2) == %s\n",
        }
        rc, out = self._puerta({**archivos, "scripts/puente/test_modulo_z.py": archivos["scripts/puente/test_modulo_z.py"] % "6"}, ["scripts/puente/modulo_z.py"])
        self.assertEqual(rc, 0, out)
        self.assertIn("1 passed", out)
        rc, out = self._puerta({**archivos, "scripts/puente/test_modulo_z.py": archivos["scripts/puente/test_modulo_z.py"] % "7"}, ["scripts/puente/modulo_z.py"])
        self.assertNotEqual(rc, 0)
        self.assertIn("1 failed", out)

    def test_una_prueba_guion_que_comprueba_al_importar_pasa_y_si_falla_tumba(self):
        # scripts/puente/test_telegram_puente.py es así: 16 comprobaciones a nivel de módulo, 0 «tests».
        # «Ran 0 tests … OK» ahí NO es un verde vacío; no hay que tumbarlo.
        guion = "import sys\nimport guion_x\nif guion_x.VALOR != %s:\n    print('FALLA valor')\n    sys.exit(1)\nprint('1/1 pruebas en verde.')\n"
        arbol = {"scripts/puente/guion_x.py": "VALOR = 1\n"}
        rc, out = self._puerta({**arbol, "scripts/puente/test_guion_x.py": guion % "1"}, ["scripts/puente/guion_x.py"])
        self.assertEqual(rc, 0, out)
        self.assertIn("Ran 0 tests", out)
        self.assertIn("1/1 pruebas en verde", out)
        rc, out = self._puerta({**arbol, "scripts/puente/test_guion_x.py": guion % "2"}, ["scripts/puente/guion_x.py"])
        self.assertNotEqual(rc, 0)
        self.assertIn("FALLA valor", out)


class TestUnTimeoutDeLaTareaNoEsDelMedio(unittest.TestCase):
    """(2026-10-20, AV1011G-d1, revisor) `_primera_linea_error` trataba TODO TIMEOUT como del medio,
    y el revisor reintenta lo «del medio» sin gastar intento. Con la puerta por alcance, las
    pruebas de la tarea tardan segundos: que se agoten 120 s es un bucle o una espera sin plazo
    de la propia tarea, y reintentarla sin fin sin contar sería encubrirla."""

    ARBOL = {"scripts/protomolecula/v.py": "", "scripts/protomolecula/test_v.py": ""}

    def _con_timeout(self, archivos, tocados, plazo_agotado):
        def sh_falso(orden, cwd=None, timeout=120, env=None, log=None):
            return (124, "TIMEOUT %ss\n..E.\ndirector/orden-tareas: OSError: disco lleno\n" % timeout) if timeout == plazo_agotado else (0, "OK")

        with _arbol(archivos) as wt:
            with mock.patch.object(enjambre, "_tocados_por_la_tarea", return_value=tocados):
                with mock.patch.object(enjambre, "sh", side_effect=sh_falso):
                    return enjambre._puerta_python(wt, tid="t")

    def test_si_se_agotan_las_pruebas_de_la_tarea_es_un_fallo_de_la_tarea(self):
        import revisor_bloqueadas_logica as rev

        rc, out = self._con_timeout(self.ARBOL, ["scripts/protomolecula/v.py"], enjambre.PLAZO_PUERTA_PY_S)
        self.assertEqual(rc, 124)
        nota = enjambre._primera_linea_error(out)
        self.assertIn("test_v.py", nota)
        self.assertIn("siguen sin acabar a los 120s", nota)
        self.assertNotIn("disco lleno", nota)
        self.assertLessEqual(len(nota), 120)
        clase = rev.clase_de_fallo(nota)
        self.assertEqual(clase, "tarea:pruebas")
        self.assertFalse(rev.es_del_medio(clase))

    def test_si_se_agota_la_carpeta_entera_sigue_siendo_del_medio(self):
        import revisor_bloqueadas_logica as rev

        archivos = {"scripts/enjambre/starseed-enjambre.py": ""}
        for i in range(15):
            archivos["scripts/enjambre/test_%d.py" % i] = 'import importlib\nE = importlib.import_module("starseed-enjambre")\n'
        rc, out = self._con_timeout(archivos, ["scripts/enjambre/starseed-enjambre.py"], enjambre.PLAZO_PUERTA_PY_COMPLETA_S)
        self.assertEqual(rc, 124)
        self.assertEqual(rev.clase_de_fallo(enjambre._primera_linea_error(out)), "medio:tiempo")

    def test_varios_archivos_se_nombran_sin_pasar_de_120_caracteres(self):
        salida = "TIMEOUT-TAREA 120s " + " ".join("scripts/puente/test_modulo_%02d.py" % i for i in range(9)) + "\nbasura\n"
        nota = enjambre._primera_linea_error(salida)
        self.assertLessEqual(len(nota), 120)
        self.assertIn("test_modulo_00.py, test_modulo_01.py y 7 más", nota[:120])

    def test_el_timeout_de_la_tarea_manda_sobre_el_de_la_carpeta(self):
        salida = "TIMEOUT 600s\nruido\nTIMEOUT-TAREA 120s scripts/puente/test_a.py\n"
        self.assertIn("de la tarea", enjambre._primera_linea_error(salida))


class TestLoRealDeUnaPasadaNoLoTapaElTimeoutDeOtra(unittest.TestCase):
    """(2026-10-20, AV1011G-d1, revisor) Las líneas «TIMEOUT …» se buscaban antes que cualquier FAIL de la
    salida unida de TODAS las pasadas: si las pruebas de la tarea fallaban y la carpeta entera agotaba
    sus 600 s, la nota decía «TIMEOUT… no es un fallo de la tarea» y el revisor reintentaba sin gastar
    intento: el fallo real quedaba tapado."""

    def _arbol(self):
        archivos = {"scripts/puente/v.py": "", "scripts/puente/test_v.py": "", "scripts/enjambre/starseed-enjambre.py": ""}
        for i in range(15):
            archivos["scripts/enjambre/test_%d.py" % i] = 'import importlib\nE = importlib.import_module("starseed-enjambre")\n'
        return archivos

    def _puerta(self, orden_de_llegada):
        def sh_falso(orden, cwd=None, timeout=120, env=None, log=None):
            if timeout == enjambre.PLAZO_PUERTA_PY_COMPLETA_S:
                return 124, "TIMEOUT 600s\n..E.\ndirector/orden-tareas: OSError: disco lleno\n"
            return 1, "F\n======\nFAIL: test_valor (test_v.T)\nAssertionError: 1 != 2\n"

        tocados = ["scripts/puente/v.py", "scripts/enjambre/starseed-enjambre.py"]
        with _arbol(self._arbol()) as wt:
            with mock.patch.object(enjambre, "_tocados_por_la_tarea", return_value=tocados), \
                    mock.patch.object(enjambre, "_hay_pytest", return_value=True), \
                    mock.patch.object(enjambre, "sh", side_effect=sh_falso):
                ordenes = enjambre._ordenes_puerta_python(wt, tocados, "python3")
                if orden_de_llegada == "al reves":
                    with mock.patch.object(enjambre, "_ordenes_puerta_python", return_value=list(reversed(ordenes))):
                        return enjambre._puerta_python(wt, tid="t")
                return enjambre._puerta_python(wt, tid="t")

    def test_el_fail_de_la_tarea_manda_sobre_el_timeout_de_la_carpeta_entera(self):
        import revisor_bloqueadas_logica as rev

        for llegada in ("normal", "al reves"):
            rc, out = self._puerta(llegada)
            nota = enjambre._primera_linea_error(out)
            self.assertNotEqual(rc, 0, llegada)
            self.assertEqual(nota, "FAIL: test_valor (test_v.T)", llegada)
            self.assertFalse(rev.es_del_medio(rev.clase_de_fallo(nota)), llegada)  # es de la tarea: gasta intento

    def test_el_orden_de_las_salidas_pone_delante_lo_que_fallo_de_verdad(self):
        self.assertEqual(
            enjambre._orden_de_salidas([(0, "bien"), (124, "TIMEOUT 600s\nx"), (1, "FAIL: a"), (1, "sin pytest instalado: n")]),
            ["FAIL: a", "TIMEOUT 600s\nx", "sin pytest instalado: n", "bien"],
        )

    def test_la_nota_de_pytest_es_la_prueba_que_fallo_y_no_la_cabecera(self):
        salida = ("....F\n=================================== FAILURES ===================================\n"
                  "___ test_a ___\n=========== short test summary info ===========\n"
                  "FAILED scripts/enjambre/test_area_diseno.py::test_a - assert False\n1 failed, 4 passed in 0.1s\n")
        self.assertEqual(enjambre._primera_linea_error(salida), "FAILED scripts/enjambre/test_area_diseno.py::test_a - assert False")

    def test_dentro_de_una_pasada_agotada_el_timeout_va_antes_que_su_ruido(self):
        """Lo escribe así `sh` («TIMEOUT Ns» y luego la cola de lo impreso): el ruido con ERROR: no la tapa."""
        nota = enjambre._primera_linea_error("TIMEOUT 600s\nERROR: algo ajeno que alcanzó a imprimir\n")
        self.assertTrue(nota.startswith("TIMEOUT 600s"), nota)


class TestSinPytestEsUnFalloDelMedio(unittest.TestCase):
    """(2026-10-20, AV1011G-d1, revisor) Las pruebas con funciones sueltas necesitan pytest en cualquier máquina
    que pase la puerta, y nadie comprobaba que estuviera: la nota era «No module named pytest», que
    `clase_de_fallo` leía como tarea:pruebas y gastaba un intento por un problema del medio."""

    ARBOL = {"scripts/puente/m.py": "", "scripts/puente/test_m.py": "def test_algo():\n    assert True\n"}

    def _puerta(self, hay_pytest, arbol=None, tocados=("scripts/puente/m.py",)):
        with _arbol(arbol or self.ARBOL) as wt:
            with mock.patch.object(enjambre, "_tocados_por_la_tarea", return_value=list(tocados)), \
                    mock.patch.object(enjambre, "_hay_pytest", return_value=hay_pytest), \
                    mock.patch.object(enjambre, "sh", return_value=(0, "OK")) as sh_falso:
                rc, out = enjambre._puerta_python(wt, tid="t")
        return rc, out, sh_falso

    def test_sin_pytest_no_se_corre_ni_se_da_por_buena(self):
        rc, out, sh_falso = self._puerta(False)
        self.assertNotEqual(rc, 0)
        sh_falso.assert_not_called()
        self.assertTrue(out.startswith("sin pytest instalado: no se pudieron correr 1 pruebas (test_m.py)"), out)

    def test_la_nota_se_lee_como_fallo_del_medio_y_no_gasta_intento(self):
        import revisor_bloqueadas_logica as rev

        rc, out, _ = self._puerta(False)
        nota = enjambre._primera_linea_error(out)
        self.assertLessEqual(len(nota), 120)
        clase = rev.clase_de_fallo(nota)
        self.assertEqual(clase, "medio:dependencias")
        self.assertTrue(rev.es_del_medio(clase))
        # y el mensaje crudo de Python tampoco se culpa a la tarea
        self.assertEqual(rev.clase_de_fallo("/usr/bin/python3: No module named pytest"), "medio:dependencias")

    def test_con_pytest_corre_como_siempre(self):
        rc, out, sh_falso = self._puerta(True)
        self.assertEqual(rc, 0)
        self.assertEqual(sh_falso.call_count, 1)
        self.assertIn("pytest", sh_falso.call_args[0][0])

    def test_lo_que_no_necesita_pytest_se_corre_aunque_falte(self):
        arbol = {"scripts/puente/m.py": "", "scripts/puente/test_m.py": "import unittest\nclass T(unittest.TestCase):\n    def test_a(self):\n        pass\n"}
        rc, out, sh_falso = self._puerta(False, arbol)
        self.assertEqual(rc, 0)
        self.assertEqual(sh_falso.call_count, 1)
        self.assertNotIn("sin pytest", out)

    def test_un_fail_real_manda_sobre_la_falta_de_pytest(self):
        arbol = {
            "scripts/puente/m.py": "", "scripts/puente/test_m.py": "def test_algo():\n    assert True\n",
            "scripts/protomolecula/v.py": "",
            "scripts/protomolecula/test_v.py": "import unittest\nclass T(unittest.TestCase):\n    def test_a(self):\n        pass\n",
        }
        with _arbol(arbol) as wt:
            with mock.patch.object(enjambre, "_tocados_por_la_tarea", return_value=["scripts/puente/m.py", "scripts/protomolecula/v.py"]), \
                    mock.patch.object(enjambre, "_hay_pytest", return_value=False), \
                    mock.patch.object(enjambre, "sh", return_value=(1, "FAIL: test_a (test_v.T)\n")):
                rc, out = enjambre._puerta_python(wt, tid="t")
        self.assertNotEqual(rc, 0)
        self.assertEqual(enjambre._primera_linea_error(out), "FAIL: test_a (test_v.T)")

    def test_hay_pytest_pregunta_al_python_que_correra_las_pruebas(self):
        self.assertTrue(enjambre._hay_pytest(sys.executable))
        self.assertFalse(enjambre._hay_pytest("/no/existe/python3"))

    def test_usa_pytest_solo_si_el_corredor_es_pytest(self):
        self.assertTrue(enjambre._usa_pytest(["env", "PYTHONPATH=/x", "python3", "-m", "pytest", "-q", "a.py"]))
        self.assertTrue(enjambre._usa_pytest(["python3", "-m", "pytest", "scripts/enjambre", "-q"]))
        self.assertFalse(enjambre._usa_pytest(["python3", "-m", "unittest", "-q", "a.py"]))
        self.assertFalse(enjambre._usa_pytest(["python3", "-c", "print(1)", "-m"]))


if __name__ == "__main__":
    unittest.main()
