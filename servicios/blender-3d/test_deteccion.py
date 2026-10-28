#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas de la detección de Blender (BLD1025B · architecture/blender-3d.md §2-§3).

Todo con `Sistema` simulado: nada de Blender, GPU ni red de verdad, salvo la clase `BlenderReal`,
que se salta con `skipUnless` si `blender` no está en el PATH de esta máquina.
Uso: python3 -m unittest servicios/blender-3d/test_deteccion.py
"""
import json, shutil, stat, tempfile, unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "taller-3d"))
import deteccion as D  # noqa: E402
import taller as T  # noqa: E402

GB = 1024 ** 3
VERSION_OK = "Blender 5.2.0 LTS\nbuild hash: fbe6228777e7\n"
FIRMAS = ("/Applications/Blender.app/Contents/MacOS/Blender", "/opt/homebrew/bin/blender", "/usr/local/bin/blender")
VM_STAT = "Mach Virtual Memory Statistics: (page size of 16384 bytes)\nPages free: 100000.\nPages inactive: 83288.\n"

class Res:
    def __init__(self, rc=0, out="", err=""):
        self.returncode, self.stdout, self.stderr = rc, out, err

class Falso:
    """Subproceso simulado: responde a `--version`, a la sonda, a nvidia-smi y a los medidores."""

    def __init__(self, version=VERSION_OK, sonda=None, nvidia_mib=None, memsize=None, sonda_rara=False):
        self.version, self.nvidia, self.memsize, self.sonda_rara = version, nvidia_mib, memsize, sonda_rara
        self.sonda = sonda or {"gpu": [], "dispositivos": [{"tipo": "cpu", "nombre": "CPU"}],
                               "motores": ["workbench", "cycles-cpu"], "ffmpeg": True}
        self.sondas = 0

    def __call__(self, orden, **kw):
        exe = Path(orden[0]).name
        if exe in ("blender", "Blender"):
            if "--version" in orden:
                return Res(0, self.version) if self.version else Res(1, "", "salida rota\n")
            if "-P" in orden:
                self.sondas += 1
                return Res(0, "sin marca\n") if self.sonda_rara else Res(0, D.PREFIJO + json.dumps(self.sonda))
        if exe == "nvidia-smi":
            if self.nvidia is None:
                raise FileNotFoundError(2, "No such file", "nvidia-smi")
            return Res(0, f"{self.nvidia}\n")
        if exe == "vm_stat":
            return Res(0, VM_STAT)
        if exe == "pmset":
            return Res(0, "Now drawing from 'AC Power'\n")
        if orden[:2] == ["sysctl", "-n"]:
            return (Res(0, f"{self.memsize}\n") if self.memsize else Res(1)) if orden[2] == "hw.memsize" else Res(0, "1\n")
        raise FileNotFoundError(2, "No such file", orden[0])

class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.carpeta = Path(self.tmp.name)
        self.addCleanup(self.tmp.cleanup)

    def crear(self, relativa):
        ruta = self.carpeta / relativa
        ruta.parent.mkdir(parents=True, exist_ok=True)
        ruta.write_text("# simulado")
        return str(ruta)

    def sistema(self, falso, plataforma="Linux", maquina="x86_64", binarios=(), entorno=None,
                meminfo="MemTotal: 8388608 kB\nMemAvailable: 4194304 kB\n", existe=None, glob_=None):
        def leer(ruta):
            if ruta == "/proc/meminfo":
                return meminfo
            if ruta == "/proc/pressure/memory":
                return "some avg10=0.00 avg60=0.00 avg300=0.00 total=0\n"
            raise OSError(ruta)
        s = T.Sistema(raiz=self.carpeta, ejecutar=falso, plataforma=plataforma, maquina=maquina,
                      entorno=entorno if entorno is not None else {"HOME": str(self.carpeta)},
                      buscar=lambda n: f"/usr/bin/{n}" if n in binarios else None, leer=leer,
                      glob=glob_ or (lambda _p: []))
        if existe:
            s.existe = existe
        return s

class BuscarBlender(Base):
    """Var > compatibilidad > PATH > rutas fijas > glob, y solo ejecutables que existen."""

    def test_orden_de_variables_y_path(self):
        falso = Falso()
        estrella = self.crear("herramientas/blender")
        s = self.sistema(falso, binarios=("blender",), entorno={"HOME": str(self.carpeta), "STARSEED_BLENDER": estrella})
        self.assertEqual(D.buscar_blender(s), estrella)  # la variable manda sobre el PATH
        taller = self.crear("taller-3d/blender")
        s2 = self.sistema(falso, binarios=("blender",), entorno={"HOME": str(self.carpeta), "TALLER3D_BLENDER": taller})
        self.assertEqual(D.buscar_blender(s2), taller)
        s3 = self.sistema(falso, binarios=("blender",))
        self.assertEqual(D.buscar_blender(s3), "/usr/bin/blender")  # sin variable: el PATH
        rota = str(self.carpeta / "no-existe" / "blender")
        s4 = self.sistema(falso, binarios=("blender",), entorno={"HOME": str(self.carpeta), "STARSEED_BLENDER": rota})
        self.assertEqual(D.buscar_blender(s4), "/usr/bin/blender")  # una variable que no existe no cuenta

    def test_rutas_fijas_y_el_glob(self):
        falso = Falso()
        existe = lambda ruta: str(ruta) == FIRMAS[1]
        self.assertEqual(D.buscar_blender(self.sistema(falso, existe=existe)), FIRMAS[1])
        globadas = [self.crear("opt/blender-5.2.0-linux-x64/blender")]
        s = self.sistema(falso, glob_=lambda _p: globadas)
        self.assertEqual(D.buscar_blender(s), globadas[0])  # sin PATH ni fijas: /opt/blender*/blender

class Version(Base):
    def test_bien_formada(self):
        s = self.sistema(Falso(), plataforma="Darwin", maquina="arm64")
        self.assertEqual(D.leer_version(self.crear("app/Blender"), s),
                         {"version": "5.2.0", "serie": "5.2", "lts": True, "hash": "fbe6228777e7"})

    def test_mal_formada_o_muda(self):
        s = self.sistema(Falso(version=""))  # el binario falla o dice cosas que no son versiones
        self.assertIsNone(D.leer_version(self.crear("x/blender"), s))
        s2 = self.sistema(Falso(version="blente cinco, y ademas un hash que no existe"))
        self.assertIsNone(D.leer_version(self.crear("y/blender"), s2))

class Perfil(Base):
    """`perfil_de` es pura: umbrales del §3 y memoriaMB = min(tope del perfil, 50 % de la RAM libre)."""

    def test_ninguno_y_ligero_8gb_sin_gpu(self):
        self.assertEqual(D.perfil_de({"instalado": False})["perfil"], "ninguno")
        ligero = D.perfil_de({"instalado": True, "gpu": [], "vramGB": None, "hilos": 2, "ramGB": 8, "ramLibreGB": 4})
        self.assertEqual((ligero["perfil"], ligero["ancho"], ligero["alto"], ligero["muestras"], ligero["fotogramas"]),
                         ("ligero", 1280, 720, 64, 120))
        self.assertEqual(ligero["memoriaMB"], 2048)  # el 50 % de los 4 GB libres: 4 × 512 = 2048

    def test_mac_m1_8gb_con_metal_es_estandar(self):
        m1 = D.perfil_de({"instalado": True, "gpu": ["metal"], "vramGB": None, "hilos": 8, "ramGB": 8, "ramLibreGB": 3})
        self.assertEqual((m1["perfil"], m1["ancho"], m1["muestras"]), ("estandar", 1920, 256))
        self.assertEqual(m1["memoriaMB"], 1536)  # min(4096, 50 % de 3 GB): la Mac va con el enjambre

    def test_32gb_con_gpu_12gb_es_estudio(self):
        estudio = D.perfil_de({"instalado": True, "gpu": ["cuda"], "vramGB": 12, "hilos": 16, "ramGB": 32, "ramLibreGB": 24})
        self.assertEqual((estudio["perfil"], estudio["ancho"], estudio["muestras"]), ("estudio", 3840, 1024))
        self.assertEqual(estudio["memoriaMB"], 8192)  # el tope del perfil: los 12 GB libres no lo suben

class Detectar(Base):
    FICHA = {"v", "instalado", "version", "hash", "serie", "perfil", "motores", "gpu", "hilos",
            "ramGB", "ramLibreGB", "formatos", "visto"}

    def test_sin_blender_da_ninguno(self):
        ficha = D.detectar(self.sistema(Falso()))
        self.assertEqual(set(ficha), self.FICHA)  # exactamente la forma del §2
        self.assertEqual((ficha["instalado"], ficha["perfil"], ficha["motores"]), (False, "ninguno", []))
        self.assertEqual(json.dumps(ficha["version"], ensure_ascii=False), "null")  # sin versión ni datos falsos

    def test_deteccion_completa_con_caché_y_sin_rutas(self):
        falso = Falso()
        s = self.sistema(falso, binarios=("blender",))
        ficha = D.detectar(s)
        self.assertEqual((ficha["instalado"], ficha["version"], ficha["serie"], ficha["hash"]),
                         (True, "5.2.0", "5.2", "fbe6228777e7"))
        self.assertEqual((ficha["perfil"], ficha["motores"], ficha["gpu"]), ("ligero", ["workbench", "cycles-cpu"], []))
        cache = self.carpeta / ".starseed" / "blender-3d" / "sonda.json"
        self.assertEqual(stat.S_IMODE(cache.stat().st_mode), 0o600)  # permisos del caché del §3
        self.assertEqual(falso.sondas, 1)
        D.detectar(s)  # segunda pasada: la sonda vive en caché con la clave versión|hash
        self.assertEqual(falso.sondas, 1)
        texto = json.dumps(ficha, ensure_ascii=False)
        self.assertNotIn(str(self.carpeta), texto)  # sin rutas absolutas ni nombre de usuario
        self.assertFalse(any(m in texto for m in ("/opt", "/Applications", "/usr", "/home")))
        self.assertNotIn(D.buscar_blender(s), texto)

    def test_mac_m1_con_sonda(self):
        falso = Falso(memsize=8 * GB)
        ficha = D.detectar(self.sistema(falso, plataforma="Darwin", maquina="arm64", binarios=("blender",)))
        self.assertEqual((ficha["perfil"], ficha["gpu"], ficha["ramGB"]), ("estandar", ["metal"], 8.0))
        self.assertIn("cycles-gpu", ficha["motores"])
        self.assertIn("eevee", ficha["motores"])  # con GPU sí se ofrece (§1.4)

    def test_sonda_rara_no_revienta(self):
        s = self.sistema(Falso(sonda_rara=True), binarios=("blender",))
        ficha = D.detectar(s)  # sin línea STARSEED_SONDA: sigue con lo medido fuera de Blender
        self.assertEqual((ficha["motores"], ficha["gpu"]), (["workbench", "cycles-cpu"], []))

@unittest.skipUnless(shutil.which("blender"), "Blender no está en el PATH de esta máquina: se salta")
class BlenderReal(Base):
    def test_real_5_2(self):
        raiz, ficha = Path.home() / ".starseed" / "blender-3d" / "sonda.json", D.detectar()
        pre = raiz.exists()
        self.addCleanup(lambda: raiz.unlink(missing_ok=True) if not pre else None)  # borra lo que la prueba generó
        self.assertTrue(ficha["instalado"])
        self.assertRegex(str(ficha["version"]), r"^5\.2\.")
        self.assertNotEqual(ficha["perfil"], "ninguno")
        self.assertIn("cycles-cpu", ficha["motores"])
        self.assertFalse(any("/" in gota for gota in ficha["gpu"] + ficha["motores"]))  # sin rutas absolutas
        if not ficha["gpu"]:
            self.assertNotIn("eevee", ficha["motores"])  # sin GPU no se ofrece EEVEE (contrato §1.4)

if __name__ == "__main__":
    unittest.main()
