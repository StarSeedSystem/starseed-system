#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Inventario de contenedores en la nube: qué servicio, qué capacidad y cuánta queda libre.

POR QUÉ EXISTE (2026-09-22). Alex: «agrega un medidor de contenedores en la nube… debe
incluir toda la información de cada servicio y proveedor de los contenedores disponibles
para que los directores de los agentes también usen esa información para enrutar procesos
a agentes en todos los contenedores y siempre se aproveche la mayor cantidad disponible».

Las dos mitades de esa frase son la razón del diseño. Hasta hoy la capacidad de la nube
vivía en dos sitios que no se hablaban: el sondeo de medios que se pinta en el Puente
(`medios_disponibles.py`) y unas constantes dentro del director (`TOPE_AGENTES = 12`,
`TRABAJADORES = 4`). O sea: lo que la pantalla enseñaba y lo que el director usaba para
decidir no eran el mismo número, y el del director era una suposición escrita a mano.

Aquí se mide UNA vez y se escribe UNA vez, en `mando/contenedores.json`. Lo leen el
medidor del Puente y el director de la nube. Si mañana un medio cambia de capacidad, los
dos cambian juntos, porque es el mismo archivo.

Qué se mide de cada contenedor:
  · servicio y proveedor, y en qué estado está (listo · usable · requiere_alex · no_disponible)
  · la máquina: vCPU, RAM, tope de horas por job
  · cuántos jobs simultáneos admite y cuántos agentes caben en cada job
  · cuántos agentes tiene AHORA y cuántos quedan libres
  · qué falta para poder usarlo, y el paso exacto que lo arregla

  python3 scripts/puente/contenedores_nube.py            # texto
  python3 scripts/puente/contenedores_nube.py --json     # JSON y lo escribe en el bus
