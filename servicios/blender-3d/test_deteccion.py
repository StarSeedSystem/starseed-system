#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas de detección Blender (BLD1025B)."""
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


class Res:
    def __init__(self, rc=0, out="", err=""):
        self.returncode, self.stdout, self.stderr = rc, out, err


class Falso:
    def __init__(self, versiones=None, sonda=None, falla=None, binarios=None, rutas=None):
        self.versiones = versiones or {}
        self.sonda = sonda
        self.falla = falla
        self.binarios = binarios or {}
        self.rutas = rutas or []
        self.ordenes = []
        self.sondas = 0

    def __call__(self, orden, **kw):
        self.ordenes.append(list(orden))
        if "-P" in orden:
            self.sondas += 1
        exe = Path(orden[0]).name
        if orden[:1] and orden[0] in self.binarios:
            # si ruta específica
            pass
        if exe == "blender" and len(orden) >= 2 and orden[1] == "--version":
            ruta = orden[0]
            if ruta in self.versiones:
                return Res(0, self.versiones[ruta], "")
            if self.falla:
                return Res(1, "", "error")
            return Res(1, "", "")
        if exe == "blender" and "-P" in orden:
            # buscar sonda
            if self.sonda is not None:
                return Res(0, self.sonda, "")
            return Res(0, "")
        return Res(0, "")


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.raiz = Path(self.tmp.name)
        self.addCleanup(self.tmp.cleanup)

    def crear(self, relativa):
        """Un binario falso (archivo vacío) dentro del tmp, como lo haría una instalación."""
        ruta = self.raiz / relativa
        ruta.parent.mkdir(parents=True, exist_ok=True)
        ruta.write_text("")
        return ruta

    def sistema(self, falso, plataforma="Linux", maquina="x86_64", entorno=None, meminfo="", disco=500, buscar=None):
        def leer(ruta):
            if ruta == "/proc/meminfo" and meminfo:
                return meminfo
            if ruta == "/proc/pressure/memory":
                return "some avg10=0.00 avg60=0.00 avg300=0.00 total=0\n"
            raise OSError(ruta)
        env = entorno or {}
        return T.Sistema(raiz=self.raiz, ejecutar=falso, plataforma=plataforma, maquina=maquina,
                         entorno=env, buscar=buscar or (lambda n: None),
                         glob=lambda p: [h for h in falso.rutas if p.replace("*", "") in h] if hasattr(falso, "rutas") else [],
                         disco_libre=lambda _r: disco * 1024 ** 3, leer=leer)


