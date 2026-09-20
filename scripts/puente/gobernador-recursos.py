#!/usr/bin/env python3
"""Gobernador de recursos: la máquina decide cuántos agentes y si BitNet respira.

Regla de Alex (2026-09-20): «bajar el enjambre a 1 trabajador cuando lo use
interactivo, dinámica y automáticamente; en todos los dispositivos debe
funcionar adaptándose a los recursos del hardware».

Cada minuto (launchd `com.starseed.gobernador`) mide tres cosas y escribe
`~/.starseed/gobernador.json`, que el orquestador relee para saber cuántos
trabajadores puede LANZAR (nunca mata nada en marcha):

  · uso interactivo → segundos sin teclado/ratón (HIDIdleTime en macOS;
    en Linux, `loginctl`/xprintidle si existen, si no «no interactivo»);
  · presión de memoria → swap usado y RAM libre+inactiva;
  · BitNet → si Alex está delante y hay RAM, se le pide DESPERTAR a Astraura
    (`POST /api/bitnet/despertar`) para que la primera respuesta no tarde un
    minuto; dormir lo hace sola Astraura por inactividad (ASTRAURA_BITNET_SUENO_MIN).

Decisión (función pura `decidir`, probada en test_gobernador_recursos.py).
Alex (2026-09-20, 22:40): «olvida lo de 1 agente, añade la mayor cantidad posible»:

  RAM libre < RAM_ROJA_MB (150)  → máximo − 1 (nunca menos de 2)
  si no                          → máximo = min(director-config, maximo_por_hardware)
  (el uso interactivo ya no baja nada; solo decide si se despierta a BitNet)

Nada de aquí toca claves ni red pública: solo lee la máquina y habla con
Astraura en 127.0.0.1:8000.
"""
from __future__ import annotations

import json
import os
import platform
import subprocess
import sys
import time
import urllib.request

RUTA_ESTADO = os.path.expanduser("~/.starseed/gobernador.json")
RUTA_CONFIG_DIRECTOR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "starseed_memory_root", "mando", "director-config.json",
)
ASTRAURA = os.environ.get("STARSEED_ASTRAURA_URL", "http://127.0.0.1:8000")

UMBRAL_INTERACTIVO_S = float(os.environ.get("STARSEED_GOB_INTERACTIVO_S", 300))
SWAP_ROJO_MB = float(os.environ.get("STARSEED_GOB_SWAP_ROJO_MB", 10240))
SWAP_AMBAR_MB = float(os.environ.get("STARSEED_GOB_SWAP_AMBAR_MB", 6144))
RAM_ROJA_MB = float(os.environ.get("STARSEED_GOB_RAM_ROJA_MB", 150))
RAM_PARA_BITNET_MB = float(os.environ.get("STARSEED_GOB_RAM_BITNET_MB", 1600))


# ───────────────────────── medidas (nunca lanzan) ─────────────────────────

def _salida(cmd: list[str], timeout: float = 5) -> str:
    try:
        return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout).stdout
    except (OSError, subprocess.SubprocessError):
        return ""


def segundos_inactivo() -> float | None:
    """Segundos desde la última tecla/ratón. None = no se puede saber."""
    so = platform.system()
    if so == "Darwin":
        for linea in _salida(["ioreg", "-c", "IOHIDSystem"]).splitlines():
            if "HIDIdleTime" in linea:
                try:
                    return int(linea.rsplit("=", 1)[1].strip()) / 1e9
                except ValueError:
                    return None
        return None
    if so == "Linux":
        s = _salida(["xprintidle"]).strip()
        if s.isdigit():
            return int(s) / 1000
        return None
    return None


def memoria_mb() -> dict:
    """{'ram_libre_mb', 'swap_mb', 'ram_total_mb'} con lo que la plataforma dé."""
    so = platform.system()
    out = {"ram_libre_mb": None, "swap_mb": None, "ram_total_mb": None}
    if so == "Darwin":
        pagina, libres = 4096, 0
        for linea in _salida(["vm_stat"]).splitlines():
            if "page size of" in linea:
                try:
                    pagina = int(linea.split("page size of")[1].split()[0])
                except (IndexError, ValueError):
                    pass
            for clave in ("Pages free", "Pages inactive", "Pages speculative"):
                if linea.startswith(clave):
                    try:
                        libres += int(linea.split(":")[1].strip().rstrip("."))
                    except (IndexError, ValueError):
                        pass
        out["ram_libre_mb"] = libres * pagina / 1048576
        sw = _salida(["sysctl", "-n", "vm.swapusage"])
        if "used =" in sw:
            try:
                out["swap_mb"] = float(sw.split("used =")[1].split("M")[0])
            except (IndexError, ValueError):
                pass
        total = _salida(["sysctl", "-n", "hw.memsize"]).strip()
        if total.isdigit():
            out["ram_total_mb"] = int(total) / 1048576
        return out
    try:
        with open("/proc/meminfo", encoding="utf-8") as f:
            mi = {l.split(":")[0]: float(l.split(":")[1].split()[0]) for l in f if ":" in l}
        out["ram_libre_mb"] = mi.get("MemAvailable", 0) / 1024
        out["swap_mb"] = (mi.get("SwapTotal", 0) - mi.get("SwapFree", 0)) / 1024
        out["ram_total_mb"] = mi.get("MemTotal", 0) / 1024
    except (OSError, ValueError, IndexError):
        pass
    return out


