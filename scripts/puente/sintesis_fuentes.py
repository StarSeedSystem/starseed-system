#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""sintesis_fuentes · contexto común de la síntesis diaria (SDP1111A). PURO y sin red.
`contexto(raiz, ahora, home)` reúne las 3 últimas síntesis y su «Mañana», la rotación de hoy
(sin previas empieza en los vídeos 4 y 5 y en Cole Hastings, Sunseed y Damanhur), las salidas de
Imaginación de 24 h, los informes nuevos de directores y sueños y el resumen de actividad si existe.
Cada fuente se puede inyectar (`previas`, `imaginacion`, `informes`, `actividad`). Sin red.
"""
import json, os, re
from datetime import datetime, timedelta
RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SINTESIS, IMAGINACION, DIRECTORES, SUENOS = ("starseed_memory_root", "produccion-audiovisual", "sintesis"), ("starseed_memory_root", "imaginacion", "agentes"), ("starseed_memory_root", "directores"), ("starseed_memory_root", "dream", "profundo")
VIDEOS, N_CONTACTOS, HORAS, INICIALES, CONTACTOS_INICIALES = 15, 3, 24, (4, 5), ("Cole Hastings", "Sunseed", "Damanhur")
_SECCION, _CABECERA, _NUM, _BULLET, _PARTIR = re.compile(r"^#{1,6}\s*Mañana\s*$", re.I), re.compile(r"^#{1,6}\s"), re.compile(r"\b(\d{1,2})\b"), re.compile(r"^\s*[-*]\s*"), re.compile(r",|;|·|\by\b")
def _json(ruta, defecto=None):
    try:
        with open(ruta, encoding="utf-8") as f: return json.load(f)
    except (OSError, ValueError): return defecto
def _leer(ruta):
    try:
        with open(ruta, encoding="utf-8") as f: return f.read()
    except OSError: return ""
def _fecha(valor=None, defecto=None):
    if isinstance(valor, datetime): f = valor
    elif isinstance(valor, (int, float)): f = datetime.fromtimestamp(valor)
    elif not isinstance(valor, str) or not valor.strip(): return defecto
    else:
        try: f = datetime.fromisoformat(valor.strip().replace("Z", "+00:00"))
        except ValueError: return defecto
    return f.astimezone().replace(tzinfo=None) if f.tzinfo else f
def _limpio(valor, tope=200): return re.sub(r"\s+", " ", str(valor or "")).strip()[:tope]
def _recientes(carpeta, patron, desde):
    try: nombres = sorted((n for n in os.listdir(carpeta) if re.match(patron, n)), reverse=True)
    except OSError: return []
    fuera = []
    for n in nombres:
        try: mtime = datetime.fromtimestamp(os.path.getmtime(os.path.join(carpeta, n)))
        except OSError: continue
        if mtime >= desde: fuera.append((n, os.path.join(carpeta, n), mtime))
    return fuera
def _salidas(datos):
    datos = next((datos[k] for k in ("propuestas", "salidas", "items", "referencias", "hallazgos", "resultados") if isinstance(datos, dict) and isinstance(datos.get(k), list)), datos); return [x for x in datos if isinstance(x, dict)] if isinstance(datos, list) else ([datos] if isinstance(datos, dict) else [])
def manana(texto):
    """{videos, contactos, categorias, texto} de la sección «Mañana». PURA."""
    dentro, fuera = False, []
    for linea in (texto or "").splitlines():
        if _SECCION.match(linea): dentro = True
        elif dentro and _CABECERA.match(linea): break
        elif dentro: fuera.append(linea)
    videos, contactos, categorias = [], [], []
    for linea in fuera:
        bajo = linea.lower(); valor = _BULLET.sub("", linea.split(":", 1)[1] if ":" in linea else linea).strip(" *`_")
        if "vídeo" in bajo or "video" in bajo: videos += [int(n) for n in _NUM.findall(valor) if 1 <= int(n) <= VIDEOS]
        elif "contact" in bajo: contactos += [p.strip(" *`_") for p in _PARTIR.split(valor)]
        elif "categor" in bajo and valor: categorias.append(valor)
    return {"videos": sorted(set(videos)), "contactos": list(dict.fromkeys(c for c in contactos if c)), "categorias": list(dict.fromkeys(c for c in categorias if c)), "texto": "\n".join(fuera).strip()}
def _manana_de(previa):
    if isinstance(previa, str): return manana(previa)
    if isinstance(previa, dict) and isinstance(previa.get("manana"), dict): return previa["manana"]
    return manana(previa.get("texto", "") if isinstance(previa, dict) else "")
def rotacion(previas=(), contactos_pool=CONTACTOS_INICIALES, categorias_pool=(), n_videos=2, n_contactos=N_CONTACTOS):
    """Los siguientes 2 vídeos (ciclo de 15), 2-3 contactos y 1 categoría, sin repetir las 3 últimas. PURA."""
    previas = list(previas or [])
    if not previas:
        return {"videos": list(INICIALES), "contactos": list(CONTACTOS_INICIALES)[:n_contactos], "categoria": None}
    tres = [_manana_de(p) for p in previas[-3:]]
    usados_v = {v for m in tres for v in m.get("videos") or []}
    usados_c = {c for m in tres for c in m.get("contactos") or []}
    usados_cat = {c for m in tres for c in m.get("categorias") or []}
    if len(usados_v) >= VIDEOS: usados_v = set()
    videos, siguiente = [], max(usados_v) if usados_v else INICIALES[-1]
    while len(videos) < n_videos:
        siguiente = siguiente % VIDEOS + 1
        if siguiente not in usados_v: videos.append(siguiente)
    categorias = [c for c in categorias_pool if c not in usados_cat]
    return {"videos": videos, "contactos": [c for c in contactos_pool if c not in usados_c][:n_contactos], "categoria": categorias[0] if categorias else None}
def contexto(raiz=RAIZ, ahora=None, home=None, previas=None, imaginacion=None, informes=None, actividad=None,
             contactos_pool=CONTACTOS_INICIALES, categorias_pool=()):
    """Todo el contexto común, con cada fuente sustituible por lo inyectado."""
    ahora = ahora or datetime.now(); desde = ahora - timedelta(hours=HORAS)
    if previas is None:
        previas = []
        for n, ruta, _ in _recientes(os.path.join(raiz, *SINTESIS), r"^\d{4}-\d{2}-\d{2}\.md$", datetime.min)[:3]:
            md = _leer(ruta)
            if md: previas.append({"fecha": n[:-3], "ruta": ruta, "texto": md, "manana": manana(md)})
    if imaginacion is None:
        imaginacion = []
        for n, ruta, mtime in _recientes(os.path.join(raiz, *IMAGINACION), r".*\.json$", desde):
            for item in _salidas(_json(ruta)):
                origen = item.get("origen"); origen = origen if isinstance(origen, dict) else {}
                f = _fecha(item.get("fecha") or origen.get("fecha"), mtime)
                if f is None or f < desde: continue
                imaginacion.append({"archivo": n, "fecha": f.date().isoformat(), "titulo": _limpio(item.get("titulo") or item.get("title") or item.get("nombre"), 160), "fuente": _limpio(item.get("fuente") or origen.get("fuente"), 40), "resumen": _limpio(item.get("resumen") or item.get("por_que") or item.get("cuerpo") or item.get("detalle"), 240)})
    if informes is None:
        informes = {"directores": [], "suenos": []}
        for n, ruta, mtime in _recientes(os.path.join(raiz, *DIRECTORES), r".*\.json$", desde):
            datos = _json(ruta, {})
            if isinstance(datos, dict):
                informes["directores"].append({"tipo": "director", "archivo": n, "fecha": mtime.date().isoformat(),
                    "titulo": _limpio(datos.get("titulo") or datos.get("title") or n[:-5], 120),
                    "resumen": _limpio(datos.get("resumen") or datos.get("summary"))})
        for n, carpeta, _ in _recientes(os.path.join(raiz, *SUENOS), r"^\d{4}-\d{2}-\d{2}$", datetime.min):
            ruta = os.path.join(carpeta, "INFORME.md"); md = _leer(ruta)
            try: mtime = datetime.fromtimestamp(os.path.getmtime(ruta))
            except OSError: continue
            if md and mtime >= desde:
                informes["suenos"].append({"tipo": "suenos", "archivo": "dream/profundo/%s/INFORME.md" % n,
                    "fecha": n, "titulo": _limpio(md.splitlines()[0].lstrip("# "), 120), "resumen": _limpio(md)})
    if actividad is None:
        actividad, base = None, os.path.join(home or os.path.expanduser("~"), ".starseed", "actividad")
        for dias in (0, 1):
            fecha = (ahora - timedelta(days=dias)).date().isoformat(); ruta = os.path.join(base, "resumen-%s.json" % fecha)
            datos = _json(ruta)
            if isinstance(datos, (dict, list)):
                actividad = {"fecha": fecha, "ruta": ruta, "datos": datos}; break
    return {"ahora": ahora.strftime("%Y-%m-%d %H:%M"), "raiz": raiz, "sintesis": previas,
            "rotacion": rotacion(previas, contactos_pool, categorias_pool), "imaginacion": imaginacion,
            "informes": {"directores": list((informes or {}).get("directores") or []), "suenos": list((informes or {}).get("suenos") or [])},
            "actividad": actividad}