class DeteccionTest(Base):
    def test_sin_blender_ninguno(self):
        falso = Falso()
        s = self.sistema(falso)
        ficha = D.detectar(s)
        self.assertFalse(ficha["instalado"])
        self.assertEqual(ficha["perfil"], "ninguno")
        # sin rutas absolutas
        for k, v in ficha.items():
            if isinstance(v, str) and v:
                self.assertFalse(v.startswith("/"))
                self.assertNotIn(os.path.expanduser("~"), v)

    def test_version_mal_formada(self):
        falso = Falso(versiones={"/usr/bin/blender": "Blender raro sin version\nbuild hash: abc123\n"})
        falso.rutas = []
        s = self.sistema(falso)
        # forzar buscar que devuelva ruta
        D.buscar_blender = lambda s2: "/usr/bin/blender" if True else None
        ficha = D.detectar(s)
        # pero usar ruta encontrada
        s2 = self.sistema(falso)
        # monkey patch
        orig_buscar = D.buscar_blender
        D.buscar_blender = lambda x: "/usr/bin/blender"
        try:
            ficha = D.detectar(s2)
            self.assertFalse(ficha["instalado"])
        finally:
            D.buscar_blender = orig_buscar

    def test_8gb_sin_gpu_ligero(self):
        falso = Falso(versiones={"/opt/blender/blender": "Blender 4.2.0\nbuild hash: deadbeef\n"},
                      sonda="STARSEED_SONDA:" + json.dumps({"gpu": [], "dispositivos": [], "motores": ["workbench", "cycles-cpu"], "ffmpeg": True}))
        orig_buscar = D.buscar_blender
        D.buscar_blender = lambda x: "/opt/blender/blender"
        try:
            s = self.sistema(falso, plataforma="Linux", maquina="x86_64", meminfo="MemTotal: 8388608 kB\nMemAvailable: 4194304 kB\n")
            # simular recursos
            orig_rec = T.recursos
            T.recursos = lambda s2: {"memoria_libre_gb": 4.0, "presion": 1, "bateria": False}
            orig_ram = T.ram_total_gb
            orig_vram = T.vram_nvidia_gb
            T.ram_total_gb = lambda s2: 8.0
            T.vram_nvidia_gb = lambda s2: None
            try:
                ficha = D.detectar(s)
                self.assertTrue(ficha["instalado"])
                self.assertEqual(ficha["perfil"], "ligero")
                self.assertIn("cycles-cpu", ficha["motores"])
            finally:
                T.recursos = orig_rec
                T.ram_total_gb = orig_ram
                T.vram_nvidia_gb = orig_vram
        finally:
            D.buscar_blender = orig_buscar

    def test_mac_m1_8gb_metal_estandar_memoria_recortada(self):
        falso = Falso(versiones={"/usr/bin/blender": "Blender 5.2.0 LTS\nbuild hash: fbe6228777e7\n"},
                      sonda="STARSEED_SONDA:" + json.dumps({"gpu": ["metal"], "dispositivos": [{"tipo": "metal", "nombre": "Apple M1"}], "motores": ["workbench", "cycles-cpu", "cycles-gpu", "eevee"], "ffmpeg": True}))
        orig_buscar = D.buscar_blender
        D.buscar_blender = lambda x: "/usr/bin/blender"
        try:
            s = self.sistema(falso, plataforma="Darwin", maquina="arm64", meminfo="")
            orig_rec = T.recursos
            orig_ram = T.ram_total_gb
            orig_vram = T.vram_nvidia_gb
            T.recursos = lambda s2: {"memoria_libre_gb": 6.0, "presion": 1, "bateria": False}
            T.ram_total_gb = lambda s2: 8.0
            T.vram_nvidia_gb = lambda s2: None
            try:
                ficha = D.detectar(s)
                self.assertTrue(ficha["instalado"])
                self.assertEqual(ficha["perfil"], "estandar")
                caps = {"instalado": True, "arranca": True, "ramLibreGB": 6.0, "ramGB": 8.0, "hilos": 8, "gpu": ["metal"], "vramGB": None}
                p = D.perfil_de(caps)
                self.assertEqual(p["perfil"], "estandar")
                self.assertEqual(p["memoriaMB"], 3072)
            finally:
                T.recursos = orig_rec
                T.ram_total_gb = orig_ram
                T.vram_nvidia_gb = orig_vram
        finally:
            D.buscar_blender = orig_buscar

    def test_32gb_gpu_12gb_estudio(self):
        caps = {"instalado": True, "arranca": True, "ramLibreGB": 20.0, "ramGB": 32.0, "hilos": 16, "gpu": ["cuda"], "vramGB": 12}
        p = D.perfil_de(caps)
        self.assertEqual(p["perfil"], "estudio")
        # tope estudio 8192, 50% de 20GB libre = 10240, min es 8192
        self.assertEqual(p["memoriaMB"], 8192)

    def test_sin_rutas_absolutas_en_resultado(self):
        falso = Falso(versiones={"/usr/bin/blender": "Blender 5.2.0\nbuild hash: abc\n"},
                      sonda="STARSEED_SONDA:" + json.dumps({"gpu": [], "dispositivos": [], "motores": ["workbench", "cycles-cpu"], "ffmpeg": True}))
        orig_buscar = D.buscar_blender
        D.buscar_blender = lambda x: "/usr/bin/blender"
        try:
            s = self.sistema(falso)
            orig_rec = T.recursos
            orig_ram = T.ram_total_gb
            orig_vram = T.vram_nvidia_gb
            T.recursos = lambda s2: {"memoria_libre_gb": 4.0, "presion": 1, "bateria": False}
            T.ram_total_gb = lambda s2: 8.0
            T.vram_nvidia_gb = lambda s2: None
            try:
                ficha = D.detectar(s)
                s_ficha = json.dumps(ficha)
                self.assertNotIn("/home/", s_ficha)
                self.assertNotIn("/Users/", s_ficha)
                self.assertNotIn(os.path.expanduser("~"), s_ficha)
            finally:
                T.recursos = orig_rec
                T.ram_total_gb = orig_ram
                T.vram_nvidia_gb = orig_vram
        finally:
            D.buscar_blender = orig_buscar


    def test_orden_de_variables_y_path(self):
        # la variable STARSEED_BLENDER manda sobre el PATH, luego TALLER3D_BLENDER
        falso = Falso()
        estrella = self.crear("herramientas/blender")
        s = self.sistema(falso, entorno={"HOME": str(self.raiz), "STARSEED_BLENDER": str(estrella)},
                         buscar=lambda n: "/usr/bin/blender")
        self.assertEqual(D.buscar_blender(s), str(estrella))
        taller = self.crear("taller-3d/blender")
        s2 = self.sistema(falso, entorno={"HOME": str(self.raiz), "TALLER3D_BLENDER": str(taller)},
                          buscar=lambda n: "/usr/bin/blender")
        self.assertEqual(D.buscar_blender(s2), str(taller))
        s3 = self.sistema(falso, buscar=lambda n: "/usr/bin/blender")
        self.assertEqual(D.buscar_blender(s3), "/usr/bin/blender")  # sin variable: el PATH
        s4 = self.sistema(falso, entorno={"HOME": str(self.raiz), "STARSEED_BLENDER": str(self.raiz / "no-existe" / "blender")},
                          buscar=lambda n: "/usr/bin/blender")
        self.assertEqual(D.buscar_blender(s4), "/usr/bin/blender")  # una variable que no existe no cuenta

    def test_rutas_fijas_y_el_glob(self):
        falso = Falso()
        s = self.sistema(falso)
        fija = D.FIJAS[1]
        s.existe = lambda r: str(r) == str(fija)  # necesita esa única ruta fija, aunque el tmp no la tenga
        self.assertEqual(D.buscar_blender(s), str(fija))  # la fija de Homebrew antes del glob
        globada = str(self.crear("opt/blender-5.2.0-linux-x64/blender"))
        s.existe = lambda r: str(r) == globada
        s.glob = lambda _p: [globada]
        self.assertEqual(D.buscar_blender(s), globada)  # sin variable ni fijas: /opt/blender*/blender

    def test_bien_formada(self):
        ruta = self.crear("app/blender")
        falso = Falso(versiones={ruta: "Blender 5.2.0 LTS\nbuild hash: fbe6228777e7\n"})
        s = self.sistema(falso, plataforma="Darwin", maquina="arm64")
        self.assertEqual(
            D.leer_version(ruta, s),
            {"version": "5.2.0", "serie": "5.2", "lts": True, "hash": "fbe6228777e7"},
        )

    def test_deteccion_completa_con_cache_y_sin_rutas(self):
        falso = Falso(
            versiones={"/usr/bin/blender": "Blender 5.2.0 LTS\nbuild hash: fbe6228777e7\n"},
            sonda="STARSEED_SONDA:" + json.dumps(
                {"gpu": [], "dispositivos": [], "motores": ["workbench", "cycles-cpu"], "ffmpeg": True}),
        )
        orig_buscar = D.buscar_blender
        orig_rec, orig_ram, orig_vram = T.recursos, T.ram_total_gb, T.vram_nvidia_gb
        D.buscar_blender = lambda _s: "/usr/bin/blender"
        T.recursos = lambda _s: {"memoria_libre_gb": 4.0, "presion": 1, "bateria": False}
        T.ram_total_gb = lambda _s: 8.0
        T.vram_nvidia_gb = lambda _s: None
        try:
            s = self.sistema(falso, entorno={"HOME": str(self.raiz)})
            ficha = D.detectar(s)
            self.assertEqual((ficha["instalado"], ficha["version"], ficha["serie"], ficha["hash"]),
                             (True, "5.2.0", "5.2", "fbe6228777e7"))
            self.assertEqual((ficha["perfil"], ficha["motores"], ficha["gpu"]),
                             ("ligero", ["workbench", "cycles-cpu"], []))
            cache = self.raiz / ".starseed" / "blender-3d" / "sonda.json"
            self.assertEqual(cache.stat().st_mode & 0o777, 0o600)  # permisos del caché del §3
            self.assertEqual(falso.sondas, 1)
            D.detectar(s)  # segunda pasada: la sonda vive en caché con la clave versión|hash
            self.assertEqual(falso.sondas, 1)
            texto = json.dumps(ficha, ensure_ascii=False)
            self.assertNotIn(str(self.raiz), texto)  # sin rutas absolutas ni nombre de usuario
            self.assertFalse(any(m in texto for m in ("/opt", "/Applications", "/usr", "/home")))
            self.assertNotIn(D.buscar_blender(s), texto)
        finally:
            D.buscar_blender = orig_buscar
            T.recursos, T.ram_total_gb, T.vram_nvidia_gb = orig_rec, orig_ram, orig_vram

    def test_mac_m1_con_sonda(self):
        # 8 GB y GPU Metal: perfil estándar ya lo cubre test_mac_m1_8gb…; aquí lo nuevo
        # es que CON GPU los motores ofrecidos incluyen cycles-gpu y eevee (§1.4).
        falso = Falso(
            versiones={"/usr/bin/blender": "Blender 5.2.0\nbuild hash: a1b2c3d4e5f6\n"},
            sonda="STARSEED_SONDA:" + json.dumps(
                {"gpu": ["metal"], "dispositivos": [{"tipo": "metal", "nombre": "Apple M1"}],
                 "motores": ["workbench", "cycles-cpu", "cycles-gpu", "eevee"], "ffmpeg": True}),
        )
        orig_buscar = D.buscar_blender
        orig_rec, orig_ram, orig_vram = T.recursos, T.ram_total_gb, T.vram_nvidia_gb
        D.buscar_blender = lambda _s: "/usr/bin/blender"
        T.recursos = lambda _s: {"memoria_libre_gb": 6.0, "presion": 1, "bateria": False}
        T.ram_total_gb = lambda _s: 8.0
        T.vram_nvidia_gb = lambda _s: None
        try:
            s = self.sistema(falso, plataforma="Darwin", maquina="arm64", entorno={"HOME": str(self.raiz)})
            ficha = D.detectar(s)
            self.assertEqual((ficha["gpu"], ficha["ramGB"]), (["metal"], 8.0))
            self.assertIn("cycles-gpu", ficha["motores"])
            self.assertIn("eevee", ficha["motores"])
        finally:
            D.buscar_blender = orig_buscar
            T.recursos, T.ram_total_gb, T.vram_nvidia_gb = orig_rec, orig_ram, orig_vram

    def test_sonda_rara_no_revienta(self):
        # la sonda responde pero su salida no es el JSON del contrato: sigue con lo medido fuera
        falso = Falso(
            versiones={"/usr/bin/blender": "Blender 5.2.0\nbuild hash: a1b2c3d4e5f6\n"},
            sonda="STARSEED_SONDA: esta línea no es json",
        )
        orig_buscar = D.buscar_blender
        orig_rec, orig_ram, orig_vram = T.recursos, T.ram_total_gb, T.vram_nvidia_gb
        D.buscar_blender = lambda _s: "/usr/bin/blender"
        T.recursos = lambda _s: {"memoria_libre_gb": 4.0, "presion": 1, "bateria": False}
        T.ram_total_gb = lambda _s: 8.0
        T.vram_nvidia_gb = lambda _s: None
        try:
            s = self.sistema(falso, entorno={"HOME": str(self.raiz)})
            ficha = D.detectar(s)
            self.assertTrue(ficha["instalado"])
            self.assertEqual((ficha["motores"], ficha["gpu"]), (["workbench", "cycles-cpu"], []))
        finally:
            D.buscar_blender = orig_buscar
            T.recursos, T.ram_total_gb, T.vram_nvidia_gb = orig_rec, orig_ram, orig_vram


@unittest.skipUnless(shutil.which("blender"), "blender no instalado")
class DeteccionRealTest(unittest.TestCase):
    def test_blender_real_5_2_x(self):
        s = T.Sistema()
        ficha = D.detectar(s)
        self.assertTrue(ficha["instalado"])
        self.assertTrue(ficha["version"].startswith("5.2."))
        self.assertNotEqual(ficha["perfil"], "ninguno")
        self.assertIn("cycles-cpu", ficha["motores"])
        self.assertNotIn("eevee", ficha["motores"])


if __name__ == "__main__":
    unittest.main()
