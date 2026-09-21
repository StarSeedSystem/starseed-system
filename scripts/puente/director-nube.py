#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Director de la nube: mantiene encendido el medio de GitHub Actions sin que nadie lo pida.

Alex (2026-09-20): «sincroniza la mayor cantidad posible de agentes simultáneos que los
directores puedan manejar y que los servicios gratuitos nos ofrezcan». El medio de la nube
existía desde el día 20 y NUNCA se encendió solo: había que lanzarlo a mano con
`nube-gh.py lanzar`, y como nadie lo lanzaba, tres agentes gratuitos de 4 vCPU / 16 GB
estuvieron apagados mientras la Mac iba al límite con tres.

Esto lo arregla: cada `INTERVALO_S`, si hay atraso que la Mac no está tocando y no hay ya
un run en marcha, reparte esas tareas a una cola-nube y dispara el workflow.

Lo que NO hace, a propósito:
  · No toca `main` con código: `nube-gh.py lanzar` solo publica el commit de la cola.
  · No lanza si ya hay un run en marcha (un job por vez basta: el tope real son las
    pasarelas gratuitas, no las máquinas), ni más de `TOPE_DIA` veces al día.
  · No interrumpe nada de la Mac: la nube trabaja sobre tareas marcadas «reasignada · nube».

  python3 scripts/puente/director-nube.py
"""
import json
import os
import subprocess
import sys
import time

RAIZ = os.environ.get("STARSEED_ROOT") or "/Users/alex/Documents/starseed-os-main"
INTERVALO_S = int(os.environ.get("STARSEED_NUBE_S", "600"))
TOPE_DIA = int(os.environ.get("STARSEED_NUBE_TOPE_DIA", "8"))
TRABAJADORES = os.environ.get("STARSEED_NUBE_TRABAJADORES", "3")
MINUTOS = os.environ.get("STARSEED_NUBE_MINUTOS", "300")
CUENTA = os.path.expanduser("~/.starseed/nube-lanzamientos.json")


def decidir_lanzamiento(atraso, runs_en_marcha, lanzados_hoy, tope_dia=TOPE_DIA):
    """Función PURA: (lanzar: bool, motivo: str). Aquí vive toda la política.

    Se lanza solo si hay trabajo que la Mac no está tocando, no hay ya un job vivo y no se
    ha llegado al tope del día. El orden de las comprobaciones es el orden en que importan.
    """
    if runs_en_marcha > 0:
        return False, "ya hay %d run(s) en marcha" % runs_en_marcha
    if lanzados_hoy >= tope_dia:
        return False, "tope del día alcanzado (%d)" % tope_dia
    if atraso <= 0:
        return False, "no hay atraso que repartir"
    return True, "%d tarea(s) de atraso y la nube libre" % atraso


def _sh(orden, timeout=120):
    try:
        r = subprocess.run(orden, cwd=RAIZ, capture_output=True, text=True, timeout=timeout)
        return r.stdout or ""
    except Exception:
        return ""


def atraso():
    """Cuántas tareas repartiría el reparto AHORA (simulación, no toca nada)."""
    salida = _sh([sys.executable, os.path.join(RAIZ, "scripts", "puente", "repartir-a-nube.py"),
                  "--tope", "6", "--simular"])
    for trozo in salida.split():
        if trozo.isdigit():
            return int(trozo)
    return 0


def runs_en_marcha():
    salida = _sh(["gh", "run", "list", "--workflow", "enjambre-nube.yml", "--limit", "10",
                  "--json", "status", "--jq", ".[].status"])
    return sum(1 for l in salida.splitlines() if l.strip() in ("in_progress", "queued"))


def _cuenta_hoy():
    hoy = time.strftime("%Y-%m-%d")
    try:
        d = json.load(open(CUENTA, encoding="utf-8"))
    except Exception:
        d = {}
    return hoy, int(d.get(hoy, 0)), d


def _anotar():
    hoy, n, d = _cuenta_hoy()
    d[hoy] = n + 1
    os.makedirs(os.path.dirname(CUENTA), exist_ok=True)
    json.dump({k: v for k, v in sorted(d.items())[-14:]}, open(CUENTA, "w"))


def main():
    print("Director de la nube · cada %d s · tope %d lanzamientos/día" % (INTERVALO_S, TOPE_DIA),
          flush=True)
    while True:
        try:
            _, hoy_n, _ = _cuenta_hoy()
            lanzar, motivo = decidir_lanzamiento(atraso(), runs_en_marcha(), hoy_n)
            print("[%s] %s: %s" % (time.strftime("%H:%M"), "LANZO" if lanzar else "espero", motivo),
                  flush=True)
            if lanzar:
                salida = _sh([sys.executable, os.path.join(RAIZ, "scripts", "puente", "nube-gh.py"),
                              "lanzar", "--tope", "6", "--trabajadores", TRABAJADORES,
                              "--minutos", MINUTOS], timeout=300)
                print(salida.strip()[-400:], flush=True)
                _anotar()
        except Exception as e:
            print("director-nube: %s: %s" % (type(e).__name__, e), flush=True)
        time.sleep(INTERVALO_S)


if __name__ == "__main__":
    sys.exit(main() or 0)
