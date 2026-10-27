#!/usr/bin/env python3
"""Pruebas unitarias de la detección del medio Blender (BLD1025B)."""

import json, os, sys, subprocess, shutil, unittest
from pathlib import Path

# ---- import Sistema from taller 3d ----
_taller = os.path.join(os.path.dirname(__file__), "..", "taller-3d")
if _taller not in sys.path:
    sys.path.insert(0, _taller)
from taller import Sistema  # noqa: F401

# ---- cargar módulo deteccion dinámicamente para evitar import con hífen ----
spec = os.path.join(os.path.dirname(__file__), "deteccion.py")
import importlib.util
_dd = importlib.util.spec_from_file_location("deteccion", spec)
deteccion = importlib.util.module_from_spec(_dd)
_dd.loader.exec_module(deteccion)
detectar = deteccion.detectar


def _hacer_sistema(blender_existe=True, version_ok=True, ram_gb=8, gpu=True):
    """Crea un Sistema simulado minimalista para las pruebas."""
    class _Sis(Sistema):
        def __init__(self):
            super().__init__(
                raiz=None,
                ejecutar=self._ejec,
                buscar=self._buscar,
                plataforma="Darwin",
                maquina="arm64",
                entorno={},
                leer=self._leer,
                glob=lambda p: [],
            )
            self.ram_gb = ram_gb
            self.gpu = gpu
            self._blender_path = "/usr/local/bin/blender" if blender_existe else None

        def _ejec(self, orden, **kwargs):
            if not blender_existe:
                class _P:
                    returncode = 127
                    stdout = ""
                    stderr = "blender not found"
                return _P()
            if "--version" in orden and version_ok:
                class _P:
                    returncode = 0
                    stdout = "Blender 5.2.0 LTS\nbuild hash: fbe6228777e7\n"
                    stderr = ""
                return _P()
            if "sonda_blender.py" in orden:
                class _P:
                    returncode = 0
                    stdout = "STARSEED_SONDA:{\"devices\":[\"cycles-cpu\"]}\n"
                    stderr = ""
                return _P()
            class _P:
                returncode = 0
                stdout = ""
                stderr = ""
            return _P()

        def _buscar(self, nombre):
            if self._blender_path and nombre == "blender":
                return self._blender_path
            return None

        def _buscar_blender_original(self):
            # not used; we override buscar
            pass

        def existe(self, ruta):
            if self._blender_path and str(ruta) == self._blender_path:
                return True
            return Path(ruta).exists()

        def _leer(self, ruta):
            if "/proc/meminfo" in ruta:
                return (
                    f"MemTotal: {int(self.ram_gb * 1024)} kB\n"
                    f"MemAvailable: {int(self.ram_gb * 1024 // 2)} kB\n"
                )
            return ""
    return _Sis()


class TestDeteccionBlender(unittest.TestCase):
    def test_sin_blender(self):
        s = _hacer_sistema(blender_existe=False)
        resultado = detectar(s)
        assert resultado["instalado"] is False
        assert resultado["perfil"] == "ninguno"

    def test_version_mal_formada(self):
        s = _hacer_sistema(blender_existe=True, version_ok=False)
        resultado = detectar(s)
        assert resultado["instalado"] is True
        assert resultado["version"] == ""

    def test_ligero_sin_gpu_8gb(self):
        s = _hacer_sistema(blender_existe=True, ram_gb=8, gpu=False)
        resultado = detectar(s)
        assert resultado["perfil"] == "ligero"
        assert resultado["memoriaMB"] <= 2 * 1024

    def test_estandar_m1_con_metal(self):
        s = _hacer_sistema(blender_existe=True, ram_gb=8, gpu=True)
        resultado = detectar(s)
        assert resultado["perfil"] == "estandar"

    def test_estudio_32gb_gpu_12gb(self):
        s = _hacer_sistema(blender_existe=True, ram_gb=32, gpu=True)
        resultado = detectar(s)
        assert resultado["perfil"] == "estudio"

    def test_sin_rutas_absolutas_en_visto(self):
        s = _hacer_sistema(blender_existe=True)
        resultado = detectar(s)
        # visto es ISO, no debe tener rutas absolutas ni usuario
        assert "/" not in resultado["visto"]

    def test_real_con_blender(self):
        if shutil.which("blender"):
            r = subprocess.run(["blender", "--version"], capture_output=True, text=True, timeout=10)
            if r.returncode == 0 and "Blender" in r.stdout:
                resultado = detectar(Sistema())
                assert resultado["instalado"] is True
                assert resultado["version"].startswith("5.")
                assert "cycles-cpu" in str(resultado["motores"])
                print("Perfil real:", resultado["perfil"])
            else:
                raise unittest.SkipTest("Blender versión inesperada")
        else:
            raise unittest.SkipTest("Blender no disponible en esta máquina")


if __name__ == "__main__":
    unittest.main()