"""
from __future__ import annotations

import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

RAIZ = os.environ.get("STARSEED_ROOT") or os.path.expanduser("~/Documents/starseed-os-main")
SALIDA = os.path.join(RAIZ, "starseed_memory_root", "mando", "contenedores.json")

#: Lo que sabemos de cada medio y que NO se puede sondear: la máquina que da el servicio y
#: cuántos jobs deja a la vez. Son datos de catálogo, medidos el 21 y 22 de septiembre, no
#: adivinados: GitHub Actions en repo público da runners de 4 vCPU / 16 GB sin tope de
#: minutos y admite unos 20 jobs simultáneos (aquí se usan 3 para no ahogar las pasarelas
#: gratuitas, que son el cuello de botella real y no las máquinas).
CATALOGO = {
    "nube-gh": {
        "servicio": "GitHub Actions",
        "proveedor": "GitHub (repo público StarSeedSystem/starseed-system)",
        "vcpu": 4,
        "ram_gb": 16,
        "horas_job": 6,
        "jobs_simultaneos": 3,
        "agentes_por_job": 4,
        "coste": "gratis y sin tope de minutos (repo público)",
        "lanza": "python3 scripts/puente/nube-gh.py lanzar",
    },
    "hf": {
        "servicio": "Hugging Face Spaces",
        "proveedor": "Hugging Face",
        "vcpu": 2,
        "ram_gb": 16,
        "horas_job": 0,
        "jobs_simultaneos": 0,
        "agentes_por_job": 0,
        "coste": "exige suscripción PRO para Docker en CPU (comprobado: HTTP 402)",
        "lanza": "",
    },
    "gcloud": {
        "servicio": "Google Cloud Run",
        "proveedor": "Google Cloud",
        "vcpu": 2,
        "ram_gb": 4,
        "horas_job": 1,
        "jobs_simultaneos": 0,
        "agentes_por_job": 0,
        "coste": "capa gratuita por peticiones; no está pensado para tandas largas",
        "lanza": "",
    },
    "colab": {
        "servicio": "Google Colab / Kaggle",
        "proveedor": "Google / Kaggle",
        "vcpu": 4,
        "ram_gb": 30,
        "horas_job": 12,
        "jobs_simultaneos": 0,
        "agentes_por_job": 0,
        "coste": "gratis, pero sin API: hace falta un cuaderno lanzador",
        "lanza": "",
    },
    "oracle": {
        "servicio": "Oracle Free Tier",
        "proveedor": "Oracle",
        "vcpu": 0,
        "ram_gb": 0,
        "horas_job": 0,
        "jobs_simultaneos": 0,
        "agentes_por_job": 0,
        "coste": "descartado por Alex (no deja crear la cuenta)",
        "lanza": "",
    },
}

#: Medios que NO son contenedores de nube: la Mac es esta máquina y «claude» es una sesión
#: de pago, no un contenedor donde desplegar agentes gratis.
NO_SON_CONTENEDORES = {"mac", "claude"}


def libres_de(cat: dict, agentes_ahora: int, runs_ahora: int) -> int:
    """PURA: cuántos agentes más caben en este medio ahora mismo.

    Se cuenta por JOBS libres, no por agentes sueltos: un job es la unidad que se lanza, y
    medio job no existe. Un medio sin `jobs_simultaneos` (no usable) no tiene sitio: 0.
    """
    jobs = int(cat.get("jobs_simultaneos") or 0)
    por_job = int(cat.get("agentes_por_job") or 0)
    if jobs <= 0 or por_job <= 0:
        return 0
    jobs_libres = max(0, jobs - max(0, int(runs_ahora)))
    # Si los runs vivos ya traen más agentes de los que cabrían, no se inventa sitio.
    tope = max(0, jobs * por_job - max(0, int(agentes_ahora)))
    return min(jobs_libres * por_job, tope)


def contenedor(medio: dict, cat: dict, vivos_por_medio: dict) -> dict:
    """PURA: un medio sondeado + su catálogo + lo que está vivo → la ficha completa."""
    mid = str(medio.get("id") or "")
    vivo = vivos_por_medio.get(mid) or {}
    agentes = int(vivo.get("agentes") or 0)
    runs = int(vivo.get("runs") or 0)
    usable = str(medio.get("estado")) in ("listo", "usable")
    libres = libres_de(cat, agentes, runs) if usable else 0
    return {
        "id": mid,
        "servicio": cat.get("servicio") or medio.get("nombre") or mid,
        "proveedor": cat.get("proveedor") or "",
        "estado": medio.get("estado") or "no_disponible",
        "maquina": ("%s vCPU · %s GB · %s h por job" % (cat.get("vcpu"), cat.get("ram_gb"), cat.get("horas_job"))
                    if cat.get("vcpu") else ""),
        "jobs_simultaneos": int(cat.get("jobs_simultaneos") or 0),
        "agentes_por_job": int(cat.get("agentes_por_job") or 0),
        "agentes_ahora": agentes,
        "runs_ahora": runs,
        "agentes_libres": libres,
        "coste": cat.get("coste") or "",
        "detalle": medio.get("detalle") or "",
        "falta": "" if usable else (medio.get("detalle") or ""),
        "siguiente_paso": medio.get("siguiente_paso") or "",
        "lanza": cat.get("lanza") or "",
        "desplegable": bool(usable and libres > 0 and cat.get("lanza")),
    }


def resumir(contenedores: list) -> dict:
    """PURA: los totales que usan el medidor y el director."""
    usables = [c for c in contenedores if c["estado"] in ("listo", "usable")]
    return {
        "contenedores": len(contenedores),
        "usables": len(usables),
        "agentes_ahora": sum(c["agentes_ahora"] for c in contenedores),
        "agentes_libres": sum(c["agentes_libres"] for c in contenedores),
        "agentes_tope": sum(c["jobs_simultaneos"] * c["agentes_por_job"] for c in usables),
        "por_hacer": len([c for c in contenedores if c["estado"] == "requiere_alex"]),
    }


def _vivos_por_medio() -> dict:
    """Agentes y runs vivos por medio, del mismo lector que alimenta el medidor de agentes."""
    try:
        import agentes_nube as AN

        d = AN.resumir(AN._runs_de_github(), time.time())
        return {"nube-gh": {"agentes": int(d.get("agentes") or 0), "runs": len(d.get("runs") or [])}}
    except Exception:
        return {}


def _sondeo() -> list:
    try:
        import medios_disponibles as MD

        return (MD.sondear() or {}).get("medios") or []
    except Exception as e:
        print("contenedores: no pude sondear los medios: %s: %s" % (type(e).__name__, e),
              file=sys.stderr)
        return []


def inventario() -> dict:
    medios = [m for m in _sondeo() if str(m.get("id")) not in NO_SON_CONTENEDORES]
    vivos = _vivos_por_medio()
    conts = [contenedor(m, CATALOGO.get(str(m.get("id")), {}), vivos) for m in medios]
    # Los usables primero, y dentro de ellos los que tienen más sitio: así el director
    # coge el mejor sin ordenar por su cuenta (otra vez, un solo criterio y no dos).
    orden = {"listo": 0, "usable": 1, "requiere_alex": 2, "no_disponible": 3}
    conts.sort(key=lambda c: (orden.get(c["estado"], 9), -c["agentes_libres"], c["id"]))
    return {"generado": time.strftime("%Y-%m-%d %H:%M:%S"), "contenedores": conts,
            "resumen": resumir(conts)}


def escribir(datos: dict) -> dict:
    try:
        os.makedirs(os.path.dirname(SALIDA), exist_ok=True)
        with open(SALIDA, "w", encoding="utf-8") as f:
            json.dump(datos, f, ensure_ascii=False, indent=1)
    except OSError:
        pass
    return datos


def leer() -> dict:
    """Lo último medido, para quien no quiera pagar el sondeo (tarda ~40 s)."""
    try:
        with open(SALIDA, encoding="utf-8") as f:
            d = json.load(f)
        return d if isinstance(d, dict) else {}
    except Exception:
        return {}


def texto(d: dict) -> str:
    lineas = []
    r = d.get("resumen") or {}
    lineas.append("%d contenedor(es) · %d usable(s) · %d agente(s) ahora · %d libre(s) de %d"
                  % (r.get("contenedores", 0), r.get("usables", 0), r.get("agentes_ahora", 0),
                     r.get("agentes_libres", 0), r.get("agentes_tope", 0)))
    for c in d.get("contenedores") or []:
        lineas.append("%-9s %-12s %-22s %s" % (c["id"], c["estado"], c["servicio"], c["maquina"]))
        lineas.append("          %d job(s) × %d agentes · ahora %d · libres %d · %s"
                      % (c["jobs_simultaneos"], c["agentes_por_job"], c["agentes_ahora"],
                         c["agentes_libres"], c["coste"]))
        if c["falta"]:
            lineas.append("          falta: %s%s" % (c["falta"],
                                                     (" → " + c["siguiente_paso"]) if c["siguiente_paso"] else ""))
        elif c["siguiente_paso"]:
            lineas.append("          se usa con: %s" % c["siguiente_paso"])
    return "\n".join(lineas)


def main() -> int:
    d = escribir(inventario())
    print(json.dumps(d, ensure_ascii=False, indent=1) if "--json" in sys.argv else texto(d))
    return 0


if __name__ == "__main__":
    sys.exit(main() or 0)