def maximo_configurado(ruta: str = RUTA_CONFIG_DIRECTOR) -> int:
    try:
        with open(ruta, encoding="utf-8") as f:
            return max(1, int(json.load(f).get("trabajadores") or 2))
    except (OSError, ValueError, TypeError):
        return 2


def maximo_por_hardware(ram_total_mb, nucleos) -> int:
    """Cuántos agentes de código caben en ESTA máquina (Alex 2026-09-20: «los
    directores deben vincular la mayor cantidad de agentes simultáneos»).

    Medido en la Mac de 8 GB: cada agente (opencode/codex + su worktree + las
    puertas tsc/vitest) cuesta ~1,5 GB en punta; con 5 la Mac llegó a 10 GB de
    swap y cada puerta tardó 10×. El tope no es el modelo, es la memoria:
      ≤ 8,5 GB → 3 · ≤ 16,5 GB → 5 · ≤ 32,5 GB → 8 · más → 12,
    y nunca más de (núcleos − 1). Para tener MÁS agentes no se sube este
    número: se añade otro MEDIO (otra máquina, un VPS, Oracle Free Tier) que
    corre su propio orquestador contra la misma cola — ver
    memory/orquestacion-economica.md §10.
    """
    if ram_total_mb is None:
        return 2
    gb = ram_total_mb / 1024
    por_ram = 3 if gb <= 8.5 else 5 if gb <= 16.5 else 8 if gb <= 32.5 else 12
    por_cpu = max(1, int(nucleos or 2) - 1)
    return max(1, min(por_ram, por_cpu))


# ───────────────────────── decisión (pura) ─────────────────────────

def decidir(idle_s, ram_libre_mb, swap_mb, maximo, *,
            interactivo_s=UMBRAL_INTERACTIVO_S, swap_rojo=SWAP_ROJO_MB,
            swap_ambar=SWAP_AMBAR_MB, ram_roja=RAM_ROJA_MB,
            ram_bitnet=RAM_PARA_BITNET_MB) -> dict:
    """Devuelve {'trabajadores', 'motivo', 'interactivo', 'bitnet'}.

    `bitnet` es 'despertar' cuando Alex está delante y hay RAM para el motor,
    'dejar' en cualquier otro caso (Astraura duerme sola por inactividad).
    """
    maximo = max(1, int(maximo))
    interactivo = idle_s is not None and idle_s < interactivo_s
    ram = ram_libre_mb if ram_libre_mb is not None else float("inf")
    swap = swap_mb if swap_mb is not None else 0.0
    # Alex (2026-09-20, 22:40): «olvida lo de 1 agente, añade la mayor cantidad
    # posible». El uso interactivo ya NO baja el tope; solo el colapso de memoria
    # (RAM libre < ram_roja, no el tamaño del swap: esta Mac vive con 12-14 GB
    # de swap y aun así integra) quita UN trabajador, nunca deja menos de 2.
    if ram < ram_roja:
        n, motivo = max(2 if maximo >= 2 else 1, maximo - 1), "memoria al límite (RAM libre %d MB): un trabajador menos" % ram
    else:
        n, motivo = maximo, "máximo (%s)" % ("Alex al teclado" if interactivo else "máquina libre")
    bitnet = "despertar" if interactivo and ram >= ram_bitnet else "dejar"
    return {"trabajadores": n, "motivo": motivo, "interactivo": interactivo, "bitnet": bitnet}


# ───────────────────────── efectos ─────────────────────────

def despertar_bitnet(base: str = ASTRAURA, timeout: float = 4) -> bool:
    try:
        req = urllib.request.Request(base.rstrip("/") + "/api/bitnet/despertar", data=b"{}",
                                     headers={"Content-Type": "application/json"}, method="POST")
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return 200 <= r.status < 300
    except Exception:
        return False


def escribir_estado(decision: dict, medidas: dict, ruta: str = RUTA_ESTADO) -> None:
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    previo = {}
    try:
        with open(ruta, encoding="utf-8") as f:
            previo = json.load(f)
    except (OSError, ValueError):
        pass
    cuerpo = {**previo, **decision, **medidas, "t": time.strftime("%Y-%m-%dT%H:%M:%S")}
    tmp = ruta + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(cuerpo, f, ensure_ascii=False, indent=1)
    os.replace(tmp, ruta)


def main() -> int:
    idle = segundos_inactivo()
    mem = memoria_mb()
    nucleos = os.cpu_count() or 2
    por_hw = maximo_por_hardware(mem["ram_total_mb"], nucleos)
    maximo = min(maximo_configurado(), por_hw)
    d = decidir(idle, mem["ram_libre_mb"], mem["swap_mb"], maximo)
    medidas = {"idle_s": None if idle is None else round(idle), "maximo": maximo,
               "maximo_hardware": por_hw, "nucleos": nucleos,
               "ram_total_mb": None if mem["ram_total_mb"] is None else round(mem["ram_total_mb"]),
               "servidor": platform.node(),
               "ram_libre_mb": None if mem["ram_libre_mb"] is None else round(mem["ram_libre_mb"]),
               "swap_mb": None if mem["swap_mb"] is None else round(mem["swap_mb"])}
    if d["bitnet"] == "despertar":
        d["bitnet_despierto"] = despertar_bitnet()
    escribir_estado(d, medidas)
    print("gobernador: %d/%d trabajadores · %s · bitnet %s" % (d["trabajadores"], maximo, d["motivo"], d["bitnet"]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
