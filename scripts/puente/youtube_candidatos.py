#!/usr/bin/env python3
"""YouTube candidatos del día (SDP1111S · §4 de sintesis-diaria-autonoma).

Con tokens de cuentas_google (alex, fundacion): (a) suscripciones → vídeos 48h por
playlistItems (1 ud c/u); (b) me gusta, listas propias, subidas propias; (c) historial
Takeout; (d) búsquedas por temas del día (máx 5, 100 ud c/u); (e) canales resonancia/
activistas. Puntúa con Laya, filtra con LEANN, máx 40, ordenados. Guarda en
~/.starseed/actividad/youtube/candidatos-AAAA-MM-DD.json con cuota.
"""
import json, os, sys
from datetime import datetime, timedelta, timezone

API = "https://www.googleapis.com/youtube/v3"
DIR_SALIDA_DEFECTO = os.path.expanduser("~/.starseed/actividad/youtube")
CUOTA_MAX = 10000


def _ahora(ahora=None):
    return ahora or datetime.now(timezone.utc)


def _corte_48h(ahora):
    return (ahora - timedelta(hours=48)).strftime("%Y-%m-%dT%H:%M:%SZ")


def _ficha_base(video_id, titulo, canal, enlace, fecha, cuenta, motivo, privado):
    return {"id": video_id, "titulo": titulo, "canal": canal, "enlace": enlace,
            "fecha": fecha, "origen": {"cuenta": cuenta, "motivo": motivo},
            "privado": privado}


def _playlist_items(token, playlist_id, corte, max_results=10):
    params = {"part": "snippet", "playlistId": playlist_id, "maxResults": max_results}
    url = f"{API}/playlistItems"
    # inyectado en pruebas
    return None  # se reemplaza por pedir_actividad


def _canales_suscripciones(token, cuenta, corte):
    params = {"part": "snippet", "mine": "true", "maxResults": 50}
    url = f"{API}/subscriptions"
    return None


def _info_canales(token, channel_ids):
    params = {"part": "snippet", "id": ",".join(channel_ids), "maxResults": 50}
    url = f"{API}/channels"
    return None


def _buscar(token, query, max_results=10):
    params = {"part": "snippet", "q": query, "type": "video", "maxResults": max_results,
              "order": "date", "publishedAfter": (datetime.now(timezone.utc) - timedelta(days=7)).strftime("%Y-%m-%dT%H:%M:%SZ")}
    url = f"{API}/search"
    return None


def _procesar_items(items, cuenta, motivo, corte, privados):
    """Convierte playlistItems/search results en fichas base, filtra por fecha."""
    salida = []
    for it in items or []:
        sn = it.get("snippet") or {}
        vid = (sn.get("resourceId") or {}).get("videoId") or (it.get("id") or {}).get("videoId")
        if not vid:
            continue
        fecha = sn.get("publishedAt") or ""
        if fecha < corte:
            continue
        salida.append(_ficha_base(vid, sn.get("title", ""), sn.get("channelTitle", ""),
                                 f"https://www.youtube.com/watch?v={vid}", fecha,
                                 cuenta, motivo, privados))
    return salida


