#!/usr/bin/env python3
"""Actividad · YouTube por la Data API v3 (SDP1111G · §4 de sintesis-diaria-autonoma).
Con el token que `cuentas_google` guarda por alias (youtube.readonly) lee en pocas llamadas y
con paginación corta (cuota): «me gusta» recientes, vídeos añadidos a listas en 7 días,
suscripciones nuevas y subidas propias; fichas privadas (título, canal, enlace, fecha) en
~/.starseed/actividad/fichas/. El historial de vídeos vistos NO está en la API: no se pide.
"""
import json, os, time
import urllib.parse, urllib.request

BASE = "https://www.googleapis.com/youtube/v3"
DIR_ACTIVIDAD, DIR_CUENTAS = os.path.expanduser("~/.starseed/actividad"), os.path.expanduser("~/.starseed/cuentas")
NOMBRE_ESTADO, ALIAS = "youtube-estado.json", ("alex", "fundacion")
MAX_PAGINA, MAX_LISTAS, DIAS = 25, 10, 7  # paginación corta: la cuota manda
PART = "snippet,contentDetails"

def _get(url, token):
    """GET a la Data API con el token de acceso; el JSON de la respuesta, o {} sin fallar."""
    try:
        with urllib.request.urlopen(urllib.request.Request(
                url, headers={"Authorization": "Bearer " + token}), timeout=30) as respuesta:
            return json.loads(respuesta.read().decode("utf-8"))
    except (OSError, ValueError):
        return {}

def api(ruta, token, pedir=None, **params):
    """Una llamada a la Data API: URL con la consulta firmada; devuelve el dict del JSON."""
    consulta = urllib.parse.urlencode(dict(params, maxResults=MAX_PAGINA))
    return (pedir or _get)("%s/%s?%s" % (BASE, ruta, consulta), token)

def _nuevas(vistos, clave, filas, corte):
    """(nuevas, estado): filas recientes cuya identidad (vídeo, canal o id) no se había visto."""
    def identidad(f):
        r = (f.get("snippet") or {}).get("resourceId") or {}
        return str(r.get("videoId") or r.get("channelId") or (f.get("contentDetails") or {}).get("videoId") or f.get("id") or "")
    ya = list(vistos.get(clave, [])); identidades = [identidad(f) for f in filas]
    pares = [(i, f) for i, f in zip(identidades, filas)
             if i and i not in ya and str(((f.get("snippet") or {}).get("publishedAt") or ""))[:10] >= corte]
    return pares, sorted(set(ya) | set(i for i in identidades if i))

def _ficha(alias, correo, tipo, fila, lista=None):
    """Ficha privada de YouTube: referencia al vídeo o canal, nunca su contenido."""
    sn, recurso = fila.get("snippet") or {}, (fila.get("snippet") or {}).get("resourceId") or {}
    video, canal_id = recurso.get("videoId"), recurso.get("channelId")
    enlace = ("https://www.youtube.com/watch?v=%s" % video) if video else ("https://www.youtube.com/channel/%s" % canal_id) if canal_id else ""
    return {"fuente": "youtube", "cuenta": correo, "alias": alias, "tipo": tipo, "lista": lista,
            "privado": True, "titulo": str(sn.get("title") or "")[:300],
            "canal": str(sn.get("videoOwnerChannelTitle") or sn.get("channelTitle") or "")[:200],
            "enlace": enlace, "fecha": str(sn.get("publishedAt") or "")[:40]}
