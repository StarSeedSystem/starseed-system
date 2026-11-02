"""Mantiene despierto el sistema (no solo la pantalla) según el ajuste global.
Lee `~/.starseed/pantalla.json` ({activa, modo, bateria}) y mantiene un hijo propio:
keepalive si está en PATH; si no, caffeinate (macOS) o systemd-inhibit (Linux).
Nunca toca procesos ajenos. Estado en `~/.starseed/despierto.json`.
"""

import json
import os
import shutil
import signal
import subprocess
import sys
import time
from collections import namedtuple

CAFFEINATE = "/usr/bin/caffeinate"
ARCHIVO_AJUSTE = os.path.expanduser("~/.starseed/pantalla.json")
ARCHIVO_ESTADO = os.path.expanduser("~/.starseed/despierto.json")
INTERVALO_BUCLE_S, BATERIA_POR_DEFECTO = 10, 15
class Ajuste(namedtuple("Ajuste", "activa modo bateria", defaults=(True, "pantalla", BATERIA_POR_DEFECTO))):
    __slots__ = ()
    def __bool__(self) -> bool:
        return self.activa

Orden = namedtuple("Orden", "herramienta argv aviso", defaults=((), ""))

def leer_ajuste(texto_json: str) -> Ajuste:
    """Ajuste saneado; cualquier cosa rara cae a pantalla encendida."""
    try:
        datos = json.loads(texto_json)
    except (ValueError, TypeError):
        datos = None
    if not isinstance(datos, dict):
        return Ajuste()
    modo, bateria = datos.get("modo"), datos.get("bateria"); valida = type(bateria) is int and 0 <= bateria <= 100
    return Ajuste(bool(datos.get("activa", True)), modo if modo in ("pantalla", "sistema") else "pantalla",
                  bateria if valida else BATERIA_POR_DEFECTO)

def construir_orden(plataforma: str, ajuste: Ajuste, pid: int, keepalive: bool) -> Orden:
    """PURA: orden por plataforma y modo; nunca ejecuta nada."""
    if not ajuste.activa: return Orden("ninguna")
    if keepalive:
        return Orden("keepalive", ("keepalive", "--plain",
            f"--keep-display={'true' if ajuste.modo == 'pantalla' else 'false'}",
            "--pid", str(pid), "-b", str(ajuste.bateria)))
    if plataforma == "darwin":
        return Orden("caffeinate", (CAFFEINATE, *(["-d", "-i", "-m"] if ajuste.modo == "pantalla" else ["-i", "-m"]), "-w", str(pid)))
    if plataforma == "linux":
        return Orden("systemd-inhibit", ("systemd-inhibit", "--what=sleep:idle", "--mode=block",
            "--who=StarSeed OS", "--why=Procesos de StarSeed OS despiertos", "sleep", "infinity"))
    return Orden("ninguna", (), "Sin keepalive ni inhibidor: el sistema puede dormir.")

def guardar_estado(texto: str) -> None:
    try:
        os.makedirs(os.path.dirname(ARCHIVO_ESTADO), exist_ok=True)
        with open(f"{ARCHIVO_ESTADO}.tmp", "w", encoding="utf-8") as f:
            f.write(texto + "\n")
        os.replace(f"{ARCHIVO_ESTADO}.tmp", ARCHIVO_ESTADO)
    except OSError:
        pass

class ServicioDespierto:
    def __init__(self, lanzador_popen=None, plataforma=None, keepalive=None,
                 guardar=guardar_estado) -> None:
        self._popen = lanzador_popen or subprocess.Popen
        self._plataforma = plataforma or ("darwin" if sys.platform.startswith("darwin")
                                          else "linux" if sys.platform.startswith("linux") else "otros")
        self._keepalive = shutil.which("keepalive") is not None if keepalive is None else keepalive
        self._guardar, self.hijo, self._orden = guardar, None, None

    def hijo_vivo(self) -> bool:
        return self.hijo is not None and self.hijo.poll() is None

    def parar(self) -> None:
        if self.hijo is not None:
            try:
                self.hijo.terminate()
                self.hijo.wait(timeout=5)
            except Exception:
                pass
        self.hijo, self._orden = None, None

    def ciclo(self, texto_ajuste: str) -> Orden:
        ajuste = leer_ajuste(texto_ajuste)
        orden = construir_orden(self._plataforma, ajuste, os.getpid(), self._keepalive)
        if orden.herramienta == "ninguna":
            self.parar()
        elif self._orden != orden or not self.hijo_vivo():
            self.parar()
            self.hijo = self._popen(list(orden.argv), stdout=subprocess.DEVNULL,
                                    stderr=subprocess.DEVNULL)
            self._orden = orden
        self._guardar(json.dumps({
            "activo": orden.herramienta != "ninguna", "modo": ajuste.modo,
            "herramienta": orden.herramienta, "pid": os.getpid()}, ensure_ascii=False))
        return orden

def main() -> int:
    una_vez = "--una-vez" in sys.argv[1:]
    servicio, seguir = ServicioDespierto(), {"valor": True}
    def _terminar(_signum, _frame) -> None:
        seguir["valor"] = False
    for senal in (signal.SIGTERM, signal.SIGINT): signal.signal(senal, _terminar)
    try:
        while seguir["valor"]:
            try:
                with open(ARCHIVO_AJUSTE, "r", encoding="utf-8") as f:
                    texto = f.read()
            except OSError:
                texto = ""
            orden = servicio.ciclo(texto)
            if orden.aviso: print(f"mantener_pantalla: {orden.aviso}")
            if una_vez: break
            time.sleep(INTERVALO_BUCLE_S)
    finally:
        servicio.parar()
    return 0

if __name__ == "__main__":
    sys.exit(main())
