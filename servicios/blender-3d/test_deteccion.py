#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas del detector de Blender (BLD1025B) con Sistema simulado y una prueba real si hay Blender."""
import json, os, shutil, sys, tempfile, unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "taller-3d"))
import deteccion as D  # noqa: E402

GB = 1024 ** 3
VERSION = "Blender 5.2.0 LTS\n\tbuild date: 2026-07-14\n\tbuild hash: fbe6228777e7\n\tbuild type: Release\n"
SONDA = {"v": 1, "gpu": [], "gpu_utilizable": False, "ffmpeg": True, "motores": ["BLENDER_WORKBENCH", "CYCLES"]}
VM = "Mach Virtual Memory Statistics: (page size of 16384 bytes)\nPages free: 200000.\nPages inactive: 150000.\nPages speculative: 43216.\n"
MEM8 = "MemTotal: 8388608 kB\nMemAvailable: 8388608 kB\n"


class Res:
    def __init__(self, rc=0, out="", err=""):
        self.returncode, self.stdout, self.stderr = rc, out, err


class Falso:
    def __init__(self, version=VERSION, sonda=SONDA, nvidia=None, vm=VM, memsize=None):
        self.version, self.sonda, self.nvidia, self.vm, self.memsize = version, sonda, nvidia, vm, memsize

    def __call__(self, orden, **kw):
        exe = Path(orden[0]).name
        if "--version" in orden:
            return Res(0, self.version)
        if "-P" in orden:
            return Res(0, "STARSEED_SONDA:" + json.dumps(self.sonda) + "\n") if self.sonda else Res(1)
        if exe == "nvidia-smi":
            if self.nvidia is None:
                raise FileNotFoundError(2, "No such file", "nvidia-smi")
            return Res(0, f"{self.nvidia}\n")
        if exe == "vm_stat":
            return Res(0, self.vm)
        if orden[:2] == ["sysctl", "-n"]:
            return Res(0, f"{self.memsize}\n" if self.memsize and orden[2] == "hw.memsize" else "1\n")
        if exe == "pmset":
            return Res(0, "Now drawing from 'AC Power'\n")
        return Res(1)


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.raiz = Path(self.tmp.name)
        self.addCleanup(self.tmp.cleanup)

    def sistema(self, falso, plataforma="Linux", maquina="x86_64", meminfo=MEM8, binarios=(), entorno=None, hilos=8):
        def leer(ruta):
            if ruta == "/proc/meminfo" and meminfo:
                return meminfo
            if ruta == "/proc/pressure/memory":
                return "some avg10=0.00 avg60=0.00 avg300=0.00 total=0\n"
            raise OSError(ruta)
        s = D.Sistema(raiz=self.raiz, ejecutar=falso, plataforma=plataforma, maquina=maquina,
                      entorno={"HOME": str(self.raiz), **(entorno or {})}, leer=leer,
                      buscar=lambda n: f"/usr/bin/{n}" if n in binarios else None, glob=lambda _p: [])
        s.hilos = hilos
        return s


class Deteccion(Base):
    def test_sin_blender_da_ninguno(self):
        f = D.detectar(self.sistema(Falso()))
        self.assertEqual((f["instalado"], f["perfil"], f["motores"], f["version"]), (False, "ninguno", [], None))

    def test_version_mal_formada_da_ninguno(self):
        f = D.detectar(self.sistema(Falso(version="Blender raro\n"), binarios=("blender",)))
        self.assertTrue(f["instalado"])
        self.assertIsNone(f["version"])
        self.assertEqual(f["perfil"], "ninguno")

    def test_8gb_sin_gpu_es_ligero(self):
        f = D.detectar(self.sistema(Falso(), binarios=("blender",), hilos=2))
        self.assertEqual(f["perfil"], "ligero")
        self.assertEqual(f["motores"], ["workbench", "cycles-cpu"])

    def test_mac_m1_8gb_con_metal_es_estandar_y_recorta(self):
        f = D.detectar(self.sistema(Falso(memsize=8 * GB), plataforma="Darwin", maquina="arm64", binarios=("blender",)))
        self.assertEqual((f["perfil"], f["gpu"], f["ramLibreGB"]), ("estandar", ["metal"], 6.0))
        p = D.perfil_de({"instalado": True, "gpu": ["metal"], "ramLibreGB": 6.0, "hilos": 8})
        self.assertEqual(p["topes"]["memoriaMB"], 3072)

    def test_32gb_con_gpu_de_12gb_es_estudio(self):
        p = D.perfil_de({"instalado": True, "gpu": ["cuda"], "vramGB": 12, "ramLibreGB": 32.0, "hilos": 8})
        self.assertEqual((p["perfil"], p["topes"]["memoriaMB"]), ("estudio", 8192))

    def test_sin_rutas_absolutas(self):
        f = D.detectar(self.sistema(Falso(), binarios=("blender",)))
        texto = json.dumps(f)
        for prohibido in ("/usr/bin", str(self.raiz), "/home/"):
            self.assertNotIn(prohibido, texto)

    def test_variable_explicita_manda(self):
        binario = self.raiz / "blender"
        binario.write_text("")
        s = self.sistema(Falso(), entorno={"STARSEED_BLENDER": str(binario)}, binarios=("blender",))
        self.assertEqual(D.buscar_blender(s), str(binario))

    @unittest.skipUnless(shutil.which("blender"), "Blender no está instalado en esta máquina")
    def test_blender_de_verdad(self):
        s = D.Sistema(entorno={**os.environ, "HOME": str(self.raiz)})
        f = D.detectar(s)
        self.assertTrue(f["version"].startswith("5.2."))
        self.assertNotEqual(f["perfil"], "ninguno")
        self.assertIn("cycles-cpu", f["motores"])
        if not f["gpu"]:
            self.assertNotIn("eevee", f["motores"])


if __name__ == "__main__":
    unittest.main()
