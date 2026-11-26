#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Lector de los límites del plan de Claude (DIR1125S, 25-11-2026).

El Director presidente solo usa a Claude si hay una lectura de límites de menos de 120 min
(`director_presidente.disponibilidad_claude`). Antes se declaraban a mano y caducaban: el
presidente caía a la flota gratuita aunque Claude tuviera sesión. Esto lee `claude -p /usage`
(orden local del CLI, no llama al modelo) y lo declara con `limites_claude.py declarar`.

  python3 scripts/puente/lector_limites_claude.py          # lee y declara
  python3 scripts/puente/lector_limites_claude.py --ver    # solo enseña lo leído

Nunca imprime ni lee credenciales; si el CLI no tiene sesión o no contesta, no declara nada.
"""
import os
import re
import subprocess
import sys
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

AQUI = os.path.dirname(os.path.abspath(__file__))
MESES = {m: i for i, m in enumerate(
    ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"], 1)}
_LINEA = re.compile(
    r"Current (session|week \(([^)]+)\))\s*:\s*(\d+(?:\.\d+)?)% used.*?resets\s+"
    r"([A-Za-z]{3})\s+(\d{1,2})\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)\s*\(([^)]+)\)", re.I)


def _reinicio(mes, dia, hora, minuto, ampm, zona, ahora):
    """PURA. Fecha ISO del reinicio en su zona; el año es el de `ahora` salvo que ya pasó (cambio de año)."""
    h = int(hora) % 12 + (12 if ampm.lower() == "pm" else 0)
    tz = ZoneInfo(zona)
    base = ahora.astimezone(tz)
    f = datetime(base.year, MESES[mes.lower()[:3]], int(dia), h, int(minuto or 0), tzinfo=tz)
    if f < base - timedelta(days=2):
        f = f.replace(year=base.year + 1)
    return f.isoformat()


def parsear_usage(texto, ahora):
    """PURA. Lo que dice `/usage` → {sesion_pct, sesion_reinicio, semana_pct, semana_reinicio,
    modelo_nombre, modelo_pct, modelo_reinicio} (los que salgan) o None si no hay sesión ni semana."""
    out = {}
    for m in _LINEA.finditer(texto or ""):
        tipo, quien, pct = m.group(1).lower(), (m.group(2) or "").strip(), float(m.group(3))
        rein = _reinicio(m.group(4), m.group(5), m.group(6), m.group(7), m.group(8), m.group(9), ahora)
        if tipo == "session":
            out.update(sesion_pct=pct, sesion_reinicio=rein)
        elif quien.lower() == "all models":
            out.update(semana_pct=pct, semana_reinicio=rein)
        elif "modelo_pct" not in out:
            out.update(modelo_nombre=quien, modelo_pct=pct, modelo_reinicio=rein)
    return out if ("sesion_pct" in out and "semana_pct" in out) else None


def orden_declarar(lectura):
    """PURA. Los argumentos de `limites_claude.py declarar` para esa lectura."""
    args = [sys.executable, os.path.join(AQUI, "limites_claude.py"), "declarar",
            "--sesion", "%g" % lectura["sesion_pct"], "--sesion-reinicio", lectura["sesion_reinicio"],
            "--semana", "%g" % lectura["semana_pct"], "--semana-reinicio", lectura["semana_reinicio"],
            "--fuente", "lector"]
    if "modelo_pct" in lectura:
        args += ["--modelo-nombre", lectura["modelo_nombre"], "--modelo", "%g" % lectura["modelo_pct"],
                 "--modelo-reinicio", lectura["modelo_reinicio"]]
    return args


def leer_usage(segundos=90):
    """Corre `claude -p /usage` sin entrada y desde /tmp. Devuelve el texto (vacío si falla)."""
    try:
        r = subprocess.run(["claude", "-p", "/usage"], stdin=subprocess.DEVNULL, capture_output=True,
                           text=True, timeout=segundos, cwd="/tmp")
        return r.stdout or ""
    except (OSError, subprocess.TimeoutExpired):
        return ""


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    ahora = datetime.now().astimezone()
    lectura = parsear_usage(leer_usage(), ahora)
    if not lectura:
        print("sin lectura: el CLI de Claude no contestó o no tiene sesión; no declaro nada")
        return 1
    print(lectura)
    if "--ver" in argv:
        return 0
    r = subprocess.run(orden_declarar(lectura), capture_output=True, text=True, timeout=60)
    print("declarado" if r.returncode == 0 else "fallo al declarar: " + (r.stderr or r.stdout)[-300:])
    return r.returncode


if __name__ == "__main__":
    sys.exit(main())
