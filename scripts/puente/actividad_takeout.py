#!/usr/bin/env python3
"""Actividad · Takeout (SDP1111H · §4 de sintesis-diaria-autonoma).

Google Takeout exporta cada 2 meses al Drive de cada cuenta (§5, paso 4): el historial de
vídeos vistos de YouTube y «Mi actividad» de Búsqueda y Gemini. Esto busca en el Drive de
cada alias la carpeta «Takeout», baja el zip a un directorio temporal del nodo, extrae las
fichas JSON y borra el zip al terminar. Incremental: guarda la última marca de tiempo leída
y solo emite fichas nuevas. Todo privado (privado: true, ~/.starseed/actividad/); la red va
inyectada (token_de, pedir) como en cuentas_google.py y el lector del zip es puro.
"""
import json, os, shutil, tempfile, time, urllib.parse, zipfile

API = "https://www.googleapis.com/drive/v3/files"
CARPETA = "Takeout"
SERVICIOS = ("Búsqueda", "Gemini")
DIR_ACTIVIDAD = os.path.expanduser("~/.starseed/actividad")
NOMBRE_ESTADO = "takeout-estado.json"

def leer_actividad(items, servicio, cuenta=""):
    """Fichas de una exportación: historial de YouTube (servicio 'youtube') o «Mi actividad»."""
    if servicio not in ("youtube",) + SERVICIOS:
        return []
    fichas = []
    for it in (items if isinstance(items, list) else []):
        if not isinstance(it, dict) or not it.get("time"):
            continue
        ficha = {"fuente": "takeout", "servicio": servicio, "cuenta": cuenta, "privado": True,
                 "titulo": str(it.get("title") or "")[:300], "enlace": str(it.get("titleUrl") or "")[:300],
                 "fecha": str(it.get("time"))[:40]}
        if servicio == "youtube":
            subs = [s["name"] for s in (it.get("subtitles") or []) if isinstance(s, dict) and s.get("name")]
            ficha["canal"] = subs[0] if subs else None
        else:
            ficha["texto"] = str(it.get("subtitle") or "")[:300]
        fichas.append(ficha)
    return fichas

def miembros(ruta_zip, abrir=zipfile.ZipFile):
    """(servicio, items) de las exportaciones JSON del zip; el HTML y lo demás, fuera."""
    hallados = []
    with abrir(ruta_zip) as z:
        for nombre in z.namelist():
            servicio = ("youtube" if nombre.endswith("watch-history.json")
                        else nombre.rsplit("/", 2)[-2] if "/MyActivity.json" in nombre else "")
            if servicio not in ("youtube",) + SERVICIOS:
                continue
            try:
                hallados.append((servicio, json.loads(z.read(nombre) or "[]")))
            except (ValueError, TypeError, zipfile.BadZipFile, OSError):
                continue
    return hallados

def fichas_de(ruta_zip, cuenta, abrir=zipfile.ZipFile):
    """Todas las fichas del zip, con la cuenta de origen."""
    return [ficha for servicio, items in miembros(ruta_zip, abrir)
            for ficha in leer_actividad(items, servicio, cuenta)]

def nuevas(todas, marca=None):
    """(fichas nuevas, marca nueva): solo las posteriores a la última marca de tiempo leída."""
    fechas = [str(f.get("fecha", "")) for f in todas]
    return [f for f in todas if f.get("fecha", "") > (marca or "")], max(fechas + [marca or ""])

def ultimo_zip(token, pedir):
    """Id y nombre del zip más reciente dentro de la carpeta «Takeout» del Drive; None si no hay."""
    filtro = "name = '%s' and mimeType = 'application/vnd.google-apps.folder'" % CARPETA
    for campos in ("id", "id,name"):
        filas = pedir("%s?q=%s&orderBy=modifiedTime desc&pageSize=1&fields=files(%s)"
                      % (API, urllib.parse.quote(filtro), campos), token) or {}
        primero = (filas.get("files") or [None])[0]
        if not primero:
            return None
        filtro = "'%s' in parents and name contains '.zip'" % primero["id"]
    return primero

def ejecutar(alias, token_de, pedir, dir_actividad=None, estado=None, dir_temp=tempfile.mkdtemp):
    """Una pasada de Takeout: busca el zip, lo baja, extrae lo nuevo y borra el zip al salir."""
    token = token_de(alias)
    if not token:
        return {"ok": False, "motivo": "sin token de Drive para %s" % alias}
    zip_ = ultimo_zip(token, pedir)
    if not zip_:
        return {"ok": False, "motivo": "no hay exportación de Takeout en el Drive de %s" % alias}
    temporal = dir_temp()
    try:
        ruta = os.path.join(temporal, zip_.get("name") or "takeout.zip")
        with open(ruta + ".tmp", "wb") as archivo:
            archivo.write(pedir("%s/%s?alt=media" % (API, zip_["id"]), token) or b"")
        os.replace(ruta + ".tmp", ruta)
        try:
            todas = fichas_de(ruta, alias)
        except (zipfile.BadZipFile, ValueError, OSError) as error:
            return {"ok": False, "motivo": "el zip de Takeout no se pudo leer: %s" % error}
        previo = estado if estado is not None else (leer_estado(
            os.path.join(dir_actividad, NOMBRE_ESTADO)) if dir_actividad else {})
        fichas, marca = nuevas(todas, (previo or {}).get(alias)); nuevo = {**dict(previo or {}), alias: marca}
        if dir_actividad:
            guardar(nuevo, fichas, alias, dir_actividad)
        return {"ok": True, "alias": alias, "fichas": fichas, "marca": marca, "estado": nuevo,
                "zip": zip_.get("name")}
    finally:
        shutil.rmtree(temporal, ignore_errors=True)

def guardar(estado, fichas, alias, dir_actividad=DIR_ACTIVIDAD):
    """Fichas privadas del alias y el estado incremental: solo en el nodo, nunca fuera."""
    os.makedirs(os.path.join(dir_actividad, "fichas"), exist_ok=True)
    fecha = time.strftime("%Y-%m-%d"); destino = os.path.join(
        dir_actividad, "fichas", "%s-takeout-%s.json" % (fecha, alias))
    for ruta, contenido in ((destino, {"alias": alias, "fecha": fecha, "privado": True, "fichas": fichas}),
                            (os.path.join(dir_actividad, NOMBRE_ESTADO), estado)):
        with open(ruta + ".tmp", "w", encoding="utf-8") as archivo:
            json.dump(contenido, archivo, ensure_ascii=False, indent=1)
        os.replace(ruta + ".tmp", ruta)
    return {"fichas": destino, "estado": os.path.join(dir_actividad, NOMBRE_ESTADO)}

def leer_estado(ruta=None):
    """El estado de la pasada anterior (marca por alias); vacío si no hay archivo."""
    try:
        return json.load(open(ruta or os.path.join(DIR_ACTIVIDAD, NOMBRE_ESTADO), encoding="utf-8"))
    except (OSError, ValueError):
        return {}
