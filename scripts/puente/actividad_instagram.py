#!/usr/bin/env python3
"""Actividad · guardados de Instagram desde la exportación oficial (SDP1111I · §4, SDP1111Qb).

Lee la exportación «Descargar tu información» (saved_posts.json y saved_collections.json),
sueltos o dentro de un zip oficial instagram-<usuario>-<fecha>-<id>.zip en
~/.starseed/actividad/entrada/instagram/ o ~/Downloads/.
También lee DESDE DRIVE de alex (sin la Mac): carpeta «Actividad StarSeed (privado …)»
id 1PvBnBhoxxNSBuCLSC2aQZ89Oe8mdJGB-, subcarpetas por cuenta de Instagram.
Sin red ni sesión de Alex: fichas {enlace, autor, fecha, privado: true}, incremental por enlace.
"""
import json, os, re, time, urllib.error, urllib.parse, urllib.request, zipfile, uuid

from cuentas_actividad import (
    CARPETA_ACTIVIDAD_DRIVE_ID,
    SUBCARPETAS_INSTAGRAM,
    cuenta_instagram_para,
    subcarpeta_instagram_drive,
)

FUENTE = "instagram"
DIR_ENTRADA = os.path.expanduser("~/.starseed/actividad/entrada/instagram")
DIR_DESCARGAS = os.path.expanduser("~/Downloads")
DIR_ACTIVIDAD = os.path.expanduser("~/.starseed/actividad")
NOMBRE_ESTADO = "instagram-estado.json"
ARCHIVOS_DATO = ("saved_posts.json", "saved_collections.json")
ZIP_OK = re.compile(r"^instagram-[A-Za-z0-9._]+-\d{4}-\d{2}-\d{2}-[A-Za-z0-9]+\.zip$")
CUENTA_SEGURA = re.compile(r"[^A-Za-z0-9._-]")
API_DRIVE = "https://www.googleapis.com/drive/v3/files"
CAMPOS_DRIVE = "files(id,name,mimeType,modifiedTime)"


def _sanitizar_cuenta(cuenta: str) -> str:
    """Sanitiza el nombre de cuenta para uso seguro en rutas de archivo."""
    if not cuenta:
        return "desconocida"
    # Elimina path traversal y caracteres peligrosos
    segura = CUENTA_SEGURA.sub("_", cuenta)
    # Colapsa secuencias de puntos (path traversal)
    while ".." in segura:
        segura = segura.replace("..", ".")
    # Evita nombres reservados y vacíos tras sanitizar
    if segura in {"", ".", ".."} or segura.startswith("."):
        return "desconocida"
    return segura[:64]


def texto_de(fila):
    titulo = fila.get("title") or fila.get("name")
    if isinstance(titulo, list):
        return " ".join(str(t.get("text", "")) for t in titulo if isinstance(t, dict)).strip()
    return titulo.strip() if isinstance(titulo, str) else ""


def filas_de_datos(datos, *claves):
    if isinstance(datos, list):
        return [f for f in datos if isinstance(f, dict)]
    for clave in claves:
        valor = datos.get(clave) if isinstance(datos, dict) else None
        if isinstance(valor, list):
            return [f for f in valor if isinstance(f, dict)]
    return []


def _de_medios(fila, claves):
    for clave in claves:
        valor = fila.get(clave)
        if isinstance(valor, str) and valor.strip():
            return valor.strip()
    for bloque in fila.get("media_list_data", []) or []:
        if isinstance(bloque, dict) and isinstance(bloque.get("media"), dict):
            medio = bloque["media"]
            anidado = _de_medios(medio, claves) or _de_medios(medio.get("user") or {}, claves)
            if anidado:
                return anidado
    return ""


def autor_de(fila):
    return _de_medios(fila, ("autor", "author", "username", "user_name", "full_name"))


def enlace_de(fila):
    return _de_medios(fila, ("href", "uri", "url", "link"))


def fecha_de(fila):
    for clave in ("saved_date", "created_time", "last_update", "saved_at"):
        valor = fila.get(clave)
        if isinstance(valor, (int, float)) and valor > 0:
            return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(valor))
        if isinstance(valor, str) and valor.strip():
            return valor.strip()[:40]
    return ""


