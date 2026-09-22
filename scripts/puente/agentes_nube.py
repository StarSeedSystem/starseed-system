#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Los agentes que trabajan EN LA NUBE, para que el Puente los cuente.

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
refresco. Este guion escribe `starseed_memory_root/mando/agentes-nube.json` y el Mando lo
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
    """PURA: de la lista de runs de GitHub al resumen que lee el Puente.

    Solo entran los `in_progress` (y `queued`, que ya tienen máquina asignada) que no
    lleven más de `viejo_s`. Un run terminado no tiene agentes, por muy reciente que sea.
    """
    vivos, agentes = [], 0
    for r in runs or []:
        if not isinstance(r, dict):
            continue
        estado = str(r.get("status") or "")
        if estado not in ("in_progress", "queued"):
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
        agentes += n
        vivos.append(
            {
                "run": r.get("databaseId"),
                "estado": estado,
                "agentes": n,
                "cola": (r.get("inputs") or {}).get("cola") if isinstance(r.get("inputs"), dict) else None,
                "minutos": int(edad / 60) if edad is not None else None,
                "enlace": r.get("url"),
            }
        )
    return {
        "generado": time.strftime("%Y-%m-%d %H:%M:%S"),
        "medio": "nube-gh",
        "runs": vivos,
        "agentes": agentes,
    }


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
        if str(r.get("status")) not in ("in_progress", "queued"):
            continue
        try:
            q = subprocess.run(
                ["gh", "api", "/repos/{owner}/{repo}/actions/runs/%s" % r["databaseId"],
                 "--jq", ".display_title"],
                cwd=RAIZ, capture_output=True, text=True, timeout=30,
            )
            del q  # el título no nos sirve; los inputs se leen del archivo de la cola
        except Exception:
            pass
        # Los inputs de un workflow_dispatch no se pueden leer por la API después del
        # lanzamiento. Se guardan al lanzar, en este mismo archivo, por `nube-gh.py`.
        r["inputs"] = _inputs_guardados(r["databaseId"])
    return runs


def _inputs_guardados(run_id) -> dict:
    """Los inputs que `nube-gh.py lanzar` anotó al disparar el run."""
    try:
        with open(SALIDA, encoding="utf-8") as f:
            previo = json.load(f)
        for r in previo.get("lanzamientos") or []:
            if str(r.get("run")) == str(run_id):
                return {"trabajadores": r.get("trabajadores"), "cola": r.get("cola")}
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
