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

sys.path.insert(
    0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "enjambre")
)
try:
    from cambio_pedido import aplicar_a_todas
except ImportError:  # pragma: no cover

    def aplicar_a_todas(tareas, progreso):
        return list(tareas or [])


from vigilante_logica import es_cola_fuente

RAIZ = os.environ.get("STARSEED_ROOT", "/Users/alex/Documents/starseed-os-main")
OLAS = os.path.join(RAIZ, "starseed_memory_root", "olas")
PROGRESO = os.path.join(OLAS, "progreso.json")
DESTINO_DIR = os.path.join(RAIZ, "enjambre", "colas")


def validar_raiz(raiz):
    """STARSEED_ROOT debe ser un repo con carpeta de colas; si no, se aborta."""
    if not os.path.isdir(os.path.join(raiz, ".git")) or not os.path.isdir(
        os.path.join(raiz, "enjambre", "colas")
    ):
        raise SystemExit(
            "reparto: STARSEED_ROOT inválido (%s): falta .git o enjambre/colas" % raiz
        )


def nombre_destino(ahora, destino_dir):
    """cola-nube-<AAAAMMDD-HHMM>.json; si ya existe, sufijo -2, -3... Nunca sobrescribe."""
    base = "cola-nube-%s" % ahora.strftime("%Y%m%d-%H%M")
    nombre, i = base + ".json", 1
    while os.path.exists(os.path.join(destino_dir, nombre)):
        i += 1
        nombre = "%s-%d.json" % (base, i)
    return nombre


def asuntos_main(raiz):
    """Asuntos de main; si git falla se aborta (nunca lista vacía silenciosa)."""
    r = subprocess.run(
        ["git", "log", "main", "--format=%s"], cwd=raiz, capture_output=True, text=True
    )
    if r.returncode != 0:
        raise SystemExit(
            "reparto: git log falló (%s): %s" % (r.returncode, r.stderr.strip())
        )
    return r.stdout.splitlines()


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
            with open(ruta, encoding="utf-8") as f:
                datos = json.load(f)
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

    validar_raiz(RAIZ)
    colas = colas_fuente()
    progreso = {}
    if os.path.exists(PROGRESO):
        with open(PROGRESO, encoding="utf-8") as f:
            progreso = json.load(f)
    asuntos = asuntos_main(RAIZ)
    # (2026-09-23) La nube no ve el progreso de la Mac: el cambio pedido desde el Puente
    # (prompt y dependencias quitadas) se hornea DENTRO de la cola que se le manda.
    colas = [(nombre, aplicar_a_todas(tareas, progreso)) for nombre, tareas in colas]
    # (2026-09-24) Lo que ya se mandó 3 veces sin integrarse no se vuelve a mandar.
    from repartir_nube import envios_por_tarea, leer_colas_nube
    import time as _time

    envios = envios_por_tarea(leer_colas_nube(DESTINO_DIR, _time.time()))
    elegidas = elegir(colas, progreso, asuntos, ola_actual(colas), tope=args.tope, envios=envios)
    ahora = datetime.datetime.now()
    fecha = ahora.strftime("%Y%m%d")
    mensaje = "Reparto a la nube %s: %d tareas (%s)" % (
        fecha,
        len(elegidas),
        ", ".join(t["id"] for t in elegidas) or "ninguna",
    )

    if args.simular or not elegidas:
        print("[reparto] %s (simulación)" % mensaje)
        return
    os.makedirs(DESTINO_DIR, exist_ok=True)
    nombre = nombre_destino(ahora, DESTINO_DIR)
    ruta = os.path.join(DESTINO_DIR, nombre)
    with open(ruta, "w", encoding="utf-8") as f:
        json.dump(
            {"ola": "nube-%s" % fecha, "tareas": elegidas},
            f,
            ensure_ascii=False,
            indent=1,
        )
    nuevo = marcar(progreso, [t["id"] for t in elegidas], fecha)
    with open(PROGRESO, "w", encoding="utf-8") as f:
        json.dump(nuevo, f, ensure_ascii=False, indent=1)
    puente.decir(mensaje, quien="reparto-nube", tipo="hecho")

    if args.publicar:
        asunto = "Enjambre · reparto a la nube %s: %d tareas" % (fecha, len(elegidas))
        subprocess.run(["git", "add", "enjambre/colas"], cwd=RAIZ, check=True)
        subprocess.run(["git", "commit", "-m", asunto], cwd=RAIZ, check=True)
        subprocess.run(["git", "push", "origin", "main"], cwd=RAIZ, check=True)
    print("[reparto] " + mensaje)


if __name__ == "__main__":
    main()
