#!/usr/bin/env python3
"""Actividad · Takeout de Google (SDP1111H · §4 de sintesis-diaria-autonoma).

Busca en el Drive de cada alias el zip de Takeout más reciente, lo baja a un directorio
temporal del nodo y extrae en JSON el historial de vídeos vistos de YouTube y «Mi actividad»
de Búsqueda y de Gemini. Incremental: guarda la última marca leída y solo emite fichas nuevas;
privado: true; borra el zip al terminar. Los lectores son puros y probados con muestras."""
import csv, datetime, io, json, os, tempfile, time, urllib.parse, urllib.request, zipfile

ALIAS = ("alex", "fundacion")
DIR_ACTIVIDAD = os.path.expanduser("~/.starseed/actividad")
API_DRIVE = "https://www.googleapis.com/drive/v3/files"
CAMPOS = "files(id,name,modifiedTime)"

def _ahora(ahora=None):
    return (ahora.astimezone(datetime.timezone.utc) if isinstance(ahora, datetime.datetime)
            else datetime.datetime.fromtimestamp(ahora if ahora is not None else time.time(), datetime.timezone.utc))

def _iso(texto):
    """Marca de tiempo del Takeout (ISO con Z o CSV sin zona) en UTC con Z, comparable."""
    crudo = str(texto or "").strip().replace("Z", "+00:00")
    for forma in ("%Y-%m-%dT%H:%M:%S.%f%z", "%Y-%m-%dT%H:%M:%S%z", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M"):
        try:
            fecha = datetime.datetime.strptime(crudo, forma); return (fecha if fecha.tzinfo else fecha.replace(tzinfo=datetime.timezone.utc)).strftime("%Y-%m-%dT%H:%M:%SZ")
        except ValueError: continue
    return ""

def _fichas(filas, alias, fuente, marca, fechas, titulos, enlaces):
    fichas = []
    for fila in filas or []:
        fecha = _iso(str(next((fila[c] for c in fechas if fila.get(c)), "") or ""))
        if not fecha or fecha <= marca: continue
        fichas.append({"fuente": fuente, "cuenta": alias, "privado": True, "fecha": fecha,
                       "titulo": str(next((fila[c] for c in titulos if fila.get(c)), "") or ""),
                       "enlace": str(next((fila[c] for c in enlaces if fila.get(c)), "") or "")})
    return fichas

def fichas_actividad(eventos, alias, fuente, marca=""):
    return _fichas(eventos, alias, fuente, marca, ("time",), ("title",), ("titleUrl",))
def fichas_youtube(filas, alias, marca=""):
    return _fichas(filas, alias, "youtube", marca, ("Visto el", "Watched at", "time"),
                   ("Título", "Title", "title"), ("URL del título", "Title URL", "titleUrl"))

def extraer(zip_bytes):
    datos = {"busqueda": [], "gemini": [], "youtube": []}
    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as paquete:
        for nombre in paquete.namelist():
            bajo = nombre.replace("\\", "/").lower()
            actividad = bajo.endswith("myactivity.json")
            clave = ("busqueda" if actividad and ("search" in bajo or "búsqueda" in bajo)
                     else ("gemini" if actividad and "gemini" in bajo else ("youtube" if "watch-history" in bajo else "")))
            if clave: datos[clave] = (_filas if clave == "youtube" else _eventos)(paquete.read(nombre).decode("utf-8", "replace"))
    return datos

def _eventos(crudo):
    bloque = json.loads(crudo)
    return bloque if isinstance(bloque, list) else (bloque or {}).get("events") or []
def _filas(crudo):
    return json.loads(crudo) if crudo.lstrip().startswith("[") else list(csv.DictReader(io.StringIO(crudo)))

def pedir_http(url, datos=None, cabeceras=None):
    cuerpo = urllib.parse.urlencode(datos).encode("utf-8") if datos is not None else None
    peticion = urllib.request.Request(url, data=cuerpo, headers=cabeceras or {})
    with urllib.request.urlopen(peticion, timeout=300) as respuesta: return respuesta.read()
def _token_real(alias, pedir):
    from cuentas_google import token
    return token(alias, lambda url, datos: pedir(url, datos=datos))

def buscar_takeout(pedir, autorizacion):
    consulta = "name contains 'takeout' and mimeType='application/zip' and trashed = false"
    url = "%s?q=%s&orderBy=modifiedTime desc&pageSize=5&fields=%s" % (API_DRIVE, urllib.parse.quote(consulta), urllib.parse.quote(CAMPOS))
    return ((pedir(url, cabeceras=autorizacion) or {}).get("files") or [None])[0]

def leer_marca(alias, dir_actividad):
    try: return json.load(open(os.path.join(dir_actividad, "takeout", "marca-%s.json" % alias), encoding="utf-8")).get("ultima", "")
    except (OSError, ValueError): return ""

def guardar_marca(alias, ultima, dir_actividad):
    destino = os.path.join(dir_actividad, "takeout", "marca-%s.json" % alias)
    os.makedirs(os.path.dirname(destino), exist_ok=True)
    with open(destino, "w", encoding="utf-8") as archivo: json.dump({"alias": alias, "ultima": ultima, "privado": True}, archivo, ensure_ascii=False)

def guardar(fichas, alias, fecha, dir_actividad):
    os.makedirs(os.path.join(dir_actividad, "fichas"), exist_ok=True)
    destino = os.path.join(dir_actividad, "fichas", "%s-takeout-%s.json" % (fecha, alias))
    with open(destino + ".tmp", "w", encoding="utf-8") as archivo:
        json.dump({"cuenta": alias, "fecha": fecha, "privado": True, "fichas": fichas}, archivo, ensure_ascii=False, indent=1)
    os.chmod(destino + ".tmp", 0o600); os.replace(destino + ".tmp", destino)
    return destino

def _cuenta(pedir, token, descargar, alias, marca, dir_actividad, fecha, dir_tmp):
    """Baja el zip a un archivo temporal del nodo, lo extrae, emite lo nuevo y borra el zip."""
    if not token: raise RuntimeError("sin token (cuentas_google.py alta %s)" % alias)
    autorizacion = {"Authorization": "Bearer %s" % token}
    archivo = buscar_takeout(pedir, autorizacion)
    if not archivo: return [], ""
    descriptor, ruta_zip = tempfile.mkstemp(prefix="takeout-%s-" % alias, suffix=".zip", dir=dir_tmp); os.close(descriptor)
    try:
        with open(ruta_zip, "wb") as destino: destino.write(descargar("%s/%s?alt=media" % (API_DRIVE, archivo.get("id")), cabeceras=autorizacion))
        datos = extraer(open(ruta_zip, "rb").read())
    finally:
        if os.path.exists(ruta_zip): os.remove(ruta_zip)
    fichas = (fichas_actividad(datos["busqueda"], alias, "busqueda", marca) + fichas_actividad(datos["gemini"], alias, "gemini", marca) + fichas_youtube(datos["youtube"], alias, marca))
    if fichas and dir_actividad: guardar(fichas, alias, fecha, dir_actividad)
    return fichas, max([f["fecha"] for f in fichas] + [marca])

def leer(pedir=None, token_de=None, descargar=None, alias=None, ahora=None, dir_actividad=DIR_ACTIVIDAD, dir_tmp=None):
    """Por cada alias: el Takeout más reciente, solo las fichas nuevas desde la última marca."""
    pedir = pedir or pedir_http
    token_de = token_de or (lambda nombre: _token_real(nombre, pedir))
    descargar = descargar or pedir_http
    fecha, todas, errores = _ahora(ahora).strftime("%Y-%m-%d"), [], []
    for nombre in (alias or ALIAS):
        try:
            fichas, ultima = _cuenta(pedir, token_de(nombre), descargar, nombre, leer_marca(nombre, dir_actividad), dir_actividad, fecha, dir_tmp)
            todas.extend(fichas)
            if fichas and ultima: guardar_marca(nombre, ultima, dir_actividad)
        except Exception as error:  # una cuenta rota no tumba a la otra
            errores.append("%s: %s" % (nombre, error))
    return {"ok": True, "fichas": todas, "errores": errores}
