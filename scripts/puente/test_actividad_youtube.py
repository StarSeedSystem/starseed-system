#!/usr/bin/env python3
"""Pruebas de actividad_youtube sin red: la Data API va inyectada (SDP1111)."""
import json, os, sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import actividad_youtube as A  # noqa: E402

RECENTE, VIEJO = "2026-11-10T12:00:00Z", "2026-10-01T00:00:00Z"
HOY = datetime(2026, 11, 11, tzinfo=timezone.utc)
CANALES = {"items": [{"contentDetails": {"relatedPlaylists": {"uploads": "UU1"}}}]}
LISTAS = {"items": [{"id": "PL1", "snippet": {"title": "Lista A"}}, {"id": "PL2"}]}
SUSCRIPCIONES = {"items": [{"snippet": {"publishedAt": RECENTE, "title": "Canal B",
                                        "resourceId": {"channelId": "CB"}}}]}


def item(video, titulo, canal, fecha):
    return {"snippet": {"publishedAt": fecha, "title": titulo, "channelTitle": canal,
                        "resourceId": {"videoId": video}}}


ME_GUSTA = {"items": [item("v1", "Vídeo uno", "Canal A", RECENTE), item("v0", "Viejo", "Canal A", VIEJO)]}
SUBIDAS = {"items": [item("v2", "Mi subida", "Yo", RECENTE)]}


def api_falsa(llamadas):
    def pedir(url, params):
        llamadas.append((url.rsplit("/", 1)[-1], dict(params)))
        if url.endswith("/channels"):
            return CANALES
        if url.endswith("/subscriptions"):
            return SUSCRIPCIONES
        if url.endswith("/playlists"):
            return LISTAS
        pid = params.get("playlistId")
        return {"items": []} if pid not in ("LL", "UU1", "PL1") else (ME_GUSTA if pid == "LL" else SUBIDAS)
    return pedir


def leer_sin_red(llamadas, tmp_path):
    return A.leer("alex", api_falsa(llamadas), hoy=HOY, dir_fichas=str(tmp_path / "fichas"))


def test_pocas_llamadas_y_paginas_cortas(tmp_path):
    llamadas = []
    leer_sin_red(llamadas, tmp_path)
    nombres = [n for n, _ in llamadas]
    assert nombres.count("playlistItems") <= 4  # me gusta, subidas y como mucho dos listas
    assert all(p["maxResults"] <= 10 for _, p in llamadas)
    assert nombres.count("channels") == 1 and nombres.count("subscriptions") == 1
    assert nombres.count("playlists") == 1


def test_las_fichas_son_privadas_y_completas(tmp_path):
    llamadas = []
    fichas = leer_sin_red(llamadas, tmp_path)["fichas"]
    assert all(f["privado"] is True and f["fuente"] == "youtube" and f["cuenta"] == "alex" for f in fichas)
    assert sorted({f["tipo"] for f in fichas}) == ["lista", "me_gusta", "subida", "suscripcion"]
    uno = [f for f in fichas if f["titulo"] == "Vídeo uno"][0]
    assert uno["canal"] == "Canal A" and uno["enlace"] == "https://www.youtube.com/watch?v=v1" and uno["fecha"] == RECENTE
    sub = [f for f in fichas if f["tipo"] == "suscripcion"][0]
    assert sub["enlace"] == "https://www.youtube.com/channel/CB" and sub["canal"] == "Canal B"


def test_solo_lo_reciente_y_ordenado(tmp_path):
    llamadas = []
    fichas = leer_sin_red(llamadas, tmp_path)["fichas"]
    fechas = [f["fecha"] for f in fichas]
    assert fechas == sorted(fechas, reverse=True) and VIEJO not in fechas


def test_guarda_el_json_privado_con_0600(tmp_path):
    llamadas = []
    resultado = leer_sin_red(llamadas, tmp_path)
    ruta = resultado["destino"]
    assert ruta.endswith("2026-11-11-youtube-alex.json") and os.path.exists(ruta)
    assert oct(os.stat(ruta).st_mode & 0o777) == "0o600"
    assert json.load(open(ruta, encoding="utf-8")) == resultado["fichas"]


def test_el_historial_no_se_pide(tmp_path):
    llamadas = []
    leer_sin_red(llamadas, tmp_path)
    texto = json.dumps(llamadas).lower()
    assert "history" not in texto and "watch" not in texto


def test_sin_canal_ni_listas_no_falla(tmp_path):
    def pedir(url, params):
        return {"items": []}
    resultado = A.leer("fundacion", pedir, hoy=HOY, dir_fichas=str(tmp_path / "f"))
    assert resultado["ok"] is True and resultado["fichas"] == []
