#!/usr/bin/env python3
"""Pruebas de youtube_candidatos sin red: YouTube API, Takeout, Laya y LEANN inyectados (SDP1111S)."""
import json
import os
import sys
from datetime import datetime, timezone, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import youtube_candidatos as Y  # noqa: E402

HOY = datetime(2026, 11, 11, tzinfo=timezone.utc)
AYER = HOY - timedelta(days=1)
ANTIER = HOY - timedelta(days=2)
VIEJO = HOY - timedelta(days=10)

CANAL_A = {"id": "UC1", "snippet": {"title": "Canal A", "publishedAt": "2020-01-01T00:00:00Z"}}
CANAL_B = {"id": "UC2", "snippet": {"title": "Canal B", "publishedAt": "2021-01-01T00:00:00Z"}}
CANAL_C = {"id": "UC3", "snippet": {"title": "Canal Resonancia", "publishedAt": "2019-01-01T00:00:00Z"}}

SUBSCRIPCIONES_ALEX = {
    "items": [
        {"snippet": {"resourceId": {"channelId": "UC1"}, "title": "Canal A", "publishedAt": AYER.isoformat()}},
        {"snippet": {"resourceId": {"channelId": "UC2"}, "title": "Canal B", "publishedAt": VIEJO.isoformat()}},
    ]
}
SUBSCRIPCIONES_FUNDACION = {
    "items": [
        {"snippet": {"resourceId": {"channelId": "UC3"}, "title": "Canal Resonancia", "publishedAt": AYER.isoformat()}},
    ]
}

UPLOADS_UC1 = {"items": [{"snippet": {"publishedAt": AYER.isoformat(), "title": "Video nuevo A1",
        "resourceId": {"videoId": "vA1"}, "channelTitle": "Canal A", "videoOwnerChannelTitle": "Canal A"}}]}
UPLOADS_UC2 = {"items": [{"snippet": {"publishedAt": VIEJO.isoformat(), "title": "Video viejo B1",
        "resourceId": {"videoId": "vB1"}, "channelTitle": "Canal B", "videoOwnerChannelTitle": "Canal B"}}]}
UPLOADS_UC3 = {"items": [{"snippet": {"publishedAt": AYER.isoformat(), "title": "Video resonancia R1",
        "resourceId": {"videoId": "vR1"}, "channelTitle": "Canal Resonancia", "videoOwnerChannelTitle": "Canal Resonancia"}}]}

ME_GUSTA_ALEX = {"items": [{"snippet": {"publishedAt": AYER.isoformat(), "title": "Like A1",
        "resourceId": {"videoId": "vLike1"}, "channelTitle": "Canal X", "videoOwnerChannelTitle": "Canal X"}}]}
LISTAS_ALEX = {"items": [{"id": "PL1", "snippet": {"title": "Mi lista"}}, {"id": "PL2"}]}
VIDEOS_LISTA_PL1 = {"items": [{"snippet": {"publishedAt": AYER.isoformat(), "title": "Video lista L1",
        "resourceId": {"videoId": "vL1"}, "channelTitle": "Canal Y", "videoOwnerChannelTitle": "Canal Y"}}]}
SUBIDAS_ALEX = {"items": [{"snippet": {"publishedAt": AYER.isoformat(), "title": "Mi subida",
        "resourceId": {"videoId": "vSub1"}, "channelTitle": "Alex", "videoOwnerChannelTitle": "Alex"}}]}

ME_GUSTA_FUNDACION = {"items": []}
LISTAS_FUNDACION = {"items": []}
SUBIDAS_FUNDACION = {"items": []}

TAKEOUT_HISTORIAL = [
    {"Visto el": AYER.isoformat(), "Título": "Video visto T1", "URL del título": "https://www.youtube.com/watch?v=vT1"},
    {"Visto el": VIEJO.isoformat(), "Título": "Video visto viejo", "URL del título": "https://www.youtube.com/watch?v=vTold"},
]

BUSQUEDA_TEMA1 = {"items": [{"id": {"videoId": "vSearch1"}, "snippet": {"publishedAt": AYER.isoformat(),
        "title": "Resultado búsqueda 1", "channelTitle": "Canal Search", "channelId": "UCSearch"}}]}
BUSQUEDA_TEMA2 = {"items": [{"id": {"videoId": "vSearch2"}, "snippet": {"publishedAt": AYER.isoformat(),
        "title": "Resultado búsqueda 2", "channelTitle": "Canal Search2", "channelId": "UCSearch2"}}]}

RESONANCIA_CANALES = ["UC1", "UC3"]
ACTIVISTAS_CANALES = ["UC2"]


