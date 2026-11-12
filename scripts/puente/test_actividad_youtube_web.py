#!/usr/bin/env python3
"""Pruebas de actividad_youtube_web sin red: extractores puros (NAV1112F)."""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import actividad_youtube_web as A  # noqa: E402

R = """<html><body><ytd-rich-item-renderer><a id="video-title" href="/watch?v=abc123" title="V1">V1</a><ytd-channel-name><a href="/channel/UC111">C1</a></ytd-channel-name></ytd-rich-item-renderer><ytd-rich-item-renderer><a id="video-title" href="/watch?v=def456" title="V2">V2</a><ytd-channel-name><a href="/channel/UC222">C2</a></ytd-channel-name></ytd-rich-item-renderer></body></html>"""
H = """<html><body><ytd-video-renderer><a id="video-title" href="/watch?v=h1" title="H1">H1</a><ytd-channel-name><a href="/channel/UCH1">HC1</a></ytd-channel-name></ytd-video-renderer></body></html>"""
V = "<html><body><div>Nada</div></body></html>"

def test_rec_pura():
    it = A.extraer_recomendados(R)
    assert len(it)==2 and it[0]["titulo"]=="V1" and it[0]["canal"]=="C1" and it[0]["enlace"]=="https://www.youtube.com/watch?v=abc123"
    assert it[1]["enlace"]=="https://www.youtube.com/watch?v=def456"

def test_rec_sin_limite():
    html = "<html><body>" + "".join(f'<ytd-rich-item-renderer><a id="video-title" href="/watch?v=v{i}" title="V{i}">V{i}</a><ytd-channel-name><a href="/channel/UC{i}">C{i}</a></ytd-channel-name></ytd-rich-item-renderer>' for i in range(50)) + "</body></html>"
    assert len(A.extraer_recomendados(html)) == 50

def test_hist_pura():
    it = A.extraer_historial(H)
    assert len(it)==1 and it[0]["titulo"]=="H1" and it[0]["canal"]=="HC1" and it[0]["enlace"]=="https://www.youtube.com/watch?v=h1"

def test_pag_cambiada_rec(tmp_path):
    A.DIR_REPARAR = str(tmp_path/"r")
    assert A.extraer_recomendados(V) == []

def test_pag_cambiada_hist(tmp_path):
    A.DIR_REPARAR = str(tmp_path/"r")
    assert A.extraer_historial(V) == []

def test_ficha():
    f = A.ficha("T","C","https://www.youtube.com/watch?v=x","recomendado")
    assert f["fuente"]=="youtube_web" and f["cuenta"]=="google-alex" and f["privado"] and f["origen"]=="recomendado" and f["fecha"].endswith("Z")
    assert A.ficha("T","C","x","historial")["origen"]=="historial"

def test_escribir(tmp_path):
    A.DIR_FICHAS = str(tmp_path/"f")
    fs = [A.ficha("T1","C1","u1","recomendado"), A.ficha("T2","C2","u2","historial")]
    r = A._escribir_fichas(fs)
    assert r and os.path.exists(r) and oct(os.stat(r).st_mode&0o777)=="0o600"
    assert json.load(open(r))[1]["origen"]=="historial"
    assert A._escribir_fichas([]) is None

def _mock_leer(tmp_path):
    A.DIR_FICHAS = str(tmp_path/"f"); A.DIR_REPARAR = str(tmp_path/"r")
    return {"abrir":[], "cerrar":False}

def test_ok(tmp_path):
    st = _mock_leer(tmp_path); st["h"]=0
    def a(u): st["abrir"].append(u)
    def eh(): r = R if st["h"]==0 else H; st["h"]+=1; return r
    def es(s): pass
    def de(n): pass
    def ce(): st["cerrar"]=True
    r = A.leer_youtube_web(a,eh,es,de,ce)
    assert r["ok"] and r["fichas"]==3 and st["cerrar"] and st["abrir"]==["https://www.youtube.com","https://www.youtube.com/feed/history"]

def test_fail_rec(tmp_path):
    st = _mock_leer(tmp_path)
    def a(u): pass
    def eh(): return V
    def es(s): pass
    def de(n): pass
    def ce(): pass
    r = A.leer_youtube_web(a,eh,es,de,ce)
    assert not r["ok"] and r["motivo"]=="pagina cambiada" and r["origen"]=="recomendados"
    assert len(list((tmp_path/"r").glob("esqueleto-recomendados-*.html")))==1

def test_fail_hist(tmp_path):
    st = _mock_leer(tmp_path)
    def a(u): pass
    hs = [R,V]
    def eh(): return hs.pop(0)
    def es(s): pass
    def de(n): pass
    def ce(): pass
    r = A.leer_youtube_web(a,eh,es,de,ce)
    assert not r["ok"] and r["motivo"]=="pagina cambiada" and r["origen"]=="historial"
    assert len(list((tmp_path/"r").glob("esqueleto-historial-*.html")))==1

def test_exc_cierra(tmp_path):
    st = _mock_leer(tmp_path); cs=[]
    def a(u): raise RuntimeError("x")
    def eh(): return R
    def es(s): pass
    def de(n): pass
    def ce(): cs.append(True)
    r = A.leer_youtube_web(a,eh,es,de,ce)
    assert not r["ok"] and "error" in r["motivo"] and cs==[True]