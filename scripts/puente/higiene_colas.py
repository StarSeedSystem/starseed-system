#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Higiene de colas: las colas fuente ya cerradas salen de `olas/`.

POR QUÉ. Regla del 09-09 (§💠 trampa 2): un id solo puede vivir en UNA cola; la
cola vieja que se queda en `olas/` descuadra latidos y tareas. Nada se borra: se
MUEVE a `starseed_memory_root/colas-fuente/`.

  python3 scripts/puente/higiene_colas.py            # mueve
  python3 scripts/puente/higiene_colas.py --simular  # solo lista
"""
import json, os, re, subprocess, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from vigilante_logica import es_cola_fuente, id_en_asuntos  # noqa: E402

# Cierre humano o irreversible del orquestador: ya no sostiene la cola.
ESTADOS_CERRADOS = {"commit", "sustituida", "rechazada", "bloqueante"}
VIEJO = 24 * 3600  # una copia cola-auto-* con más de 24 h es historia
RE = re.compile(r"^[^ ]*[Pp]ython[0-9.]* +-u +.*starseed-enjambre\.py")


def tarea_cerrada(tarea, progreso, asuntos_main):
    """Cierra si su estado es terminal o su id ya vive en main (token entero)."""
    if not isinstance(tarea, dict) or not tarea.get("id"):
        return True  # sin id no hay trabajo vivo: no sostiene la cola
    tid = str(tarea["id"])
    estado = progreso.get(tid)
    actual = estado.get("estado") if isinstance(estado, dict) else ""
    return actual in ESTADOS_CERRADOS or id_en_asuntos(tid, asuntos_main)


def orquestador_vivo(procesos):
    """¿Hay un starseed-enjambre.py corriendo? Recibe la salida de `ps -eo args`."""
    return any(RE.match(l) for l in procesos)


def colas_cerradas(colas, progreso, asuntos_main):
    """Nombres de colas fuente cuyas tareas están TODAS cerradas (estado
    terminal o id ya en asuntos de main, token entero). Las copias
    `cola-auto-*` y las colas ilegibles se ignoran: no se mueven."""
    moviles = []
    for nombre, tareas in colas:
        if not es_cola_fuente(nombre) or nombre.startswith("cola-auto-"):
            continue
        if not isinstance(tareas, list):
            continue
        if all(tarea_cerrada(t, progreso, asuntos_main) for t in tareas):
            moviles.append(nombre)
    return moviles


def colas_auto_viejas(olas, ahora=None, vivo=True):
    """Copias cola-auto-* con más de 24 h; si el orquestador vive, ninguna sale."""
    if vivo:
        return []
    ahora = time.time() if ahora is None else ahora
    return [f for f in os.listdir(olas)
            if f.startswith("cola-auto-") and f.endswith(".json")
            and ahora - os.path.getmtime(os.path.join(olas, f)) > VIEJO]


def _leer(nombre, olas):
    """Lee una cola de olas/; si está rota devuelve None (se ignora, no se mueve)."""
    try:
        with open(os.path.join(olas, nombre), encoding="utf-8") as f:
            d = json.load(f)
        return d.get("tareas", d) if isinstance(d, dict) else d
    except Exception:
        return None


def main():
    """Mueve (nunca borra) las colas muertas a colas-fuente/ y lo dice al canal."""
    raiz = os.environ.get("STARSEED_ROOT", "/Users/alex/Documents/starseed-os-main")
    olas = os.path.join(raiz, "starseed_memory_root", "olas")
    destino = os.path.join(raiz, "starseed_memory_root", "colas-fuente")
    p = _leer("progreso.json", olas)
    progreso = p if isinstance(p, dict) else {}
    asuntos = subprocess.run(["git", "log", "main", "--format=%s"], cwd=raiz,
                             capture_output=True, text=True).stdout.splitlines()
    procesos = subprocess.run(["ps", "-eo", "args"], capture_output=True,
                              text=True).stdout.splitlines()
    nombres = [f for f in os.listdir(olas) if f.startswith("cola-") and f.endswith(".json")]
    colas = [(f, _leer(f, olas)) for f in sorted(nombres)]
    salida = colas_cerradas(colas, progreso, asuntos) + colas_auto_viejas(olas, vivo=orquestador_vivo(procesos))
    if "--simular" in sys.argv:
        print("\n".join(salida) or "nada que mover")
        return
    os.makedirs(destino, exist_ok=True)
    movidas = 0
    for nombre in salida:
        try:
            os.replace(os.path.join(olas, nombre), os.path.join(destino, nombre))
            movidas += 1
        except OSError as e:
            print("no pude mover %s: %s" % (nombre, e))
    texto = "higiene: %d colas movidas a colas-fuente/" % movidas
    try:
        import puente
        puente.decir(texto, quien="higiene", tipo="hecho")
    except Exception:
        pass
    print(texto)


if __name__ == "__main__":
    main()
