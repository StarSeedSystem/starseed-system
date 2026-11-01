# -*- coding: utf-8 -*-
"""Una neurona AHOGADA no toma ni renueva el arriendo de líder de dirección (LID1101A).

Medido 01-11 04:20 (hora de la Mac), con swap 10,2 de 11,3 GB y Genesis sin contestar 25 s, la Mac
se declaró «sin puerta o sin red: líder en local» mientras el orquestador del A1 esperaba en fila.
Ahogo — la regla del medidor (`gobernador-recursos.py`, 2026-10-12) —: presión de memoria del
núcleo ≥ 2 (el «swap al 90 %» miente a medias: macOS agranda el archivo de swap al llenarse), swap
> 90 %, o su Genesis sin contestar en 10 s. Lo que esta máquina no puede medir (`None`) no decide.
Sin puerta tampoco líder local si el A1 latió hace menos de `A1_VIVO_S`. Nunca imprime fichas.
"""
import json
import os
import platform
import subprocess
import urllib.request

#: Segundos que espera a su Genesis antes de darlo por muerto; y «hace menos de 10 min» del A1.
GENESIS_ESPERA_S, A1_VIVO_S = 10.0, 600.0
#: Dónde queda el último estado del A1 que `oracle_nodo.py estado` deja en la Mac.
RUTA_A1 = "~/.starseed/oracle.json"
GENESIS = os.environ.get("STARSEED_GENESIS_URL", "http://127.0.0.1:9002")
EN_MAC = platform.system() == "Darwin"          # aquí vive Genesis; donde no, no se le pide


def _num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


def _salida(orden):
    try:
        return subprocess.check_output(orden, text=True, timeout=4).strip()
    except Exception:  # noqa: BLE001 — un medidor que falla no decide por nosotros
        return ""


def causa_ahogo(presion, swap_usado, swap_total, genesis_ok):
    """PURA. Por qué está AHOGADA (causa) o "" si respira: `presion` ≥ 2, swap > 90 % del total
    o `genesis_ok is False`; solo decide lo medido, un `None` no ahoga nunca."""
    if presion is not None and presion >= 2:
        return "presión de memoria %d del núcleo" % int(presion)
    if _num(swap_total) > 0 and _num(swap_usado) > 0.9 * _num(swap_total):
        return "swap %d de %d MB" % (_num(swap_usado), int(_num(swap_total)))
    if genesis_ok is False:
        return "su Genesis no contesta"
    return ""


def presion_nucleo():
    """La presión de memoria que mide el propio núcleo (macOS), o None donde no se puede medir."""
    nivel = _salida(["sysctl", "-n", "kern.memorystatus_vm_pressure_level"]) if EN_MAC else ""
    return int(nivel) if nivel.isdigit() else None


def swap_mb():
    """(usado, total) de la swap en MB — sysctl en macOS, /proc/meminfo en Linux; (0, 0) si no hay."""
    if EN_MAC:
        sw = _salida(["sysctl", "-n", "vm.swapusage"])
        try:
            return _num(sw.split("used =")[1].split("M")[0]), _num(sw.split("total =")[1].split("M")[0])
        except (IndexError, ValueError):
            return 0.0, 0.0
    try:
        with open("/proc/meminfo", encoding="utf-8") as f:
            mi = {p[0]: _num(p[1].split()[0]) for p in ([l.split(":", 1) for l in f if ":" in l]) if p[1].split()}
        return (mi.get("SwapTotal", 0.0) - mi.get("SwapFree", 0.0)) / 1024.0, mi.get("SwapTotal", 0.0) / 1024.0
    except (OSError, IndexError):
        return 0.0, 0.0


def genesis_ok():
    """¿Contesta su Genesis en `GENESIS_ESPERA_S` s? En una máquina sin Genesis es None."""
    if not EN_MAC:
        return None
    try:
        req = urllib.request.Request(GENESIS, headers={"User-Agent": "starseed-lider-direccion/1"})
        with urllib.request.urlopen(req, timeout=GENESIS_ESPERA_S) as r:
            return r.status < 400
    except Exception:  # noqa: BLE001 — un Genesis colgado o vacío es «no contesta»
        return False


def medida_ahogo():
    """Memoria y Genesis ahora mismo, con `None` donde no se mide; para `causa_ahogo`."""
    usado, total = swap_mb()
    return {"presion": presion_nucleo(), "swap_usado": usado, "swap_total": total, "genesis_ok": genesis_ok()}


def nodo_a1():
    """El «nodo» de `~/.starseed/oracle.json` («latido», «vivo»…), o None si no está o no se lee."""
    try:
        with open(os.path.expanduser(RUTA_A1), encoding="utf-8") as f:
            datos = json.load(f)
    except (OSError, ValueError):
        return None
    nodo = datos.get("nodo") if isinstance(datos, dict) else None
    return nodo if isinstance(nodo, dict) else None


def a1_desde(nodo, ahora):
    """PURA. Segundos que hace que el A1 latió según su estado local (None si no lo dice)."""
    latido = _num((nodo if isinstance(nodo, dict) else {}).get("latido"))
    return ahora - latido if latido > 0 else None


def sin_puerta(ahora, nodo=None):
    """Con la puerta inalcanzable, por qué NO seguir de líder local: el A1 latió hace poco (None: como hoy)."""
    desde = a1_desde(nodo if nodo is not None else nodo_a1(), ahora)
    if desde is not None and 0 <= desde < A1_VIVO_S:  # un reloj atrasado (desde < 0) no cede el mando
        return "sin puerta: el A1 latió hace %d s" % int(desde)
    return None


def fuera(medida=None):
    """Por qué NO coge ni renueva el arriendo por AHOGO («ahogada: …»), o None; `medida` inyectable."""
    m = medida if medida is not None else medida_ahogo()
    causa = causa_ahogo(m.get("presion"), m.get("swap_usado"), m.get("swap_total"), m.get("genesis_ok"))
    return ("ahogada: %s" % causa) if causa else None
