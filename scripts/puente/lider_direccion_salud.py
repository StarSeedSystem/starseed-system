# -*- coding: utf-8 -*-
"""Salud de una neurona para el arriendo de dirección (LID1101A): ahogo local y latido del A1.

Puras y probadas: `ahogada` (presión ≥ 2, swap > 90 % o Genesis sin contestar) y `a1_late`
(`nodo.latido` de ~/.starseed/oracle.json dentro de la ventana). `medir_salud` y `leer_oracle`
solo leen: nunca escriben, nunca imprimen fichas ni claves.
"""
import json
import os
import subprocess
import urllib.request

VENTANA_A1_S = 600


def _num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


def ahogada(presion, swap_pct, genesis=True):
    """PURA. Presión ≥ 2, swap > 90 % o Genesis que no contesta: la neurona está ahogada."""
    return _num(presion) >= 2 or _num(swap_pct) > 90 or not genesis


def a1_late(estado, ahora, ventana=VENTANA_A1_S):
    """PURA. ¿El A1 latió hace menos de `ventana` s? (`nodo.latido` de oracle.json)"""
    nodo = (estado or {}).get("nodo") if isinstance(estado, dict) else None
    nodo = nodo if isinstance(nodo, dict) else (estado if isinstance(estado, dict) else {})
    latido = _num(nodo.get("latido") or nodo.get("t"))
    return 0 < latido <= ahora and ahora - latido < ventana


def lider_local(ahogada_, a1_late_):
    """PURA. Sin puerta: (soy, motivo). Cede ante el ahogo o un A1 vivo."""
    if ahogada_:
        return False, "ahogada: no tomo ni renuevo el arriendo"
    if a1_late_:
        return False, "sin puerta y el A1 late: no me declaro líder en local"
    return True, "sin puerta o sin red: líder en local"


def _cmd(*args):
    """La salida de un comando corto; '' si no existe o falla (fuera de macOS, p. ej.)."""
    try:
        return subprocess.run(args, capture_output=True, text=True, timeout=5).stdout.strip()
    except Exception:
        return ""


def _swap_pct():
    """% de swap usado: `vm.swapusage` en macOS, `SwapTotal/SwapFree` en Linux; None si no se sabe."""
    s = _cmd("sysctl", "-n", "vm.swapusage")
    try:
        usado = float(s.split("used =")[1].split("M")[0])
        total = float(s.split("total =")[1].split("M")[0])
        return round(usado * 100 / total, 1) if total else 0.0
    except (IndexError, ValueError):
        pass
    try:
        with open("/proc/meminfo", encoding="utf-8") as f:
            mi = {l.split(":")[0]: float(l.split(":")[1].split()[0]) for l in f if ":" in l}
        total = mi.get("SwapTotal", 0.0)
        return round((total - mi.get("SwapFree", 0.0)) * 100 / total, 1) if total else 0.0
    except (OSError, ValueError, IndexError):
        return None


def _genesis(timeout=10.0):
    """¿El Genesis local contesta dentro de `timeout` s? (cualquier respuesta < 500 cuenta)."""
    url = os.environ.get("STARSEED_GENESIS_URL", "http://127.0.0.1:9002").rstrip("/")
    try:
        with urllib.request.urlopen(url + "/api/mando/estado", timeout=timeout) as r:
            return 200 <= getattr(r, "status", 200) < 500
    except Exception:
        return False


def medir_salud(timeout=10.0, genesis=True):
    """Foto local: presión del núcleo, % de swap y si Genesis contesta en `timeout` segundos."""
    # Solo se sondea en la Mac y sin puerta: en el A1 no hay Genesis local y con puerta ya hay red.
    presion = _cmd("sysctl", "-n", "kern.memorystatus_vm_pressure_level")
    return {"presion": int(presion) if presion.isdigit() else None,
            "swap_pct": _swap_pct(), "genesis": _genesis(timeout) if genesis else True}


def leer_oracle(ruta=None):
    """El estado que dejó `oracle_nodo.estado()` en ~/.starseed/oracle.json ({} si no está)."""
    try:
        with open(ruta or os.path.expanduser("~/.starseed/oracle.json"), encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}
