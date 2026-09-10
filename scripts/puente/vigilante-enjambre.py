#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""El que hace que la orquestación sea AUTOMÁTICA de verdad.

Hasta hoy faltaba justo esto. El orquestador terminaba su cola, salía con éxito…
y ahí se quedaba. El Mando enseñaba «0 tareas en curso» con decenas de pendientes,
y no porque nada funcionara: porque nadie volvía a arrancarlo. La automatización
se apoyaba en que yo estuviera delante para relanzarlo a mano, y eso no es
automatización.

Este vigilante mira cada `INTERVALO_S` segundos:

  · ¿Hay un orquestador vivo?  Si sí, no toca nada.
  · Si no, ¿queda trabajo real?  Reúne las tareas pendientes de TODAS las colas,
    descarta las que ya están en `main` según progreso.json, escribe una cola nueva
    y lanza el orquestador con ella.
  · Si no queda trabajo, calla y espera. No inventa tareas.

Cada decisión se anuncia en el canal común, así que los cuatro entornos y el
Telegram se enteran de por qué arrancó o por qué está callado.

  python3 scripts/puente/vigilante-enjambre.py
"""
import importlib.util, json, os, subprocess, sys, time

RAIZ = os.environ.get("STARSEED_ROOT") or "/Users/alex/Documents/starseed-os-main"
OLAS = os.path.join(RAIZ, "starseed_memory_root", "olas")
INTERVALO_S = int(os.environ.get("STARSEED_VIGILANTE_S", "90"))
TRABAJADORES = os.environ.get("STARSEED_TRABAJADORES", "5")
# Estados de los que no hay que volver a ocuparse.
TERMINAL = {"commit", "bloqueante", "sustituida", "rechazada"}
# Un tope por tanda: una cola de noventa tareas es inmanejable y el orquestador
# se pasa la vida releyendo el progreso en vez de escribir.
TOPE = int(os.environ.get("STARSEED_TOPE_COLA", "20"))

_spec = importlib.util.spec_from_file_location(
    "puente", os.path.join(os.path.dirname(os.path.abspath(__file__)), "puente.py"))
_p = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(_p)


def orquestador_vivo():
    """Cuenta SOLO procesos cuya orden EMPIEZA por un python.

    Un `grep` suelto cuenta como orquestador el TEXTO DEL PROMPT de un agente,
    porque ahí dentro aparece la ruta del script. Esa trampa ya nos hizo matar
    nuestro propio shell y ver orquestadores fantasma tres veces en un día."""
    try:
        salida = subprocess.run(["ps", "-eo", "args"], capture_output=True, text=True, timeout=20).stdout
    except Exception:
        return True          # ante la duda, no lanzar: dos orquestadores es peor
    import re
    patron = re.compile(r"^[^ ]*[Pp]ython[0-9.]* +-u +.*starseed-enjambre\.py")
    return any(patron.match(l) for l in salida.splitlines())


def pendientes():
    """Todo lo que queda por hacer, sin duplicar y sin lo que ya está en main."""
    try:
        prog = json.load(open(os.path.join(OLAS, "progreso.json"), encoding="utf-8"))
    except Exception:
        prog = {}
    vistas, cola = set(), []
    for f in sorted(os.listdir(OLAS), reverse=True):     # las colas nuevas primero
        if not (f.startswith("cola-") and f.endswith(".json")):
            continue
        try:
            d = json.load(open(os.path.join(OLAS, f), encoding="utf-8"))
        except Exception:
            continue
        for t in (d if isinstance(d, list) else d.get("tareas", [])):
            if not isinstance(t, dict) or "id" not in t or t["id"] in vistas:
                continue
            e = prog.get(t["id"])
            if isinstance(e, dict) and e.get("estado") in TERMINAL:
                continue
            vistas.add(t["id"])
            cola.append(t)
    return cola


def lanzar(tareas):
    nombre = "cola-auto-%s.json" % time.strftime("%m%d-%H%M")
    ruta = os.path.join(OLAS, nombre)
    json.dump(tareas, open(ruta, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    guion = os.path.join(RAIZ, "scripts", "puente", "lanzar-enjambre.sh")
    demonio = os.path.join(RAIZ, "scripts", "puente", "demonio.py")
    subprocess.run(["python3", demonio, "/tmp/enjambre.log", RAIZ,
                    "/bin/zsh", guion, os.path.join("starseed_memory_root", "olas", nombre),
                    TRABAJADORES], timeout=60)
    return nombre


def main():
    print("Vigilante del enjambre · cada %ss · tope %d tareas por tanda" % (INTERVALO_S, TOPE))
    _p.decir("Vigilante del enjambre en marcha: si el orquestador termina o muere y queda "
             "trabajo, lo relanzo solo.", "vigilante", "hecho")
    callado_desde = None
    while True:
        try:
            if orquestador_vivo():
                callado_desde = None
            else:
                cola = pendientes()
                if cola:
                    tanda = cola[:TOPE]
                    nombre = lanzar(tanda)
                    _p.decir("orquestador parado con %d pendientes → relanzo con %d en %s"
                             % (len(cola), len(tanda), nombre), "vigilante", "aviso")
                elif callado_desde is None:
                    callado_desde = time.time()
                    _p.decir("orquestador parado y NO queda trabajo pendiente: espero sin inventar tareas.",
                             "vigilante", "mensaje")
        except Exception as e:
            print("vigilante: %s: %s" % (type(e).__name__, e), flush=True)
        time.sleep(INTERVALO_S)


if __name__ == "__main__":
    sys.exit(main() or 0)
