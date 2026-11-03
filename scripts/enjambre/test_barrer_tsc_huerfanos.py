# -*- coding: utf-8 -*-
"""El barrido de tsc huérfanos también funciona en macOS (SUP0211R, 2026-11-03).

`_barrer_tsc_huerfanos` pedía `ps -eo pid,ppid,etimes,args`; el ps de macOS NO tiene
`etimes` (imprime «keyword not found» y deja la fila sin esa columna), así que
`int(partes[2])` fallaba en cada fila y en la Mac el barrido nunca cortaba nada.
Ahora pide `etime` (`[[dd-]hh:]mm:ss`, que existe en macOS y Linux) y la conversión
vive en la función pura `segundos_de_etime`.

Test
# tdd #python
"""

import importlib.util
import os
import subprocess
import sys
import unittest
from unittest import mock

RUTA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "starseed-enjambre.py")
ESPEC = importlib.util.spec_from_file_location("enjambre", RUTA)
enjambre = importlib.util.module_from_spec(ESPEC)
sys.modules["enjambre"] = enjambre
ESPEC.loader.exec_module(enjambre)


class SegundosDeEtime(unittest.TestCase):
    def test_minutos_y_segundos(self):
        self.assertEqual(enjambre.segundos_de_etime("05:07"), 307)

    def test_horas(self):
        self.assertEqual(enjambre.segundos_de_etime("1:02:03"), 3723)

    def test_dias(self):
        self.assertEqual(enjambre.segundos_de_etime("2-03:04:05"), 183845)

    def test_cero(self):
        self.assertEqual(enjambre.segundos_de_etime("00:00"), 0)

    def test_basura_da_none(self):
        for texto in ["", "307", "abc", "x:y", "1:2:3:4", "-1:02", "5:70", None]:
            self.assertIsNone(enjambre.segundos_de_etime(texto), texto)


TSC = "/Users/alex/Documents/starseed-os-main/node_modules/typescript/bin/tsc --noEmit"


class SalidaProceso:
    def __init__(self, stdout):
        self.stdout = stdout


def barrer(tabla, vivos):
    """Corre el barrido con la tabla de ps falsa; devuelve los pids eliminados."""
    matados = []

    def falso_run(*_args, **_kwargs):
        return SalidaProceso(tabla)

    def falso_kill(pid, *_resto):
        matados.append(pid)

    with mock.patch.object(subprocess, "run", side_effect=falso_run), \
            mock.patch.object(enjambre, "_pid_vivo", side_effect=lambda p: p in vivos), \
            mock.patch.object(enjambre.os, "kill", side_effect=falso_kill), \
            mock.patch.object(enjambre, "evento"), \
            mock.patch.object(
                enjambre, "_limpiar_pesado_huerfano", return_value=False
            ):
        enjambre._barrer_tsc_huerfanos()
    return matados


class Barrido(unittest.TestCase):
    def test_corta_padre_muerto_y_mas_de_20_min_y_nada_mas(self):
        tabla = "\n".join(
            [
                "  123   999 05:07 " + TSC,
                "  124     1 0:25:00 /x/node --max-old-space-size=2560 " + TSC.split()[0] + " --noEmit",
                "  125     1 03:07 " + TSC,
                "  126   999 05:07 tail -f algo",
                "  127     1 etimes " + TSC,
                "%d     1 05:07 %s" % (os.getpid(), TSC),
            ]
        )
        matados = barrer(tabla, vivos={1})
        self.assertEqual(sorted(matados), [123, 124])

    def test_fila_sin_tiempo_se_salta_y_basura_corta_nada(self):
        self.assertEqual(barrer("", vivos={1}), [])
        self.assertEqual(barrer("abc def\n", vivos={1}), [])
        self.assertEqual(barrer("123 999 bin/tsc sans argumentos", vivos={1}), [])


if __name__ == "__main__":
    unittest.main()
