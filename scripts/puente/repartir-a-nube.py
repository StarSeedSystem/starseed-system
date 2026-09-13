#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Reparto del atraso a la nube: la Mac elige, versiona la cola y la marca.

La nube arranca sin estado (`starseed_memory_root/` no viaja), así que el
atraso se materializa como `enjambre/colas/cola-nube-<AAAAMMDD>.json`, que SÍ
se versiona, y la Mac marca cada id `reasignada · nube` para no duplicarlo.

Uso:
  repartir-a-nube.py [--tope N] [--simular] [--publicar]

  --simular   solo imprime lo que haría (no escribe ni toca git)
  --publicar  además `git add` + `commit` + `push origin main`
"""

import argparse, datetime, json, os, re, subprocess, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import puente
from repartir_nube import elegir, marcar
from vigilante_logica import es_cola_fuente

RAIZ = os.environ.get("STARSEED_ROOT", "/Users/alex/Documents/starseed-os-main")
OLAS = os.path.join(RAIZ, "starseed_memory_root", "olas")
PROGRESO = os.path.join(OLAS, "progreso.json")
DESTINO_DIR = os.path.join(RAIZ, "enjambre", "colas")


def colas_fuente():
    vivos = [
        n
        for n in os.listdir(OLAS)
        if es_cola_fuente(n) and not n.startswith("cola-nube-")
    ]
    vivos.sort(key=lambda n: os.path.getmtime(os.path.join(OLAS, n)), reverse=True)
    salida = []
    for nombre in vivos:
        ruta = os.path.join(OLAS, nombre)
        try:
            datos = json.load(open(ruta, encoding="utf-8"))
        except (OSError, ValueError):
            continue
        tareas = datos.get("tareas", datos) if isinstance(datos, dict) else datos
        if isinstance(tareas, list):
            salida.append((nombre, tareas))
    return salida


def ola_actual(colas):
    """La ola de la cola viva más reciente: la que se queda en la Mac."""
    if not colas:
        return ""
    m = re.search(r"cola-(\d+)", colas[0][0])
    return m.group(1) if m else ""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--tope", type=int, default=20)
    ap.add_argument("--simular", action="store_true")
    ap.add_argument("--publicar", action="store_true")
    args = ap.parse_args()

    colas = colas_fuente()
    progreso = (
        json.load(open(PROGRESO, encoding="utf-8")) if os.path.exists(PROGRESO) else {}
    )
    asuntos = subprocess.run(
        ["git", "log", "main", "--format=%s"], cwd=RAIZ, capture_output=True, text=True
    ).stdout.splitlines()
    elegidas = elegir(colas, progreso, asuntos, ola_actual(colas), tope=args.tope)
    fecha = datetime.date.today().strftime("%Y%m%d")
    nombre = "cola-nube-%s.json" % fecha
    mensaje = "Reparto a la nube %s: %d tareas (%s)" % (
        fecha,
        len(elegidas),
        ", ".join(t["id"] for t in elegidas) or "ninguna",
    )

    if args.simular or not elegidas:
        print("[reparto] %s (simulación)" % mensaje)
        return
    ruta = os.path.join(DESTINO_DIR, nombre)
    json.dump(
        {"ola": "nube-%s" % fecha, "tareas": elegidas},
        open(ruta, "w", encoding="utf-8"),
        ensure_ascii=False,
        indent=1,
    )
    nuevo = marcar(progreso, [t["id"] for t in elegidas], fecha)
    json.dump(
        nuevo, open(PROGRESO, "w", encoding="utf-8"), ensure_ascii=False, indent=1
    )
    puente.decir(mensaje, quien="reparto-nube", tipo="hecho")

    if args.publicar:
        asunto = "Enjambre · reparto a la nube %s: %d tareas" % (fecha, len(elegidas))
        subprocess.run(["git", "add", "enjambre/colas"], cwd=RAIZ, check=True)
        subprocess.run(["git", "commit", "-m", asunto], cwd=RAIZ, check=True)
        subprocess.run(["git", "push", "origin", "main"], cwd=RAIZ, check=True)
    print("[reparto] " + mensaje)


if __name__ == "__main__":
    main()
