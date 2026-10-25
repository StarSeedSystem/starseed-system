#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas del detector de Blender (BLD1025B). Simula la máquina; la prueba real se salta sin Blender.

Uso: python3 -m unittest servicios/blender-3d/test_deteccion.py
"""
import json, shutil, stat, sys, tempfile, unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import deteccion as D  # noqa: E402
import taller as T  # noqa: E402

GB = 1024 ** 3
SONDA = {"tipos": ["CUDA", "OptiX", "HIP", "oneAPI"], "dispositivos": [], "ffmpeg": True,
         "motores": ["BLENDER_WORKBENCH", "CYCLES", "BLENDER_EEVEE"], "gpu": False}
VERSION = "Blender 5.2.0 LTS\n\tbuild date: 2026-07-14\n\tbuild hash: fbe6228777e7\n\tbuild platform: Linux\n"
VM_STAT = "Mach Virtual Memory Statistics: (page size of 16384 bytes)\nPages free: {n}.\nPages inactive: 0.\nPages speculative: 0.\n"


class Res:
    def __init__(self, rc=0, out=""):
        self.returncode, self.stdout, self.stderr = rc, out, ""


class Falso:
    """Subproceso simulado: versión, sonda, memoria, GPU y presión, sin tocar la máquina."""

    def __init__(self, memsize=8 * GB, libre_gb=4, vram_mib=None, version=VERSION, sonda=None, presion="1"):
        self.memsize, self.libre_gb, self.vram_mib = memsize, libre_gb, vram_mib
        self.version, self.sonda, self.presion, self.ordenes = version, sonda, presion, []

    def __call__(self, orden, **kw):
        self.ordenes.append(list(orden))
        exe = Path(orden[0]).name
        if "--version" in orden:
            return Res(0, self.version)
        if "-P" in orden:
            return Res(0, "ruido\nSTARSEED_SONDA:" + json.dumps(self.sonda if self.sonda is not None else SONDA) + "\n")
        if exe == "sysctl" and orden[2] == "hw.memsize":
            return Res(0, f"{self.memsize}\n")
        if exe == "sysctl":
            return Res(0, self.presion + "\n")
        if exe == "nvidia-smi":
            if self.vram_mib is None:
                raise FileNotFoundError(2, "No such file", "nvidia-smi")
            return Res(0, f"{self.vram_mib}\n")
        if exe == "vm_stat":
            return Res(0, VM_STAT.format(n=self.libre_gb * GB // 16384))
        if exe == "pmset":
            return Res(0, "Now drawing from 'AC Power'\n")
        return Res(0)


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.raiz = Path(self.tmp.name)
        self.addCleanup(self.tmp.cleanup)
        self.blender = self.raiz / "blender"
        self.blender.write_text("")
        self.estado = self.raiz / "estado"

    def sistema(self, falso, plataforma="Darwin", maquina="arm64", entorno=None, binarios=(), meminfo=""):
        def leer(ruta):
            if ruta == "/proc/meminfo" and meminfo:
                return meminfo
            if ruta == "/proc/pressure/memory":
                return "some avg10=0.00 avg60=0.00 avg300=0.00 total=0\n"
            raise OSError(ruta)
        env = {"STARSEED_BLENDER": str(self.blender), "STARSEED_BLENDER_DIR": str(self.estado), **(entorno or {})}
        return T.Sistema(raiz=self.raiz, ejecutar=falso, plataforma=plataforma, maquina=maquina, entorno=env,
                         buscar=lambda n: f"/usr/bin/{n}" if n in binarios else None, leer=leer,
                         glob=lambda _p: [])


class Casos(Base):
    def test_sin_blender_ni_version(self):
        self.blender.unlink()
        caps = D.detectar(self.sistema(Falso()))
        self.assertEqual((caps["instalado"], caps["perfil"], caps["motores"], caps["version"]), (False, "ninguno", [], None))
        self.blender.write_text(""); caps = D.detectar(self.sistema(Falso(version="Blender rota\n")))
        self.assertEqual((caps["instalado"], caps["perfil"], caps["version"]), (False, "ninguno", None))

    def test_8gb_sin_gpu_es_ligero(self):
        caps = D.detectar(self.sistema(Falso(memsize=8 * GB, libre_gb=5), "Linux", "x86_64", meminfo="MemTotal: 8388608 kB\nMemAvailable: 5242880 kB\n"))
        self.assertEqual(caps["perfil"], "ligero")
        self.assertEqual(caps["motores"], ["workbench", "cycles-cpu"])
        self.assertNotIn("eevee", caps["motores"])

    def test_mac_m1_8gb_con_metal_es_estandar_y_recorta(self):
        falso = Falso(memsize=8 * GB, libre_gb=4, sonda={**SONDA, "dispositivos": ["METAL"], "gpu": True})
        caps = D.detectar(self.sistema(falso))
        self.assertEqual((caps["perfil"], caps["gpu"]), ("estandar", ["metal"]))
        self.assertEqual(D.perfil_de({**caps, "vramGB": None})["memoriaMB"], 2048)
        self.assertIn("eevee", caps["motores"])

    def test_32gb_con_gpu_de_12gb_es_estudio(self):
        falso = Falso(memsize=32 * GB, libre_gb=20, vram_mib=12288, sonda={**SONDA, "dispositivos": ["CUDA"], "gpu": True})
        caps = D.detectar(self.sistema(falso, "Linux", "x86_64", meminfo="MemTotal: 33554432 kB\nMemAvailable: 20971520 kB\n"))
        self.assertEqual((caps["perfil"], caps["gpu"]), ("estudio", ["cuda"]))
        self.assertIn("cycles-gpu", caps["motores"])

    def test_sin_rutas_absolutas_y_cache_600(self):
        falso = Falso(memsize=8 * GB, libre_gb=5); s = self.sistema(falso)
        caps = D.detectar(s)
        self.assertNotIn("/", json.dumps(caps, ensure_ascii=False))
        D.detectar(s)
        self.assertEqual(stat.S_IMODE((self.estado / "sonda.json").stat().st_mode), 0o600)
        self.assertEqual(len([o for o in falso.ordenes if "-P" in o]), 1)


@unittest.skipUnless(shutil.which("blender"), "Blender no está instalado en esta máquina")
class Real(unittest.TestCase):
    def test_blender_de_verdad(self):
        caps = D.detectar()
        self.assertTrue(caps["instalado"] and caps["version"].startswith("5.2."))
        self.assertNotEqual(caps["perfil"], "ninguno")
        self.assertIn("cycles-cpu", caps["motores"])
        if not caps["gpu"]: self.assertNotIn("eevee", caps["motores"])
