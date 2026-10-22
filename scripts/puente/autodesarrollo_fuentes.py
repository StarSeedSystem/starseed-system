#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""autodesarrollo_fuentes · las cuatro fuentes de propuestas de Imaginación, normalizadas.

§3 de `architecture/imaginacion-autodesarrollo.md`. PURO: sin red, sin disco, fecha por
parámetro. Lo ya encargado (`~/.starseed/dream-encargado.json`) lo pasa quien llama; lo no
verificado se dice (`sin_verificar`) y lo que la fuente no trae, None."""
import re

import dream_a_cola as D

FUENTES = ("diaria", "profunda", "astraura", "directores")
_APLICADA = re.compile(r"applied|done|completed|discarded|rejected", re.I)
_CITA = re.compile(r"`([^`:\s]+\.(?:py|ts|tsx|js|jsx|md|json|sql|sh|yml|yaml))(?::(\d+))?`")
def _texto(valor): return " ".join(str(valor or "").split())
def _entero(valor):
    try: return int(float(valor))
    except (TypeError, ValueError): return None
def _claves(titulo, extra=()):
    fuera = {D.clave(titulo)} if titulo else set()
    return fuera | {str(e) for e in extra if e}
def _citas(texto):
    vistas = {}
    for m in _CITA.finditer(texto or ""):
        vistas.setdefault(m.group(1), m.group(1) + (":" + m.group(2) if m.group(2) else ""))
    return list(vistas.values())
def _propuesta(fuente, clave, titulo, cuerpo, archivos, cita, verificacion, impacto,
               esfuerzo, origen):
    """Forma común de §3; `id` estable = fuente + clave."""
    return {"id": "%s:%s" % (fuente, clave), "fuente": fuente, "titulo": titulo,
            "cuerpo": cuerpo, "archivos": list(archivos or []), "cita": cita or "",
            "verificacion": verificacion, "impacto": impacto, "esfuerzo": esfuerzo,
            "origen": origen or {}}
def de_diaria(texto_md, fecha, ya_encargadas=()):
    """Accionables de `dream/sugerencias-<fecha>.md`, con el lector del Dream."""
    fuera, vistas = [], set(ya_encargadas or ())
    informe = "dream/sugerencias-%s.md" % fecha
    for nombre, lineas in D.secciones(texto_md).items():
        for titulo, cuerpo in D.puntos(lineas):
            clave = D.clave(titulo)
            if not clave or clave in vistas or not D.es_accionable(titulo, cuerpo):
                continue
            vistas.add(clave)
            citas = _citas("%s %s" % (titulo, cuerpo))
            fuera.append(_propuesta(
                "diaria", clave, titulo, cuerpo, [c.split(":")[0] for c in citas],
                citas[0] if citas else informe, "sin_verificar", None, None,
                {"informe": informe, "seccion": nombre, "clave": clave}))
    return fuera
def de_profunda(consolidado, fecha, ya_encargadas=()):
    """Ranking ya consolidado (`dream/profundo/<fecha>/consolidado.json`)."""
    datos = consolidado if isinstance(consolidado, list) else (consolidado or {}).get("top", [])
    fuera, vistas = [], set(ya_encargadas or ())
    for u in datos or []:
        if not isinstance(u, dict): continue
        titulo = _texto(u.get("titulo") or u.get("propuesta"))
        clave, archivo = D.clave(titulo), _texto(u.get("archivo"))
        if (not clave or clave in vistas or u.get("ya_encargada")
                or _claves(titulo, [archivo]) & vistas):
            continue
        vistas.add(clave)
        linea = _entero(u.get("linea"))
        cita = "%s:%s" % (archivo, linea) if archivo and linea else archivo or "dream/profundo/%s/consolidado.json" % fecha
        verif = _texto(u.get("verificacion")).lower()
        cuerpo = _texto(u.get("propuesta") or u.get("detalle"))
        fuera.append(_propuesta(
            "profunda", clave, titulo, "" if cuerpo == titulo else cuerpo,
            [archivo] if archivo else [], cita,
            verif if verif in ("verificado", "ajustado") else "sin_verificar",
            _entero(u.get("impacto")), _entero(u.get("esfuerzo")),
            {"sesion": fecha, "area": u.get("area"), "lente": u.get("lente"),
             "confianza": u.get("confianza"), "capacidad": bool(u.get("capacidad")),
             "privado": bool(u.get("privado")), "tarea": u.get("tarea")}))
    return fuera
def de_astraura(status, ya_encargadas=()):
    """Creaciones y ramas NO aplicadas de `GET /api/imagination/status` (Astraura 1.58)."""
    datos = status if isinstance(status, dict) else {}
    fuera, vistas = [], set(ya_encargadas or ())
    for tipo, lista in (("creacion", datos.get("creations")), ("rama", datos.get("branches"))):
        for x in lista or []:
            if not isinstance(x, dict) or _APLICADA.search(_texto(x.get("status"))): continue
            titulo = _texto(x.get("title") or x.get("theme") or x.get("hypothesis"))
            ident = _texto(x.get("id"))
            clave = "%s-%s" % (tipo, ident or D.clave(titulo))
            if (not titulo or clave in vistas
                    or _claves(titulo, [ident, clave]) & vistas):
                continue
            vistas.add(clave)
            verif = ("verificado" if (x.get("verification") or {}).get("is_verified")
                     else "sin_verificar")
            cuerpo = _texto(x.get("content") or x.get("insights"))
            fuera.append(_propuesta(
                "astraura", clave, titulo, "" if cuerpo == titulo else cuerpo, [],
                "astraura:%s/%s" % (tipo, ident or clave), verif, None, None,
                {"tipo": tipo, "id": ident, "importancia": x.get("importance_level"),
                 "requiere_aprobacion": bool(x.get("requires_user_approval")),
                 "estado": _texto(x.get("status")),
                 "proceso": x.get("process_name") or x.get("process_type") or ""}))
    return fuera
def de_directores(revisor, ya_encargadas=()):
    """Preguntas a Alex que el revisor dejó en `olas/revisor-bloqueadas.json`."""
    datos = revisor if isinstance(revisor, dict) else {}
    fuera, vistas = [], set(ya_encargadas or ())
    for ident, q in (datos.get("necesitan_alex") or {}).items():
        q = q if isinstance(q, dict) else {"pregunta": q}
        pregunta = _texto(q.get("pregunta"))
        titulo = _texto(q.get("titulo") or pregunta)
        clave = _texto(ident) or D.clave(titulo)
        if not clave or clave in vistas or _claves(titulo, [clave]) & vistas: continue
        vistas.add(clave)
        cuerpo = pregunta if pregunta != titulo else ""
        motivo = _texto(q.get("motivo"))
        if motivo: cuerpo = (cuerpo + " · " + motivo) if cuerpo else motivo
        fuera.append(_propuesta(
            "directores", clave, titulo, cuerpo, [],
            "starseed_memory_root/olas/revisor-bloqueadas.json#%s" % clave,
            "sin_verificar", None, None,
            {"tarea": clave, "desde": q.get("desde") or "revisor-bloqueadas",
             "opciones": list(q.get("opciones") or [])}))
    return fuera
