#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Inventario de contenedores en la nube: qué servicio, qué capacidad y cuánta queda libre.

POR QUÉ EXISTE (2026-09-22). Alex: «agrega un medidor de contenedores en la nube… debe
incluir toda la información de cada servicio y proveedor de los contenedores disponibles
para que los directores de los agentes también usen esa información para enrutar procesos
a agentes en todos los contenedores y siempre se aproveche la mayor cantidad disponible».

Las dos mitades de esa frase son la razón del diseño. Hasta hoy la capacidad de la nube
vivía en dos sitios que no se hablaban: el sondeo de medios que se pinta en Genesis
(`medios_disponibles.py`) y unas constantes dentro del director (`TOPE_AGENTES = 12`,
`TRABAJADORES = 4`). O sea: lo que la pantalla enseñaba y lo que el director usaba para
decidir no eran el mismo número, y el del director era una suposición escrita a mano.

Aquí se mide UNA vez y se escribe UNA vez, en `mando/contenedores.json`. Lo leen el
medidor de Genesis y el director de la nube. Si mañana un medio cambia de capacidad, los
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
import math
import os
import sys
import time
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

RAIZ = os.environ.get("STARSEED_ROOT") or os.path.expanduser("~/Documents/starseed-os-main")
SALIDA = os.path.join(RAIZ, "starseed_memory_root", "mando", "contenedores.json")
PROGRESO = os.path.join(RAIZ, "starseed_memory_root", "olas", "progreso.json")

#: (2026-10-22, ALT1022C) Las sesiones de Claude Code en la nube. Alex tiene un crédito que SOLO
#: gastan ellas y que no toca su límite semanal (`memory/orquestacion-economica.md` §0, 4a): son
#: un medio más. Lo declarado del crédito y el registro del lanzador viven fuera del repo.
CREDITO_CLAUDE = os.path.expanduser("~/.starseed/credito-claude-nube.json")
REGISTRO_CLAUDE = os.path.expanduser("~/.starseed/alta-capacidad-nube.json")
LANZADOR_CLAUDE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "alta-capacidad-nube.py")
#: Lo que se deja sin gastar del crédito, y lo que cuesta de media una sesión (medido: ~3 $).
RESERVA_CLAUDE_USD = 10.0
COSTE_SESION_CLAUDE_USD = 3.0
#: Estados del registro que dicen que la sesión ya acabó (como `agentes-claude-nube.ts`).
SESION_CERRADA = {"terminada", "traida", "traída", "integrada", "fallida", "cancelada", "archivada", "hecha"}


def tope_claude_nube() -> int:
    try:
        return max(0, int(os.environ.get("STARSEED_ALTA_NUBE_MAX") or 4))
    except ValueError:
        return 4

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
    # (2026-10-26, CAP1026C) 3 agentes, no 1: el orquestador del A1 corre con 3 trabajadores desde el
    # 13-10 (`oracle_a1.py`, «el A1 pasa a 3 trabajadores»). Con 1, el medidor decía «1 de 1 libre» con
    # el A1 trabajando a tope y sus agentes no contaban en ningún total.
    "oracle": {
        "servicio": "Oracle Always Free",
        "proveedor": "Oracle Cloud (A1 Ampere ARM)",
        "vcpu": 2,
        "ram_gb": 12,
        "horas_job": 0,
        "jobs_simultaneos": 1,
        "agentes_por_job": 3,
        "coste": "Always Free (gratis para siempre): 2 OCPU · 12 GB · 10 TB/mes de salida",
        "lanza": "",
    },
    # (2026-10-24) Cloudroom: hilos de su nube con Pi (proveedores gratuitos) o Codex; cupo de la cuenta.
    "cloudroom": {
        "servicio": "Cloudroom (agentes en su nube)",
        "proveedor": "Cloudroom · Pi con NIM/xKiro gratis o Codex",
        "horas_job": 0,
        "jobs_simultaneos": 30,
        "agentes_por_job": 1,
        "coste": "100 agentes en la nube cada 30 días (plan gratis); los modelos, de cada proveedor",
        "lanza": "python3 scripts/puente/cloudroom_lanzar.py lanzar --ids …",
    },
    "claude-nube": {
        "servicio": "Sesiones de Claude Code en la nube",
        "proveedor": "Anthropic (crédito de sesiones en la nube)",
        "horas_job": 0,
        "jobs_simultaneos": tope_claude_nube(),
        "agentes_por_job": 1,
        "coste": "crédito de sesiones en la nube (no toca el límite semanal)",
        "lanza": "python3 scripts/puente/alta-capacidad-nube.py lanzar --auto",
    },
}

