#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""director_dream · lee el informe del Dream y lo convierte en cola para el enjambre.

    python3 scripts/puente/director_dream.py [--fecha 2026-09-15] [--tope 3] [--seco]

Por qué existe (2026-09-16). El Dream de Hermes escribe un informe cada mañana a las siete
desde el 6 de septiembre. Nueve informes. **Nadie los había abierto.** El primero que se leyó
—con este guion, delante de Alex— traía un token de GitHub incrustado en el remoto de un
repo suyo: un riesgo real que llevaba días escrito y sin ver.

Un analista cuyo informe nadie lee no es un analista: es un archivo creciendo.

Lo que hace:
  1. Busca el informe más reciente (o el de la fecha que se le diga).
  2. Saca lo accionable con `dream_a_cola` (puro y con pruebas).
  3. Descarta lo que ya se encargó otro día — el Dream repite, y sin memoria encolaríamos
     lo mismo cada mañana.
  4. Escribe una cola para el enjambre y lo anuncia en el canal.

Lo que NO hace: lanzar nada por su cuenta ni tocar código. Propone; el enjambre ejecuta y
las puertas deciden.
"""

import argparse
import json
import os
import sys
import time

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
if DIRECTORIO not in sys.path:
    sys.path.insert(0, DIRECTORIO)

import dream_a_cola as D

ROOT = os.path.dirname(os.path.dirname(DIRECTORIO))
DREAM = os.path.join(ROOT, "starseed_memory_root", "dream")
OLAS = os.path.join(ROOT, "starseed_memory_root", "olas")
MEMORIA = os.path.expanduser("~/.starseed/dream-encargado.json")


def informe_mas_reciente(fecha=None):
    """(ruta, fecha) del informe pedido, o del último que haya."""
    if fecha:
        ruta = os.path.join(DREAM, "sugerencias-%s.md" % fecha)
        return (ruta, fecha) if os.path.isfile(ruta) else (None, fecha)
    try:
        nombres = sorted(n for n in os.listdir(DREAM)
                         if n.startswith("sugerencias-") and n.endswith(".md"))
    except Exception:
        return None, None
    if not nombres:
        return None, None
    return os.path.join(DREAM, nombres[-1]), nombres[-1][12:-3]


def ya_encargadas():
    try:
        with open(MEMORIA, encoding="utf-8") as f:
            return list(json.load(f).get("claves", []))
    except Exception:
        return []


def anotar(claves):
    """Memoria de lo encargado. Sin esto, cada mañana se encargaría lo mismo."""
    try:
        os.makedirs(os.path.dirname(MEMORIA), exist_ok=True)
        previas = set(ya_encargadas()) | set(claves or [])
        tmp = MEMORIA + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump({"claves": sorted(previas), "t": time.strftime("%Y-%m-%d %H:%M:%S")}, f,
                      ensure_ascii=False, indent=2)
        os.replace(tmp, MEMORIA)
    except Exception:
        pass


def tarea_de(p, fecha, i):
    """Una sugerencia del Dream, escrita como encargo para un agente.

    El enunciado dice DE DÓNDE sale y con qué palabras lo dijo el Dream: un agente que
    no sabe de dónde viene el encargo se inventa el alcance, y eso ya nos costó tareas
    enteras.
    """
    return {
        "id": "DR%d" % (i + 1),
        "ola": "Ola Dream %s · lo que el análisis nocturno encontró" % fecha,
        "titulo": p["titulo"],
        "archivos": [],
        "depende": [],
        "prompt": (
            "ORIGEN: esto lo escribió el Dream —el análisis nocturno de Hermes— en "
            "`starseed_memory_root/dream/sugerencias-%s.md`, sección «%s». Texto literal "
            "del informe:\n\n  %s — %s\n\n"
            "ANTES DE ESCRIBIR NADA: comprueba que sigue siendo cierto. El Dream lo escriben "
            "modelos gratuitos leyendo registros, y a veces proponen algo que YA está hecho o "
            "que se entendió mal. Si al mirar el repo resulta que no aplica, no inventes "
            "trabajo: escribe en tu respuesta una línea `NO APLICA: <motivo>` y para.\n\n"
            "Si aplica: acota el cambio a lo mínimo que resuelva lo que dice el informe, y "
            "dilo en el commit. Máximo 3 archivos y 120 líneas por archivo. Las reglas de la "
            "casa están en `memory/workflow-actual.md` — léelas: el silencio no es "
            "aprobación, integrado no es aplicado, y si una prueba falla se arregla el "
            "código, no la prueba."
            % (fecha, p["seccion"], p["titulo"], p["cuerpo"])
        ),
    }


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--fecha", help="AAAA-MM-DD; por defecto, el informe más reciente")
    ap.add_argument("--tope", type=int, default=3, help="cuántas encargar como mucho")
    ap.add_argument("--seco", action="store_true", help="enseña lo que haría y no escribe")
    args = ap.parse_args()

    ruta, fecha = informe_mas_reciente(args.fecha)
    if not ruta:
        print("No hay informe del Dream%s. ¿Corrió esta mañana?"
              % (" del %s" % args.fecha if args.fecha else ""))
        return 2
    texto = open(ruta, encoding="utf-8", errors="replace").read()
    leidas = sum(len(D.puntos(l)) for l in D.secciones(texto).values())
    propuestas = D.proponer(texto, ya_encargadas(), tope=args.tope)

    print("Informe: %s" % os.path.basename(ruta))
    print(D.resumen(propuestas, leidas))
    for p in propuestas:
        print("  · [%s] %s — %s" % (p["seccion"], p["titulo"], p["cuerpo"][:90]))
    if not propuestas:
        return 0
    if args.seco:
        print("\n(seco: no he escrito nada)")
        return 0

    cola = [tarea_de(p, fecha, i) for i, p in enumerate(propuestas)]
    destino = os.path.join(OLAS, "cola-dream-%s.json" % fecha)
    os.makedirs(OLAS, exist_ok=True)
    with open(destino, "w", encoding="utf-8") as f:
        json.dump(cola, f, ensure_ascii=False, indent=2)
    anotar([p["clave"] for p in propuestas])
    print("\nCola escrita: %s (%d tareas)" % (destino, len(cola)))

    try:
        import puente  # el canal común, para que los cuatro entornos se enteren
        puente.decir(D.resumen(propuestas, leidas))
    except Exception:
        pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
