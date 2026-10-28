#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas de detección de Blender (BLD1025B)."""
import json
import os
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "taller-3d"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import taller as T
import deteccion as D


GB = 1024 ** 3


class Res:
    def __init__(self, rc=0, out="", err=""):
        self.returncode, self.stdout, self.stderr = rc, out, err


class Falso:
    def __init__(self, respuestas=None, ordenes=None):
        self.respuestas = respuestas or {}
        self.ordenes = []
        if ordenes is not None:
            self._ordenes = ordenes

    def __call__(self, orden, **kw):
        self.ordenes.append(list(orden))
        exe = Path(orden[0]).name
        clave = " ".join(str(o) for o in orden)
        for k, v in self.respuestas.items():
            if k in clave or (isinstance(k, tuple) and all(str(x) in clave for x in k)):
                if isinstance(v, Res):
                    return v
                if isinstance(v, Exception):
                    raise v
                return Res(0, str(v))
        # Blender version
        if exe == "blender" and "--version" in orden:
            return Res(0, "Blender 5.2.0 LTS\nbuild hash: fbe6228777e7\n")
        return Res(1, "", "")


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.raiz = Path(self.tmp.name)
        self.addCleanup(self.tmp.cleanup)

    def sistema(self, falso, plataforma="Linux", maquina="x86_64", binarios=(), entorno=None, meminfo="", disco=500):
        def leer(ruta):
            if ruta == "/proc/meminfo" and meminfo:
                return meminfo
            raise OSError(ruta)

        env = entorno or {}
        return T.Sistema(raiz=self.raiz, ejecutar=falso, plataforma=plataforma, maquina=maquina, entorno=env,
                         buscar=lambda n: f"/usr/bin/{n}" if n in binarios else None,
                         leer=leer,
                         glob=lambda p: [], disco_libre=lambda _r: disco * GB)


class DeteccionTest(Base):
    def test_sin_blender_ninguno(self):
        falso = Falso()
        s = self.sistema(falso)
        ficha = D.detectar(s)
        self.assertFalse(ficha["instalado"])
        self.assertEqual(ficha["perfil"], "ninguno")
        self.assertEqual(ficha["motores"], [])
        self.assertEqual(ficha["gpu"], [])
        self.assertEqual(ficha["v"], 1)
        self.assertIn("formatos", ficha)

    def test_version_mal_formada(self):
        class FalsoMalo(Falso):
            def __call__(self, orden, **kw):
                self.ordenes.append(list(orden))
                exe = Path(orden[0]).name
                if exe == "blender" and "--version" in orden:
                    return Res(0, "sin version aqui\n")
                return Res(1, "", "")

        falso = FalsoMalo()
        s = self.sistema(falso)
        # Simular que blender existe
        s.buscar = lambda n: "/usr/bin/blender" if n == "blender" else None
        s.existe = lambda p: str(p) == "/usr/bin/blender" or True
        ficha = D.detectar(s)
        self.assertFalse(ficha["instalado"])
        self.assertEqual(ficha["perfil"], "ninguno")

    def test_8gb_sin_gpu_ligero(self):
        falso = Falso()
        s = self.sistema(falso, plataforma="Linux", maquina="x86_64", meminfo="MemTotal: 8388608 kB\nMemAvailable: 4194304 kB\n")
        s.buscar = lambda n: "/usr/bin/blender" if n == "blender" else None
        s.existe = lambda p: True
        # Forzar lectura de recursos
        ficha = D.detectar(s)
        # Si no se pudo leer correctamente, ajustar
        if not ficha["instalado"]:
            # Simular leyendo via s.salida
            pass
        self.assertTrue(ficha["instalado"])
        self.assertEqual(ficha["perfil"], "ligero")

    def test_mac_m1_8gb_con_metal_estandar_memoria_recortada_al_50(self):
        falso = Falso()
        s = self.sistema(falso, plataforma="Darwin", maquina="arm64", meminfo="")
        s.buscar = lambda n: "/usr/bin/blender" if n == "blender" else None
        s.existe = lambda p: True
        # Simular 8GB total, 6GB libre
        s.ejecutar = lambda orden, **kw: Res(0, "8589934592\n") if orden[:2] == ["sysctl", "-n"] and len(orden) > 2 and orden[2] == "hw.memsize" else falso(orden, **kw)
        # Parchear recursos
        orig_recursos = T.recursos
        try:
            T.recursos = lambda s: {"memoria_libre_gb": 6.0}
            ficha = D.detectar(s)
        finally:
            T.recursos = orig_recursos
        self.assertTrue(ficha["instalado"])
        self.assertEqual(ficha["perfil"], "estandar")
        # memoriaMB debe estar recortada al 50% de lo libre = 50% de 6GB = 3GB = 3072 MB
        # tope estandar es 4096, min(4096, 6*512)=min(4096,3072)=3072
        caps_pura = D.perfil_de({"instalado": True, "ramLibreGB": 6.0, "hilos": 8, "ramGB": 8.0, "gpu": ["metal"]})
        self.assertEqual(caps_pura["memoriaMB"], 3072)

    def test_32gb_con_gpu_de_12gb_estudio(self):
        caps_pura = D.perfil_de({"instalado": True, "ramLibreGB": 20.0, "hilos": 16, "ramGB": 32.0, "gpu": ["cuda"], "vramGB": 12})
        self.assertEqual(caps_pura["perfil"], "estudio")

    def test_sin_rutas_absolutas_en_resultado(self):
        falso = Falso()
        s = self.sistema(falso)
        s.buscar = lambda n: "/usr/bin/blender" if n == "blender" else None
        s.existe = lambda p: True
        ficha = D.detectar(s)
        ficha_str = json.dumps(ficha)
        self.assertNotRegex(ficha_str, r'"/[^\"]+"')
        self.assertNotIn("runner", ficha_str)
        self.assertNotIn("/home/", ficha_str)

    @unittest.skipUnless(shutil.which("blender"), "no hay blender en PATH")
    def test_real_con_blender_5_2x(self):
        ficha = D.detectar()
        self.assertTrue(ficha["instalado"])
        self.assertTrue(str(ficha["version"]).startswith("5.2"))
        self.assertNotEqual(ficha["perfil"], "ninguno")
        self.assertIn("cycles-cpu", ficha["motores"])
        self.assertNotIn("eevee", ficha["motores"])  # sin GPU en caja típica


if __name__ == "__main__":
    unittest.main()
