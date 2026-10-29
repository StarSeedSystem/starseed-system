# -*- coding: utf-8 -*-
"""Ficha pública de cada objetivo del alcance (INV1025L · R4, R5, R6, R8).
`construir_ficha(obj, lecturas, extraer=None)` arma la ficha SOLO con resúmenes, citas y
enlaces — nunca el texto íntegro de una página — usando `extractor_web.extraer` (LLM propio)
si viene, o extracción por reglas. Toda línea de terceros que parezca una orden a un agente
se descarta (R6) y todo el texto de terceros va marcado como DATOS. Se guarda SOLO en
~/.starseed/alcance/fichas/ (R5: 700/600, jamás bajo starseed_memory_root) y caduca a los 30 días.
"""
from __future__ import annotations
import datetime as dt, json, os, re
from urllib.parse import urljoin
import alcance_fuentes as F
RE_TITLE = re.compile(r"<title[^>]*>(.*?)</title>", re.S | re.I)
RE_LINK = re.compile(r"<a[^>]+href=[\"']([^\"'#?]+)[\"'][^>]*>(.*?)</a>", re.I | re.S)
RE_VALORES = re.compile(r"valores|misión|mision|principios|manifiesto|creemos|compromiso", re.I)
RE_CONTACTO = re.compile(r"contacto|contact|correo|email|about|equipo|team|escrib", re.I); RE_PROYECTO = re.compile(r"proyecto|project|iniciativa|programa|program", re.I)
RE_NO_PEDIDAS = re.compile(r"no aceptamos?|unsolicited|no contactes?|no contactar|do not (send|contact)", re.I)
# R6: líneas que se dirigen a un agente (instrucciones, instalar paquetes, borrar archivos…)
RE_ORDEN = re.compile(r"(ignora\w*\s+(las\s+)?(instrucciones|instructions)|disregard\b|(er?s|you are)\s*.{0,25}(agente|modelo|assistant|bot)|system ?prompt|(instalar?|install)\s.{0,40}(pip|npm|curl|paquete|package)|(curl|wget)\s.{0,80}\|\s*(sh|bash)|(actúa como|act as )|borra\w*\s.{0,30}(archivo|fichero|file)|delete\s.{0,30}(files|repo))", re.I)
METAS_DESC = (re.compile(r"<meta[^>]+name=[\"']description[\"'][^>]+content=[\"']([^\"']*)", re.I), re.compile(r"<meta[^>]+content=[\"']([^\"']*)[^>]+name=[\"']description[\"']", re.I),
              re.compile(r"<meta[^>]+property=[\"']og:description[\"'][^>]*content=[\"']([^\"']*)", re.I))
PROMPT_FICHA = ("Extrae en JSON: nombre, que_hacen (≤ 300), valores (frases declaradas por el sitio, ≤ 5), "
                "proyectos ({nombre, url}, ≤ 5) y canal_contacto ({medio, valor, fuente_url}); solo lo seguro.")
TONOS = (("tecnico", ("api", "open source", "sdk", "protocolo", "desarrollador", "develop", "código")),
         ("activista", ("activista", "activism", "justicia", "movimiento", "clima", "derechos")),
         ("creativo", ("arte", "diseño", "estudio", "festival", "narrativa", "música", "story")), ("cercano", ("comunidad", "juntos", "amigo", "hola", "viaje", "tú ")))
PAL_ES, PAL_EN = ("de", "la", "el", "los", "que", "con", "para", "una", "por", "más"), ("the", "and", "of", "with", "for", "our", "we", "is", "are", "to")
def _limpio(x, n):
    # texto a una línea, sin etiquetas HTML y acotado a `n` caracteres
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", str(x or ""))).strip()[:int(n)]
def es_orden(linea):
    # R6: True si la línea parece una orden dirigida a un agente
    return bool(RE_ORDEN.search(str(linea or "")))
def limpia_datos(texto):
    # DATO de terceros (R6): se descarta cualquier línea que parezca una orden
    lineas = [l for l in str(texto or "").splitlines() if l.strip() and not es_orden(l)]
    return _limpio("\n".join(lineas), 20000) if lineas else ""
