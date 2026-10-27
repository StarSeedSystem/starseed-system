#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas de la detección de Blender (BLD1025B) con `Sistema` simulado.
Uso: python3 -m unittest servicios/blender-3d/test_deteccion.py
La última clase habla con el Blender de verdad y se salta si no está en el PATH.
"""
import json, os, shutil, sys, tempfile, unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "taller-3d"))
import deteccion as D  # noqa: E402
import taller as T  # noqa: E402
VERSION = "Blender 5.2.0 LTS\nbuild hash: fbe6228777e7\n"
VM_STAT = "Mach Virtual Memory Statistics: (page size of 16384 bytes)\nPages free: 100000.\nPages inactive: 100000.\nPages speculative: 62144.\n"

class Res:
    def __init__(self, rc=0, out=""):
        self.returncode, self.stdout, self.stderr = rc, out, ""

class Falso:
    def __init__(self, version=VERSION, memsize=None, nvidia_mib=None, sonda=None):
        self.version, self.memsize, self.nvidia_mib, self.sonda = version, memsize, nvidia_mib, sonda
    def __call__(self, orden, **kw):
        exe = Path(orden[0]).name
        if "--version" in orden:
            return Res(0, self.version) if self.version is not None else Res(1)
        if orden[:3] == ["sysctl", "-n", "hw.memsize"]:
            return Res(0, "%d\n" % self.memsize) if self.memsize else Res(1)
        if exe == "nvidia-smi":
            if self.nvidia_mib is None:
                raise FileNotFoundError(2, "No such file", "nvidia-smi")
            return Res(0, "%d\n" % self.nvidia_mib)
        if exe == "vm_stat":
            return Res(0, VM_STAT)
        if any(str(a).endswith("sonda_blender.py") for a in orden):
            return Res(0, "STARSEED_SONDA:" + json.dumps(self.sonda) + "\n") if self.sonda else Res(1)
        return Res(0, "")

class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.raiz = Path(self.tmp.name)
        self.addCleanup(self.tmp.cleanup)
    def instalar(self):
        ruta = self.raiz / "blender"
        ruta.write_text("#!/bin/sh\n")
        return {"STARSEED_BLENDER": str(ruta)}
    def meminfo(self, total, libre):
        return "MemTotal: %d kB\nMemAvailable: %d kB\n" % (total * 1048576, libre * 1048576)
    def sistema(self, falso, plataforma="Linux", maquina="x86_64", entorno=None, meminfo="", hilos=None):
        def leer(ruta):
            if ruta == "/proc/meminfo" and meminfo:
                return meminfo
            raise OSError(ruta)
        s = T.Sistema(raiz=self.raiz, ejecutar=falso, plataforma=plataforma, maquina=maquina,
                      entorno={"HOME": str(self.raiz), **(entorno or {})}, leer=leer,
                      buscar=lambda _n: None, glob=lambda _p: [])
        s.hilos = hilos or 2
        return s

class Deteccion(Base):
    def test_sin_blender_da_ninguno(self):
        c = D.detectar(self.sistema(Falso()))
        self.assertFalse(c["instalado"])
        self.assertEqual(c["perfil"], "ninguno")
        self.assertEqual((c["motores"], c["gpu"]), ([], []))
    def test_version_mal_formada_es_ninguno(self):
        c = D.detectar(self.sistema(Falso(version="esto no es Blender\n"), entorno=self.instalar()))
        self.assertFalse(c["instalado"])
        self.assertEqual(c["perfil"], "ninguno")
    def test_ocho_gb_sin_gpu_es_ligero(self):
        sonda = {"tipos": [], "dispositivos": [], "ffmpeg": True, "motores": ["workbench", "cycles-cpu"], "gpu": False}
        s = self.sistema(Falso(sonda=sonda), entorno=self.instalar(), meminfo=self.meminfo(8, 4), hilos=8)
        c = D.detectar(s)
        self.assertEqual(c["perfil"], "ligero")
        self.assertEqual((c["ramGB"], c["ramLibreGB"]), (8.0, 4.0))
        self.assertIn("cycles-cpu", c["motores"])
        self.assertNotIn("eevee", c["motores"])
    def test_mac_m1_ocho_gb_con_metal_es_estandar_y_recorta_memoria(self):
        sonda = {"tipos": ["METAL"], "dispositivos": ["METAL"], "ffmpeg": True,
                 "motores": ["workbench", "cycles-cpu", "cycles-gpu", "eevee"], "gpu": True}
        s = self.sistema(Falso(memsize=8 * 1024 ** 3, sonda=sonda), plataforma="Darwin", maquina="arm64",
                         entorno=self.instalar(), hilos=8)
        c = D.detectar(s)
        self.assertEqual(c["perfil"], "estandar")
        self.assertIn("metal", c["gpu"])
        p = D.perfil_de({"instalado": True, "gpu": c["gpu"], "ramLibreGB": c["ramLibreGB"], "hilos": 8})
        self.assertEqual((p["perfil"], p["topes"]["memoriaMB"]), ("estandar", 2048))
    def test_treinta_y_dos_gb_con_gpu_de_doce_es_estudio(self):
        sonda = {"tipos": ["CUDA", "OPTIX"], "dispositivos": ["CUDA"], "ffmpeg": True,
                 "motores": ["workbench", "cycles-cpu", "cycles-gpu", "eevee"], "gpu": True}
        s = self.sistema(Falso(nvidia_mib=12288, sonda=sonda), entorno=self.instalar(),
                         meminfo=self.meminfo(32, 24), hilos=8)
        c = D.detectar(s)
        self.assertEqual(c["perfil"], "estudio")
        self.assertIn("cuda", c["gpu"])
        self.assertIn("cycles-gpu", c["motores"])
    def test_resultado_sin_rutas_absolutas(self):
        c = D.detectar(self.sistema(Falso(nvidia_mib=12288, sonda={"tipos": ["CUDA"], "gpu": True}),
                                    entorno=self.instalar(), meminfo=self.meminfo(32, 24)))
        texto = json.dumps(c, ensure_ascii=False)
        for ruta in (str(self.raiz), "/Users/", "/home/"):
            self.assertNotIn(ruta, texto)
@unittest.skipUnless(shutil.which("blender"), "sin Blender en PATH")
class BlenderReal(Base):
    def test_ficha_real(self):
        s = T.Sistema(raiz=self.raiz, entorno={"HOME": str(self.raiz), "PATH": os.environ.get("PATH", "")})
        c = D.detectar(s)
        self.assertTrue(c["instalado"])
        self.assertTrue((c["version"] or "").startswith("5.2."))
        self.assertNotEqual(c["perfil"], "ninguno")
        self.assertIn("cycles-cpu", c["motores"])
        if not c["gpu"]:
            self.assertNotIn("eevee", c["motores"])

if __name__ == "__main__":
    unittest.main()
