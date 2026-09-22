# -*- coding: utf-8 -*-
"""Pruebas del cableado de `curacion_logica` dentro del vigilante.

Nada de git ni kill de verdad: `subprocess.run`, `os.kill`, `time.sleep` y las
lecturas del árbol se sustituyen por dobles. Lo único que toca disco de verdad
son los archivos temporales de la prueba del apartado (un `.new` de mentira en
un directorio temporal), porque lo que se prueba ahí es justo que se MUEVE y
no se borra.
"""

import importlib.util
import os
import shutil
import sys
import tempfile
import time
import unittest
from unittest import mock

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
if DIRECTORIO not in sys.path:
    sys.path.insert(0, DIRECTORIO)

_spec = importlib.util.spec_from_file_location(
    "vigilante_enjambre", os.path.join(DIRECTORIO, "vigilante-enjambre.py")
)
vig = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(vig)


def _trabajador(pid, tarea="tareaX", inicio=0, ultimo_byte=1800):
    return {
        "pid": pid,
        "tarea": tarea,
        "inicio": inicio,
        "ultimo_byte": ultimo_byte,
        "propio": False,
    }


class MatarColgadosTest(unittest.TestCase):
    def test_al_colgado_se_le_manda_term_a_su_pid_y_se_avisa(self):
        avisos = []
        ordenes = []
        procesos = [_trabajador(4321, ultimo_byte=0, inicio=0)]

        def _run_falso(orden, **kw):
            ordenes.append(list(orden))
            return mock.Mock(stdout="")

        with (
            mock.patch.object(vig, "listar_trabajadores", return_value=procesos),
            mock.patch.object(vig, "COLGADO_S", 1800),
            mock.patch.object(vig.subprocess, "run", side_effect=_run_falso),
            mock.patch.object(vig.os, "kill", side_effect=ProcessLookupError),
            mock.patch.object(vig.time, "sleep"),
            mock.patch.object(vig.time, "time", return_value=4000),
        ):
            vig.matar_colgados(decir=lambda msg, *a: avisos.append(msg))

        self.assertIn(["kill", "-TERM", "4321"], ordenes)
        self.assertEqual(len(avisos), 1)
        self.assertIn("tareaX", avisos[0])
        self.assertIn("min sin escribir un byte", avisos[0])

    def test_si_sobrevive_al_termina_con_kill_menos_nueve(self):
        ordenes = []
        procesos = [_trabajador(4321, ultimo_byte=0, inicio=0)]

        def _run_mock(o, **k):
            ordenes.append(list(o))
            return mock.Mock(stdout="opencode run ...")

        with (
            mock.patch.object(vig, "listar_trabajadores", return_value=procesos),
            mock.patch.object(vig, "COLGADO_S", 1800),
            mock.patch.object(
                vig.subprocess,
                "run",
                side_effect=_run_mock,
            ),
            mock.patch.object(vig.os, "kill"),  # sigue vivo: no lanza nada
            mock.patch.object(vig.time, "sleep"),
            mock.patch.object(vig.time, "time", return_value=4000),
        ):
            vig.matar_colgados(decir=lambda *a: None)
        self.assertIn(["kill", "-9", "4321"], ordenes)

    def test_si_pid_reutilizado_no_manda_kill_menos_nueve(self):
        ordenes = []
        procesos = [_trabajador(4321, ultimo_byte=0, inicio=0)]

        def _run_mock(o, **k):
            ordenes.append(list(o))
            # Si se consulta el comando del PID 4321, devuelve otro proceso distinto
            if o[:2] == ["ps", "-p"]:
                return mock.Mock(stdout="python3 /otro/proceso.py")
            return mock.Mock(stdout="")

        with (
            mock.patch.object(vig, "listar_trabajadores", return_value=procesos),
            mock.patch.object(vig, "COLGADO_S", 1800),
            mock.patch.object(vig.subprocess, "run", side_effect=_run_mock),
            mock.patch.object(vig.os, "kill"),  # no lanza excepción, parecería vivo
            mock.patch.object(vig.time, "sleep"),
            mock.patch.object(vig.time, "time", return_value=4000),
        ):
            vig.matar_colgados(decir=lambda *a: None)
        # TERM sí se envió, pero -9 NO porque el PID cambió de proceso
        self.assertIn(["kill", "-TERM", "4321"], ordenes)
        self.assertNotIn(["kill", "-9", "4321"], ordenes)

    def test_jamas_se_construye_una_orden_con_pkill(self):
        ordenes = []
        procesos = [
            _trabajador(1, ultimo_byte=0, inicio=0),  # pid bajo: ni se toca
            _trabajador(7777, ultimo_byte=0, inicio=0),
        ]
        with (
            mock.patch.object(vig, "listar_trabajadores", return_value=procesos),
            mock.patch.object(vig, "COLGADO_S", 100),
            mock.patch.object(
                vig.subprocess,
                "run",
                side_effect=lambda o, **k: ordenes.append(list(o)) or mock.Mock(),
            ),
            mock.patch.object(vig.os, "kill", side_effect=ProcessLookupError),
            mock.patch.object(vig.time, "sleep"),
            mock.patch.object(vig.time, "time", return_value=99999),
        ):
            vig.matar_colgados(decir=lambda *a: None)
        aplanado = [pieza for orden in ordenes for pieza in orden]
        self.assertNotIn("pkill", aplanado)
        # y el pid 1 (init) jamás recibe un kill
        self.assertNotIn("1", aplanado)


class CurarArbolSucioTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.tmp, ignore_errors=True)
        self._raiz = mock.patch.object(vig, "RAIZ", self.tmp)
        self._apartado = mock.patch.object(
            vig, "APARTADO", os.path.join(self.tmp, "_apartado")
        )
        self._raiz.start()
        self._apartado.start()
        self.addCleanup(mock.patch.stopall)

    def test_un_new_sin_seguimiento_se_mueve_a_apartado_y_no_se_borra(self):
        origen = os.path.join(self.tmp, "nota.new")
        with open(origen, "w", encoding="utf-8") as f:
            f.write("borrador")
        avisos = []
        llamadas = [["?? nota.new"], []]  # sucio primero, limpio después
        with mock.patch.object(vig, "_porcelain_lineas", side_effect=llamadas):
            limpio = vig.curar_arbol_sucio(decir=lambda m, *a: avisos.append(m))
        self.assertTrue(limpio)
        self.assertFalse(os.path.exists(origen))  # ya no está en el árbol
        # …pero NO se borró: vive dentro de _apartado/<fecha>/nota.new
        pisos = []
        for base, _carpetas, archivos in os.walk(os.path.join(self.tmp, "_apartado")):
            pisos.extend(os.path.join(base, a) for a in archivos)
        self.assertEqual(len(pisos), 1)
        self.assertTrue(
            pisos[0].endswith(
                os.path.join("_apartado", time.strftime("%Y-%m-%d"), "nota.new")
            )
        )
        with open(pisos[0], encoding="utf-8") as f:
            self.assertEqual(f.read(), "borrador")

    def test_con_trabajo_real_no_se_mueve_nada_y_el_aviso_lleva_la_ruta(self):
        ruta_trabajo = os.path.join(self.tmp, "src")
        os.makedirs(ruta_trabajo, exist_ok=True)
        escrito = os.path.join(ruta_trabajo, "app.ts")
        with open(escrito, "w", encoding="utf-8") as f:
            f.write("const x = 1")
        avisos = []
        with mock.patch.object(
            vig, "_porcelain_lineas", return_value=[" M src/app.ts"]
        ):
            limpio = vig.curar_arbol_sucio(decir=lambda m, *a: avisos.append(m))
        self.assertFalse(limpio)
        self.assertTrue(os.path.exists(escrito))  # intacto, donde estaba
        self.assertFalse(os.path.exists(os.path.join(self.tmp, "_apartado")))
        self.assertTrue(any("src/app.ts" in a for a in avisos))


class EsperarReintentoTest(unittest.TestCase):
    def test_corta_en_cuanto_la_causa_desaparece(self):
        # El árbol está sucio las dos primeras miradas y limpio a la tercera:
        # la pausa de 10 min no llega a cumplirse ni de lejos.
        miradas = [[" M src/app.ts"], [" M src/app.ts"], []]
        dormido = []
        with (
            mock.patch.object(vig, "_porcelain_lineas", side_effect=miradas),
            mock.patch.object(vig.time, "sleep", side_effect=dormido.append),
        ):
            vig.esperar_reintento("working tree ... cambios sin commit")
        self.assertLessEqual(len(dormido), 2)

    def test_si_la_causa_nunca_desaparece_hay_techo_en_la_pausa(self):
        dormido = []
        reloj = [1000.0]

        def _sleep_falso(s):
            dormido.append(s)
            reloj[0] += s  # cada siesta AVANZA el reloj, como en la vida real

        with (
            mock.patch.object(vig, "_porcelain_lineas", return_value=[" M src/app.ts"]),
            mock.patch.object(vig.time, "sleep", side_effect=_sleep_falso),
            mock.patch.object(vig.time, "time", side_effect=lambda: reloj[0]),
        ):
            vig.esperar_reintento("working tree ... cambios sin commit")
        esperado = vig.PAUSA_TRAS_FALLO_S // vig.INTERVALO_S
        self.assertLessEqual(len(dormido), esperado + 1)
        self.assertGreater(len(dormido), 0)  # sí hubo espera por tramos


class UltimoByteTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.tmp, ignore_errors=True)

    def test_mtime_recursivo_en_subcarpetas(self):
        # Crear subdirectorio profundo src/lib
        sub = os.path.join(self.tmp, "src", "lib")
        os.makedirs(sub, exist_ok=True)
        f_path = os.path.join(sub, "component.ts")

        # Poner carpetas en el pasado
        ahora = time.time()
        os.utime(self.tmp, (ahora - 1000, ahora - 1000))
        os.utime(os.path.join(self.tmp, "src"), (ahora - 1000, ahora - 1000))
        os.utime(sub, (ahora - 1000, ahora - 1000))

        # Crear archivo en subcarpeta con tiempo más reciente
        with open(f_path, "w", encoding="utf-8") as f:
            f.write("export const A = 1;")
        os.utime(f_path, (ahora + 5000, ahora + 5000))

        # _ultimo_byte_de debe encontrar la mtime de component.ts (ahora + 5000)
        u_byte = vig._ultimo_byte_de(self.tmp)
        self.assertEqual(u_byte, ahora + 5000)


if __name__ == "__main__":
    unittest.main()