def _de_html(html, url):
    """Extracción por reglas: título, meta descripción, enlaces de contacto y de proyectos."""
    t, tusado = str(html or ""), str(url or "")
    m_tit = RE_TITLE.search(t); desc = ""
    for m_meta in METAS_DESC:
        m = m_meta.search(t)
        if m: desc = m.group(1); break
    contactos, proyectos = [], []
    for m in RE_LINK.finditer(t[:120000]):
        href, texto = (m.group(1) or ""), _limpio(m.group(2), 120)
        if href.startswith(("javascript", "data", "mailto")) or len(contactos) + len(proyectos) > 20: continue
        absoluto = urljoin(tusado, href)
        destino = proyectos if RE_PROYECTO.search(href) or RE_PROYECTO.search(texto) else (
            contactos if RE_CONTACTO.search(href) or RE_CONTACTO.search(texto) or RE_CONTACTO.search(tusado) else None)
        if destino is not None and absoluto not in [d.get("url") for d in destino]:
            destino.append({"nombre": texto or absoluto, "url": absoluto})
    valores = " ; ".join(p.strip() for p in re.split(r"(?<=[.!?])\s+", desc) if RE_VALORES.search(p))
    return {"titulo": _limpio(m_tit.group(1) if m_tit else "", 160), "descripcion": str(desc).strip(),
            "valores": valores[:200], "proyectos": proyectos, "contactos": contactos}
def _extraer_llm(extraer, lectura):
    """El extractor de ScrapeGraphAI (LLM propio del OS) sobre el HTML ya leído; None en falla."""
    if not extraer: return None
    try: r = extraer({"html": str(lectura.get("texto") or "")[:60000], "prompt": PROMPT_FICHA}, {})
    except Exception: return None
    dato = r.get("dato") if isinstance(r, dict) else None; return dato if isinstance(dato, dict) and dato else None
def _fecha(valor=None):
    if isinstance(valor, dt.datetime): f = valor
    else:
        try: f = dt.datetime.fromisoformat(str(valor or "").replace("Z", "+00:00"))
        except ValueError: f = dt.datetime.now(dt.timezone.utc)
    return f if f.tzinfo else f.replace(tzinfo=dt.timezone.utc)
def esta_caducada(ficha, ahora=None):
    """True si la ficha pasó los 30 días de caducidad; sin `caduca`, no está caducada."""
    c = ((ficha or {}).get("caduca") or "").replace("Z", "+00:00") if isinstance(ficha, dict) else ""
    return bool(c) and _fecha(ahora) >= _fecha(c)