def candidatos_dia(cuentas, pedir_actividad, pedir_takeout, temas_dia, resonancia_canales,
                   activistas_canales, laya, leann, ahora=None, dir_salida=DIR_SALIDA_DEFECTO):
    """Función pura: todo inyectado (pedir_actividad, pedir_takeout, laya, leann)."""
    ahora = _ahora(ahora)
    corte = _corte_48h(ahora)
    fecha_str = ahora.strftime("%Y-%m-%d")
    todos, cuota = [], {"unidades": 0, "detalle": {}}
    vistos = set()

    def sumar_cuota(origen, uds):
        cuota["unidades"] += uds
        cuota["detalle"][origen] = cuota["detalle"].get(origen, 0) + uds

    # (a) Suscripciones → uploads de cada canal (playlistItems = 1 ud)
    for cuenta in cuentas:
        subs = pedir_actividad(cuenta, f"{API}/subscriptions",
                              {"part": "snippet", "mine": "true", "maxResults": 50})
        sumar_cuota(f"subscriptions:{cuenta}", 1)
        canal_ids = [(s.get("snippet") or {}).get("resourceId", {}).get("channelId")
                     for s in (subs.get("items") or [])]
        canal_ids = [c for c in canal_ids if c]
        if not canal_ids:
            continue
        info = pedir_actividad(cuenta, f"{API}/channels",
                              {"part": "snippet,contentDetails", "id": ",".join(canal_ids[:50]), "maxResults": 50})
        sumar_cuota(f"channels:{cuenta}", 1)
        for ch in info.get("items") or []:
            uploads = ((ch.get("contentDetails") or {}).get("relatedPlaylists") or {}).get("uploads")
            if not uploads:
                continue
            items = pedir_actividad(cuenta, f"{API}/playlistItems",
                                   {"part": "snippet", "playlistId": uploads, "maxResults": 10})
            sumar_cuota(f"playlistItems:uploads:{cuenta}", 1)
            canal_titulo = (ch.get("snippet") or {}).get("title", "")
            motivo = "resonancia" if ch["id"] in resonancia_canales else ("activista" if ch["id"] in activistas_canales else "suscripcion_nueva")
            for f in _procesar_items(items, cuenta, motivo, corte, privado=True):
                if f["id"] not in vistos:
                    vistos.add(f["id"])
                    todos.append(f)

    # (b) Me gusta, listas propias, subidas propias
    for cuenta in cuentas:
        # Me gusta (playlist LL)
        items = pedir_actividad(cuenta, f"{API}/playlistItems",
                               {"part": "snippet", "playlistId": "LL", "maxResults": 10})
        sumar_cuota(f"playlistItems:me_gusta:{cuenta}", 1)
        for f in _procesar_items(items, cuenta, "me_gusta", corte, privado=True):
            if f["id"] not in vistos:
                vistos.add(f["id"]); todos.append(f)
        # Listas propias (playlists → playlistItems)
        listas = pedir_actividad(cuenta, f"{API}/playlists",
                                {"part": "snippet", "mine": "true", "maxResults": 5})
        sumar_cuota(f"playlists:{cuenta}", 1)
        for pl in (listas.get("items") or [])[:5]:
            items = pedir_actividad(cuenta, f"{API}/playlistItems",
                                   {"part": "snippet", "playlistId": pl["id"], "maxResults": 5})
            sumar_cuota(f"playlistItems:lista:{cuenta}", 1)
            for f in _procesar_items(items, cuenta, "lista_propia", corte, privado=True):
                if f["id"] not in vistos:
                    vistos.add(f["id"]); todos.append(f)
        # Subidas propias (canal mine → uploads)
        canal = pedir_actividad(cuenta, f"{API}/channels",
                               {"part": "contentDetails", "mine": "true", "maxResults": 1})
        sumar_cuota(f"channels:mine:{cuenta}", 1)
        uploads = ((canal.get("items") or [{}])[0].get("contentDetails") or {}).get("relatedPlaylists", {}).get("uploads")
        if uploads:
            items = pedir_actividad(cuenta, f"{API}/playlistItems",
                                   {"part": "snippet", "playlistId": uploads, "maxResults": 10})
            sumar_cuota(f"playlistItems:subidas:{cuenta}", 1)
            for f in _procesar_items(items, cuenta, "subida_propia", corte, privado=True):
                if f["id"] not in vistos:
                    vistos.add(f["id"]); todos.append(f)

    # (c) Historial Takeout (ya vistos → LEANN)
    for cuenta in cuentas:
        for f in pedir_takeout(cuenta):
            vid = f.get("enlace", "").split("v=")[-1].split("&")[0]
            if vid:
                vistos.add(vid)

    # (d) Búsquedas por temas del día (máx 5, 100 ud c/u)
    for i, tema in enumerate(temas_dia[:5]):
        items = pedir_actividad("busqueda", f"{API}/search",
                               {"part": "snippet", "q": tema, "type": "video", "maxResults": 10,
                                "order": "date", "publishedAfter": corte})
        sumar_cuota(f"search:{tema}", 100)
        for f in _procesar_items(items, "busqueda", f"busqueda:{tema}", corte, privado=False):
            if f["id"] not in vistos:
                vistos.add(f["id"]); todos.append(f)

    # (e) Canales resonancia/activistas extra (suscripciones ya los cubre, pero forzamos búsqueda por canal)
    for ch_id in resonancia_canales + activistas_canales:
        if ch_id in vistos:
            continue
        info = pedir_actividad("extra", f"{API}/channels",
                              {"part": "contentDetails", "id": ch_id, "maxResults": 1})
        sumar_cuota(f"channels:extra", 1)
        uploads = ((info.get("items") or [{}])[0].get("contentDetails") or {}).get("relatedPlaylists", {}).get("uploads")
        if uploads:
            items = pedir_actividad("extra", f"{API}/playlistItems",
                                   {"part": "snippet", "playlistId": uploads, "maxResults": 5})
            sumar_cuota(f"playlistItems:extra", 1)
            motivo = "resonancia" if ch_id in resonancia_canales else "activista"
            for f in _procesar_items(items, "extra", motivo, corte, privado=False):
                if f["id"] not in vistos:
                    vistos.add(f["id"]); todos.append(f)

    # Puntuar con Laya y filtrar con LEANN
    finales = []
    for f in todos:
        if leann(f["id"]):
            continue
        veredicto = laya(f) or {"relevante": False, "tema": None}
        if veredicto.get("relevante"):
            f["laya"] = veredicto
            finales.append(f)

    # Ordenar: primero por tema (diseño, guion, storyboard, noticia, activista, estilo), luego por fecha desc
    orden_tema = {"diseño": 0, "guion": 1, "storyboard": 2, "noticia": 3, "activista": 4, "estilo": 5}
    finales.sort(key=lambda x: (orden_tema.get(x["laya"].get("tema", ""), 99), -int(x["fecha"][:4] + x["fecha"][5:7] + x["fecha"][8:10]) if x["fecha"] else 0))
    finales = finales[:40]

    # Guardar
    archivo = None
    if dir_salida:
        os.makedirs(dir_salida, exist_ok=True)
        archivo = os.path.join(dir_salida, f"candidatos-{fecha_str}.json")
        datos = {"fecha": fecha_str, "cuota": cuota, "cuenta_origen": "ambas" if len(cuentas) > 1 else cuentas[0],
                 "candidatos": finales}
        with open(archivo + ".tmp", "w", encoding="utf-8") as fp:
            json.dump(datos, fp, ensure_ascii=False, indent=1)
        os.chmod(archivo + ".tmp", 0o600)
        os.replace(archivo + ".tmp", archivo)

    return {"ok": True, "fecha": fecha_str, "candidatos": finales, "cuota": cuota, "archivo": archivo}


