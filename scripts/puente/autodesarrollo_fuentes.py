#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Las fuentes de imaginación → propuestas normalizadas (§3 de la Ola 1021I + «agentes» de la 1024I).
PURO: sin red, disco ni reloj; la fecha, lo ya encargado y el contenido de los archivos de los
agentes los pasa quien llama (el director lee `imaginacion/agentes/*.json`)."""
from __future__ import annotations
import hashlib
import re
import unicodedata
import dream_a_cola as D
from autodesarrollo_decidir import nivel  # baja · media · alta · critica: una sola tabla

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


# ─────────────── fuente «agentes» (Ola 1024I · IMG1024C, contrato §1) ───────────────
# Cada archivo de `starseed_memory_root/imaginacion/agentes/*.json` es una LISTA de propuestas en
# formato libre (o `{agente?, propuestas: [...]}`). Solo se exige un título; el resto se normaliza.
TIPOS = ("codigo", "diseno", "contenido", "investigacion", "otro")
MAX_TITULO, MAX_CUERPO, MAX_REFERENCIAS, MAX_ARCHIVOS, MAX_POR_ARCHIVO = 200, 8000, 20, 20, 100
_ID_AMBITO = re.compile(r"^[A-Za-z0-9_.-]{1,64}$")
_REIMAGINADA = re.compile(r"^reimaginada-.+-v(\d+)\.json$")
_FECHA_FINAL = re.compile(r"[-_]\d{4}-?\d{2}-?\d{2}(?:[-_T]\d{2,6})?$")
_URL = re.compile(r"https?://\S+")
_VERIFICACIONES = ("verificado", "ajustado", "sin verificar")

def _plano(v):
    t = unicodedata.normalize("NFKD", str(v or "").strip().lower())
    return "".join(c for c in t if not unicodedata.combining(c))
def slug(v, n=60):
    """Identificador seguro para ids y nombres de archivo: [a-z0-9-], sin acentos, ≤ n."""
    t = re.sub(r"[^a-z0-9]+", "-", _plano(v)).strip("-")
    return t[:n].strip("-") or "x"
def id_seguro(v, n=60, unico=False):
    """`slug` estable: si hay que cortar (o con `unico`, siempre) lleva un resumen de 6 caracteres del
    original, para que «Añadir caché» y «anadir cache» no acaben en el mismo nombre."""
    t, h = slug(v, 10 ** 6), hashlib.sha1(str(v).encode("utf-8")).hexdigest()[:6]
    return t if len(t) <= n and not unico else "%s-%s" % (t[:n - 7].strip("-"), h)
def _texto(v, n):
    return v.strip()[:n] if isinstance(v, str) else ""
def tipo(v):
    t = _plano(v)
    return t if t in TIPOS else "codigo"
def ambito(v):
    """metagenesis · personal · grupo:<id> · pagina:<id> (el id conserva su forma); si no, metagenesis."""
    pre, _, ident = str(v or "").strip().partition(":")
    pre = _plano(pre)
    if pre in ("metagenesis", "personal") and not ident: return pre
    if pre in ("grupo", "pagina") and _ID_AMBITO.match(ident.strip()): return "%s:%s" % (pre, ident.strip())
    return "metagenesis"
def referencias(v, n=MAX_REFERENCIAS):
    """[{titulo, url}] con url `https://` y sin repetir; un texto suelto que sea https vale como url."""
    fuera, vistas = [], set()
    for r in v if isinstance(v, list) else []:
        url, titulo = (r, "") if isinstance(r, str) else ((r.get("url"), r.get("titulo") or r.get("title")) if isinstance(r, dict) else ("", ""))
        url = url.strip() if isinstance(url, str) else ""
        if not url.lower().startswith("https://") or len(url) > 2000 or any(c.isspace() for c in url) or url in vistas:
            continue
        vistas.add(url)
        fuera.append({"titulo": _texto(titulo, MAX_TITULO) or url[8:][:MAX_TITULO], "url": url})
        if len(fuera) >= n: break
    return fuera
def _ruta_relativa(a):
    a = a.strip().replace("\\", "/") if isinstance(a, str) else ""
    malas = not a or len(a) > 200 or a.startswith(("/", "~")) or re.match(r"^[a-zA-Z]:", a) or ".." in a.split("/") or "://" in a
    return "" if malas else a.lstrip("./") if a.startswith("./") else a
def _archivos_de(item, texto):
    if isinstance(item.get("archivos"), (list, str)):
        crudos = [item["archivos"]] if isinstance(item["archivos"], str) else item["archivos"]
    else:  # sin la clave: los que cite el texto (sin URLs), como la imaginación diaria
        crudos = _refs(_URL.sub(" ", texto))[0]
    fuera = []
    for a in map(_ruta_relativa, crudos):
        if a and a not in fuera: fuera.append(a)
    return fuera[:MAX_ARCHIVOS]
def _agente_de(nombre):
    base = nombre[:-5] if nombre.endswith(".json") else nombre
    return slug(_FECHA_FINAL.sub("", base), 40)
def _items(contenido):
    if isinstance(contenido, list): return contenido, ""
    if isinstance(contenido, dict):
        if isinstance(contenido.get("propuestas"), list): return contenido["propuestas"], _texto(contenido.get("agente"), 40)
        if contenido.get("titulo"): return [contenido], ""
    return [], ""
def de_agente(item, nombre, fecha="", agente=""):
    """UNA propuesta libre de un agente → propuesta normalizada, o None si no trae título."""
    if not isinstance(item, dict): return None
    titulo = _texto(item.get("titulo") or item.get("title"), MAX_TITULO)
    if not titulo: return None
    cuerpo = _texto(item.get("cuerpo") or item.get("body") or item.get("contenido"), MAX_CUERPO) or titulo
    agente = slug(_texto(item.get("agente"), 40) or agente or _agente_de(nombre), 40)
    m = _REIMAGINADA.match(nombre)
    clave = slug(nombre[:-5], 90) if m else "%s--%s" % (agente, id_seguro(item.get("id") or D.clave(titulo), 60))
    p = {"id": "agentes:" + clave, "fuente": "agentes", "agente": agente, "tipo": tipo(item.get("tipo")),
         "ambito": ambito(item.get("ambito")), "titulo": titulo, "cuerpo": cuerpo,
         "referencias": referencias(item.get("referencias")), "archivos": _archivos_de(item, "%s %s" % (titulo, cuerpo)),
         "cita": _texto(item.get("cita"), 300), "verificacion": "sin dato", "version": 1,
         "origen": {"fecha": fecha, "archivo": nombre, "agente": agente, "id": _texto(str(item.get("id") or ""), 120)}}
    verif = _plano(item.get("verificacion")).replace("_", " ")
    if verif in _VERIFICACIONES: p["verificacion"] = verif
    for k in ("impacto", "esfuerzo"):
        v = item.get(k)
        if isinstance(v, (int, float)) and not isinstance(v, bool) and 0 < v <= 10: p[k] = v
    if nivel(item.get("importancia")): p["importancia_declarada"] = nivel(item.get("importancia"))
    if isinstance(item.get("accion"), str) and item["accion"].strip(): p["accion"] = item["accion"].strip()[:40]
    v = item.get("version")
    if isinstance(v, int) and not isinstance(v, bool) and v >= 1: p["version"] = v
    if isinstance(item.get("version_de"), str) and item["version_de"].strip(): p["version_de"] = item["version_de"].strip()[:120]
    u = item.get("utilidad")
    if isinstance(u, (int, float)) and not isinstance(u, bool): p["origen"]["utilidad_agente"] = max(0.0, min(1.0, float(u)))
    return p
def de_agentes(archivos, fecha="", ya_encargadas=(), esperadas=None):
    """{nombre de archivo: contenido JSON ya leído} → propuestas. `esperadas` = {nombre: {id, version}}
    de las reimaginaciones encargadas: su versión nueva sale con `version_de` y `version + 1` aunque el
    modelo no lo diga. De un archivo `reimaginada-*.json` solo cuenta la primera propuesta válida."""
    ya, vistas, fuera = {str(k) for k in (ya_encargadas or ()) if str(k)}, set(), []
    esperadas = esperadas if isinstance(esperadas, dict) else {}
    for nombre in sorted(archivos if isinstance(archivos, dict) else {}):
        items, agente = _items(archivos[nombre])
        reimaginada = bool(_REIMAGINADA.match(nombre))
        for item in items[:MAX_POR_ARCHIVO]:
            p = de_agente(item, nombre, fecha, "reimaginacion" if reimaginada and not agente else agente)
            if p is None: continue
            clave = p["id"].split(":", 1)[1]
            if clave in vistas or clave in ya:
                if reimaginada: break  # la versión de esta reimaginación ya se recogió
                continue
            vistas.add(clave)
            e = esperadas.get(nombre)
            if reimaginada and isinstance(e, dict) and e.get("id"):
                p["version_de"], p["version"] = str(e["id"]), int(e.get("version") or 1) + 1
            fuera.append(p)
            if reimaginada: break
    return fuera