#: Medios que NO son contenedores de nube: la Mac es esta máquina y «claude» es la sesión de
#: dirección en Cowork, no un sitio donde desplegar agentes. Las sesiones de Claude Code en la
#: nube SÍ lo son, y van aparte como «claude-nube».
NO_SON_CONTENEDORES = {"mac", "claude"}


def _fecha(txt):
    """ISO con zona → datetime con zona, o None."""
    if not isinstance(txt, str) or not txt.strip():
        return None
    try:
        d = datetime.fromisoformat(txt.strip().replace("Z", "+00:00"))
    except ValueError:
        return None
    return d if d.tzinfo else d.replace(tzinfo=timezone.utc)


def _usd(v) -> float:
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


def estado_claude_nube(credito, hay_lanzador: bool, ahora: float):
    """PURA: (estado, detalle) del medio claude-nube según el crédito declarado y el lanzador."""
    if not isinstance(credito, dict) or "restante_usd" not in credito:
        return ("no_disponible", "sin crédito declarado (credito_claude_nube.py declarar --restante …)")
    vence = _fecha(credito.get("vence"))
    restante = _usd(credito.get("restante_usd"))
    if vence is not None and vence.timestamp() <= ahora:
        return ("no_disponible", "el crédito venció el %s" % credito.get("vence"))
    if restante <= RESERVA_CLAUDE_USD:
        return ("no_disponible", "quedan %.0f $ del crédito: no se baja de la reserva de %.0f $"
                % (restante, RESERVA_CLAUDE_USD))
    if not hay_lanzador:
        return ("usable", "el lanzador (scripts/puente/alta-capacidad-nube.py) aún no está en main")
    return ("listo", "crédito %.0f $ (vence %s)" % (restante, credito.get("vence") or "sin fecha"))


def coste_claude_nube(credito) -> str:
    """PURA: el coste dicho con el restante y el vencimiento."""
    if not isinstance(credito, dict):
        return CATALOGO["claude-nube"]["coste"]
    return "crédito de sesiones en la nube: quedan %.0f $ de %.0f $, vence %s (no toca el límite semanal)" % (
        _usd(credito.get("restante_usd")), _usd(credito.get("total_usd")), credito.get("vence") or "sin fecha")


def vivas_claude_nube(registro, progreso) -> int:
    """PURA: sesiones vivas = tareas del registro que siguen `reasignada` con `medio: claude-nube`.
    Una tarea con dos sesiones anotadas (un relanzamiento) es UN agente."""
    sesiones = (registro or {}).get("sesiones") if isinstance(registro, dict) else None
    progreso = progreso if isinstance(progreso, dict) else {}
    vivas = set()
    for s in sesiones if isinstance(sesiones, list) else []:
        if not isinstance(s, dict):
            continue
        tarea = str(s.get("tarea") or "").strip()
        e = progreso.get(tarea) if tarea else None
        if not isinstance(e, dict) or e.get("estado") != "reasignada" or e.get("medio") != "claude-nube":
            continue
        if str(s.get("estado") or "").strip().lower() in SESION_CERRADA:
            continue
        vivas.add(tarea)
    return len(vivas)


