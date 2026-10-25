#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas del detector de Blender (BLD1025B): máquina SIMULADA y una prueba real si hay Blender.

Uso: python3 -m unittest servicios/blender-3d/test_deteccion.py
"""
import json, shutil, sys, tempfile, unittest
from pathlib import Path

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))
sys.path.insert(0, str(AQUI.parent / "taller-3d"))
import deteccion as D  # noqa: E402
import taller as T  # noqa: E402

GB = 1024 ** 3
CLAVES = {"v", "instalado", "version", "hash", "serie", "perfil", "motores", "gpu", "hilos",
          "ramGB", "ramLibreGB", "formatos", "visto"}
VERSION = "Blender 5.2.0 LTS\n\tbuild date: 2026-07-14\n\tbuild hash: fbe6228777e7\n\tbuild type: Release\n"
CPU = {"tipos": ["CPU"], "dispositivos": ["CPU"], "ffmpeg": True, "motores": ["CYCLES"], "gpu": False}
METAL = {"tipos": ["METAL"], "dispositivos": ["METAL"], "ffmpeg": True, "motores": ["CYCLES"], "gpu": True}
CUDA = {"tipos": ["CUDA", "OPTIX"], "dispositivos": ["CUDA", "OPTIX"], "ffmpeg": True, "motores": ["CYCLES"], "gpu": True}
class Res:
    def __init__(self, rc=0, out="", err=""):
        self.returncode, self.stdout, self.stderr = rc, out, err


def vm(libre_gb):
    paginas = int(libre_gb * GB / 16384)
    return f"Mach Virtual Memory Statistics: (page size of 16384 bytes)\nPages free: {paginas}.\nPages inactive: 0.\nPages speculative: 0.\n"


class Maquina:
    """Subproceso simulado: versión, sonda, memoria y GPU; nada de Blender de verdad."""
    def __init__(self, version=None, sonda=None, memsize=8, libre=4, nvidia=None):
        self.version, self.sonda, self.memsize, self.libre, self.nvidia = version, sonda, memsize, libre, nvidia
        self.ordenes = []

    def __call__(self, orden, **kw):
        self.ordenes.append(list(orden))
        if orden[1:2] == ["--version"]:
            return Res(0, self.version) if self.version else Res(1, "", "no arranca")
        if "-P" in orden:
            return Res(0, "STARSEED_SONDA:" + json.dumps(self.sonda)) if self.sonda else Res(3, "", "sonda rota")
        exe = Path(orden[0]).name
        if exe == "nvidia-smi":
            if self.nvidia is None:
                raise FileNotFoundError(2, "no", "nvidia-smi")
            return Res(0, f"{self.nvidia}\n")
        if exe == "sysctl" and orden[-1] == "hw.memsize":
            return Res(0, f"{self.memsize * GB}\n")
        if exe == "sysctl":
            return Res(0, "1\n")
        if exe == "vm_stat":
            return Res(0, vm(self.libre))
        if exe == "pmset":
            return Res(0, "Now drawing from 'AC Power'\n")
        return Res(1, "", "no")


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.raiz = Path(self.tmp.name)
        self.b = self.raiz / "blender"
        self.b.write_text("#!/bin/sh\nexit 0\n")
        self.b.chmod(0o755)

    def ficha(self, maquina, hay=True):
        entorno = {"HOME": str(self.raiz / "home")}
        s = T.Sistema(raiz=self.raiz, ejecutar=maquina, plataforma="Darwin", maquina="arm64", entorno=entorno,
                      buscar=lambda n: str(self.b) if hay and n == "blender" else None,
                      leer=lambda r: (_ for _ in ()).throw(OSError(r)), glob=lambda _p: [])
        return D.detectar(s)
class Deteccion(Base):
    def test_sin_blender_es_ninguno(self):
        c = self.ficha(Maquina(), hay=False)
        self.assertEqual((c["perfil"], c["instalado"], c["motores"]), ("ninguno", False, []))
        self.assertEqual(set(c), CLAVES)
    def test_version_mal_formada_no_lanza(self):
        c = self.ficha(Maquina(version="Blender sin números\n", sonda=CPU))
        self.assertEqual((c["perfil"], c["version"]), ("ninguno", None))
    def test_8gb_sin_gpu_es_ligero(self):
        c = self.ficha(Maquina(version=VERSION, sonda=CPU, memsize=8, libre=3))
        self.assertEqual((c["perfil"], c["gpu"]), ("ligero", []))
        self.assertNotIn("eevee", c["motores"])
        self.assertEqual(D.perfil_de({**c, "vramGB": None})["memoriaMB"], 1536)
    def test_mac_m1_8gb_con_metal_es_estandar_y_recorta_memoria(self):
        c = self.ficha(Maquina(version=VERSION, sonda=METAL, memsize=8, libre=4))
        self.assertEqual((c["perfil"], c["gpu"]), ("estandar", ["metal"]))
        self.assertIn("eevee", c["motores"])
        self.assertEqual(D.perfil_de({**c, "vramGB": None})["memoriaMB"], 2048)
    def test_32gb_con_gpu_12gb_es_estudio(self):
        c = self.ficha(Maquina(version=VERSION, sonda=CUDA, memsize=32, libre=20, nvidia=12288))
        self.assertEqual((c["perfil"], c["gpu"]), ("estudio", ["cuda", "optix"]))
        self.assertEqual(D.perfil_de({**c, "vramGB": 12})["memoriaMB"], 8192)
    def test_sin_rutas_absolutas_ni_usuario(self):
        c = self.ficha(Maquina(version=VERSION, sonda=METAL, memsize=8, libre=4))
        textos = []
        def recorrer(x):
            if isinstance(x, dict): [recorrer(v) for v in x.values()]
            elif isinstance(x, list): [recorrer(v) for v in x]
            else: textos.append(str(x))
        recorrer(c)
        self.assertFalse([t for t in textos if t.startswith("/") or str(self.raiz) in t])

    @unittest.skipUnless(shutil.which("blender"), "Blender no está instalado en esta máquina")
    def test_blender_de_verdad(self):
        s = T.Sistema(entorno={"HOME": str(self.raiz / "home"), "TMPDIR": tempfile.gettempdir()})
        ruta = D.buscar_blender(s)
        self.assertTrue(ruta)
        v = D.leer_version(ruta, s)
        self.assertIsNotNone(v)
        self.assertTrue(v["version"].startswith("5.2."))
        c = D.detectar(s)
        self.assertNotEqual(c["perfil"], "ninguno")
        self.assertIn("cycles-cpu", c["motores"])
        if not c["gpu"]: self.assertNotIn("eevee", c["motores"])