def api_falsa_actividad(alias, llamadas):
    def pedir(url, params):
        llamadas.append((alias, url.rsplit("/", 1)[-1], dict(params)))
        ep = url.rsplit("/", 1)[-1]
        if ep == "channels":
            if params.get("mine") == "true":
                uploads_id = "UU1" if alias == "alex" else "UU3"
                return {"items": [{"contentDetails": {"relatedPlaylists": {"uploads": uploads_id}}}]}
            for ch_id in params.get("id", "").split(","):
                if ch_id == "UC1": return {"items": [CANAL_A]}
                if ch_id == "UC2": return {"items": [CANAL_B]}
                if ch_id == "UC3": return {"items": [CANAL_C]}
        if ep == "subscriptions" and params.get("mine") == "true":
            return SUBSCRIPCIONES_ALEX if alias == "alex" else SUBSCRIPCIONES_FUNDACION
        if ep == "playlistItems":
            pid = params.get("playlistId")
            if pid == "LL": return ME_GUSTA_ALEX if alias == "alex" else ME_GUSTA_FUNDACION
            if pid == "UU1": return UPLOADS_UC1
            if pid == "UU3": return UPLOADS_UC3
            if pid == "PL1": return VIDEOS_LISTA_PL1
            return {"items": []}
        if ep == "playlists" and params.get("mine") == "true":
            return LISTAS_ALEX if alias == "alex" else LISTAS_FUNDACION
        if ep == "search":
            return BUSQUEDA_TEMA1 if params.get("q") == "tema1" else BUSQUEDA_TEMA2
        return {"items": []}
    return pedir


def test_suscripciones_nuevos_videos_48h(tmp_path):
    """(a) Suscripciones → videos de 48h por playlistItems de uploads."""
    llamadas = []
    res = Y.candidatos_dia(
        cuentas=("alex", "fundacion"),
        pedir_actividad=lambda a, u, p: api_falsa_actividad(a, llamadas)(u, p),
        pedir_takeout=lambda a: TAKEOUT_HISTORIAL if a == "alex" else [],
        temas_dia=["tema1"],
        resonancia_canales=RESONANCIA_CANALES,
        activistas_canales=ACTIVISTAS_CANALES,
        laya=lambda f: {"relevante": True, "tema": "diseño"},
        leann=lambda v: False,
        ahora=HOY,
        dir_salida=str(tmp_path),
    )
    videos = [c for c in res["candidatos"] if c["origen"]["motivo"] == "suscripcion_nueva"]
    assert len(videos) >= 1
    assert videos[0]["id"] in ("vA1", "vR1")
    assert all(c["privado"] for c in videos)


def test_me_gusta_listas_subidas_propias(tmp_path):
    """(b) Me gusta, listas propias y subidas propias recientes."""
    llamadas = []
    res = Y.candidatos_dia(
        cuentas=("alex",),
        pedir_actividad=lambda a, u, p: api_falsa_actividad(a, llamadas)(u, p),
        pedir_takeout=lambda a: [],
        temas_dia=[],
        resonancia_canales=[],
        activistas_canales=[],
        laya=lambda f: {"relevante": True, "tema": "noticia"},
        leann=lambda v: False,
        ahora=HOY,
        dir_salida=str(tmp_path),
    )
    motivos = {c["origen"]["motivo"] for c in res["candidatos"]}
    assert "me_gusta" in motivos
    assert "lista_propia" in motivos
    assert "subida_propia" in motivos


def test_historial_takeout_filtrado_vistos(tmp_path):
    """(c) Historial de Takeout y filtrado con LEANN (ya vistos)."""
    llamadas = []
    vistos = {"vA1", "vR1"}
    res = Y.candidatos_dia(
        cuentas=("alex",),
        pedir_actividad=lambda a, u, p: api_falsa_actividad(a, llamadas)(u, p),
        pedir_takeout=lambda a: TAKEOUT_HISTORIAL,
        temas_dia=[],
        resonancia_canales=[],
        activistas_canales=[],
        laya=lambda f: {"relevante": True, "tema": "tema"},
        leann=lambda v: v in vistos,
        ahora=HOY,
        dir_salida=str(tmp_path),
    )
    ids = {c["id"] for c in res["candidatos"]}
    assert "vT1" not in ids  # filtrado por LEANN (ya visto en takeout)
    assert "vA1" not in ids  # filtrado por LEANN (ya visto en suscripciones)


def test_busquedas_temas_dia_max_5(tmp_path):
    """(d) Recomendados aproximados con search.list: máx 5 búsquedas/día."""
    llamadas = []
    res = Y.candidatos_dia(
        cuentas=("alex",),
        pedir_actividad=lambda a, u, p: api_falsa_actividad(a, llamadas)(u, p),
        pedir_takeout=lambda a: [],
        temas_dia=["tema1", "tema2", "tema3", "tema4", "tema5", "tema6"],
        resonancia_canales=[],
        activistas_canales=[],
        laya=lambda f: {"relevante": True, "tema": "diseño"},
        leann=lambda v: False,
        ahora=HOY,
        dir_salida=str(tmp_path),
    )
    busquedas = [l for l in llamadas if l[1] == "search"]
    assert len(busquedas) <= 5


