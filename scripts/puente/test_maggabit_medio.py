# -*- coding: utf-8 -*-
"""Pruebas herméticas del estado del medio Maggabit (MAG1117).

Nada aquí toca /Volumes, la red ni el disco real: la función pura se prueba con datos de
mentira y la capa fina con un `correr` falso que registra órdenes y topes de tiempo.
"""
import json
import os
import plistlib
import subprocess
import sys
import unittest

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
if DIRECTORIO not in sys.path:
    sys.path.insert(0, DIRECTORIO)

import maggabit_medio as M  # noqa: E402

BUENO = {"VolumeUUID": M.UUID_VOLUMEN, "FilesystemType": "exfat", "VolumeName": "Maggabit"}
OTRO = {"VolumeUUID": "00000000-0000-0000-0000-000000000000", "FilesystemType": "exfat",
        "VolumeName": "Maggabit"}


class Resultado:
    def __init__(self, salida=b"", codigo=0):
        self.stdout = salida
        self.stderr = b""
        self.returncode = codigo


class Corredor:
    """Doble de `subprocess.run`: responde por orden y apunta órdenes y topes."""

    def __init__(self, respuestas):
        self.respuestas = respuestas
        self.llamadas = []

    def __call__(self, orden, capture_output=True, timeout=None):
        self.llamadas.append((list(orden), timeout))
        respuesta = self.respuestas.get(orden[0], Resultado(b"", 1))
        if isinstance(respuesta, Exception):
            raise respuesta
        return respuesta


class TestEstadoMedio(unittest.TestCase):
    def test_disco_bueno(self):
        r = M.estado_medio(BUENO, [M.RAIZ, M.TRABAJO, M.BOVEDA],
                           {M.RAIZ: 120.0, M.TRABAJO: 40.5}, True, True)
        self.assertEqual(r["estado"], "listo")
        self.assertTrue(r["presente"])
        self.assertEqual(r["sistema"], "exfat")
        self.assertTrue(r["trabajo_montado"])
        self.assertEqual(r["boveda"], "abierta")
        self.assertEqual(r["libre_gb"], 120.0)
        self.assertEqual(r["libre_trabajo_gb"], 40.5)

    def test_otro_disco_con_el_mismo_nombre(self):
        r = M.estado_medio(OTRO, [M.RAIZ, M.TRABAJO], {M.RAIZ: 999.0}, True, True)
        self.assertFalse(r["presente"])
        self.assertEqual(r["estado"], "otro-disco")
        self.assertIsNone(r["libre_gb"])
        self.assertIsNone(r["libre_trabajo_gb"])

    def test_ausente(self):
        r = M.estado_medio(None, [], {}, False)
        self.assertEqual(r, {"presente": False, "sistema": None, "trabajo_montado": False,
                             "boveda": "sin-crear", "libre_gb": None,
                             "libre_trabajo_gb": None, "estado": "ausente"})

    def test_sin_imagen_por_no_estar_montada(self):
        r = M.estado_medio(BUENO, [M.RAIZ], {M.RAIZ: 8.0}, False)
        self.assertEqual(r["estado"], "sin-imagen")
        self.assertFalse(r["trabajo_montado"])
        self.assertEqual(r["libre_gb"], 8.0)
        self.assertIsNone(r["libre_trabajo_gb"])

    def test_sin_imagen_dicha_explicitamente(self):
        r = M.estado_medio(BUENO, [M.RAIZ, M.TRABAJO], {}, False, existe_imagen=False)
        self.assertEqual(r["estado"], "sin-imagen")

    def test_boveda_abierta(self):
        r = M.estado_medio(BUENO, [M.RAIZ, M.TRABAJO, M.BOVEDA], {}, True, True)
        self.assertEqual(r["boveda"], "abierta")
        self.assertEqual(r["estado"], "listo")

    def test_boveda_cerrada(self):
        r = M.estado_medio(BUENO, [M.RAIZ, M.TRABAJO], {}, True, True)
        self.assertEqual(r["boveda"], "cerrada")
        self.assertEqual(r["estado"], "listo")

    def test_boveda_sin_crear(self):
        r = M.estado_medio(BUENO, [M.RAIZ, M.TRABAJO], {}, False, True)
        self.assertEqual(r["boveda"], "sin-crear")


