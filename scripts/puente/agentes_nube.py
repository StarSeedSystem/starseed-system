#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Los agentes que trabajan EN LA NUBE, para que Genesis los cuente.

POR QUÉ EXISTE (2026-09-22)
---------------------------
Alex: «aún no veo que suba el número de agentes con las capacidades de los contenedores
en la nube de todos los proveedores». Tenía razón, y la causa es estructural: el medidor
«Agentes» lee los latidos locales y el bus de medios, y **los dos son archivos en el disco
de la Mac**. Un runner de GitHub Actions no puede escribir en ellos: anuncia su medio, sí,
pero en SU propio sistema de archivos, que se borra con el runner. Por eso la Mac veía
3 agentes mientras había 3 + 6 trabajando.

Preguntar a GitHub es la única fuente honesta: un run `in_progress` del workflow del
enjambre lleva tantos agentes como `trabajadores` se le pasaron al lanzarlo. No se
adivina nada — el dato está en los inputs del propio run.

No se llama a la red desde la petición del panel: eso metería un viaje a internet en cada
refresco. Este guion escribe `starseed_memory_root/mando/agentes-nube.json` y Genesis lo
lee de disco, como todo lo demás.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import time

RAIZ = os.environ.get("STARSEED_ROOT") or os.path.expanduser("~/Documents/starseed-os-main")
SALIDA = os.path.join(RAIZ, "starseed_memory_root", "mando", "agentes-nube.json")
WORKFLOW = "enjambre-nube.yml"
#: Un run que lleva más de esto sin acabar ya no cuenta: el tope del workflow son 45 min
#: y el job muere a las 6 h, así que algo que pase de ahí está colgado, no trabajando.
VIEJO_S = 6 * 3600
#: Estados de un run que aún no tiene máquina (o espera turno en su grupo de concurrencia).
ESPERAN_MAQUINA = ("queued", "pending", "waiting", "requested")


def trabajadores_de(inputs) -> int:
    """Cuántos agentes lleva un run, según los inputs con que se lanzó.

    PURA. Sin inputs legibles se devuelve 1 y no 3: contar de más es exactamente lo que
    no queremos — el medidor tiene que quedarse corto antes que mentir hacia arriba.
    """
    if not isinstance(inputs, dict):
        return 1
    v = inputs.get("trabajadores")
    try:
        n = int(str(v).strip())
    except (TypeError, ValueError):
        return 1
    return n if 1 <= n <= 32 else 1


def resumir(runs, ahora: float, viejo_s: int = VIEJO_S) -> dict:
    """PURA: de la lista de runs de GitHub al resumen que lee Genesis.

    Solo entran los `in_progress` (y `queued`, que ya tienen máquina asignada) que no
    lleven más de `viejo_s`. Un run terminado no tiene agentes, por muy reciente que sea.
    """
    vivos, agentes = [], 0
    for r in runs or []:
        if not isinstance(r, dict):
            continue
        estado = str(r.get("status") or "")
        if estado not in ("in_progress",) + ESPERAN_MAQUINA:
            continue
        edad = None
        t = str(r.get("createdAt") or "")
        if t:
            try:
                import datetime as _dt

                inicio = _dt.datetime.fromisoformat(t.replace("Z", "+00:00")).timestamp()
                edad = ahora - inicio
            except ValueError:
                edad = None
        if edad is not None and edad > viejo_s:
            continue
        n = trabajadores_de(r.get("inputs"))
        # Los que esperan máquina (o turno en su grupo de concurrencia: «pending») cuentan contra el
        # tope del director, como siempre; Genesis los enseña «esperando máquina», no escribiendo.
        agentes += n
        fila = {
            "run": r.get("databaseId"),
            "estado": estado,
            "agentes": n,
            "cola": (r.get("inputs") or {}).get("cola") if isinstance(r.get("inputs"), dict) else None,
            "minutos": int(edad / 60) if edad is not None else None,
            "enlace": r.get("url"),
        }
        # (PDA1012) El paso REAL del job ahora mismo («Enjambre», «Entregar»…), leído de GitHub.
        paso = r.get("paso") if isinstance(r.get("paso"), dict) else None
        if paso and paso.get("nombre"):
            fila["paso"] = str(paso["nombre"])[:60]
            if paso.get("desde"):
                fila["paso_desde"] = str(paso["desde"])[:30]
            if paso.get("numero") is not None:
                fila["paso_numero"] = paso.get("numero")
            if paso.get("de_antes"):
                fila["paso_de_antes"] = True
            if paso.get("hechos") is not None:
                fila["pasos_hechos"] = int(paso.get("hechos") or 0)
                fila["pasos_total"] = int(paso.get("total") or 0)
        if isinstance(r.get("inputs"), dict) and r["inputs"].get("minutos"):
            fila["minutos_tope"] = r["inputs"].get("minutos")
        vivos.append(fila)
    # (2026-10-13) Cada run con su diagnóstico: la MISMA regla que usa el director para actuar.
    try:
        import vigia_runs_nube as VR

        for fila in vivos:
            atasco = VR.diagnosticar(fila, vivos, ahora)
            if atasco:
                fila["atasco"] = atasco
    except ImportError:
        pass
    return {
        "generado": time.strftime("%Y-%m-%d %H:%M:%S"),
        "medio": "nube-gh",
        "runs": vivos,
        "agentes": agentes,
    }