def test_canales_resonancia_activistas(tmp_path):
    """(e) Canales de resonancia y activistas de síntesis previas."""
    llamadas = []
    res = Y.candidatos_dia(
        cuentas=("alex",),
        pedir_actividad=lambda a, u, p: api_falsa_actividad(a, llamadas)(u, p),
        pedir_takeout=lambda a: [],
        temas_dia=[],
        resonancia_canales=RESONANCIA_CANALES,
        activistas_canales=ACTIVISTAS_CANALES,
        laya=lambda f: {"relevante": True, "tema": "activista"},
        leann=lambda v: False,
        ahora=HOY,
        dir_salida=str(tmp_path),
    )
    motivos = {c["origen"]["motivo"] for c in res["candidatos"]}
    assert "resonancia" in motivos or "activista" in motivos


def test_puntaje_laya_y_orden(tmp_path):
    """Puntaje con Laya: solo relevantes, ordenados por tema (diseño < guion < noticia)."""
    def laya_selectiva(f):
        t = (f.get("titulo") or "").lower()
        if "diseño" in t:
            return {"relevante": True, "tema": "diseño"}
        if "guion" in t:
            return {"relevante": True, "tema": "guion"}
        if "noticia" in t:
            return {"relevante": True, "tema": "noticia"}
        return {"relevante": False, "tema": None}

    def pedir(alias, url, params):
        if url.rsplit("/", 1)[-1] == "playlistItems" and params.get("playlistId") == "LL":
            base = AYER.isoformat()
            return {"items": [
                {"snippet": {"publishedAt": base, "title": "Diseño del cosmos",
                             "resourceId": {"videoId": "vDis"}, "channelTitle": "Canal D",
                             "videoOwnerChannelTitle": "Canal D"}},
                {"snippet": {"publishedAt": base, "title": "Guion épico",
                             "resourceId": {"videoId": "vGuion"}, "channelTitle": "Canal G",
                             "videoOwnerChannelTitle": "Canal G"}},
                {"snippet": {"publishedAt": base, "title": "Noticia de la galaxia",
                             "resourceId": {"videoId": "vNot"}, "channelTitle": "Canal N",
                             "videoOwnerChannelTitle": "Canal N"}},
                {"snippet": {"publishedAt": base, "title": "Video sin interés",
                             "resourceId": {"videoId": "vNo"}, "channelTitle": "Canal X",
                             "videoOwnerChannelTitle": "Canal X"}},
            ]}
        return {"items": []}

    res = Y.candidatos_dia(
        cuentas=("alex",),
        pedir_actividad=pedir,
        pedir_takeout=lambda a: [],
        temas_dia=[],
        resonancia_canales=[],
        activistas_canales=[],
        laya=laya_selectiva,
        leann=lambda v: False,
        ahora=HOY,
        dir_salida=str(tmp_path),
    )
    candidatos = res["candidatos"]
    assert [c["id"] for c in candidatos] == ["vDis", "vGuion", "vNot"]
    assert candidatos[0]["laya"]["tema"] == "diseño"
    assert candidatos[1]["laya"]["tema"] == "guion"
    assert candidatos[2]["laya"]["tema"] == "noticia"
    assert "vNo" not in {c["id"] for c in candidatos}
    assert all(c.get("laya", {}).get("relevante") for c in candidatos)
    assert len(candidatos) <= 40


def test_guarda_json_y_cuota(tmp_path):
    """Guarda en ~/.starseed/actividad/youtube/candidatos-AAAA-MM-DD.json con cuota."""
    llamadas = []
    res = Y.candidatos_dia(
        cuentas=("alex", "fundacion"),
        pedir_actividad=lambda a, u, p: api_falsa_actividad(a, llamadas)(u, p),
        pedir_takeout=lambda a: [],
        temas_dia=["tema1"],
        resonancia_canales=[],
        activistas_canales=[],
        laya=lambda f: {"relevante": True, "tema": "tema"},
        leann=lambda v: False,
        ahora=HOY,
        dir_salida=str(tmp_path),
    )
    ruta = res["archivo"]
    assert ruta.endswith("candidatos-2026-11-11.json")
    assert os.path.exists(ruta)
    datos = json.load(open(ruta, encoding="utf-8"))
    assert datos["fecha"] == "2026-11-11"
    assert "cuota" in datos
    assert datos["cuota"]["unidades"] > 0
    assert datos["cuenta_origen"] in ("alex", "fundacion", "ambas")


def test_sin_red_solo_puro():
    """La función pura no toca la red: todo inyectado."""
    llamadas = []
    def pedir(a, u, p):
        llamadas.append((a, u, p))
        return {"items": []}
    res = Y.candidatos_dia(
        cuentas=("alex",),
        pedir_actividad=pedir,
        pedir_takeout=lambda a: [],
        temas_dia=[],
        resonancia_canales=[],
        activistas_canales=[],
        laya=lambda f: {"relevante": False, "tema": None},
        leann=lambda v: False,
        ahora=HOY,
        dir_salida=None,
    )
    assert res["ok"] is True
    assert res["candidatos"] == []


if __name__ == "__main__":
    import pytest
    pytest.main([__file__, "-v"])