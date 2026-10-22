#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Las cuatro fuentes de imaginación → propuestas normalizadas (§3).
PURO: sin red, disco ni reloj; la fecha y lo ya encargado los pasa quien llama."""
from __future__ import annotations
import re
import dream_a_cola as D

_ARCHIVO = re.compile(r"([A-Za-z0-9_./-]+\.(?:tsx?|jsx?|py|mjs|cjs|json|md|sql|ya?ml|css|scss|sh|toml))(?::(\d+))?")
_PESO = re.compile(r"(impacto|esfuerzo)\s*[:=]?\s*(\d)", re.I)
_APLICADA = re.compile(r"applied|completed|done|discarded|rejected|aplicad|completad|descartad|rechazad", re.I)
_IMPORTANCIA = {"critical": 5, "critica": 5, "crítica": 5, "high": 4, "alta": 4,
                "medium": 3, "media": 3, "low": 2, "baja": 2}

def _num(v, d=0):
    try: return float(v)
    except (TypeError, ValueError): return float(d)
def _refs(texto, archivo="", linea=0):
    archivos = []
    for m in _ARCHIVO.finditer(texto or ""):
        a = m.group(1).lstrip("./") if "://" not in m.group(0) else ""
        if a and a not in archivos: archivos.append(a)
        if len(archivos) >= 3: break
    if archivo: cita = "%s:%s" % (archivo, int(linea)) if linea else str(archivo)
    elif archivos:
        m = _ARCHIVO.search(texto or "")
        cita = archivos[0] + (":%s" % m.group(2) if m and m.group(2) else "")
    else: cita = ""
    return archivos, cita
def _pesos(texto, impacto=2, esfuerzo=3):
    for nombre, valor in _PESO.findall(texto or ""):
        if nombre.lower() == "impacto": impacto = int(valor)
        else: esfuerzo = int(valor)
    return impacto, esfuerzo
def _propuesta(fuente, clave, titulo, cuerpo, archivos, cita, verif, impacto, esfuerzo, origen):
    return {"id": "%s:%s" % (fuente, clave), "fuente": fuente,
            "titulo": str(titulo or "").strip(), "cuerpo": str(cuerpo or "").strip(),
            "archivos": list(archivos or [])[:3], "cita": cita or "",
            "verificacion": verif or "sin_verificar", "impacto": int(round(_num(impacto))),
            "esfuerzo": int(round(_num(esfuerzo))), "origen": dict(origen or {})}
def de_diaria(texto_md, fecha, ya_encargadas=()):
    ya, vistas, fuera = {str(k) for k in (ya_encargadas or ()) if str(k)}, set(), []
    for seccion, lineas in D.secciones(texto_md).items():
        for titulo, cuerpo in D.puntos(lineas):
            clave = D.clave(titulo)
            if clave and clave not in vistas and clave not in ya and D.es_accionable(titulo, cuerpo):
                vistas.add(clave)
                texto = "%s %s" % (titulo, cuerpo)
                impacto, esfuerzo = _pesos(texto)
                archivos, cita = _refs(texto)
                fuera.append(_propuesta("diaria", clave, titulo, cuerpo or titulo, archivos, cita,
                                        "sin_verificar", impacto, esfuerzo,
                                        {"fecha": fecha, "seccion": seccion, "clave": clave}))
    return fuera
def de_profunda(consolidado, fecha, ya_encargadas=()):
    top = consolidado.get("top") if isinstance(consolidado, dict) else consolidado
    ya, vistas, fuera = {str(k) for k in (ya_encargadas or ()) if str(k)}, set(), []
    for u in top if isinstance(top, list) else []:
        if not isinstance(u, dict) or u.get("ya_encargada") or u.get("accionable") is False:
            continue
        prop = u.get("propuesta")
        prop = prop if isinstance(prop, dict) else {}
        titulo = u.get("titulo") or prop.get("titulo") or ""
        clave = str(u.get("clave") or D.clave(titulo))
        if not clave or clave in vistas or clave in ya: continue
        vistas.add(clave)
        archivo = str(u.get("archivo") or "")
        archivos = [a for a in (prop.get("archivos") or [archivo]) if isinstance(a, str) and a][:3]
        archivo = archivo or (archivos[0] if archivos else "")
        cuerpo = u.get("detalle") or prop.get("cambio") or prop.get("titulo") or titulo
        _, cita = _refs(cuerpo, archivo, u.get("linea") or 0)
        cita = str(u.get("cita") or cita)
        archivos = archivos or _refs(cita)[0]
        fuera.append(_propuesta("profunda", clave, titulo, cuerpo, archivos, cita,
                                u.get("verificacion") or "sin_verificar", u.get("impacto", 2),
                                u.get("esfuerzo", 3),
                                {"fecha": fecha, "clave": clave, "area": u.get("area"),
                                 "lente": u.get("lente"), "confianza": _num(u.get("confianza"))}))
    return fuera
def de_astraura(status, fecha="", ya_encargadas=()):
    status = status if isinstance(status, dict) else {}
    ya, vistas, fuera = {str(k) for k in (ya_encargadas or ()) if str(k)}, set(), []
    for tipo, items in (("creacion", status.get("creations")), ("rama", status.get("branches"))):
        for it in items if isinstance(items, list) else []:
            if not isinstance(it, dict) or _APLICADA.search(str(it.get("status") or "")) or it.get("applied_by"):
                continue
            ident = str(it.get("id") or "")
            clave = ident or D.clave(it.get("title") or it.get("theme") or "")
            if not clave or clave in vistas or clave in ya: continue
            vistas.add(clave)
            titulo = it.get("title") or it.get("theme") or clave
            cuerpo = it.get("content") or it.get("hypothesis") or it.get("insights") or titulo
            verif = it.get("verification")
            verif = verif if isinstance(verif, dict) else {}
            importancia = str(it.get("importance_level") or "")
            fuera.append(_propuesta(
                "astraura", clave, titulo, cuerpo, [], "astraura:%s/%s" % (tipo, ident),
                "verificado" if verif.get("is_verified") else "sin_verificar",
                _IMPORTANCIA.get(importancia.lower(), 3), 3,
                {"fecha": fecha, "tipo": tipo, "id": ident, "importance_level": importancia or None,
                 "requires_user_approval": bool(it.get("requires_user_approval")),
                 "status": str(it.get("status") or "")}))
    return fuera
def de_directores(revisor, fecha="", ya_encargadas=()):
    alex = revisor.get("necesitan_alex") if isinstance(revisor, dict) else {}
    ya, vistas, fuera = {str(k) for k in (ya_encargadas or ()) if str(k)}, set(), []
    for tid, p in (alex if isinstance(alex, dict) else {}).items():
        p = p if isinstance(p, dict) else {}
        clave = str(tid)
        if not clave or clave in vistas or clave in ya: continue
        vistas.add(clave)
        pregunta = p.get("pregunta") or ""
        opciones = [str(o) for o in (p.get("opciones") or [])]
        cuerpo = pregunta + (("\nOpciones: " + " · ".join(opciones)) if opciones else "")
        fuera.append(_propuesta(
            "directores", clave, p.get("titulo") or pregunta or clave, cuerpo or p.get("motivo") or "",
            [], "", "sin_verificar", 0, 0,
            {"fecha": fecha, "tarea": clave, "motivo": p.get("motivo"),
             "opciones": opciones, "desde": p.get("desde")}))
    return fuera
