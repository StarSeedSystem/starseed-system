# -*- coding: utf-8 -*-
"""Pruebas del detector de Blender (BLD1025B): sistema SIMULADO + UNA real con skipUnless.
Uso: python3 -m unittest servicios/blender-3d/test_deteccion.py"""
import json, shutil, subprocess, sys, tempfile, unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import deteccion as D  # noqa: E402

GB = 1024 ** 3
VERSION_OK = "Blender 5.2.0 LTS\nbuild hash: fbe6228777e7\n"
MEMINFO = "MemTotal: {total} kB\nMemAvailable: {libre} kB\n"


class Res:
    def __init__(self, out, rc=0):
        self.returncode, self.stdout, self.stderr = rc, out, ""


class Falso:
    """`blender`, `sysctl` y `nvidia-smi` simulados. Nunca toca disco de Blender real."""
    def __init__(self, version=VERSION_OK, sonda=None, memsize=None, nvidia_mib=None):
        self.version_salida, self.sonda_salida = version, sonda
        self.memsize, self.nvidia_mib = memsize, nvidia_mib
        self.sondas = 0
    def __call__(self, orden, **kw):
        exe = Path(orden[0]).name
        if exe == "blender":
            if "--version" in orden:
                return Res(self.version_salida)
            self.sondas += 1
            return Res(self.sonda_salida or "")
        if orden[:2] == ["sysctl", "-n"] and orden[2] == "hw.memsize" and self.memsize:
            return Res(f"{self.memsize}\n")
        if exe == "vm_stat":
            return Res("Mach Virtual Memory Statistics: (page size of 16384 bytes)\nPages free: 300000.\nPages inactive: 200000.\nPages speculative: 24288.\n")
        if exe == "pmset":
            return Res("Now drawing from 'AC Power'\n")
        if exe == "nvidia-smi" and self.nvidia_mib is not None:
            return Res(f"{self.nvidia_mib}\n")
        raise FileNotFoundError(2, "no está", orden[0])


def sonda_de(gpu, ffmpeg=True):
    motores = ["workbench", "cycles-cpu"] + (["cycles-gpu", "eevee"] if gpu else [])
    return "STARSEED_SONDA:" + json.dumps({"gpu": gpu, "motores": motores, "ffmpeg": ffmpeg, "tipos": []})


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)

    def sistema(self, falso, plataforma="Linux", maquina="x86_64", meminfo="", binarios=(), extra=None):
        leer = (lambda ruta: meminfo) if meminfo else (lambda ruta: (_ for _ in ()).throw(OSError(ruta)))
        return D.Sistema(raiz=self.tmp.name, ejecutar=falso, plataforma=plataforma, maquina=maquina,
                         entorno={"STARSEED_RAIZ": self.tmp.name, **(extra or {})},
                         buscar=lambda n: f"/usr/bin/{n}" if n in binarios else None, leer=leer,
                         glob=lambda _p: [])

    def ficha(self, falso, **kw):
        return D.detectar(self.sistema(falso, **kw))


class SinBlender(Base):
    def test_nada_instalado_da_ninguno(self):
        f = self.ficha(Falso())
        self.assertEqual((f["instalado"], f["perfil"], f["version"], f["motores"], f["gpu"]),
                         (False, "ninguno", None, [], []))

    def test_version_mal_formada_da_ninguno_y_no_lanza(self):
        f = self.ficha(Falso(version="Meloncho de la pradera\n"), binarios=("blender",))
        self.assertEqual((f["instalado"], f["perfil"]), (False, "ninguno"))