def caben_hoy_claude(credito, ahora: float) -> int:
    """PURA: sesiones que caben hoy = (restante − reserva) / días que faltan, a 3 $ por sesión."""
    if not isinstance(credito, dict):
        return 0
    vence = _fecha(credito.get("vence"))
    if vence is not None and vence.timestamp() <= ahora:
        return 0
    dias = max(1, math.ceil((vence.timestamp() - ahora) / 86400)) if vence is not None else 1
    presupuesto = (_usd(credito.get("restante_usd")) - RESERVA_CLAUDE_USD) / dias
    return max(0, int(presupuesto // COSTE_SESION_CLAUDE_USD))


def medio_claude_nube(credito, hay_lanzador: bool, ahora: float):
    """PURA: (medio sondeado, catálogo) de claude-nube, como si `medios_disponibles` lo diera."""
    estado, detalle = estado_claude_nube(credito, hay_lanzador, ahora)
    cat = dict(CATALOGO["claude-nube"], coste=coste_claude_nube(credito))
    if not hay_lanzador:
        cat["lanza"] = ""
    medio = {"id": "claude-nube", "nombre": cat["servicio"], "estado": estado, "detalle": detalle,
             "siguiente_paso": cat["lanza"] if estado == "listo" else ""}
    return medio, cat


def _leer_json(ruta, defecto=None):
    try:
        with open(ruta, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return defecto


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
        "maquina": ("%s vCPU · %s GB%s" % (cat.get("vcpu"), cat.get("ram_gb"),
                                           (" · %s h por job" % cat.get("horas_job")) if cat.get("horas_job") else " · siempre encendido")
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


REGISTRO_CLOUDROOM = os.path.expanduser("~/.starseed/cloudroom-hilos.json")
#: (CAP1026C) Lo que `oracle_nodo.py estado` deja del A1 (sin IPs ni claves en lo que se lee aquí).
ESTADO_ORACLE = os.path.expanduser("~/.starseed/oracle.json")
#: Un latido del nodo del A1 más viejo que esto ya no dice qué hace ahora (el ciclo lo refresca cada 30 min).
LATIDO_ORACLE_MAX_S = 45 * 60


def vivos_oracle(estado, ahora) -> int:
    """PURA (CAP1026C): agentes del A1 = trabajadores de su orquestador, si el nodo late y lo tiene vivo."""
    nodo = estado.get("nodo") if isinstance(estado, dict) else None
    if not isinstance(nodo, dict) or not nodo.get("vivo"):
        return 0
    try:
        latido = float(nodo.get("latido") or 0)
    except (TypeError, ValueError):
        return 0
    if latido <= 0 or ahora - latido > LATIDO_ORACLE_MAX_S:
        return 0
    orq = nodo.get("orquestador")
    if not isinstance(orq, dict) or not orq.get("vivo"):
        return 0
    try:
        return max(0, int(orq.get("trabajadores") or 0))
    except (TypeError, ValueError):
        return 0


def vivos_cloudroom(registro, progreso) -> int:
    """PURA: hilos de Cloudroom vivos = tareas con una fila sin `final` que siguen `reasignada` con
    `medio: cloudroom` (como agentes-cloudroom.ts). Acepta la lista o el {hilos: […]} del piloto."""
    filas = registro if isinstance(registro, list) else (registro or {}).get("hilos", []) if isinstance(registro, dict) else []
    vivas = set()
    for f in filas:
        if not isinstance(f, dict) or f.get("final") or not isinstance(f.get("tarea"), str):
            continue
        e = (progreso or {}).get(f["tarea"])
        if isinstance(e, dict) and e.get("estado") == "reasignada" and e.get("medio") == "cloudroom":
            vivas.add(f["tarea"])
    return len(vivas)


def _vivos_por_medio() -> dict:
    """Agentes y runs vivos por medio, del mismo lector que alimenta el medidor de agentes."""
    try:
        import agentes_nube as AN

        d = AN.resumir(AN._runs_de_github(), time.time())
        vivos = {"nube-gh": {"agentes": int(d.get("agentes") or 0), "runs": len(d.get("runs") or [])}}
    except Exception:
        vivos = {}
    n = vivas_claude_nube(_leer_json(REGISTRO_CLAUDE, {}), _leer_json(PROGRESO, {}))
    vivos["claude-nube"] = {"agentes": n, "runs": n}
    c = vivos_cloudroom(_leer_json(REGISTRO_CLOUDROOM, []), _leer_json(PROGRESO, {}))
    vivos["cloudroom"] = {"agentes": c, "runs": c}
    o = vivos_oracle(_leer_json(ESTADO_ORACLE, {}), time.time())
    vivos["oracle"] = {"agentes": o, "runs": 1 if o else 0}
    return vivos


def _sondeo() -> list:
    try:
        import medios_disponibles as MD

        return (MD.sondear() or {}).get("medios") or []
    except Exception as e:
        print("contenedores: no pude sondear los medios: %s: %s" % (type(e).__name__, e),
              file=sys.stderr)
        return []


def capacidad_gh(escritores, agentes_por_job, agentes_por_escritor, max_jobs) -> int:
    """PURA (2026-10-26, CAP1026F): jobs de GitHub a la vez que tienen un modelo que los escriba.

    El límite de verdad de la nube son los escritores (CLAUDE.md §17), no las máquinas: cada escritor
    vivo aguanta `agentes_por_escritor` agentes a la vez antes de los 429 (los de «Buscar más
    capacidad»: 2 jobs × 3). Antes el catálogo decía 3 jobs fijos: el director lanzaba sus 3 con un
    solo escritor vivo y «Buscar más capacidad» lanzaba los suyos con otra cuenta (9 a las 12:08).
    Ahora los dos leen el mismo número. Sin escritor, 0: un job sin modelo es un «cero commits»."""
    n = len(set(escritores or ()))
    if n <= 0:
        return 0
    por_job = max(1, int(agentes_por_job or 1))
    return max(1, min(int(max_jobs), (n * int(agentes_por_escritor)) // por_job))


def _catalogo_gh_medido(cat: dict) -> dict:
    """El catálogo de nube-gh con los jobs que aguantan los escritores vivos (salud compartida). Nunca lanza."""
    try:
        import buscar_capacidad as BC

        esc = BC.escritores_en_la_nube(None, _leer_json(BC.SALUD, {}), time.strftime("%Y-%m-%d %H:%M:%S"))
        jobs = capacidad_gh(esc, cat.get("agentes_por_job"), BC.RUNS_POR_ESCRITOR * BC.TRABAJADORES_JOB,
                            BC.MAX_RUNS_NUBE)
    except Exception:
        return cat
    medido = dict(cat)
    medido["jobs_simultaneos"] = jobs
    medido["coste"] = "%s · %d escritor(es) con cupo en la nube (%s) → %d job(s) a la vez" % (
        cat.get("coste") or "", len(esc), ", ".join(esc) or "ninguno", jobs)
    return medido


def inventario(medios_sondeados=None) -> dict:
    """`medios_sondeados`: el resultado de `medios_disponibles.sondear()` si ya se tiene
    (2026-10-05: «Buscar más capacidad» sondea una vez y lo reusa, en vez de pagar dos veces
    los ~40 s del sondeo)."""
    origen = medios_sondeados if medios_sondeados is not None else _sondeo()
    medios = [m for m in origen if str(m.get("id")) not in NO_SON_CONTENEDORES]
    vivos = _vivos_por_medio()
    # (CAP1026F) GitHub no tiene un número fijo de jobs: los que aguantan los escritores vivos.
    conts = [contenedor(m, _catalogo_gh_medido(CATALOGO["nube-gh"]) if str(m.get("id")) == "nube-gh"
                        else CATALOGO.get(str(m.get("id")), {}), vivos) for m in medios]
    # `medios_disponibles` no sondea las sesiones de Claude en la nube: se añaden aquí.
    if not any(str(m.get("id")) == "claude-nube" for m in medios):
        medio, cat = medio_claude_nube(_leer_json(CREDITO_CLAUDE), os.path.exists(LANZADOR_CLAUDE), time.time())
        conts.append(contenedor(medio, cat, vivos))
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
