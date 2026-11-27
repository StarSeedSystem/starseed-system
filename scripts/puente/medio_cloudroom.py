#!/usr/bin/env python3
"""Sonda de Cloudroom para el catálogo de medios del enjambre."""
from __future__ import annotations
import json, os, shutil, subprocess, sys, time

def cli_path(env=None, which=shutil.which):
    env = env or os.environ
    ruta = env.get("CLOUDROOM_CLI")
    return (ruta if ruta and os.path.isfile(ruta) else which(ruta) if ruta else "") or which("room-cli") or (os.path.expanduser("~/.local/bin/room-cli") if os.path.isfile(os.path.expanduser("~/.local/bin/room-cli")) else "")

#: (1103) Tope de cada orden de `room-cli`: `status` tarda 12 s con la Mac tranquila y más de 15 s con la Mac cargada.
TOPE_CLI_S = int(os.environ.get("STARSEED_CLOUDROOM_TOPE_S", "45") or 45)


def interpretar(local, nube, hilos=None, errores=()):
    """PURA: interpreta respuestas JSON y errores de `room-cli`."""
    capacidad = "100 agentes en la nube / 30 días (plan gratis)"
    motivo = next((str(e) for e in errores if e), "")
    if local is None and isinstance(nube, dict) and (nube.get("ready") or nube.get("account")):
        local = {}  # (1103) el estado local tardó, pero la cuenta en la nube contesta: el medio sirve
    if local is None:
        return medio("no_disponible", motivo or "app sin instalar", capacidad, "instala Cloudroom y vuelve a sondear")
    if not isinstance(local, dict):
        return medio("no_disponible", "respuesta inválida de room-cli status", capacidad)
    if nube is None:
        return medio("requiere_alex", motivo or "Cloudroom no contestó ni después de que la dirección abriera la app",
                     capacidad, "si la app pide sesión, inicia sesión en ella (la dirección ya la abrió)")
    if not isinstance(nube, dict):
        return medio("no_disponible", "respuesta inválida de room-cli cloud status", capacidad)
    login = nube.get("authenticated", nube.get("logged_in", nube.get("signed_in")))
    login = bool(login or nube.get("user") or nube.get("account"))
    if not login:
        return medio("requiere_alex", "sin iniciar sesión en Cloudroom", capacidad, "inicia sesión en la app Cloudroom")
    activos = int((hilos or {}).get("count", 0)) if isinstance(hilos, dict) else 0
    detalle = "cuenta conectada · %d hilo(s) abierto(s)" % activos
    return medio("usable", detalle, capacidad)

def medio(estado, detalle, capacidad, siguiente=""):
    return {"id":"cloudroom", "nombre":"Cloudroom", "estado":estado, "detalle":detalle,
            "capacidad":capacidad, "siguiente_paso":siguiente}

APP_CLOUDROOM = "/Applications/Cloudroom.app"


def abrir_app(run=subprocess.run):
    """(DIR1126K, 26-11) Si `room-cli` no contesta es casi siempre porque la app está cerrada: la
    sesión de Cloudroom ya estaba iniciada (Maggasukha, 26-11: «si estaba ya iniciado sesión»), y la
    sonda decía «abre Cloudroom e inicia sesión». Ahora la dirección la abre ella misma en segundo
    plano (`open -g`, sin quitarle el foco) y vuelve a preguntar; nunca se le pide a él."""
    if sys.platform != "darwin" or not os.path.isdir(APP_CLOUDROOM):
        return False
    try:
        run(["open", "-g", "-a", "Cloudroom"], capture_output=True, text=True, timeout=20)
        return True
    except (OSError, subprocess.TimeoutExpired):
        return False


def sondear(run=subprocess.run, env=None, abrir=None, esperar=time.sleep):
    ruta = cli_path(env)
    if not ruta:
        return interpretar(None, None, errores=("app sin instalar",))
    def pedir(args):
        try:
            p = run([ruta, *args, "--json"], capture_output=True, text=True, timeout=TOPE_CLI_S)
            return json.loads(p.stdout) if p.returncode == 0 else None, (p.stderr or "comando fallido").strip()
        except FileNotFoundError:
            return None, "app sin instalar"
        except (OSError, subprocess.TimeoutExpired, ValueError) as e:
            return None, type(e).__name__
    local, e1 = pedir(["status"]); nube, e2 = pedir(["cloud", "status"])
    # Solo con la orden real (o si se pide expresamente): las pruebas con un `run` falso no abren nada.
    abrir = abrir or (abrir_app if run is subprocess.run else (lambda _run: False))
    if (nube is None or local is None) and abrir(run):
        for _ in range(6):  # hasta ~30 s a que la app arranque
            esperar(5)
            local, e1 = pedir(["status"]); nube, e2 = pedir(["cloud", "status"])
            if nube is not None and local is not None:
                break
    hilos, _ = pedir(["thread", "count"])
    return interpretar(local, nube, hilos, (e1, e2))

if __name__ == "__main__":
    print(json.dumps(sondear(), ensure_ascii=False))