def _numero(paso, i):
    try:
        return int(paso.get("numero"))
    except (TypeError, ValueError):
        return i + 1


def paso_actual(jobs) -> dict | None:
    """PURA. Del `jobs` de un run de GitHub al paso en curso: {nombre, desde, numero, hechos, total}.

    (2026-10-13, MEDIDO) Se tomaba el PRIMER paso «in_progress», y GitHub deja a menudo «Set up
    job» o «setup-node» en «in_progress» con el job ya en «Enjambre» (runs 38472212923 y
    38472833577: Genesis decía «preparando su máquina» con los 7 agentes escribiendo). Manda el
    paso más AVANZADO de los ya empezados (en curso o hechos), por su número. Sin pasos: si el job
    espera máquina se dice así; si ya corre, «sin dato del paso» (GitHub a veces no los da), con
    la hora de arranque del job: no se inventa «preparando».
    """
    if not isinstance(jobs, list) or not jobs:
        return {"nombre": "esperando máquina", "desde": None, "numero": None, "hechos": 0, "total": 0}
    vivo = next((j for j in jobs if isinstance(j, dict) and j.get("estado") == "in_progress"), None) or jobs[0]
    vivo = vivo if isinstance(vivo, dict) else {}
    pasos = [p for p in (vivo.get("pasos") or []) if isinstance(p, dict)]
    if not pasos:
        espera = vivo.get("estado") in ESPERAN_MAQUINA
        return {"nombre": "esperando máquina" if espera else "sin dato del paso",
                "desde": None if espera else vivo.get("inicio"), "numero": None, "hechos": 0, "total": 0}
    hechos = sum(1 for p in pasos if p.get("estado") == "completed")
    numerados = [(_numero(p, i), p) for i, p in enumerate(pasos)]
    empezados = [(n, p) for n, p in numerados if p.get("estado") in ("in_progress", "completed")]
    n, actual = max(empezados, key=lambda x: x[0]) if empezados else numerados[0]
    return {"nombre": str(actual.get("nombre") or "?"), "desde": actual.get("inicio"), "numero": n,
            "hechos": hechos, "total": len(pasos)}


def paso_monotono(previo, nuevo) -> dict | None:
    """PURA. Un job no vuelve atrás: si la medición nueva viene sin pasos o con un paso anterior al
    ya visto (GitHub da listas incompletas mientras el job corre), se queda el visto, marcado
    `de_antes`. Si la nueva va igual o más lejos, manda la nueva."""
    if not isinstance(previo, dict) or previo.get("numero") is None:
        return nuevo
    if not isinstance(nuevo, dict):
        return dict(previo, de_antes=True)
    if nuevo.get("numero") is None and nuevo.get("nombre") == "esperando máquina":
        return nuevo
    try:
        if nuevo.get("numero") is not None and int(nuevo["numero"]) >= int(previo["numero"]):
            return nuevo
    except (TypeError, ValueError):
        return nuevo
    return dict(previo, de_antes=True)


