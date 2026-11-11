#!/usr/bin/env python3
"""Actividad de YouTube por API (SDP1111 · §4 de sintesis-diaria-autonoma).

Con el token de cuentas_google (youtube.readonly) lee de cada cuenta: los «me gusta»
recientes, los vídeos añadidos a listas en 7 días, las suscripciones nuevas y las
subidas propias. Fichas privadas (privado: true) en ~/.starseed/actividad/fichas/.
Pocas llamadas y paginación corta (una página de ≤10 por lista); el historial de
vídeos vistos NO está en la API: llega por Takeout (actividad_takeout), no se pide aquí.
Uso: python3 scripts/puente/actividad_youtube.py [alias ...]
"""
import json, os, sys, urllib.parse, urllib.request
from datetime import datetime, timedelta, timezone

import cuentas_google
from cuentas_google_env import ALIAS, escribir_json

API = "https://www.googleapis.com/youtube/v3"
DIR_FICHAS = os.path.expanduser("~/.starseed/actividad/fichas")
DIAS = 7
TOPE_LISTAS = 5  # pocas llamadas: como mucho una página por esta cantidad de listas


def pedir_api(token, url, params):
    """GET autenticado contra la Data API v3 (costura inyectable en las pruebas)."""
    consulta = urllib.parse.urlencode(params)
    peticion = urllib.request.Request("%s?%s" % (url, consulta), headers={"Authorization": "Bearer " + token})
    with urllib.request.urlopen(peticion, timeout=30) as respuesta:
        return json.load(respuesta)


def recientes(items, corte):
    """Solo los elementos cuya fecha (snippet.publishedAt) es posterior al corte."""
    return [e for e in items if ((e.get("snippet") or {}).get("publishedAt") or "") >= corte]


def ficha(tipo, cuenta, titulo, canal, enlace, fecha):
    return {"fuente": "youtube", "cuenta": cuenta, "tipo": tipo, "titulo": titulo,
            "canal": canal, "enlace": enlace, "fecha": fecha, "privado": True}


def fichas_video(items, tipo, cuenta):
    """Fichas de una página de playlistItems: título, canal, enlace al vídeo y fecha de alta."""
    salida = []
    for elemento in items:
        trozo = elemento.get("snippet") or {}
        video = (trozo.get("resourceId") or {}).get("videoId")
        if not video:
            continue
        salida.append(ficha(tipo, cuenta, trozo.get("title") or "",
                            trozo.get("videoOwnerChannelTitle") or trozo.get("channelTitle") or "",
                            "https://www.youtube.com/watch?v=" + video, trozo.get("publishedAt") or ""))
    return salida


def fichas_suscripcion(items, cuenta):
    """Las suscripciones nuevas: el canal al que se empezó a seguir y su fecha."""
    salida = []
    for elemento in items:
        trozo = elemento.get("snippet") or {}
        salida.append(ficha("suscripcion", cuenta, trozo.get("title") or "", trozo.get("title") or "",
                            "https://www.youtube.com/channel/%s" % (trozo.get("resourceId") or {}).get("channelId", ""),
                            trozo.get("publishedAt") or ""))
    return salida


def leer(alias, pedir, hoy=None, dir_fichas=DIR_FICHAS):
    """Reúne las fichas de una cuenta con pocas llamadas y las guarda en dir_fichas."""
    ahora = hoy or datetime.now(timezone.utc)
    corte = (ahora - timedelta(days=DIAS)).strftime("%Y-%m-%dT%H:%M:%SZ")
    llamadas, fichas = [], []

    def api(endpoint, **params):
        llamadas.append((endpoint, params))
        return pedir(API + "/" + endpoint, params)

    def videos(playlist_id, tipo):
        pagina = api("playlistItems", part="snippet", playlistId=playlist_id, maxResults=10)
        return fichas_video(recientes(pagina.get("items") or [], corte), tipo, alias)

    canal = (api("channels", part="contentDetails", mine="true", maxResults=1).get("items") or [{}])[0]
    subidas = ((canal.get("contentDetails") or {}).get("relatedPlaylists") or {}).get("uploads")
    fichas += videos("LL", "me_gusta")  # la lista de «me gusta» siempre lleva el id LL
    if subidas:
        fichas += videos(subidas, "subida")
    for lista in (api("playlists", part="snippet", mine="true", maxResults=TOPE_LISTAS).get("items") or [])[:TOPE_LISTAS]:
        fichas += videos(lista["id"], "lista")
    suscripciones = api("subscriptions", part="snippet", mine="true", maxResults=10).get("items") or []
    fichas += fichas_suscripcion(recientes(suscripciones, corte), alias)
    fichas.sort(key=lambda f: f["fecha"], reverse=True)
    destino = None
    if dir_fichas:
        os.makedirs(dir_fichas, exist_ok=True)
        destino = os.path.join(dir_fichas, "%s-youtube-%s.json" % (ahora.strftime("%Y-%m-%d"), alias))
        escribir_json(destino, fichas)
    return {"ok": True, "alias": alias, "fichas": fichas, "llamadas": llamadas, "destino": destino}


def main(argv):
    from cuentas_google_env import pedir_http  # la red solo en el main
    total = 0
    for alias in argv[1:] or list(ALIAS):
        token = cuentas_google.token(alias, pedir_http)
        if not token:
            print("%s: sin token vivo; corre 'cuentas_google.py estado'" % alias)
            continue
        try:
            resultado = leer(alias, lambda url, params, t=token: pedir_api(t, url, params))
        except Exception as error:  # cuota, token revocado, red: no tumba el resto de cuentas
            print("%s: sin actividad (%s)" % (alias, error.__class__.__name__))
            continue
        print("%s: %d fichas con %d llamadas -> %s" % (alias, len(resultado["fichas"]),
                                                       len(resultado["llamadas"]), resultado["destino"]))
        total += len(resultado["fichas"])
    print("Total: %d fichas privadas" % total)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