def construir_ficha(obj, lecturas, extraer=None, ahora=None):
    """La ficha PÚBLICA (R6): resúmenes/citas/enlaces, nunca texto íntegro; tono formal|cercano|tecnico|activista|creativo,
    canal_oficial {medio,valor,fuente_url}, resonancias [{con,por_que,cita_url}] y fuentes [{url,fecha,metodo}]."""
    o, momento = (obj if isinstance(obj, dict) else {}), _fecha(ahora)
    lista = ((lecturas.get("lecturas") if isinstance(lecturas, dict) else lecturas) or [])
    ficha = {"obj_id": str(o.get("id") or ""), "nombre_publico": _limpio(o.get("nombre_publico"), 120), "que_hacen": "", "canal_oficial": o.get("canal_contacto") or None,
             "valores_declarados": [], "proyectos": [], "contenido_reciente": [], "idioma": "otro", "tono": "formal", "fuentes": [],
             "resonancias": [r for r in (o.get("resonancias") or []) if isinstance(r, dict)][:5],
             "avisos": [str(a)[:160] for a in (o.get("avisos") or [])][:5], "datos_terceros": F.DATOS_TERCEROS,
             "generada": momento.isoformat(), "caduca": (momento + dt.timedelta(days=30)).isoformat()}
    descripciones, titulos = [], []
    for lectura in lista:
        if not isinstance(lectura, dict): continue
        metodo = "cita" if not lectura.get("ok") else str(lectura.get("tipo") or "lectura-cortes")
        ficha["fuentes"].append({"url": lectura.get("url"), "fecha": lectura.get("fecha"), "metodo": metodo,
                                 **({} if lectura.get("ok") else {"bloqueado_por": str(lectura.get("bloqueado_por") or "error")[:60]})})  # el enlace se cita aunque se omita
        if not lectura.get("ok") or len(titulos) > 6: continue
        dato = _extraer_llm(extraer, lectura) or _de_html(lectura.get("texto"), lectura.get("url"))
        if dato.get("descripcion"): descripciones.append(limpia_datos(dato["descripcion"]))
        if dato.get("titulo"): titulos.append(limpia_datos(dato["titulo"]))
        for frase in (dato["valores"].split(" ; ") if isinstance(dato.get("valores"), str) and dato["valores"] else []):
            if frase and len(ficha["valores_declarados"]) < 5: ficha["valores_declarados"].append({"texto": _limpio(frase, 200), "cita_url": lectura.get("url"), "datos_terceros": True})
        for p in (dato.get("proyectos") or [])[:5]:
            if isinstance(p, dict) and p.get("url") and len(ficha["proyectos"]) < 5: ficha["proyectos"].append({"nombre": _limpio(p.get("nombre") or p["url"], 200), "url": str(p["url"])[:300], "datos_terceros": True})
        tipo_l = str(lectura.get("tipo")); items = list(lectura.get("items") or [])
        if not items and tipo_l in ("rss", "sitemap"):
            import vigia_referencias as V
            datos = V.parsear_rss(str(lectura.get("texto") or "")) if tipo_l == "rss" else V.parsear_sitemap(str(lectura.get("texto") or ""))
            items = list(datos) if isinstance(datos, list) else [{"titulo": u, "url": u, "fecha": f} for u, f in datos.items()]
        for i in items:
            if len(ficha["contenido_reciente"]) >= 8: break
            if isinstance(i, dict) and i.get("url"): ficha["contenido_reciente"].append({"titulo": _limpio(i.get("titulo") or i["url"], 160), "url": str(i["url"])[:300], "fecha": str(i.get("fecha") or "") or None,
                                                                                         "resumen": _limpio(i.get("texto") or i.get("resumen") or "", 200), "datos_terceros": True})
        if RE_NO_PEDIDAS.search(str(dato.get("descripcion") or "")): ficha["avisos"].append("no acepta solicitudes no pedidas (visto en su sitio)")
    ficha["avisos"] = ficha["avisos"][:5]; ficha["que_hacen"] = _limpio(" ".join(dict.fromkeys(descripciones)), 400)
    base = (ficha["que_hacen"] + " " + " ".join(titulos)).lower()
    cuantos_es, cuantos_en = sum(1 for p in PAL_ES if " %s " % p in base), sum(1 for p in PAL_EN if " %s " % p in base)
    ficha["idioma"] = "es" if cuantos_es > cuantos_en else ("en" if cuantos_en > cuantos_es else "otro")
    for tono, marcas in TONOS:
        if any(m in base for m in marcas): ficha["tono"] = tono; break
    return ficha
def guardar_ficha(ficha, home=None):
    """R5: la ficha vive SOLO en ~/.starseed/alcance/fichas/ (700/600); jamás en la memoria espejada."""
    import alcance_objetivos as AO
    carpeta = os.path.join(AO.ruta_almacen(home), "fichas"); os.makedirs(carpeta, mode=0o700, exist_ok=True); os.chmod(carpeta, 0o700)
    ruta = os.path.join(carpeta, str((ficha or {}).get("obj_id") or (ficha or {}).get("nombre_publico") or "sin-id").replace("/", "_") + ".json")
    with open(os.open(ruta, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600), "w", encoding="utf-8") as f:
        json.dump(ficha, f, ensure_ascii=False, indent=1)
    os.chmod(ruta, 0o600); return ruta