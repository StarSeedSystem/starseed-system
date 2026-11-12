#!/usr/bin/env python3
"""Pruebas de actividad_miactividad sin red (NAV1112E). Extractor puro con HTML inventado."""
import datetime, json, os, sys, tempfile
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import actividad_miactividad as AM  # noqa: E402

AHORA = datetime.datetime(2026, 11, 12, 10, 0, tzinfo=datetime.timezone.utc)
ITEM = lambda t, h, u, ti: f'<div class="activity-item" data-type="{t}"><a href="{u}" class="content-link">{h}</a><span class="timestamp">{ti}</span></div>'

def test_extraer_lista_vacia():
    assert AM.extraer_entradas("<html><body><div>Sin actividad</div></body></html>") == []

def test_extraer_youtube_visto():
    r = AM.extraer_entradas(f"<html><body>{ITEM('youtube', 'Vídeo', 'https://y.com/1', '12 nov 2026, 10:30')}</body></html>")
    assert len(r) == 1 and r[0]["fuente"] == "youtube" and r[0]["titulo"] == "Vídeo"

def test_extraer_busqueda():
    r = AM.extraer_entradas(f"<html><body>{ITEM('search', 'búsqueda', 'https://g.com/q', '12 nov 2026, 09:15')}</body></html>")
    assert len(r) == 1 and r[0]["fuente"] == "busqueda"

def test_extraer_gemini():
    r = AM.extraer_entradas(f"<html><body>{ITEM('gemini', 'Chat G', 'https://gemini.google.com/c', '11 nov 2026, 18:45')}</body></html>")
    assert len(r) == 1 and r[0]["fuente"] == "gemini" and r[0]["enlace"] == "https://gemini.google.com/c"

def test_extraer_multiples():
    html = "".join([ITEM('youtube', 'V1', 'u1', '12 nov 2026, 10:00'), ITEM('search', 'B2', 'u2', '12 nov 2026, 09:00'), ITEM('gemini', 'C3', 'u3', '11 nov 2026, 20:00')])
    r = AM.extraer_entradas(f"<html><body>{html}</body></html>")
    assert len(r) == 3 and {e["fuente"] for e in r} == {"youtube", "busqueda", "gemini"}

def test_extraer_pagina_cambiada():
    assert AM.extraer_entradas("<html><body><div class='x'>Contenido</div></body></html>") == []

def test_filtrar_36h():
    base, ant = AHORA - datetime.timedelta(hours=20), AHORA - datetime.timedelta(hours=40)
    r = AM.filtrar_por_ventana([{"fuente": "y", "fecha": base.isoformat(), "titulo": "R"}, {"fuente": "b", "fecha": ant.isoformat(), "titulo": "A"}], AHORA, 36)
    assert len(r) == 1 and r[0]["titulo"] == "R"

def _setup(tmp_path):
    AM.RUTA_FICHAS = str(tmp_path / "actividad" / "fichas")
    AM.RUTA_REPARAR = str(tmp_path / "navegador" / "reparar")

def test_guardar_incremental(tmp_path):
    _setup(tmp_path)
    e = [{"fuente": "y", "cuenta": "a", "fecha": "2026-11-12T10:00:00+00:00", "titulo": "V1", "enlace": "u1", "privado": True},
         {"fuente": "b", "cuenta": "a", "fecha": "2026-11-12T09:00:00+00:00", "titulo": "B1", "enlace": "u2", "privado": True}]
    AM.guardar_fichas(e, "a", AHORA)
    f = list(Path(AM.RUTA_FICHAS).glob("*.json"))
    assert len(f) == 1 and "2026-11-12-miactividad-a.json" in f[0].name
    assert len(json.loads(f[0].read_text())) == 2

def test_guardar_no_duplica(tmp_path):
    _setup(tmp_path)
    e = [{"fuente": "y", "cuenta": "a", "fecha": "2026-11-12T10:00:00+00:00", "titulo": "V1", "enlace": "u1", "privado": True}]
    AM.guardar_fichas(e, "a", AHORA); AM.guardar_fichas(e, "a", AHORA)
    assert len(json.loads(Path(AM.RUTA_FICHAS).glob("*.json").__next__().read_text())) == 1

def test_pagina_cambiada_esqueleto(tmp_path):
    _setup(tmp_path)
    r = AM.procesar_pagina("<html><body><div class='n'>Contenido</div></body></html>", "a", AHORA)
    assert r == {"ok": False, "motivo": "pagina cambiada"}
    sk = list(Path(AM.RUTA_REPARAR).glob("*.html"))
    assert len(sk) == 1 and "<div" in sk[0].read_text() and "Contenido" not in sk[0].read_text()

if __name__ == "__main__":
    import unittest; unittest.main()