def _runs_de_github() -> list:
    """Los runs del workflow, con sus inputs. Aquí sí se toca la red (una vez cada ciclo)."""
    try:
        p = subprocess.run(
            ["gh", "run", "list", "--workflow", WORKFLOW, "--limit", "12",
             "--json", "databaseId,status,createdAt,url"],
            cwd=RAIZ, capture_output=True, text=True, timeout=45,
        )
        if p.returncode != 0:
            return []
        runs = json.loads(p.stdout or "[]")
    except Exception:
        return []
    # `gh run list` no trae los inputs: hay que pedirlos run por run, y solo de los vivos.
    for r in runs:
        if str(r.get("status")) not in ("in_progress",) + ESPERAN_MAQUINA:
            continue
        # (PDA1012) Alex vio «undefined» como detalle de los agentes de la nube: no se sabía en qué
        # paso iba cada run. GitHub sí lo dice: el paso del job que está en curso ahora mismo.
        try:
            q = subprocess.run(
                ["gh", "api", "/repos/{owner}/{repo}/actions/runs/%s/jobs" % r["databaseId"],
                 "--jq", "[.jobs[] | {estado: .status, inicio: .started_at, pasos: [.steps[]? | {numero: .number, nombre: .name, estado: .status, inicio: .started_at}]}]"],
                cwd=RAIZ, capture_output=True, text=True, timeout=30,
            )
            if q.returncode == 0:
                r["paso"] = paso_monotono(_paso_guardado(r["databaseId"]), paso_actual(json.loads(q.stdout or "[]")))
        except Exception:
            pass
        # Los inputs de un workflow_dispatch no se pueden leer por la API después del
        # lanzamiento. Se guardan al lanzar, en este mismo archivo, por `nube-gh.py`.
        r["inputs"] = _inputs_guardados(r["databaseId"])
    return runs


def _paso_guardado(run_id) -> dict | None:
    """El último paso medido de ese run (para que no vuelva atrás con una lista incompleta)."""
    try:
        with open(SALIDA, encoding="utf-8") as f:
            previo = json.load(f)
        for r in previo.get("runs") or []:
            if str(r.get("run")) == str(run_id) and r.get("paso_numero") is not None:
                return {"nombre": r.get("paso"), "desde": r.get("paso_desde"), "numero": r.get("paso_numero"),
                        "hechos": r.get("pasos_hechos", 0), "total": r.get("pasos_total", 0)}
    except Exception:
        pass
    return None


def _inputs_guardados(run_id) -> dict:
    """Los inputs que `nube-gh.py lanzar` anotó al disparar el run."""
    try:
        with open(SALIDA, encoding="utf-8") as f:
            previo = json.load(f)
        for r in previo.get("lanzamientos") or []:
            if str(r.get("run")) == str(run_id):
                return {"trabajadores": r.get("trabajadores"), "cola": r.get("cola"), "minutos": r.get("minutos")}
    except Exception:
        pass
    return {}


def conservar_lanzamientos(datos: dict, previo) -> dict:
    """PURA: devuelve `datos` con los lanzamientos anotados de `previo` intactos.

    (2026-09-22) Esto es un parche con sangre. El director de la nube escribía este mismo
    archivo con la salida de `resumir()` a pelo, y `resumir()` no sabe nada de
    lanzamientos: cada medición borraba la única anotación que dice con cuántos
    trabajadores salió cada run, así que un run de 4 agentes volvía a contarse como 1.
    La misma enfermedad de siempre — dos sitios escribiendo el mismo archivo de forma
    distinta — así que ahora sólo se escribe por aquí.
    """
    salida = dict(datos or {})
    if isinstance(previo, dict):
        salida["lanzamientos"] = (previo.get("lanzamientos") or [])[-30:]
    else:
        salida["lanzamientos"] = []
    return salida


def escribir(datos: dict) -> dict:
    """El ÚNICO escritor del bus de agentes de la nube."""
    try:
        with open(SALIDA, encoding="utf-8") as f:
            previo = json.load(f)
    except Exception:
        previo = None
    datos = conservar_lanzamientos(datos, previo)
    try:
        os.makedirs(os.path.dirname(SALIDA), exist_ok=True)
        with open(SALIDA, "w", encoding="utf-8") as f:
            json.dump(datos, f, ensure_ascii=False, indent=1)
    except OSError:
        pass
    return datos


def main() -> int:
    datos = escribir(resumir(_runs_de_github(), time.time()))
    print("agentes en la nube: %d en %d run(s)" % (datos["agentes"], len(datos["runs"])))
    for r in datos["runs"]:
        print("  run %s · %s agentes · %s" % (r["run"], r["agentes"], r.get("cola") or "?"))
    return 0


if __name__ == "__main__":
    sys.exit(main() or 0)
