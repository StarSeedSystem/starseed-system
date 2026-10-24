#!/usr/bin/env python3
"""Sonda del medio Cloudroom para el enjambre (ola 1024C · CRM1024D).
SOP architecture/cloudroom-servidor-agentes.md §3/§4.3: sondea `room-cli` (CLI de la app de
Cloudroom) y devuelve el medio con la MISMA forma que espera `medios_disponibles.py`
(id, nombre, estado, capacidad, detalle, siguiente_paso). Lo gratis: agentes locales gratis
siempre y 100 en la nube cada 30 días por cuenta. Honesto: si la app no está, no hay sesión
o la CLI falla, NO usable con el motivo a la vista. Claves: solo en la app (`room-cli cloud
env`); aquí jamás un valor. Puras (localizar, leer_*, sesion_cloud, clasificar) probadas
en test_medio_cloudroom.py con salidas simuladas.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys

try:  # como paquete (scripts.puente) o como módulo suelto desde su carpeta
    from .medios_disponibles import medio
except ImportError:
    from medios_disponibles import medio

CUPO_GRATIS = "agentes locales gratis siempre · 100 en la nube cada 30 días (plan gratis)"


def localizar(ruta_env: str | None, hay_defecto: bool) -> tuple[str | None, str]:
    """PURA: la ruta de room-cli y el motivo cuando falta."""
    if ruta_env:
        return ruta_env, ""
    if hay_defecto:
        return "~/.local/bin/room-cli", ""
    return None, "app sin instalar (ni CLOUDROOM_CLI ni ~/.local/bin/room-cli)"


def leer_json(texto: str | None) -> dict:
    """PURA: salida `--json` de room-cli → dict; vacía, rota o no-objeto → {}."""
    try:
        d = json.loads(texto) if texto and texto.strip() else {}
    except ValueError:
        return {}
    return d if isinstance(d, dict) else {}


def leer_hilos(d: dict) -> int | None:
    """PURA: cuántos hilos hay abiertos según `thread count --json`; sin dato honesto."""
    for k in ("count", "hilos", "threads", "n"):
        v = d.get(k)
        if isinstance(v, bool) or not isinstance(v, (int, str)) \
                or (isinstance(v, str) and not v.strip().isdigit()):
            continue
        return v if isinstance(v, int) else int(v)
    return None


def sesion_cloud(cloud: dict) -> tuple[bool, str]:
    """PURA: (conectado a Cloudroom, motivo honesto) según `cloud status --json`."""
    if not cloud:
        return False, "cloud status sin datos (¿sin iniciar sesión en Cloudroom?)"
    ok = cloud.get("authenticated")
    if ok is None:
        ok = next((cloud.get(k) for k in ("signed_in", "signedIn", "logged_in", "sesion")
                   if cloud.get(k) is not None), None)
    if isinstance(ok, bool):
        return ok, ("" if ok else "sin iniciar sesión en Cloudroom")
    if any(cloud.get(k) for k in ("user", "email", "account", "cuenta")):
        return True, ""
    return False, "cloud status no deja ver la sesión (¿sin iniciar sesión en Cloudroom?)"


def clasificar(ruta: str | None, motivo_cli: str, status: dict, error_status: str,
               cloud_ok: bool, motivo_cloud: str, hilos: int | None) -> dict:
    """PURA: los datos medidos → el medio con la forma de medios_disponibles."""
    if ruta is None:
        return medio("cloudroom", "Cloudroom", "requiere_alex", CUPO_GRATIS, motivo_cli,
                     "instalar la app (SOP architecture/cloudroom-servidor-agentes.md §2)")
    if not status:
        return medio("cloudroom", "Cloudroom", "no_disponible", CUPO_GRATIS,
                     "room-cli no responde a `status --json`" +
                     (": %s" % error_status if error_status else ""),
                     "abrir la app de Cloudroom y comprobar que está arriba")
    if not cloud_ok:
        return medio("cloudroom", "Cloudroom", "no_disponible", CUPO_GRATIS, motivo_cloud,
                     "iniciar sesión en cloudroom.dev desde la app de escritorio")
    hilos_txt = ("%d hilo(s) abierto(s)" % hilos if hilos is not None
                 else "hilos sin dato (la CLI no dio `thread count`)")
    return medio("cloudroom", "Cloudroom", "listo" if hilos else "usable", CUPO_GRATIS,
                 "servidor local ok · " + hilos_txt, "")


def _sh(cli: str, args: list[str], tope: int = 15) -> tuple[int, str, str]:
    """Ejecuta room-cli con lista de argumentos y tope de 15 s; nunca revienta."""
    try:
        p = subprocess.run([cli, *args], capture_output=True, text=True, timeout=tope)
        return p.returncode, p.stdout or "", p.stderr or ""
    except (OSError, subprocess.SubprocessError) as e:
        return 1, "", "%s: %s" % (type(e).__name__, e)


def sondear() -> dict:
    ruta, motivo_cli = localizar(os.environ.get("CLOUDROOM_CLI"),
                                 os.path.exists(os.path.expanduser("~/.local/bin/room-cli")))
    status: dict = {}
    error_status = ""
    cloud_ok, motivo_cloud, hilos = False, "no sondeado (app sin instalar)", None
    if ruta:
        rc, out, err = _sh(ruta, ["status", "--json"])
        status = leer_json(out) if rc == 0 else {}
        if rc != 0:
            error_status = (err.strip() or "fallo %d" % rc)[:160]
        rc_c, out_c, _ = _sh(ruta, ["cloud", "status", "--json"])
        cloud_ok, motivo_cloud = sesion_cloud(leer_json(out_c) if rc_c == 0 else {})
        hilos = leer_hilos(leer_json(_sh(ruta, ["thread", "count", "--json"])[1]))
        if rc_c != 0 and cloud_ok:
            cloud_ok, motivo_cloud = False, "room-cli cloud status falló"
    return clasificar(ruta, motivo_cli, status, error_status, cloud_ok, motivo_cloud, hilos)

if __name__ == "__main__":
    f = sondear()
    print(json.dumps(f, ensure_ascii=False, indent=1) if "--json" in sys.argv
          else "%s [%s] %s · %s" % (f["id"], f["estado"], f["capacidad"], f["detalle"]))
