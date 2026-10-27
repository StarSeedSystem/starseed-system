#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas de la detección de Blender (BLD1025B), con `Sistema` simulado y sin red.

Uso: python3 -m unittest servicios/blender-3d/test_deteccion.py
"""
import json, shutil, sys, tempfile, unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "taller-3d"))
import deteccion as D  # noqa: E402
import taller as T  # noqa: E402

GB = 1024 ** 3
VM = "Mach Virtual Memory Statistics: (page size of 16384 bytes)\nPages free: 200000.\nPages inactive: 50000.\nPages speculative: 12144.\n"


class Res:
    def __init__(self, rc=0, out=""):
        self.returncode, self.stdout, self.stderr = rc, out, ""


class Falso:
    """Subproceso simulado: versión, sonda, memoria y GPU; nunca ejecuta nada de verdad."""

    def __init__(self, version=None, sonda=None, memsize=None, meminfo="", nvidia_mib=None):
        self.version, self.sonda, self.memsize = version, sonda, memsize
        self.meminfo, self.nvidia_mib, self.ordenes = meminfo, nvidia_mib, []

    def __call__(self, orden, **kw):
        self.ordenes.append(list(orden))
        if "--version" in orden:
            return Res(0, self.version) if self.version else Res(1)
        if "-P" in orden:
            return Res(0, "STARSEED_SONDA:" + json.dumps(self.sonda or {}) + "\n")
        if orden[:2] == ["sysctl", "-n"] and orden[2] == "hw.memsize":
            return Res(0, f"{self.memsize}\n") if self.memsize else Res(1)
        if orden[:2] == ["sysctl", "-n"]:
            return Res(0, "1\n")
        if Path(orden[0]).name == "nvidia-smi":
            if self.nvidia_mib is None:
                raise FileNotFoundError(2, "No such file", "nvidia-smi")
            return Res(0, f"{self.nvidia_mib}\n")
        if Path(orden[0]).name == "vm_stat":
            return Res(0, VM)
        return Res(0)


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.raiz = Path(self.tmp.name) / ".starseed" / "taller-3d"

    def sistema(self, falso, plataforma="Linux", maquina="x86_64", binarios=(), entorno=None):
        def leer(ruta):
            if ruta == "/proc/meminfo" and falso.meminfo:
                return falso.meminfo
            if ruta == "/proc/pressure/memory":
                return "some avg10=0.00 avg60=0.00 avg300=0.00 total=0\n"
            raise OSError(ruta)
        return T.Sistema(raiz=self.raiz, ejecutar=falso, plataforma=plataforma, maquina=maquina,
                         entorno=entorno or {}, buscar=lambda n: f"/usr/bin/{n}" if n in binarios else None,
                         leer=leer, glob=lambda _p: [], disco_libre=lambda _r: 500 * GB)

    def con_blender(self, falso, **kw):
        exe = Path(self.tmp.name) / "bin" / "blender"
        exe.parent.mkdir(parents=True, exist_ok=True)
        exe.write_text("")
        return self.sistema(falso, entorno={"STARSEED_BLENDER": str(exe), "PATH": "/usr/bin:/bin"}, **kw)

class Deteccion(Base):
    def test_sin_blender_es_ninguno(self):
        ficha = D.detectar(self.sistema(Falso()))
        self.assertFalse(ficha["instalado"]); self.assertEqual(ficha["perfil"], "ninguno")
        self.assertEqual(ficha["motores"], []); self.assertIsNone(ficha["version"])

    def test_version_mal_formada_no_arranca(self):
        ficha = D.detectar(self.con_blender(Falso(version="Blender compilado raro\n")))
        self.assertFalse(ficha["instalado"]); self.assertEqual(ficha["perfil"], "ninguno")

    def test_8gb_sin_gpu_es_ligero(self):
        falso = Falso(version="Blender 5.2.0 LTS\nbuild hash: fbe6228777e7\n", sonda={"gpu": [], "motores": ["workbench", "cycles-cpu"]},
                      meminfo="MemTotal: 8388608 kB\nMemAvailable: 4194304 kB\n")
        ficha = D.detectar(self.con_blender(falso))
        self.assertEqual(ficha["perfil"], "ligero"); self.assertIn("cycles-cpu", ficha["motores"])
        self.assertNotIn("eevee", ficha["motores"])

    def test_mac_m1_8gb_con_metal_es_estandar_y_recorta_memoria(self):
        sonda = {"gpu": ["metal"], "motores": ["workbench", "cycles-cpu", "cycles-gpu", "eevee"]}
        ficha = D.detectar(self.con_blender(Falso(version="Blender 5.2.0 LTS\nbuild hash: fbe6228777e7\n", sonda=sonda,
                                                  memsize=8 * GB), plataforma="Darwin", maquina="arm64"))
        self.assertEqual(ficha["perfil"], "estandar"); self.assertEqual(ficha["gpu"], ["metal"])
        self.assertEqual(D.perfil_de({**ficha, "arranca": True})["topes"]["memoriaMB"], 2048)

    def test_32gb_con_gpu_de_12gb_es_estudio(self):
        falso = Falso(version="Blender 5.2.0 LTS\nbuild hash: fbe6228777e7\n", sonda={"gpu": ["cuda"], "motores": ["workbench", "cycles-cpu", "cycles-gpu"]},
                      meminfo="MemTotal: 33554432 kB\nMemAvailable: 20971520 kB\n", nvidia_mib=12288)
        ficha = D.detectar(self.con_blender(falso))
        self.assertEqual(ficha["perfil"], "estudio")
        self.assertEqual(D.perfil_de({**ficha, "arranca": True})["topes"]["memoriaMB"], 8192)

    def test_la_ficha_no_lleva_rutas_ni_usuario(self):
        ficha = D.detectar(self.con_blender(Falso(version="Blender 5.2.0 LTS\nbuild hash: fbe6228777e7\n",
                                                  sonda={"gpu": ["metal"], "motores": ["workbench", "cycles-cpu"]}, memsize=8 * GB),
                                           plataforma="Darwin", maquina="arm64"))
        texto = json.dumps(ficha, ensure_ascii=False)
        self.assertNotIn("/", texto); self.assertNotIn(str(Path.home()), texto)

    @unittest.skipUnless(shutil.which("blender"), "Blender no está instalado en esta máquina")
    def test_blender_real(self):
        ficha = D.detectar(T.Sistema(raiz=self.raiz))
        self.assertTrue(ficha["instalado"]); self.assertTrue(ficha["version"].startswith("5.2."))
        self.assertNotEqual(ficha["perfil"], "ninguno"); self.assertIn("cycles-cpu", ficha["motores"])
        if not ficha["gpu"]: self.assertNotIn("eevee", ficha["motores"])


if __name__ == "__main__":
    unittest.main()
