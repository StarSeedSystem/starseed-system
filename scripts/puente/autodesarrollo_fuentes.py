"""autodesarrollo_fuentes · las cuatro fuentes de Imaginación, convertidas en propuestas.

Módulo PURO: datos o texto por parámetro; sin red, sin disco y sin reloj. `ya_encargadas`
es la memoria `~/.starseed/dream-encargado.json`, que pasa quien llama. Contrato:
`architecture/imaginacion-autodesarrollo.md` §3.
"""

import re

import dream_a_cola as D

_APLICADA = re.compile(r"applied|discarded|rejected|done|aplicad|descartad|rechazad|hech", re.I)
_RUTA = re.compile(r"`?((?:[\w.-]+/)+[\w.-]+\.(?:py|ts|tsx|js|jsx|md|json|css|sql|sh|ya?ml|toml))`?")

def _claves(ya):
    ya = (ya.get("claves") or ya.keys()) if isinstance(ya, dict) else ya
    return {str(x) for x in (ya or ())}

def _archivos(*textos):
    halladas = (m.group(1).rstrip(".,:;)") for m in _RUTA.finditer(" ".join(str(t or "") for t in textos)))
    return list(dict.fromkeys(halladas))

def _num(valor):
    try:
        return None if valor is None or isinstance(valor, bool) else float(valor)
    except (TypeError, ValueError):
        return None

def _propuesta(fuente, clave, titulo, cuerpo, archivos, cita, verificacion, impacto, esfuerzo, origen):
    return {"id": "%s:%s" % (fuente, clave), "fuente": fuente,
            "titulo": str(titulo or "").strip()[:200], "cuerpo": str(cuerpo or "").strip(),
            "archivos": list(archivos or [])[:8], "cita": str(cita or ""),
            "verificacion": verificacion or "sin_verificar",
            "impacto": _num(impacto), "esfuerzo": _num(esfuerzo), "origen": dict(origen or {})}

def _fuera(propuestas, ya):
    vistas, ids, fuera = _claves(ya), set(), []
    for p in propuestas:
        if p["id"] in ids or {p["id"], p["origen"].get("clave"), p["origen"].get("id")} & vistas:
            continue
        ids.add(p["id"]); fuera.append(p)
    return fuera

def de_diaria(texto_md, fecha, ya_encargadas=()):
    """Accionables del informe diario: verbo de acción, nunca una observación disfrazada."""
    fuera = []
    for seccion, lineas in D.secciones(texto_md).items():
        for titulo, cuerpo in D.puntos(lineas):
            clave = D.clave(titulo)
            if clave and D.es_accionable(titulo, cuerpo):
                fuera.append(_propuesta(
                    "diaria", clave, titulo, cuerpo, _archivos(titulo, cuerpo),
                    "starseed_memory_root/dream/sugerencias-%s.md · %s" % (fecha, seccion),
                    "sin_verificar", None, None, {"clave": clave, "seccion": seccion, "fecha": fecha}))
    return _fuera(fuera, ya_encargadas)

def de_profunda(consolidado, fecha, ya_encargadas=()):
    """El ranking verificado de la sesión, con cita, confianza e impacto declarados."""
    fuera = []
    for u in (consolidado or {}).get("top") or []:
        if not isinstance(u, dict) or u.get("ya_encargada"): continue
        prop = u.get("propuesta") if isinstance(u.get("propuesta"), dict) else {}
        titulo = u.get("titulo") or prop.get("titulo") or ""
        if not titulo:
            continue
        clave = u.get("clave") or D.clave(titulo)
        archivo, linea = u.get("archivo"), u.get("linea")
        cita = "%s:%s" % (archivo, linea) if archivo and linea is not None else str(archivo or "")
        archivos = list(prop.get("archivos") or u.get("archivos") or ([archivo] if archivo else []))
        cuerpo = u.get("detalle") or prop.get("cambio") or prop.get("titulo") or ""
        fuera.append(_propuesta(
            "profunda", clave, titulo, cuerpo, archivos, cita, u.get("verificacion"),
            u.get("impacto"), u.get("esfuerzo"),
            {"clave": clave, "fecha": fecha, "area": u.get("area"), "lente": u.get("lente"),
             "confianza": u.get("confianza"), "tarea": u.get("tarea"),
             "capacidad": bool(u.get("capacidad")), "privado": bool(u.get("privado")),
             "prioridad": u.get("prioridad"), "accionable": u.get("accionable")}))
    return _fuera(fuera, ya_encargadas)

def de_astraura(status, ya_encargadas=()):
    """Creaciones y ramas no aplicadas del motor de Imaginación de Astraura 1.58."""
    fuera = []
    status = status if isinstance(status, dict) else {}
    grupos = (("creacion", status.get("creations") or (), "creations"),
              ("rama", status.get("branches") or (), "branches"))
    for tipo, items, campo in grupos:
        for it in items:
            if not isinstance(it, dict) or not it.get("id"): continue
            estado = str(it.get("status") or "")
            if _APLICADA.search(estado):
                continue
            titulo = it.get("title") or it.get("theme") or it.get("hypothesis") or str(it["id"])
            cuerpo = it.get("content") or it.get("insights") or it.get("hypothesis") or ""
            ver = "verificado" if (it.get("verification") or {}).get("is_verified") is True else "sin_verificar"
            fuera.append(_propuesta(
                "astraura", str(it["id"]), titulo, cuerpo, _archivos(titulo, cuerpo),
                "astraura:imagination/status · %s %s" % (campo, it["id"]), ver, None, None,
                {"clave": str(it["id"]), "id": str(it["id"]), "tipo": tipo, "status": estado,
                 "importance_level": it.get("importance_level"),
                 "requires_user_approval": bool(it.get("requires_user_approval"))}))
    return _fuera(fuera, ya_encargadas)

def de_directores(revisor, ya_encargadas=()):
    """Las preguntas que el revisor dejó para Alex: no son código, son decisiones suyas."""
    fuera = []
    alex = (revisor or {}).get("necesitan_alex") if isinstance(revisor, dict) else {}
    items = alex.items() if isinstance(alex, dict) else ((d.get("tid"), d) for d in alex or () if isinstance(d, dict))
    for tid, d in items:
        if not isinstance(d, dict) or not tid: continue
        pregunta = str(d.get("pregunta") or "").strip()
        titulo = d.get("titulo") or pregunta or str(tid)
        opciones = [str(o) for o in (d.get("opciones") or ())]
        cuerpo = pregunta + (("\nOpciones: " + " · ".join(opciones)) if opciones else "")
        fuera.append(_propuesta(
            "directores", str(tid), titulo, cuerpo, _archivos(titulo, pregunta),
            "starseed_memory_root/olas/revisor-bloqueadas.json · %s" % tid, "sin_verificar",
            None, None, {"clave": str(tid), "tid": tid, "pregunta": pregunta,
                         "opciones": opciones, "motivo": d.get("motivo"),
                         "desde": d.get("desde")}))
    return _fuera(fuera, ya_encargadas)