def main(argv):
    from cuentas_google import token as token_cuenta
    from cuentas_google_env import pedir_http
    from actividad_takeout import leer as takeout_leer
    from sintesis_fuentes import contexto as sintesis_contexto
    from leann_cliente import buscar as leann_buscar

    raiz = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")
    ctx = sintesis_contexto(raiz, hoy=datetime.now(timezone.utc).strftime("%Y-%m-%d"))
    temas = [t for t in (ctx.get("resumen_actividad") or {}).get("temas", {})]
    rot = ctx.get("rotacion", {})
    temas += rot.get("categorias", [])

    # resonancia y activistas de síntesis previas (simplificado)
    resonancia, activistas = [], []
    for s in ctx.get("sintesis_previas", [])[:3]:
        txt = s.get("texto", "").lower()
        for linea in txt.splitlines():
            if "resonancia" in linea and "canal" in linea:
                pass  # extracción simplificada

    def laya_real(f):
        import jev
        return jev.decidir_con_laya(
            {"titulo": f.get("titulo", ""), "canal": f.get("canal", "")},
            ["¿Relevante para StarSeed? Tema: diseño, guion, storyboard, noticia, activista, estilo, tema. Responde 'no' si no."]
        )

    def leann_real(vid):
        return bool(leann_buscar("repo-starseed", vid, k=1))

    cuentas_lista = ("alex", "fundacion")
    tokens = {c: token_cuenta(c, pedir_http) for c in cuentas_lista}

    def pedir(alias, url, params):
        t = tokens.get(alias) or tokens.get("alex")
        if not t:
            return {"items": []}
        from actividad_youtube import pedir_api
        return pedir_api(t, url, params)

    return candidatos_dia(
        cuentas=cuentas_lista,
        pedir_actividad=pedir,
        pedir_takeout=lambda a: takeout_leer(pedir_http, token_de=lambda n: tokens[n]).get("fichas", []),
        temas_dia=temas[:5],
        resonancia_canales=resonancia,
        activistas_canales=activistas,
        laya=laya_real,
        leann=leann_real,
        dir_salida=DIR_SALIDA_DEFECTO,
    )


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))