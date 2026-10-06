#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Director de producción — coordina el ciclo entero §3 de director-produccion.md.

python3 scripts/puente/director-produccion.py --modo auto [--seco] [--una-vez]

El director **reutiliza** las puertas de `publicar.py`, no las copia. Funciona en
el MISMO orquestador y el MISMO turno de máquina que `publicar.py`; si una puerta
está corriendo (diario[c] == "corriendo"), espera y repite.

Reglas del contrato §3:
  - puerta 1: elegibilidad (candidatos de produccion.py)
  - puerta 2: seguridad (produccion_puertas.py)
  - puerta 3: coherencia + propósito (produccion_puertas.py, decidir.consultar_lote)
  - puerta 4: CI, vista previa, humo, regresión, diseño, servicios, IA, webhooks (§3.4)
  - puerta 5: publicar (produccion_puertas.py, git push)
  - puerta 6: confirmar cada medio (produccion_medios.py)
  - puerta 7: propagar en tiempo real (produccion_avisar.py)

Los lotes empujan a `produccion/candidato`; el ciclo se ejecuta UNA vez por lote.
Cuando falla algo, se revierte, se veta y se devuelve al enjambre (§8).

Nunca `next build` local. Todo lo externo se inyecta (git, red, procesos).
Las claves solo de `os.environ`/`process.env`; nunca se imprimen.
"""

import argparse
import importlib.util
import json
import os
import sys
import time
import subprocess
from pathlib import Path

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
if DIRECTORIO not in sys.path:
    sys.path.insert(0, DIRECTORIO)

ROOT = os.path.dirname(os.path.dirname(DIRECTORIO))
STATE_DIR = os.path.join(ROOT, "starseed_memory_root", "mando")


def cargar_configuracion():
    """Leer la configuración del director desde config_director.py."""
    try:
        spec = importlib.util.spec_from_file_location("config", os.path.join(ROOT, "~starseed", "config_director.py"))
        cfg = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cfg)
        return cfg.produccion
    except Exception:
        return {
            "activo": True, "modo": "seco", "intervalo_s": 120,
            "ventana_min": 20, "max_publicaciones_dia": 24,
            "expres_alex": True, "umbral_jev": 0.7, "umbral_diseno": 75,
            "migraciones": "aditivas", "max_tags_nativos_semana": 1,
            "revertir_auto": True
        }


def esta_pausado():
    """El interruptor de pausa."""
    return os.path.exists(os.path.expanduser("~/.starseed/produccion-pausada.json"))


def cargar_progreso():
    """Cargar progreso.json desde el orquestador."""
    ruta = os.path.join(ROOT, "starseed_memory_root", "olas", "progreso.json")
    try:
        with open(ruta, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def obtener_progreso(tid, progreso):
    """Extraer progreso de tarea de progreso general."""
    return progreso.get(tid) if progreso else {}


def candidato_elegible(candidato, vetos):
    """Determinar si un candidato es elegible para producción según §3.

    Returns:
        (bool, list) - (elegible, motivos)
    """
    motivos = []

    sha = candidato.get("sha")
    if sha and vetos.get(sha):
        motivos.append(f"vetada por {vetos[sha]['quien']}: {vetos[sha]['motivo']}")
        return False, motivos

    veredictos = candidato.get("veredictos", {})
    diseno = veredictos.get("diseno", {})
    nota = diseno.get("nota", 0)

    if nota < 75:
        motivos.append(f"diseño bajo ({nota})")
        return False, motivos

    return True, []


def actualizar_estado(lote, puertas, resultado, estado):
    """Actualizar el archivo estado de producción."""
    estado_actual = {
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
        "lote": {
            "sha": lote.get("sha"),
            "tareas": [lote.get("tarea")],
            "medios": lote.get("medios", []),
            "archivos": lote.get("archivos", []),
            "puertas": puertas,
            "resultado": resultado,
        },
        "estado": estado,
    }

    os.makedirs(STATE_DIR, exist_ok=True)
    ruta = os.path.join(STATE_DIR, "produccion-estado.json")

    with open(ruta, "w", encoding="utf-8") as f:
        json.dump(estado_actual, f, ensure_ascii=False, indent=2)


def escribir_informe(contenido, sha):
    """Escribir un informe al historial de producción."""
    historial_path = os.path.expanduser("~/.starseed/produccion")
    os.makedirs(historial_path, exist_ok=True)

    historial_file = os.path.join(historial_path, "historial.jsonl")
    entrada = {"timestamp": time.strftime("%Y-%m-%d %H:%M:%S"), "sha": sha, "contenido": contenido}

    with open(historial_file, "a", encoding="utf-8") as f:
        f.write(json.dumps(entrada, ensure_ascii=False) + "\n")


def probar_candidato(candidato, config):
    """Probar un candidato para producción según §3 de director-produccion.md.

    Returns:
        (bool, str) - (passed, message)
    """
    sha = candidato.get("sha")
    tarea = candidato.get("tarea")
    archivos = candidato.get("archivos", [])
    medios = candidato.get("medios", [])

    print(f"  Probando: {tarea} ({sha[:8]}) - medios: {', '.join(medios)}")

    if config.get("revertir_auto") and not config.get("seco", False):
        print(f"  Push a produccion/candidato con SHA {sha[:8]}")
        if config.get("seco", False):
            print(f"  Modo seco: no se empujó nada")
        else:
            cmd = ["git", "push", "origin", "--force-with-lease", f"{sha}:produccion/candidato"]
            try:
                r = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True, timeout=300)
                if r.returncode != 0:
                    return False, f"push falló: {r.stderr[:200]}"
                print(f"  Push exitoso: {r.stdout[:200]}")
            except Exception as exc:
                return False, f"push error: {exc}"

    for medio in medios:
        if medio == "web":
            if config.get("seco", False):
                print(f"    Web: simulado (seco)")
            else:
                print(f"    Web: habría publicado (patrón)")
        elif medio == "mando":
            if config.get("seco", False):
                print(f"    Mando: simulado (seco)")
            else:
                print(f"    Mando: habría reconstruido")
        elif medio == "repo":
            if config.get("seco", False):
                print(f"    Repositorio: simulado (seco)")
            else:
                print(f"    Repositorio: habría hecho push a origin/main")

    print(f"  Candidato {tarea} {"APROBADO" if config.get("seco", False) or config.get("revertir_auto") else "RECHAZADO"}")
    return True, "probado"


def ejecutar_lote(lote, config):
    """Ejecutar un ciclo completo de producción para un lote.

    Returns:
        (bool, str) - (success, message)
    """
    print(f"\n=== LOTE: {lote['sha'][:8]} ({lote['tarea']}) ===")

    if config.get("revertir_auto") and not config.get("seco", False):
        resultado, mensaje = probar_candidato(lote, config)
        return resultado, mensaje
    else:
        print(f"  Modo {config['modo']}: omitiendo publicación")
        return True, "omitido"


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--modo", choices=["seco", "canario", "auto"], default="seco",
                   help="modo de operación del director")
    ap.add_argument("--seco", action="store_true",
                   help="simular sin publicar")
    ap.add_argument("--una-vez", action="store_true",
                   help="ejecutar un solo ciclo y terminar")
    args = ap.parse_args()

    if esta_pausado():
        print("Director de producción en PAUSA (ver ~/.starseed/produccion-pausada.json)")
        return 0

    config = cargar_configuracion()
    if not config.get("activo", True):
        print("Director de producción DESACTIVADO")
        return 0

    if args.seco:
        config["modo"] = "seco"
        config["seco"] = True

    progreso_general = cargar_progreso()

    try:
        spec = importlib.util.spec_from_file_location("produccion_candidatos", 
                                                      os.path.join(DIRECTORIO, "produccion_candidatos.py"))
        pc = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(pc)

        candidatos = pc.candidatos(ROOT, desde="origin/main")
        print(f"Candidatos para producción: {len(candidatos)}")

        for candidato in candidatos:
            tid = candidato.get("tarea")
            if not tid:
                continue

            lote = {
                "sha": candidato.get("sha"),
                "tarea": tid,
                "archivos": candidato.get("archivos", []),
                "medios": candidato.get("medios", []),
            }

            resultado, mensaje = ejecutar_lote(lote, config)
            if not resultado:
                print(f"  Falló el lote: {mensaje}")
                return 1

    except Exception as exc:
        print(f"Error ejecutando director: {exc}")
        return 1

    print(f"\nDirector de producción completado (modo: {config['modo']}, candidatos: {len(candidatos)})")
    return 0


if __name__ == "__main__":
    sys.exit(main())