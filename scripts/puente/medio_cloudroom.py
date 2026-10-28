#!/usr/bin/env python3
"""Sonda de Cloudroom para el catálogo de medios del enjambre."""
from __future__ import annotations
import json, os, shutil, subprocess

def cli_path(env=None, which=shutil.which):
    env = env or os.environ
    ruta = env.get("CLOUDROOM_CLI")
    return (ruta if ruta and os.path.isfile(ruta) else which(ruta) if ruta else "") or which("room-cli") or (os.path.expanduser("~/.local/bin/room-cli") if os.path.isfile(os.path.expanduser("~/.local/bin/room-cli")) else "")

def interpretar(local, nube, hilos=None, errores=()):
    """PURA: interpreta respuestas JSON y errores de `room-cli`."""
    capacidad = "100 agentes en la nube / 30 días (plan gratis)"
    motivo = next((str(e) for e in errores if e), "")
    if local is None:
        return medio("no_disponible", motivo or "app sin instalar", capacidad, "instala Cloudroom y vuelve a sondear")
    if not isinstance(local, dict):
        return medio("no_disponible", "respuesta inválida de room-cli status", capacidad)
    if nube is None:
        return medio("requiere_alex", motivo or "no se pudo consultar la cuenta Cloudroom", capacidad, "abre Cloudroom e inicia sesión")
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

def sondear(run=subprocess.run, env=None):
    ruta = cli_path(env)
    if not ruta:
        return interpretar(None, None, errores=("app sin instalar",))
    def pedir(args):
        try:
            p = run([ruta, *args, "--json"], capture_output=True, text=True, timeout=15)
            return json.loads(p.stdout) if p.returncode == 0 else None, (p.stderr or "comando fallido").strip()
        except FileNotFoundError:
            return None, "app sin instalar"
        except (OSError, subprocess.TimeoutExpired, ValueError) as e:
            return None, type(e).__name__
    local, e1 = pedir(["status"]); nube, e2 = pedir(["cloud", "status"])
    hilos, _ = pedir(["thread", "count"])
    return interpretar(local, nube, hilos, (e1, e2))

if __name__ == "__main__":
    print(json.dumps(sondear(), ensure_ascii=False))
