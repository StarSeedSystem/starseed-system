#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Higiene de colas: las colas fuente ya cerradas salen de `olas/`.

POR QUÉ. Regla del 09-09 (§💠 trampa 2): un id solo puede vivir en UNA cola; la
cola vieja que se queda en `olas/` descuadra latidos y tareas. Nada se borra: se
MUEVE a `starseed_memory_root/colas-fuente/`.

  python3 scripts/puente/higiene_colas.py            # mueve
  python3 scripts/puente/higiene_colas.py --simular  # solo lista

(2026-10-03) Nadie lo llamaba y, con el orquestador vivo, no movía ninguna `cola-auto-*`
—y el orquestador casi siempre está vivo—. Se juntaron 727 copias (25 MB) y 633 latidos en
`olas/`: el Mando las leía TODAS en cada petición (`leerColasCompletas`) y su servidor murió
por «JavaScript heap out of memory» a los 19 min. Ahora solo se quedan la cola que corre un
orquestador vivo y las de menos de 24 h; sus `latidos-` se van con ellas; y el vigilante lo
pasa cada hora.
"""
import json, os, re, subprocess, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from vigilante_logica import es_cola_fuente, id_en_asuntos  # noqa: E402

# Cierre humano o irreversible del orquestador: ya no sostiene la cola.
ESTADOS_CERRADOS = {"commit", "sustituida", "rechazada", "bloqueante"}
VIEJO = 24 * 3600  # una copia cola-auto-* con más de 24 h es historia
#: El mismo patrón que `procesos-orquestador.ts` y `reconstruir_mando.py`: solo cuenta una
#: orden que EMPIEZA por python ejecutando el script (el prompt de un agente que lo nombra, no).
RE = re.compile(r"^[^ ]*[Pp]ython[0-9.]*( +-[A-Za-z]+)* +[^ ]*starseed-enjambre\.py( |$)")


def tarea_cerrada(tarea, progreso, asuntos_main):
    """Cierra si su estado es terminal o su id ya vive en main (token entero)."""
    if not isinstance(tarea, dict) or not tarea.get("id"):
        return True  # sin id no hay trabajo vivo: no sostiene la cola
    tid = str(tarea["id"])
    estado = progreso.get(tid)
    actual = estado.get("estado") if isinstance(estado, dict) else ""
    return actual in ESTADOS_CERRADOS or id_en_asuntos(tid, asuntos_main)


def orquestador_vivo(procesos):
    """¿Hay un starseed-enjambre.py corriendo? Recibe la salida de `ps -axo args=`."""
    return any(RE.match((l or "").strip()) for l in procesos)


def colas_vivas(procesos):
    """PURA: nombres `cola-….json` que corre algún orquestador vivo (de `ps -axo args=`)."""
    vivas = set()
    for linea in procesos or []:
        l = (linea or "").strip()
        if not RE.match(l):
            continue
        for tok in l.split():
            base = tok.rsplit("/", 1)[-1]
            if base.startswith("cola-") and base.endswith(".json"):
                vivas.add(base)
    return vivas


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


def colas_auto_viejas(olas, ahora=None, vivo=True, vivas=None):
    """Copias cola-auto-* con más de 24 h.

    Con `vivas` (las colas que corre un orquestador vivo) solo se quedan esas y las
    recientes. Sin `vivas` se mantiene la regla antigua: si el orquestador vive, ninguna."""
    if vivas is None and vivo:
        return []
    vivas = set(vivas or ())
    ahora = time.time() if ahora is None else ahora
    return sorted(f for f in os.listdir(olas)
                  if f.startswith("cola-auto-") and f.endswith(".json")
                  and f not in vivas
                  and ahora - os.path.getmtime(os.path.join(olas, f)) > VIEJO)


def latidos_de(colas, olas, vivas=()):
    """Los `latidos-<cola>.json` de las colas que se van (nunca los de una cola viva)."""
    fuera = []
    for nombre in colas:
        if nombre in vivas:
            continue
        lat = "latidos-" + nombre
        if os.path.isfile(os.path.join(olas, lat)):
            fuera.append(lat)
    return fuera


def _leer(nombre, olas):
    """Lee una cola de olas/; si está rota devuelve None (se ignora, no se mueve)."""
    try:
        with open(os.path.join(olas, nombre), encoding="utf-8") as f:
            d = json.load(f)
        return d.get("tareas", d) if isinstance(d, dict) else d
    except Exception:
        return None


def higiene(raiz=None, simular=False, decir=True):
    """Mueve (nunca borra) colas muertas y sus latidos a colas-fuente/. Devuelve los nombres."""
    raiz = raiz or os.environ.get("STARSEED_ROOT", "/Users/alex/Documents/starseed-os-main")
    olas = os.path.join(raiz, "starseed_memory_root", "olas")
    destino = os.path.join(raiz, "starseed_memory_root", "colas-fuente")
    p = _leer("progreso.json", olas)
    progreso = p if isinstance(p, dict) else {}
    asuntos = subprocess.run(["git", "log", "main", "--format=%s"], cwd=raiz,
                             capture_output=True, text=True).stdout.splitlines()
    # `-axo args=` y nunca `-E`: el entorno lleva secretos.
    procesos = subprocess.run(["ps", "-axo", "args="], capture_output=True,
                              text=True).stdout.splitlines()
    vivas = colas_vivas(procesos)
    nombres = [f for f in os.listdir(olas) if f.startswith("cola-") and f.endswith(".json")]
    colas = [(f, _leer(f, olas)) for f in sorted(nombres)]
    salen = [c for c in colas_cerradas(colas, progreso, asuntos) if c not in vivas]
    salen += colas_auto_viejas(olas, vivas=vivas)
    salida = salen + latidos_de(salen, olas, vivas)
    if simular:
        return salida
    os.makedirs(destino, exist_ok=True)
    movidas = []
    for nombre in salida:
        try:
            os.replace(os.path.join(olas, nombre), os.path.join(destino, nombre))
            movidas.append(nombre)
        except OSError as e:
            print("no pude mover %s: %s" % (nombre, e))
    if movidas and decir:
        texto = "higiene: %d archivos de colas movidos a colas-fuente/" % len(movidas)
        try:
            import puente
            puente.decir(texto, quien="higiene", tipo="hecho")
        except Exception:
            pass
    return movidas


def main():
    simular = "--simular" in sys.argv
    salida = higiene(simular=simular)
    if simular:
        print("\n".join(salida) or "nada que mover")
    else:
        print("higiene: %d archivos de colas movidos a colas-fuente/" % len(salida))


if __name__ == "__main__":
    main()
