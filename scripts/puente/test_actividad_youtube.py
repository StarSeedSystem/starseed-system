#!/usr/bin/env python3
"""Pruebas de actividad_youtube sin red: `token_de`, `pedir` y `correo_de` van inyectados (SDP1111G)."""
import json, os, sys
import urllib.parse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import actividad_youtube as A  # noqa: E402

AHORA = 1_800_000_000  # 2027-01-15 UTC: la ventana de 7 días empieza el 2027-01-08
HOY, VIEJA = "2027-01-15T10:00:00Z", "2026-12-01T10:00:00Z"
SESION = {"token_de": lambda alias: "tok-" + alias, "correo_de": lambda alias: alias + "@gmail.com"}

def pedir_falso(llamadas, playlists=None):
    """Una Data API de mentira: deja constancia de cada URL y responde por ruta y lista."""
    playlists = playlists or {}
    def pedir(url, token):
        llamadas.append(url)
        parte = urllib.parse.urlparse(url)
        consulta = urllib.parse.parse_qs(parte.query)
        ruta = parte.path.rsplit("/", 1)[-1]
        if ruta == "playlistItems":
            return {"items": playlists.get(consulta["playlistId"][0], [])}
        if ruta == "subscriptions":
            return {"items": [{"snippet": {"title": "Canal Seguido", "channelTitle": "Canal Seguido",
                                           "publishedAt": HOY, "resourceId": {"channelId": "UCnuevo"}}}]}
        if ruta == "channels":
            return {"items": [{"contentDetails": {"relatedPlaylists": {"uploads": "UUsubidas"}}}]}
        if ruta == "playlists":
            return {"items": [{"id": "PL1", "snippet": {"title": "Referencias"}}]}
        return {}
    return pedir

def test_las_cuatro_consultas_con_paginacion_corta():
    llamadas = []
    r = A.leer(pedir=pedir_falso(llamadas, playlists={"LL": [], "UUsubidas": [], "PL1": []}), **SESION)
    assert r["ok"] is True
    assert r["llamadas"] == 12  # por cuenta: me gusta, suscripciones, canales, subidas, listas e ítems de lista
    assert all("maxResults=25" in u for u in llamadas)
    assert not any("tok-" in u for u in llamadas)  # el token va en la cabecera, no en la URL

def test_las_fichas_son_privadas_y_de_referencia():
    llamadas = []
    listas = {"LL": [{"snippet": {"title": "Vídeo Gustado", "channelTitle": "Canal A", "publishedAt": HOY,
                                  "resourceId": {"videoId": "v1"}}}],
              "UUsubidas": [{"snippet": {"title": "Vídeo Propio", "videoOwnerChannelTitle": "Yo",
                                         "publishedAt": HOY, "resourceId": {"videoId": "v2"}}}],
              "PL1": [{"snippet": {"title": "Vídeo en Lista", "channelTitle": "Canal B", "publishedAt": HOY,
                                   "resourceId": {"videoId": "v3"}}}]}
    r = A.leer(pedir=pedir_falso(llamadas, playlists=listas), **SESION)
    de_alex = [f for f in r["fichas"] if f["alias"] == "alex"]
    assert all(f["privado"] is True and f["fuente"] == "youtube" for f in de_alex)
    assert sorted(f["tipo"] for f in de_alex) == ["lista", "me-gusta", "subida", "suscripcion"]
    por_tipo = {f["tipo"]: f for f in de_alex}
    assert por_tipo["me-gusta"]["enlace"] == "https://www.youtube.com/watch?v=v1"
    assert por_tipo["me-gusta"]["canal"] == "Canal A" and por_tipo["me-gusta"]["titulo"] == "Vídeo Gustado"
    assert por_tipo["subida"]["enlace"] == "https://www.youtube.com/watch?v=v2"
    assert por_tipo["lista"]["lista"] == "Referencias"
    assert por_tipo["suscripcion"]["enlace"] == "https://www.youtube.com/channel/UCnuevo"
    assert por_tipo["suscripcion"]["fecha"] == HOY

def test_solo_lo_reciente_y_nuevo_entra():
    llamadas = []
    listas = {"LL": [{"snippet": {"title": "Viejo", "channelTitle": "C", "publishedAt": VIEJA,
                                  "resourceId": {"videoId": "v0"}}},
                     {"snippet": {"title": "Nuevo", "channelTitle": "C", "publishedAt": HOY,
                                  "resourceId": {"videoId": "v1"}}}]}
    pedir = pedir_falso(llamadas, playlists=listas)
    r1 = A.leer(pedir=pedir, ahora=AHORA, **SESION)
    titulos = [f["titulo"] for f in r1["fichas"]]
    assert "Nuevo" in titulos and "Viejo" not in titulos
    r2 = A.leer(pedir=pedir, estado=r1["estado"], ahora=AHORA, **SESION)
    assert r2["fichas"] == []  # nada nuevo desde la pasada anterior

def test_sin_token_para_ninguna_cuenta_no_toca_la_red():
    r = A.leer(token_de=lambda alias: None)
    assert r["ok"] is False and "token" in r["motivo"]
    assert sorted(e.split(":")[0] for e in r["errores"]) == ["alex", "fundacion"]

def test_el_historial_de_videos_vistos_no_se_pide():
    llamadas = []
    A.leer(pedir=pedir_falso(llamadas), **SESION)
    assert not any("HL" in u or "watchHistory" in u for u in llamadas)

def test_con_token_para_una_sola_cuenta_las_fichas_llevan_su_correo():
    llamadas = []
    r = A.leer(pedir=pedir_falso(llamadas), token_de=lambda a: "tok" if a == "alex" else None,
               correo_de=lambda a: "alexbordongarrigos@gmail.com")
    assert all(f["cuenta"] == "alexbordongarrigos@gmail.com" and f["alias"] == "alex" for f in r["fichas"])
    assert any(e.startswith("fundacion") for e in r["errores"])

def test_guarda_fichas_y_estado_solo_en_el_nodo(tmp_path):
    llamadas = []
    r = A.leer(pedir=pedir_falso(llamadas), **SESION)
    g = A.guardar(r["estado"], r["fichas"], "2027-01-15", dir_actividad=str(tmp_path))
    assert os.path.exists(g["fichas"]) and os.path.exists(g["estado"])
    volcado = json.load(open(g["fichas"], encoding="utf-8"))
    assert volcado["privado"] is True and volcado["fecha"] == "2027-01-15" and volcado["fichas"]
    assert A.leer_estado(g["estado"]) == r["estado"]