def _lee_cuenta(alias, correo, token, pedir, vistos, nuevo, fichas, corte):
    """Las cuatro consultas de una cuenta; devuelve las llamadas hechas para medir la cuota."""
    llamadas = [0]
    items = lambda salida: (salida or {}).get("items") or []
    def llamar(ruta, **params):
        llamadas[0] += 1; return api(ruta, token, pedir, **params)
    def añadir(tipo, filas, lista=None):
        clave = "%s|lista|%s" % (alias, lista[0]) if lista else "%s|%s" % (alias, tipo)
        nuevas, nuevo[clave] = _nuevas(vistos, clave, filas, corte)
        fichas.extend(_ficha(alias, correo, tipo, f, lista[1] if lista else None) for _, f in nuevas)
    añadir("me-gusta", items(llamar("playlistItems", part=PART, playlistId="LL")))
    añadir("suscripcion", items(llamar("subscriptions", part="snippet", mine="true")))
    subidas = (((items(llamar("channels", part="contentDetails", mine="true")) or [{}])[0]
                .get("contentDetails") or {}).get("relatedPlaylists") or {}).get("uploads")
    if subidas:
        añadir("subida", items(llamar("playlistItems", part=PART, playlistId=subidas)))
    for fila in items(llamar("playlists", part="snippet", mine="true"))[:MAX_LISTAS]:
        añadir("lista", items(llamar("playlistItems", part=PART, playlistId=fila.get("id") or "")),
               (fila.get("id") or "", str((fila.get("snippet") or {}).get("title") or "")[:200]))
    return llamadas[0]

def token_cuenta(alias):
    """Token de acceso vivo para el alias por el custodio de cuentas; None si no hay sesión."""
    try:
        from cuentas_google import token as token_google; from cuentas_google_env import pedir_http
        return token_google(alias, pedir_http)
    except (ImportError, OSError, ValueError):
        return None
def correo_cuenta(alias):
    """El correo del alias, desde su ficha de cuenta; sin tokens, solo el correo."""
    try:
        return str(json.load(open(os.path.join(DIR_CUENTAS, alias + ".json"), encoding="utf-8")).get("correo") or "") or None
    except (OSError, ValueError):
        return None

def leer(token_de=None, pedir=None, correo_de=None, dir_actividad=None, estado=None, ahora=None):
    """La actividad de YouTube de cada cuenta con token; nunca falla y respeta la cuota."""
    ahora = time.time() if ahora is None else ahora
    corte = time.strftime("%Y-%m-%d", time.gmtime(ahora - DIAS * 86400))
    estado = estado or (leer_estado(os.path.join(dir_actividad, NOMBRE_ESTADO)) if dir_actividad else None)
    vistos, nuevo = dict(estado or {}), dict(estado or {})
    fichas, errores, llamadas = [], [], 0
    for alias in ALIAS:
        token = (token_de or token_cuenta)(alias)
        if not token:
            errores.append("%s: sin token de acceso" % alias); continue
        llamadas += _lee_cuenta(alias, (correo_de or correo_cuenta)(alias), token, pedir, vistos, nuevo, fichas, corte)
    if not llamadas:
        return {"ok": False, "motivo": "sin token de acceso de YouTube", "errores": errores}
    fecha = time.strftime("%Y-%m-%d", time.gmtime(ahora))
    if dir_actividad:
        guardar(nuevo, fichas, fecha, dir_actividad)
    return {"ok": True, "fichas": fichas, "estado": nuevo, "errores": errores, "llamadas": llamadas, "fecha": fecha}

def guardar(estado, fichas, fecha, dir_actividad=DIR_ACTIVIDAD):
    """Guarda las fichas privadas y el estado de la pasada: solo en el nodo, nunca fuera."""
    os.makedirs(os.path.join(dir_actividad, "fichas"), exist_ok=True)
    destino = os.path.join(dir_actividad, "fichas", "%s-youtube.json" % fecha)
    for ruta, contenido in ((destino, {"fecha": fecha, "privado": True, "fichas": fichas}),
                            (os.path.join(dir_actividad, NOMBRE_ESTADO), estado)):
        with open(ruta + ".tmp", "w", encoding="utf-8") as archivo:
            json.dump(contenido, archivo, ensure_ascii=False, indent=1)
        os.replace(ruta + ".tmp", ruta)
    return {"fichas": destino, "estado": os.path.join(dir_actividad, NOMBRE_ESTADO)}

def leer_estado(ruta=None):
    """El estado de la pasada anterior; vacío si no hay archivo."""
    try:
        return json.load(open(ruta or os.path.join(DIR_ACTIVIDAD, NOMBRE_ESTADO), encoding="utf-8"))
    except (OSError, ValueError):
        return {}
