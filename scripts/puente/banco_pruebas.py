#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Banco de pruebas: escribe `pruebas-banco.json`, la evidencia de los aparatos (PRB1111W · contrato §11).

La lógica es pura (`banco_pruebas_logica.py`); aquí solo se lee del disco y se escribe un archivo. No usa la red.
Se llama desde cada pasada del director de pruebas y también a mano:

  python3 scripts/puente/banco_pruebas.py [--salida CARPETA] [--log RUTA] [--version-mac X]

Solo reescribe el archivo si algo cambió (tamaño y hora del registro, versión instalada, app abierta,
comprobaciones): una pasada sin novedades no toca el disco. No lanza nada, no cierra nada.
"""
import json
import os
import plistlib
import subprocess
import sys
import time

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, DIRECTORIO)
import banco_pruebas_logica as L  # noqa: E402

NOMBRE = "pruebas-banco.json"
CADA_S = 60
APP = "/Applications/StarSeed OS.app"
LOGS = os.path.expanduser("~/Library/Logs/app.starseed.os")
LEIDO_MAX = 3 * 1024 * 1024


def carpeta():
    return os.environ.get("STARSEED_PRODUCCION_DIR") or os.path.expanduser("~/.starseed/produccion")


class Medios:
    """Todo lo que toca el mundo. Las pruebas lo sustituyen."""

    def __init__(self, log=None, app=APP, logs=LOGS, salida=None):
        self.log = log or os.path.join(logs, "enlaces.log")
        self.servidor_log = os.path.join(logs, "servidor-local.log")
        self.app = app
        self.salida = salida or carpeta()

    def ahora(self):
        return time.time()

    def stat(self, ruta):
        try:
            s = os.stat(ruta)
            return (s.st_size, int(s.st_mtime))
        except OSError:
            return None

    def leer_cola(self, ruta, maximo=LEIDO_MAX):
        try:
            with open(ruta, "rb") as f:
                f.seek(0, os.SEEK_END)
                n = f.tell()
                f.seek(max(0, n - maximo))
                datos = f.read().decode("utf-8", "replace")
            return datos if n <= maximo else datos.split("\n", 1)[-1]
        except OSError:
            return None

    def plist(self):
        try:
            with open(os.path.join(self.app, "Contents", "Info.plist"), "rb") as f:
                return plistlib.load(f)
        except Exception:  # noqa: BLE001 — sin app o plist ilegible = no se sabe
            return None

    def app_abierta(self, ejecutable):
        """`pgrep -x <nombre exacto>`: solo mira si existe, sin -l ni -f. None si no se puede saber."""
        if not ejecutable or sys.platform != "darwin":
            return None
        try:
            return subprocess.run(["pgrep", "-x", ejecutable], capture_output=True, timeout=10).returncode == 0
        except Exception:  # noqa: BLE001
            return None

    def leer_json(self, ruta):
        try:
            with open(ruta, encoding="utf-8") as f:
                return json.load(f)
        except (OSError, ValueError):
            return None

    def escribir_json(self, ruta, datos):
        os.makedirs(os.path.dirname(ruta), exist_ok=True)
        tmp = "%s.tmp-%d" % (ruta, os.getpid())
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(datos, f, ensure_ascii=False, indent=2)
            f.write("\n")
        os.replace(tmp, ruta)


def pasada(m, version_mac=None, forzar=False):
    """Una pasada del banco → (archivo escrito | None si no cambió nada, dict del banco)."""
    ruta_banco = os.path.join(m.salida, NOMBRE)
    info = m.plist() or {}
    version = version_mac or info.get("CFBundleShortVersionString") or None
    abierta = m.app_abierta(info.get("CFBundleExecutable"))
    comp_ruta = os.path.join(m.salida, "pruebas-comprobaciones.json")
    firma = L.firma_de(m.stat(m.log), m.stat(m.servidor_log), version, abierta, m.stat(comp_ruta))
    previo = m.leer_json(ruta_banco)
    if not forzar and isinstance(previo, dict) and previo.get("firma") == firma:
        return None, previo
    texto = m.leer_cola(m.log) or ""
    arranque, errores = L.info_arranque(m.leer_cola(m.servidor_log) or "")
    mac = {"version": version, "app_abierta": abierta, "ultimo_arranque": arranque, "errores_arranque": errores}
    comprobaciones = m.leer_json(comp_ruta)
    try:
        import comprobaciones_prueba as C
        comprobaciones = C.normalizar(comprobaciones)
    except Exception:  # noqa: BLE001
        comprobaciones = {"pruebas": {}}
    banco = L.construir(texto, mac, comprobaciones, m.ahora())
    banco.update({"t": L._a_iso(m.ahora()), "cada_s": CADA_S, "firma": firma})
    banco = {"formato": 1, "t": banco.pop("t"), "cada_s": banco.pop("cada_s"), "firma": banco.pop("firma"), **banco}
    m.escribir_json(ruta_banco, banco)
    return ruta_banco, banco


def main(argv=None):
    import argparse
    ap = argparse.ArgumentParser(description="Evidencia de los aparatos para las versiones de prueba")
    ap.add_argument("--salida", default=None, help="carpeta donde escribir (por defecto, la de producción)")
    ap.add_argument("--log", default=None)
    ap.add_argument("--version-mac", default=None, help="solo para ensayos: versión instalada que se supone")
    ap.add_argument("--forzar", action="store_true")
    a = ap.parse_args(argv)
    m = Medios(log=a.log, salida=a.salida)
    ruta, banco = pasada(m, a.version_mac, a.forzar)
    print("banco: %s · %d llamadas · %d sugerencias · aparatos: %s" % (
        "escrito" if ruta else "sin cambios", len(banco.get("llamadas", [])), len(banco.get("sugerencias", [])),
        ", ".join(x["nombre"] for x in banco.get("aparatos", []))))
    return 0


if __name__ == "__main__":
    sys.exit(main())
