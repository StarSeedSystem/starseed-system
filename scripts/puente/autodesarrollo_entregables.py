#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Entregables de la imaginación (Ola 1025S · IMG1025A).

Una propuesta APROBADA que no es código (diseño, contenido, investigación u otro sin tarea accionable:
`autodesarrollo_decidir.via == "entregable"`) no va a la cola de código: se convierte en UNA tarea de
análisis para el enjambre (`tipo: "analisis"`, `modo: "libre"`, la rama `_analisis_libre` del analista)
que produce el ENTREGABLE terminado en
`starseed_memory_root/imaginacion/agentes/entregable-<id seguro>-v<n>.json`. La fuente «agentes» NO lo
recoge como propuesta (sería un bucle: cada entregable bueno pediría otro); lo recoge el director, que
marca la propuesta «hecha» con el rastro en `entregable` {tarea, salida, cola, encolada, recibido, titulo}.
Sin respuesta en 72 h se vuelve a encargar una vez; a la segunda, vuelve a la lista de Alex.

PURO salvo lo que ya hace `autodesarrollo_reimaginar.encolar` (la cola `cola-suenos-entregables-<fecha>`:
el prefijo `cola-suenos-` aparta a los orquestadores de código).
"""
from __future__ import annotations

from datetime import datetime, timedelta

import autodesarrollo_decidir as AD
import autodesarrollo_fuentes as AF
import autodesarrollo_reimaginar as AR

PREFIJO_COLA = "cola-suenos-entregables-"
PREFIJO_SALIDA = AF.PREFIJO_ENTREGABLE
CADUCA_H = 72
MAX_INTENTOS = 2
MAX_CUERPO_PROMPT = 4000


def _intento(p):
    e = p.get("entregable") if isinstance(p.get("entregable"), dict) else {}
    n = e.get("intentos")
    return n if isinstance(n, int) and not isinstance(n, bool) and n > 0 else 0


def _sufijo(p):
    """«-v<n>» y, si es un reencargo, «-r<k>»: otro intento es otra tarea y otra salida (si no, el analista daría
    por hecha la salida vacía de antes y la cola no repetiría el id)."""
    return "-v%d" % AD.version(p) + ("-r%d" % _intento(p) if _intento(p) else "")


def nombre_salida(p):
    return "%s%s%s.json" % (PREFIJO_SALIDA, AF.id_seguro(p.get("id") or "x", 60, unico=True), _sufijo(p))


def ruta_salida(p):
    """Relativa a la raíz del repositorio; `analista.ruta_salida_segura` exige esta carpeta."""
    return "/".join((AR.CARPETA_AGENTES.replace("\\", "/"), nombre_salida(p)))


def id_tarea(p):
    return "ENT-%s%s" % (AF.id_seguro(p.get("id") or "x", 44, unico=True), _sufijo(p))


def _prompt(p):
    tipo = p.get("tipo") or "otro"
    lineas = [
        "IMAGINACIÓN · entregable, NO escritura: no edites ningún archivo del repositorio ni hagas commits.",
        "",
        "Esta propuesta (tipo %s) ya está APROBADA. Produce el ENTREGABLE terminado que describe —el texto, la "
        "investigación o la especificación de diseño completos—, no otra propuesta ni un plan de trabajo." % tipo,
        "No inventes datos, citas, cifras ni URLs: lo que no se pueda comprobar sin navegar, márcalo como "
        "«pendiente de verificar». Referencias solo https.",
    ]
    if tipo in AR.TIPOS_DISENO:
        lineas.append("Hazlo como profesional del diseño gráfico y de contenidos, con la identidad de StarSeed OS "
                      "(lee " + ", ".join(AR.LECTURAS_DISENO) + ").")
    lineas += ["", "Propuesta v%d (ámbito %s): «%s»" % (AD.version(p), p.get("ambito") or "metagenesis", p.get("titulo") or ""),
               str(p.get("cuerpo") or "")[:MAX_CUERPO_PROMPT]]
    refs = AF.referencias(p.get("referencias") or [])
    if refs:
        lineas += ["", "Referencias:"] + ["- %s — %s" % (r["titulo"], r["url"]) for r in refs]
    lineas += ["", "Devuelve SOLO JSON: {\"propuestas\": [UNA sola {titulo (≤ 200), cuerpo (el entregable en Markdown, "
               "≤ 8000), tipo: \"%s\", referencias [{titulo, url}] solo https}]}. Se guarda en %s." % (tipo, ruta_salida(p))]
    return "\n".join(lineas)


def tarea(p, ahora):
    """La tarea de análisis libre que produce el entregable de `p`. PURA (el reloj entra por `ahora`)."""
    t = {"id": id_tarea(p), "ola": "Imaginación · entregables %s" % ahora.strftime("%Y-%m-%d"),
         "titulo": ("Entregable · %s" % (p.get("titulo") or p.get("id")))[:200], "tipo": "analisis", "modo": "libre",
         "area": "imaginacion", "agente": "entregables", "archivos": [], "depende": [],
         "propuesta": {k: p.get(k) for k in ("id", "fuente", "agente", "tipo", "ambito", "titulo", "cuerpo",
                                             "referencias", "version") if p.get(k) is not None},
         "salida": ruta_salida(p), "formato_salida": "starseed-imaginacion-entregable/1",
         "contexto": "entregable de %s" % p.get("id"), "prompt": _prompt(p)}
    if (p.get("tipo") or "otro") in AR.TIPOS_DISENO:
        t.update(rol="diseno", capacidad="alta", lecturas=list(AR.LECTURAS_DISENO))
    if _intento(p):
        t["rehacer"] = True
    return t


def _rastro(p):
    e = p.get("entregable")
    return e if isinstance(e, dict) else {}


def en_vuelo(propuestas):
    """Cuántos entregables están encargados y sin recibir (para el tope en vuelo)."""
    return sum(1 for p in propuestas if isinstance(p, dict) and p.get("estado") == "encargada"
               and _rastro(p).get("tarea") and not _rastro(p).get("recibido"))


def marcar_encargada(p, t, cola, ahora_iso):
    e = p.setdefault("entregable", {})
    e.update(tarea=t["id"], salida=t["salida"], cola=cola, encolada=ahora_iso)
    p["estado"], p["tarea"] = "encargada", t["id"]
    p["motivo_destino"] = "la flota prepara el entregable (%s)" % t["id"]
    p["t"] = ahora_iso
    return p


def leer_resultado(doc):
    """(ok, titulo) de lo que dejó el analista: `{propuestas: [{titulo, cuerpo}…]}` o una lista. PURA."""
    items = doc.get("propuestas") if isinstance(doc, dict) else doc
    for it in items if isinstance(items, list) else []:
        if isinstance(it, dict) and str(it.get("cuerpo") or "").strip() and str(it.get("titulo") or "").strip():
            return True, str(it["titulo"]).strip()[:200]
    return False, ""


def _fecha(v):
    try:
        return datetime.fromisoformat(str(v))
    except ValueError:
        return None


def revisar(p, doc, ahora, ahora_iso, horas=CADUCA_H, maximo=MAX_INTENTOS):
    """Mira un entregable encargado. `doc`: el JSON de su salida (None si aún no existe). Devuelve lo que pasó:
    «recibido» (→ hecha) · «esperando» · «reencargar» (→ aprobada sin tarea, otro intento) · «a-tu-lista»
    (→ pregunta, tras `maximo` intentos). Aplica el cambio en `p`."""
    e = _rastro(p)
    if p.get("estado") != "encargada" or not e.get("tarea") or e.get("recibido"):
        return "esperando"
    ok, titulo = leer_resultado(doc) if doc is not None else (False, "")
    if ok:
        e.update(recibido=ahora_iso, titulo=titulo)
        p["estado"], p["t"] = "hecha", ahora_iso
        p["motivo_destino"] = "entregable listo: %s" % e.get("salida")
        return "recibido"
    if doc is None:  # aún no llegó: se espera hasta que caduque (la escritura del analista es atómica)
        t = _fecha(e.get("encolada"))
        if t is not None and t.tzinfo is not None and ahora.tzinfo is None:
            t = t.replace(tzinfo=None)
        if t is None or ahora - t < timedelta(hours=horas):
            return "esperando"
        por_que = "no llegó en %d h" % horas
    else:  # llegó sin ningún entregable con título y cuerpo: ese intento ya falló
        por_que = "llegó vacío"
    e["intentos"] = _intento(p) + 1
    for k in ("tarea", "encolada", "cola"):
        e.pop(k, None)
    p.pop("tarea", None)
    p["t"] = ahora_iso
    if e["intentos"] >= maximo:
        p["estado"] = "pregunta"
        p["motivo_destino"] = "el entregable %s y van %d intento(s): queda en tu lista" % (por_que, e["intentos"])
        return "a-tu-lista"
    p["estado"] = "aprobada"
    p["motivo_destino"] = "el entregable %s: se vuelve a encargar" % por_que
    return "reencargar"


def encolar(mem, tareas, ahora):
    """E/S fina: la misma vía atómica que las reimaginaciones, en `olas/cola-suenos-entregables-<fecha>.json`."""
    return AR.encolar(mem, tareas, ahora, prefijo=PREFIJO_COLA)