def fichas_de_filas(filas, tipo, cuenta, coleccion=""):
    """Una ficha por guardado con enlace; privado: true, nunca sale del nodo."""
    return [{"fuente": FUENTE, "tipo": tipo, "cuenta": cuenta, "coleccion": coleccion or None,
             "enlace": enlace[:300], "autor": autor_de(fila)[:100], "fecha": fecha_de(fila),
             "titulo": texto_de(fila)[:300], "privado": True}
            for fila in filas if (enlace := enlace_de(fila))]


def fichas_de_datos(datos, base, cuenta=""):
    if base == "saved_posts.json":
        return fichas_de_filas(filas_de_datos(datos, "saved_saved_post", "saved_post"), "guardado", cuenta)
    salida = []
    for coleccion in filas_de_datos(datos, "saved_collections", "collections"):
        medios = coleccion.get("media_list_data")
        salida.extend(fichas_de_filas(medios if isinstance(medios, list) else [], "coleccion", cuenta,
                                      texto_de(coleccion) or str(coleccion.get("name") or "")))
    return salida


def cargas_de_zip(ruta):
    with zipfile.ZipFile(ruta) as paquete:
        return {os.path.basename(n).lower(): json.loads(paquete.read(n).decode("utf-8"))
                for n in paquete.namelist() if os.path.basename(n).lower() in ARCHIVOS_DATO}


def cargas_disponibles(dirs):
    return [os.path.join(d, n) for d in dirs if os.path.isdir(d)
            for n in sorted(os.listdir(d)) if ZIP_OK.match(n) or n.lower() in ARCHIVOS_DATO]


def _drive_listar(pedir, autorizacion, carpeta_id: str):
    """Lista archivos en una carpeta de Drive (no recursivo)."""
    consulta = "'%s' in parents and trashed = false" % carpeta_id
    url = "%s?q=%s&fields=%s" % (API_DRIVE, urllib.parse.quote(consulta), urllib.parse.quote(CAMPOS_DRIVE))
    return (pedir(url, cabeceras=autorizacion) or {}).get("files") or []


def _drive_descargar(pedir, autorizacion, file_id: str) -> bytes:
    """Descarga el contenido de un archivo de Drive."""
    url = "%s/%s?alt=media" % (API_DRIVE, file_id)
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=autorizacion), timeout=60) as resp:
            return resp.read()
    except urllib.error.HTTPError as error:
        if error.code == 404:
            return b""
        raise


def _leer_desde_drive(pedir, token_de, alias: str, cuenta_ig: str, dir_actividad: str):
    """Lee exportaciones de Instagram desde Drive para una cuenta específica."""
    from cuentas_google import token as token_real
    token_func = token_de or (lambda nombre: token_real(nombre, pedir))
    token = token_func(alias)
    if not token:
        return [], ["%s: sin token (cuentas_google.py alta %s)" % (alias, alias)]
    autorizacion = {"Authorization": "Bearer %s" % token}
    subcarpeta_id = subcarpeta_instagram_drive(cuenta_ig)
    archivos = _drive_listar(pedir, autorizacion, subcarpeta_id)
    fichas, errores = [], []
    for archivo in archivos:
        if not (archivo.get("name", "").lower().endswith(".zip") or archivo.get("name", "").lower() in ARCHIVOS_DATO):
            continue
        try:
            contenido = _drive_descargar(pedir, autorizacion, archivo.get("id", ""))
            if not contenido:
                continue
            if archivo.get("name", "").lower().endswith(".zip"):
                import io
                with zipfile.ZipFile(io.BytesIO(contenido)) as paquete:
                    cargas = {os.path.basename(n).lower(): json.loads(paquete.read(n).decode("utf-8"))
                              for n in paquete.namelist() if os.path.basename(n).lower() in ARCHIVOS_DATO}
            else:
                cargas = {archivo.get("name", "").lower(): json.loads(contenido.decode("utf-8"))}
            for base, datos in cargas.items():
                fichas.extend(fichas_de_datos(datos, base, cuenta_ig))
        except (OSError, ValueError, zipfile.BadZipFile, urllib.error.HTTPError) as error:
            errores.append("%s: %s" % (archivo.get("name", "?"), str(error)[:120]))
    return fichas, errores


