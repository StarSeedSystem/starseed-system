#!/usr/bin/env python3
"""Pruebas de actividad_instagram_web sin red (NAV1112H). Extractor puro con HTML inventado."""
import datetime, json, os, sys, tempfile
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import actividad_instagram_web as AI  # noqa: E402

AHORA = datetime.datetime(2026, 11, 12, 10, 0, tzinfo=datetime.timezone.utc)
GUARDADO = lambda e, a, c: f'<a href="{e}" class="x"><span>{a}</span><span class="coleccion">{c}</span></a>'
SEGUIDO = lambda e, n: f'<a href="{e}"><span>{n}</span></a>'
PROPIO = lambda e, f: f'<a href="{e}"><time datetime="{f}"></time></a>'

def _setup(tmp_path):
    AI.RUTA_FICHAS = str(tmp_path / "actividad" / "fichas")
    AI.RUTA_ESTADO = str(tmp_path / "navegador" / "estado.json")

def test_extraer_guardados_vacio():
    assert AI.extraer_guardados("<html><body><div>Sin guardados</div></body></html>") == []

def test_extraer_guardados_con_datos():
    html = f"<html><body>{GUARDADO('/p/abc123/', 'autor1', 'coleccion1')}{GUARDADO('/p/def456/', 'autor2', '')}</body></html>"
    r = AI.extraer_guardados(html)
    assert len(r) == 2 and r[0]["enlace"] == "https://www.instagram.com/p/abc123/" and r[0]["autor"] == "autor1" and r[0]["coleccion"] == "coleccion1" and r[1]["coleccion"] == "sin colección"

def test_extraer_guardados_limite_60():
    html = "".join(GUARDADO(f'/p/{i}/', f'a{i}', 'c') for i in range(70))
    r = AI.extraer_guardados(f"<html><body>{html}</body></html>")
    assert len(r) == AI.MAX_NUEVOS

def test_extraer_seguidos():
    html = f"<html><body>{SEGUIDO('/user1/', 'Usuario 1')}{SEGUIDO('/p/123/', 'No es usuario')}{SEGUIDO('/user2/', 'Usuario 2')}</body></html>"
    r = AI.extraer_seguidos(html)
    assert len(r) == 2 and r[0]["nombre"] == "Usuario 1" and r[0]["enlace"] == "https://www.instagram.com/user1/" and r[1]["enlace"] == "https://www.instagram.com/user2/"

def test_extraer_propio():
    html = f"<html><body>{PROPIO('/p/abc123/', '2026-11-12T10:00:00Z')}{PROPIO('/p/def456/', '2026-11-11T15:30:00Z')}</body></html>"
    r = AI.extraer_propio(html)
    assert len(r) == 2 and r[0]["enlace"] == "https://www.instagram.com/p/abc123/" and r[0]["fecha"] == "2026-11-12T10:00:00+00:00"

def test_guardar_fichas_incremental(tmp_path):
    _setup(tmp_path)
    items = [{"enlace": "https://www.instagram.com/p/1/", "autor": "a", "coleccion": "c"}]
    assert AI.guardar_fichas(items, "maggasukha", "guardados", AHORA) == 1
    assert AI.guardar_fichas(items, "maggasukha", "guardados", AHORA) == 0
    items2 = [{"enlace": "https://www.instagram.com/p/2/", "autor": "b", "coleccion": "c"}]
    assert AI.guardar_fichas(items2, "maggasukha", "guardados", AHORA) == 1
    f = list(Path(AI.RUTA_FICHAS).glob("*.json"))
    assert len(f) == 1 and len(json.loads(f[0].read_text())) == 2

def test_verificar_bloqueo_verificacion():
    assert AI._verificar_bloqueo('<html><body><div>Checkpoint required</div></body></html>') == "verificacion_o_cierre"

def test_verificar_bloqueo_actividad_inusual():
    assert AI._verificar_bloqueo('<html><body><div>Actividad inusual detectada</div></body></html>') == "verificacion_o_cierre"

def test_verificar_bloqueo_sesion_expirada():
    assert AI._verificar_bloqueo('<html><body><div>Session expired, please log in</div></body></html>') == "verificacion_o_cierre"

def test_verificar_bloqueo_nada():
    assert AI._verificar_bloqueo('<html><body><div>Normal page</div></body></html>') is None

def test_pagina_cambiada_esqueleto(tmp_path):
    _setup(tmp_path)
    AI._guardar_esqueleto("<html><body><div class='nuevo'>Contenido</div></body></html>", "maggasukha", AHORA, "guardados")
    sk = list(Path(os.path.expanduser("~/.starseed/navegador/reparar")).glob("*-insta-guardados-maggasukha.html"))
    assert len(sk) == 1 and "<div" in sk[0].read_text() and "Contenido" not in sk[0].read_text()

if __name__ == "__main__":
    import unittest; unittest.main()