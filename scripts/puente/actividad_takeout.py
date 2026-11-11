#!/usr/bin/env python3
"""Actividad · Takeout de Google (SDP1111H · §4 de sintesis-diaria-autonoma).
Busca en el Drive de cada alias la exportación de Takeout más reciente (zip con «YouTube and YouTube Music» y
«My Activity»), la baja a un temporal del nodo y extrae el historial de vídeos vistos y «Mi actividad» de Búsqueda
y de Gemini. Incremental: guarda la última marca de tiempo leída y solo emite fichas nuevas. privado: true; el zip
se borra al terminar. El lector de los JSON es puro; `pedir` y `token_de` son costuras inyectables.
Uso: python3 scripts/puente/actividad_takeout.py leer [--seco]
"""
import io, json, os, sys, tempfile, time, urllib.parse, urllib.request, zipfile

import cuentas_google
from cuentas_google_env import ALIAS, pedir_http as pedir_form, escribir_json

DIR_ACTIVIDAD = os.path.expanduser("~/.starseed/actividad")
NOMBRE_ESTADO = "takeout-estado.json"
API_DRIVE = "https://www.googleapis.com/drive/v3/files"
MIEMBROS = (("YouTube and YouTube Music/history/watch-history.json", "youtube"),
            ("My Activity/Search/MyActivity.json", "busqueda"), ("My Activity/Gemini/MyActivity.json", "gemini"))


def fichas_de(filas, cuenta, fuente):
    """Fichas de una lista de Takeout (watch-history o MyActivity): puro, sin red ni disco."""
    fichas = []
    for fila in filas if isinstance(filas, list) else []:
        if not isinstance(fila, dict) or not fila.get("time"):
            continue
        fichas.append({"fuente": "takeout-" + fuente, "cuenta": cuenta, "privado": True,
                       "fecha": str(fila["time"]), "enlace": str(fila.get("titleUrl") or "")[:300],
                       "titulo": str(fila.get("title") or "").replace("Watched ", "")[:300],
                       "canal": str((fila.get("subtitles") or [{}])[0].get("name") or "")[:200]})
    return fichas


def solo_nuevas(fichas, marca):
    """Incremental: las fichas con fecha posterior a la marca, y la marca nueva (puro)."""
    nuevas = [f for f in fichas if f["fecha"] > (marca or "")]
    return nuevas, max((f["fecha"] for f in nuevas), default=marca)


def leer_zip(bytes_zip, cuenta):
    """Los JSON de Takeout dentro del zip → fichas; puro (pruebas con muestras pequeñas)."""
    fichas = []
    with zipfile.ZipFile(io.BytesIO(bytes_zip)) as zip_:
        for nombre, fuente in MIEMBROS:
            try:
                carga = json.loads(zip_.read(nombre).decode("utf-8"))
            except (KeyError, ValueError):
                continue
            fichas += fichas_de(carga, cuenta, fuente)
    return fichas


def pedir_http(url, token=None, crudo=False):
    """GET autenticada de Drive: JSON por defecto y bytes con crudo; costura inyectable."""
    cabeceras = {"Authorization": "Bearer %s" % token} if token else {}
    with urllib.request.urlopen(urllib.request.Request(url, headers=cabeceras), timeout=60) as respuesta:
        datos = respuesta.read()
    return datos if crudo else json.loads(datos.decode("utf-8"))


def buscar_zip(token, pedir):
    """El zip de Takeout más reciente del Drive: {id, name}; None si no hay."""
    consulta = urllib.parse.urlencode({
        "q": "name contains 'takeout' and mimeType='application/zip' and trashed=false",
        "orderBy": "modifiedTime desc", "pageSize": "3", "fields": "files(id,name)"})
    filas = (pedir("%s?%s" % (API_DRIVE, consulta), token) or {}).get("files") or []
    return filas[0] if filas else None


def guardar(estado, fichas, alias, fecha, dir_actividad=DIR_ACTIVIDAD):
    """Fichas y estado solo en el nodo, con escritura atómica; nunca salen de aquí."""
    os.makedirs(os.path.join(dir_actividad, "fichas"), exist_ok=True)
    escribir_json(os.path.join(dir_actividad, "fichas", "%s-takeout-%s.json" % (fecha, alias)),
                  {"alias": alias, "fecha": fecha, "privado": True, "fichas": fichas})
    escribir_json(os.path.join(dir_actividad, NOMBRE_ESTADO), estado)


def leer_estado(dir_actividad=DIR_ACTIVIDAD):
    try:
        carga = json.load(open(os.path.join(dir_actividad, NOMBRE_ESTADO), encoding="utf-8"))
        return carga if isinstance(carga, dict) else {}
    except (OSError, ValueError):
        return {}


def leer(alias, pedir=pedir_http, token_de=lambda a: cuentas_google.token(a, pedir_form),
         dir_actividad=DIR_ACTIVIDAD, dir_tmp=None):
    """Un alias: buscar el zip, bajarlo a un temporal, extraer lo nuevo, guardar y borrar el zip."""
    token = token_de(alias)
    if not token:
        return {"ok": False, "motivo": "sin token para %s" % alias}
    zip_info = buscar_zip(token, pedir)
    if not zip_info:
        return {"ok": False, "motivo": "sin exportación de Takeout en el Drive de %s" % alias}
    temporal = tempfile.mkdtemp(prefix="takeout-", dir=dir_tmp)
    ruta_zip = os.path.join(temporal, zip_info.get("name") or "takeout.zip")
    open(ruta_zip, "wb").write(pedir("%s/%s?alt=media" % (API_DRIVE, zip_info["id"]), token, crudo=True))
    fichas = leer_zip(open(ruta_zip, "rb").read(), alias)
    os.remove(ruta_zip); os.rmdir(temporal)
    estado, marcas, total, por_fuente = leer_estado(dir_actividad), {}, [], {}
    for _, fuente in MIEMBROS:
        de_fuente = [f for f in fichas if f["fuente"] == "takeout-" + fuente]
        nuevas, marcas[fuente] = solo_nuevas(de_fuente, (estado.get(alias) or {}).get(fuente))
        total += nuevas; por_fuente[fuente] = len(nuevas)
    guardar({**estado, alias: marcas}, total, alias, time.strftime("%Y-%m-%d"), dir_actividad)
    return {"ok": True, "zip": zip_info.get("name"), "nuevas": por_fuente, "fichas": total}


def main(argv):
    if "--seco" in argv:
        print(json.dumps({a: cuentas_google.token(a, pedir_form) is not None for a in ALIAS})); return 0
    for alias in ALIAS:
        r = leer(alias)
        print("%s: %s nuevas %s" % (alias, r.get("motivo", ""),
                                    json.dumps(r.get("nuevas") or {}, ensure_ascii=False)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