def leer(dirs=None, dir_actividad=None, estado=None, pedir=None, token_de=None, alias=None, desde_drive=False):
    """Lee las exportaciones disponibles (locales y/o Drive) y devuelve las fichas nuevas (por enlace)."""
    dir_actividad = dir_actividad or DIR_ACTIVIDAD
    estado = estado if estado is not None else leer_estado(dir_actividad)
    vistos, fichas, errores = set((estado or {}).get("enlaces", [])), [], []
    pedir = pedir or (lambda url, datos=None, cabeceras=None: json.loads(
        urllib.request.urlopen(urllib.request.Request(
            url, data=urllib.parse.urlencode(datos).encode("utf-8") if datos else None, headers=cabeceras or {}), timeout=60
        ).read().decode("utf-8")) if not url.endswith("?alt=media") else urllib.request.urlopen(
            urllib.request.Request(url, headers=cabeceras or {}), timeout=60).read()
    )
    # Locales
    for ruta in cargas_disponibles(dirs or [DIR_ENTRADA, DIR_DESCARGAS]):
        es_zip = ruta.lower().endswith(".zip")
        cuenta_raw = os.path.basename(ruta).split("-")[1] if es_zip else ""
        cuenta = _sanitizar_cuenta(cuenta_raw)
        try:
            cargas = cargas_de_zip(ruta) if es_zip else {os.path.basename(ruta).lower(): json.load(open(ruta, encoding="utf-8"))}
        except (OSError, ValueError, zipfile.BadZipFile) as error:
            errores.append("%s: %s" % (os.path.basename(ruta), str(error)[:120]))
            continue
        for base, datos in cargas.items():
            fichas.extend(fichas_de_datos(datos, base, cuenta))
    # Drive
    if desde_drive:
        for cuenta_ig in ("maggasukha", "sociedadstarseed"):
            alias_drive = cuenta_instagram_para(cuenta_ig)
            if alias and alias_drive not in (alias if isinstance(alias, (list, tuple)) else (alias,)):
                continue
            nuevas_drive, errores_drive = _leer_desde_drive(pedir, token_de, alias_drive, cuenta_ig, dir_actividad)
            fichas.extend(nuevas_drive)
            errores.extend(errores_drive)
    nuevas = [f for f in fichas if f["enlace"] not in vistos]
    estado_nuevo = {"enlaces": sorted(vistos | {f["enlace"] for f in nuevas})}
    guardado = guardar(estado_nuevo, nuevas, dir_actividad) if nuevas else {}
    return {"ok": True, "fichas": nuevas, "estado": estado_nuevo, "errores": errores, **guardado}


def _nombre_archivo_fichas(fecha: str, cuenta: str) -> str:
    """Genera nombre único para el archivo de fichas: fecha-cuenta-uuid.json."""
    sufijo = uuid.uuid4().hex[:8]
    return f"{fecha}-instagram-{cuenta}-{sufijo}.json"


def guardar(estado, fichas, dir_actividad=DIR_ACTIVIDAD):
    """Guarda las fichas nuevas y el estado de enlaces, con escritura atómica.
    Cada ejecución crea un archivo único (fecha-cuenta-uuid) para evitar sobrescrituras.
    """
    os.makedirs(os.path.join(dir_actividad, "fichas"), exist_ok=True)
    fecha = time.strftime("%Y-%m-%d")
    cuenta = fichas[0].get("cuenta", "general") if fichas else "general"
    cuenta = _sanitizar_cuenta(cuenta)
    destino = os.path.join(dir_actividad, "fichas", _nombre_archivo_fichas(fecha, cuenta))
    for ruta, contenido in ((destino, {"fecha": fecha, "fuente": FUENTE, "privado": True, "fichas": fichas}),
                            (os.path.join(dir_actividad, NOMBRE_ESTADO), estado)):
        json.dump(contenido, open(ruta + ".tmp", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        os.replace(ruta + ".tmp", ruta)
    return {"archivo_fichas": destino, "archivo_estado": os.path.join(dir_actividad, NOMBRE_ESTADO)}


def leer_estado(dir_actividad=DIR_ACTIVIDAD):
    try:
        return json.load(open(os.path.join(dir_actividad, NOMBRE_ESTADO), encoding="utf-8"))
    except (OSError, ValueError):
        return {}