class NuncaCorre:
    def __call__(self, *args, **kwargs):
        raise AssertionError("no debía lanzarse ninguna orden")


class TestLeer(unittest.TestCase):
    def test_disco_ausente_no_lanza_nada(self):
        r = M.leer(correr=NuncaCorre(), existe=lambda _p: False)
        self.assertEqual(r["estado"], "ausente")

    def test_timeout_de_diskutil(self):
        correr = Corredor({"diskutil": subprocess.TimeoutExpired("diskutil", 5)})
        r = M.leer(correr=correr, tope_s=5, existe=lambda _p: True)
        self.assertEqual(r, {"estado": "sin-respuesta"})
        self.assertEqual(len(correr.llamadas), 1)

    def test_timeout_de_mount(self):
        correr = Corredor({"diskutil": Resultado(plistlib.dumps(BUENO)),
                           "mount": subprocess.TimeoutExpired("mount", 5)})
        r = M.leer(correr=correr, tope_s=5, existe=lambda _p: True)
        self.assertEqual(r, {"estado": "sin-respuesta"})
        self.assertEqual(len(correr.llamadas), 2)

    def test_todo_subprocess_lleva_tope(self):
        correr = Corredor({"diskutil": Resultado(plistlib.dumps(BUENO)),
                           "mount": Resultado(b"")})
        M.leer(correr=correr, tope_s=7, existe=lambda p: p == M.RAIZ, libre=lambda _p: 1.0)
        self.assertEqual([t for _o, t in correr.llamadas], [7, 7])
        self.assertEqual([o for o, _t in correr.llamadas],
                         [["diskutil", "info", "-plist", M.RAIZ], ["mount"]])

    def test_medio_bueno(self):
        montaje = ("/dev/disk4s1 on /Volumes/Maggabit (exfat, local)\n"
                   "/dev/disk5s1 on /Volumes/MaggabitTrabajo (apfs, local)\n")
        correr = Corredor({"diskutil": Resultado(plistlib.dumps(BUENO)),
                           "mount": Resultado(montaje.encode())})
        r = M.leer(correr=correr, tope_s=3, existe=lambda _p: True,
                   libre=lambda _p: 200.0)
        self.assertEqual(r["estado"], "listo")
        self.assertEqual(r["boveda"], "cerrada")
        self.assertEqual(r["libre_gb"], 200.0)
        self.assertEqual(r["libre_trabajo_gb"], 200.0)

    def test_plist_ilegible_con_disco_montado_es_otro_disco(self):
        correr = Corredor({"diskutil": Resultado(b"no es un plist"),
                           "mount": Resultado(b"/dev/disk9s1 on /Volumes/Maggabit (exfat)\n")})
        r = M.leer(correr=correr, existe=lambda _p: True)
        self.assertEqual(r["estado"], "otro-disco")
        self.assertFalse(r["presente"])


class TestOrden(unittest.TestCase):
    def test_estado_imprime_json(self):
        capturado = []
        codigo = M.main([], leer_fn=lambda: {"estado": "listo"}, salida=capturado.append)
        self.assertEqual(codigo, 0)
        self.assertEqual(json.loads(capturado[0]), {"estado": "listo"})

    def test_orden_desconocida(self):
        capturado = []
        codigo = M.main(["otra"], leer_fn=lambda: {}, salida=capturado.append)
        self.assertEqual(codigo, 2)
        self.assertEqual(capturado, [])


if __name__ == "__main__":
    unittest.main()
