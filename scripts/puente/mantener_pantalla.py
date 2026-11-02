"""Servicio que mantiene la pantalla o el sistema despiertos según el ajuste.

Lee `~/.starseed/pantalla.json` ({activa, modo, desde, quien}); activa por
defecto con modo «pantalla» (display despierto) o «sistema» (solo el sistema:
pantalla apagable y procesos vivos). Herramienta, por este orden: `keepalive`
si está en el PATH (aserciones IOKit en macOS, peticiones de energía en
Windows, inhibidor de systemd-logind en Linux), si no `caffeinate` en macOS
o `systemd-inhibit` en Linux; sin ninguna, avisa una vez y espera. La orden
se construye en función PURA (construir_orden) probada por plataforma. Escribe
su estado en `~/.starseed/despierto.json` ({modo, herramienta, pid}). Termina
SOLO sus hijos (nunca `pkill`).
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import signal
import subprocess
import sys
import time
from typing import Any, Optional

CAFFEINATE = "/usr/bin/caffeinate"
ARCHIVO_AJUSTE = os.path.expanduser("~/.starseed/pantalla.json")
ARCHIVO_DESPIERTO = os.path.expanduser("~/.starseed/despierto.json")
INTERVALO_BUCLE_S = 10
RENOVAR_U_CADA_S = 50
U_TIEMPO_S = 60
UMBRAL_BATERIA = 15
MODOS = ("pantalla", "sistema")


def leer_ajuste(texto_json: str) -> dict[str, Any]:
    """Devuelve {'activa': bool, 'modo': str}; True y «pantalla» si está roto."""
    try:
        datos: Any = json.loads(texto_json)
    except (ValueError, TypeError):
        return {"activa": True, "modo": "pantalla"}
    ajuste: Any = datos if isinstance(datos, dict) else {}
    modo = ajuste.get("modo", "pantalla")
    if modo not in MODOS:
        modo = "pantalla"
    return {"activa": bool(ajuste.get("activa", True)), "modo": modo}


def elegir_herramienta(so: str, disponibles: set[str]) -> str:
    """keepalive primero; si no, caffeinate (macOS) o systemd-inhibit (Linux)."""
    if "keepalive" in disponibles:
        return "keepalive"
    if so == "darwin" and "caffeinate" in disponibles:
        return "caffeinate"
    if so == "linux" and "systemd-inhibit" in disponibles:
        return "systemd-inhibit"
    return "ninguna"


def construir_orden(herramienta: str, modo: str, pid: int,
                    umbral: int = UMBRAL_BATERIA) -> list[str]:
    """Orden pura por herramienta y modo; [] si no hay herramienta."""
    if herramienta == "ninguna":
        return []
    if herramienta == "keepalive":
        display = "true" if modo == "pantalla" else "false"
        return ["keepalive", "--plain", "--keep-display=" + display,
                "--pid", str(pid), "-b", str(umbral)]
    if herramienta == "caffeinate":
        return ["caffeinate", "-dim" if modo == "pantalla" else "-im",
                "-w", str(pid)]
    if herramienta == "systemd-inhibit":
        return ["systemd-inhibit", "--what=sleep:idle",
                "--why=StarSeed OS", "--mode=block", "sleep", "infinity"]
    raise ValueError(f"herramienta desconocida: {herramienta}")


def herramientas_disponibles(so: str) -> set[str]:
    """Qué herramientas de vigilia hay en esta máquina como conjunto."""
    disponibles: set[str] = set()
    if shutil.which("keepalive"):
        disponibles.add("keepalive")
    if so == "darwin" and os.path.exists(CAFFEINATE):
        disponibles.add("caffeinate")
    if so == "linux" and shutil.which("systemd-inhibit"):
        disponibles.add("systemd-inhibit")
    return disponibles


def escribir_despierto(modo: str, herramienta: str, pid: Optional[int]) -> dict:
    """Escribe y devuelve el estado vivo en ~/.starseed/despierto.json."""
    estado = {"modo": modo, "herramienta": herramienta, "pid": pid}
    try:
        os.makedirs(os.path.dirname(ARCHIVO_DESPIERTO), exist_ok=True)
        with open(ARCHIVO_DESPIERTO, "w", encoding="utf-8") as apartado:
            json.dump(estado, apartado)
    except OSError:
        pass
    return estado


def que_hacer(
    activa: bool, hijo_vivo: bool, segundos_desde_ultimo_u: float
) -> list[str]:
    """Decide las acciones del ciclo: lanzar, parar, declarar_usuario, nada."""
    acciones: list[str] = []
    if activa:
        if not hijo_vivo:
            acciones.append("lanzar_dim")
        if segundos_desde_ultimo_u >= RENOVAR_U_CADA_S:
            acciones.append("declarar_usuario")
        if not acciones:
            acciones.append("nada")
    else:
        if hijo_vivo:
            acciones.append("parar_dim")
        else:
            acciones.append("nada")
    return acciones


class ServicioPantalla:
    """Mantiene vivo un hijo de vigilia (keepalive/caffeinate/systemd)."""

    def __init__(self, lanzador_popen=None, lanzador_run=None, ahora=None,
                 escribidor=None) -> None:
        self._popen = lanzador_popen or subprocess.Popen
        self._run = lanzador_run or subprocess.run
        self._ahora = ahora or time.monotonic
        self._escribir = escribidor or escribir_despierto
        self.hijo: Optional[subprocess.Popen] = None
        self._ultimo_u: float = 0.0
        self.modo: str = "pantalla"
        self.herramienta: str = "ninguna"
        self._aviso_dado: bool = False

    def hijo_vivo(self) -> bool:
        return self.hijo is not None and self.hijo.poll() is None

    def lanzar_hijo(self) -> None:
        self.parar_hijo()
        if self.herramienta == "ninguna":
            if not self._aviso_dado:
                print("mantener_pantalla: sin keepalive ni caffeinate ni "
                      "systemd-inhibit; no puedo mantener nada despierto.")
                self._aviso_dado = True
                self._escribir(self.modo, "ninguna", None)
            return
        orden = construir_orden(self.herramienta, self.modo, os.getpid())
        self.hijo = self._popen(
            orden, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
        )
        self._escribir(self.modo, self.herramienta, os.getpid())

    def parar_hijo(self) -> None:
        if self.hijo is not None:
            try:
                self.hijo.terminate()
                self.hijo.wait(timeout=5)
            except Exception:
                pass
            self.hijo = None
            self._escribir(self.modo, self.herramienta, None)

    def declarar_usuario(self) -> None:
        if self.herramienta != "caffeinate":
            return
        try:
            self._run([CAFFEINATE, "-u", "-t", str(U_TIEMPO_S)], timeout=10)
        except Exception:
            pass
        self._ultimo_u = self._ahora()

    def ciclo(self, texto_ajuste: str) -> list[str]:
        ajuste = leer_ajuste(texto_ajuste)
        self.modo = ajuste["modo"]
        desde_u = (self._ahora() - self._ultimo_u
                   if self.herramienta == "caffeinate" else float("inf"))
        acciones = que_hacer(ajuste["activa"], self.hijo_vivo(), desde_u)
        for accion in acciones:
            if accion == "lanzar_dim":
                self.lanzar_hijo()
            elif accion == "parar_dim":
                self.parar_hijo()
            elif accion == "declarar_usuario":
                self.declarar_usuario()
        return acciones


def _leer_archivo_ajuste() -> str:
    try:
        with open(ARCHIVO_AJUSTE, "r", encoding="utf-8") as f:
            return f.read()
    except OSError:
        return ""


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Mantiene la pantalla o el sistema despiertos."
    )
    parser.add_argument("--una-vez", action="store_true",
                        help="Un ciclo y sale.")
    args = parser.parse_args()

    servicio = ServicioPantalla()
    servicio.herramienta = elegir_herramienta(
        sys.platform, herramientas_disponibles(sys.platform)
    )
    seguir = {"valor": True}

    def _terminar(signum, _frame) -> None:
        seguir["valor"] = False

    signal.signal(signal.SIGTERM, _terminar)
    signal.signal(signal.SIGINT, _terminar)

    try:
        while seguir["valor"]:
            servicio.ciclo(_leer_archivo_ajuste())
            if args.una_vez:
                break
            time.sleep(INTERVALO_BUCLE_S)
    finally:
        servicio.parar_hijo()
    return 0


if __name__ == "__main__":
    sys.exit(main())
