#!/usr/bin/env python3
"""Actividad · Gmail enviados, Drive y Docs (SDP1111F · §4 de sintesis-diaria-autonoma).

Lee de las últimas 36 h los correos ENVIADOS por Alex y los archivos de Drive creados o
modificados; de los Google Docs guarda el texto exportado. Fichas privadas en
~/.starseed/actividad/fichas/AAAA-MM-DD-google-<alias>.json. Nunca escribe en las cuentas.
`pedir` es inyectable y las pruebas corren sin red.
"""
import base64, datetime, json, os, time, urllib.parse, urllib.request

ALIAS = ("alex", "fundacion")
DIR_ACTIVIDAD = os.path.expanduser("~/.starseed/actividad")
API_GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me/messages"
API_DRIVE = "https://www.googleapis.com/drive/v3/files"
CONSULTA_ENVIADOS = "in:sent newer_than:2d"
TOPE_CORREO, TOPE_DOC, HORAS = 1500, 6000, 36
MIME_DOC = "application/vnd.google-apps.document"
CAMPOS_DRIVE = "files(id,name,mimeType,webViewLink,createdTime,modifiedTime)"

def _ahora(ahora=None):
    return (ahora.astimezone(datetime.timezone.utc) if isinstance(ahora, datetime.datetime)
            else datetime.datetime.fromtimestamp(ahora if ahora is not None else time.time(), datetime.timezone.utc))

def corte(ahora=None, horas=HORAS):
    """El límite ISO de las últimas 36 h, en UTC con Z (comparable como texto)."""
    return (_ahora(ahora) - datetime.timedelta(hours=horas)).strftime("%Y-%m-%dT%H:%M:%SZ")

def _iso(milisegundos):
    try: return datetime.datetime.fromtimestamp(int(milisegundos) / 1000, datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    except (TypeError, ValueError, OverflowError): return ""

def texto_de(parte):
    """Los primeros caracteres del cuerpo: base64url de la primera parte con datos."""
    for trozo in (parte.get("parts") or [parte]):
        datos = (trozo.get("body") or {}).get("data")
        if datos:
            return base64.urlsafe_b64decode(datos + "=" * (-len(datos) % 4)).decode("utf-8", "replace")
    return ""

def cabecera(parte, nombre):
    for fila in (parte.get("headers") or []):
        if str(fila.get("name", "")).lower() == nombre.lower():
            return str(fila.get("value") or "")
    return ""

def ficha_correo(mensaje, alias):
    carga = mensaje.get("payload") or {}
    return {"fuente": "gmail", "cuenta": alias, "fecha": _iso(mensaje.get("internalDate")),
            "titulo": cabecera(carga, "Subject"), "destinatario": cabecera(carga, "To"),
            "enlace": "https://mail.google.com/mail/u/0/#sent/%s" % mensaje.get("id", ""),
            "texto": (texto_de(carga) or mensaje.get("snippet") or "")[:TOPE_CORREO], "privado": True}

def ficha_archivo(archivo, alias, texto=""):
    es_doc = archivo.get("mimeType") == MIME_DOC
    return {"fuente": "docs" if es_doc else "drive", "cuenta": alias, "privado": True,
            "fecha": str(archivo.get("modifiedTime") or archivo.get("createdTime") or ""),
            "titulo": str(archivo.get("name") or ""), "enlace": str(archivo.get("webViewLink") or ""),
            "texto": texto[:TOPE_DOC], "tipo": str(archivo.get("mimeType") or "")}

def pedir_http(url, datos=None, cabeceras=None):
    cuerpo = urllib.parse.urlencode(datos).encode("utf-8") if datos is not None else None
    peticion = urllib.request.Request(url, data=cuerpo, headers=cabeceras or {})
    with urllib.request.urlopen(peticion, timeout=60) as respuesta:
        crudo = respuesta.read().decode("utf-8")
    return json.loads(crudo) if crudo.startswith(("{", "[")) else crudo

def _token_real(alias, pedir):
    from cuentas_google import token
    return token(alias, lambda url, datos: pedir(url, datos=datos))

def correos(pedir, autorizacion, desde, alias):
    url = "%s?q=%s&maxResults=25" % (API_GMAIL, urllib.parse.quote(CONSULTA_ENVIADOS))
    lista, fichas = pedir(url, cabeceras=autorizacion) or {}, []
    for referencia in (lista.get("messages") or [])[:25]:
        detalle = pedir("%s/%s?format=full" % (API_GMAIL, referencia.get("id", "")), cabeceras=autorizacion) or {}
        ficha = ficha_correo(detalle, alias)
        fichas += [ficha] if ficha["fecha"] and ficha["fecha"] >= desde else []
    return fichas

def archivos(pedir, autorizacion, desde, alias):
    consulta = "(modifiedTime > '%s' or createdTime > '%s') and trashed = false" % (desde, desde)
    url = "%s?q=%s&orderBy=modifiedTime desc&pageSize=50&fields=%s" % (
        API_DRIVE, urllib.parse.quote(consulta), urllib.parse.quote(CAMPOS_DRIVE))
    lista, fichas = pedir(url, cabeceras=autorizacion) or {}, []
    for archivo in (lista.get("files") or [])[:50]:
        crudo = ""
        if archivo.get("mimeType") == MIME_DOC:
            crudo = pedir("%s/%s/export?mimeType=text/plain" % (API_DRIVE, archivo.get("id", "")), cabeceras=autorizacion)
        fichas.append(ficha_archivo(archivo, alias, crudo if isinstance(crudo, str) else json.dumps(crudo, ensure_ascii=False)))
    return fichas

def guardar(fichas, alias, fecha, dir_actividad=DIR_ACTIVIDAD):
    os.makedirs(os.path.join(dir_actividad, "fichas"), exist_ok=True)
    destino = os.path.join(dir_actividad, "fichas", "%s-google-%s.json" % (fecha, alias))
    with open(destino + ".tmp", "w", encoding="utf-8") as archivo:
        json.dump({"cuenta": alias, "fecha": fecha, "privado": True, "fichas": fichas}, archivo, ensure_ascii=False, indent=1)
    os.chmod(destino + ".tmp", 0o600); os.replace(destino + ".tmp", destino)
    return destino

def leer(pedir=None, token_de=None, ahora=None, alias=None, dir_actividad=DIR_ACTIVIDAD):
    pedir = pedir or pedir_http
    token_de = token_de or (lambda nombre: _token_real(nombre, pedir))
    desde, fecha, todas, errores = corte(ahora), _ahora(ahora).strftime("%Y-%m-%d"), [], []
    for nombre in (alias or ALIAS):
        try:
            token = token_de(nombre)
        except Exception as error:  # una cuenta rota no tumba a la otra
            errores.append("%s: %s" % (nombre, error)); continue
        if not token:
            errores.append("%s: sin token (cuentas_google.py alta %s)" % (nombre, nombre)); continue
        autorizacion, fichas = {"Authorization": "Bearer %s" % token}, []
        for lector in (correos, archivos):
            try: fichas.extend(lector(pedir, autorizacion, desde, nombre))
            except Exception as error: errores.append("%s/%s: %s" % (nombre, lector.__name__, error))
        todas.extend(fichas)
        if dir_actividad: guardar(fichas, nombre, fecha, dir_actividad)
    return {"ok": True, "fichas": todas, "errores": errores}