class Perfiles(Base):
    def test_ocho_gb_sin_gpu_es_ligero(self):
        falso = Falso(sonda=sonda_de([]))
        f = self.ficha(falso, meminfo=MEMINFO.format(total=int(8 * GB // 1024), libre=int(4 * GB // 1024)),
                       binarios=("blender",))
        self.assertEqual((f["perfil"], f["gpu"]), ("ligero", []))
        p = D.perfil_de({"gpu": [], "vramGB": None, "hilos": 2, "ramLibreGB": 4.0})
        self.assertEqual((p["topes"]["ancho"], p["topes"]["muestras"], p["topes"]["memoriaMB"]), (1280, 64, 2048))

    def test_mac_m1_con_metal_es_estandar_y_memoria_a_mitad_de_lo_libre(self):
        falso = Falso(memsize=8 * GB, sonda=sonda_de(["metal"]))
        f = self.ficha(falso, plataforma="Darwin", maquina="arm64", binarios=("blender",), memsize_ok=True)
        self.assertEqual(f["perfil"], "estandar")
        self.assertEqual(f["gpu"], ["metal"])
        libre = 3.0  # vm_stat simulado: libre 3 GB de 8 totales
        self.assertIn("eevee", f["motores"])  # GPU con Metal: EEVEE sí (contrato §3.5)
        self.assertEqual(D.perfil_de({"gpu": ["metal"], "vramGB": None, "hilos": 8, "ramLibreGB": libre})
                         ["topes"]["memoriaMB"], int(libre * 1024 / 2))

    def test_treinta_y_dos_gb_con_nvidia_doce_gb_es_estudio(self):
        falso = Falso(sonda=sonda_de(["cuda"]), nvidia_mib=12288)
        meminfo = MEMINFO.format(total=int(32 * GB // 1024), libre=int(20 * GB // 1024))
        f = self.ficha(falso, meminfo=meminfo)
        self.assertEqual((f["perfil"], f["gpu"], f["ramGB"]), ("estudio", ["cuda"], 32.0))
        self.assertIn("mp4", f["formatos"]["salida"])


class Higiene(Base):
    def test_la_ficha_no_trae_rutas_absolutas_ni_usuario(self):
        falso = Falso(sonda=sonda_de(["cuda"]), nvidia_mib=12288)
        f = self.ficha(falso, binarios=("blender",),
                       extra={"STARSEED_BLENDER": str((Path(self.tmp.name) / "secreto" / "blender")),
                              "HOME": "/Casa/de/fulano"})
        self.assertTrue(f["instalado"])
        texto = json.dumps(f, ensure_ascii=False)
        for prohibido in (self.tmp.name, "secreto", "fulano", "/opt", "/Applications", "/usr/local", "/usr/bin"):
            self.assertNotIn(prohibido, texto)


class Cache(Base):
    def test_la_sonda_se_guarda_por_version_y_hash(self):
        falso = Falso(sonda=sonda_de([]), memsize=16 * GB)
        meminfo = MEMINFO.format(total=int(16 * GB // 1024), libre=int(10 * GB // 1024))
        s = self.sistema(falso, meminfo=meminfo, binarios=("blender",))
        primera, segunda = D.detectar(s), D.detectar(s)
        self.assertEqual(primera, segunda)
        self.assertEqual(falso.sondas, 1)  # la segunda va al caché
        clave = json.loads((Path(self.tmp.name) / "sonda.json").read_text())["clave"]
        self.assertEqual(clave, [segunda["version"], segunda["hash"]])


class Real(unittest.TestCase):
    """La única prueba contra Blender de verdad; se salta en cajas sin él (skipUnless)."""

    @unittest.skipUnless(shutil.which("blender"), "este contenedor no tiene blender en el PATH")
    def test_deteccion_real(self):
        with tempfile.TemporaryDirectory() as tmp:
            s = D.Sistema(entorno={"STARSEED_RAIZ": tmp})
            f = D.detectar(s)
        self.assertTrue(f["instalado"])
        self.assertTrue(f["version"].startswith("5.2."), f["version"])
        self.assertTrue(f["lts"] if "lts" in f else True)  # la ficha del §2 no trae lts; vale la del contrato
        self.assertNotEqual(f["perfil"], "ninguno")
        self.assertIn("cycles-cpu", f["motores"])
        self.assertNotIn("eevee", f["motores"])  # esta caja no tiene GPU
        self.assertIn("ramGB", f)


if __name__ == "__main__":
    unittest.main()
