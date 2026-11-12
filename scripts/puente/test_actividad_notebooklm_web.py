#!/usr/bin/env python3
"""Pruebas de actividad_notebooklm_web sin navegador: cliente y HTML inyectados (NAV1112G)."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import actividad_notebooklm_web as A  # noqa: E402


def cliente_falso(llamadas):
    """Cliente que responde con datos predefinidos."""
    def abrir(url): llamadas.append(("abrir", url))
    def esperar(seg=1.0): llamadas.append(("esperar", seg))
    def extraer(selector, campos):
        llamadas.append(("extraer", selector, campos))
        if "notebook-card" in selector:
            return [{"text": "Cuaderno Alfa", "data-id": "nb1"}, {"text": "Cuaderno Beta", "data-id": "nb2"}]
        if "notebook-modified" in selector:
            return [{"text": "2026-11-10T14:30:00Z"}, {"text": "2026-11-09T08:15:00Z"}]
        if "source-title" in selector:
            return [{"text": "Fuente Uno"}, {"text": "Fuente Dos"}]
        if "note-title" in selector:
            return [{"text": "Nota Primera"}, {"text": "Nota Segunda"}]
        return []
    def esqueleto(): llamadas.append(("esqueleto",)); return "<html><body></body></html>"
    def cerrar(): llamadas.append(("cerrar",))
    return {"abrir": abrir, "esperar": esperar, "extraer": extraer, "esqueleto": esqueleto, "cerrar": cerrar}


def test_sin_sesion_viva_no_intenta_leer():
    resultado = A.leer(cliente=lambda _: (_ for _ in ()).throw(RuntimeError("No hay sesión activa")))
    assert resultado["ok"] is False and "sesión" in resultado["motivo"].lower()


def test_lista_cuadernos_con_titulo_y_fecha():
    llamadas, cliente = [], cliente_falso([])
    resultado = A.leer(cliente=lambda _: cliente)
    assert resultado["ok"] and len(resultado["cuadernos"]) == 4
    t = [c["titulo"] for c in resultado["cuadernos"]]
    assert t.count("Cuaderno Alfa") == 2 and t.count("Cuaderno Beta") == 2


def test_solo_cuadernos_modificados_desde_ultima_pasada():
    llamadas, cliente = [], cliente_falso([])
    estado = {"ultima_pasada": "2026-11-09T12:00:00Z"}
    r = A.leer(cliente=lambda _: cliente, estado=estado)
    assert len(r["fichas"]) == 8 and {f["tipo"] for f in r["fichas"]} == {"fuente", "nota"}
    assert {f["cuaderno"] for f in r["fichas"]} == {"Cuaderno Alfa"}


def test_fichas_son_privadas_y_tienen_campos_requeridos():
    cliente = cliente_falso([])
    r = A.leer(cliente=lambda _: cliente)
    assert all(f["privado"] for f in r["fichas"])
    for f in r["fichas"]:
        assert f["fuente"] == "notebooklm" and all(k in f for k in ("cuenta", "tipo", "titulo", "fecha", "cuaderno"))


def test_no_crea_edita_ni_borra_nada():
    llamadas, cliente = [], cliente_falso([])
    A.leer(cliente=lambda _: cliente)
    assert all(n in ("abrir", "esperar", "extraer", "esqueleto", "cerrar") for n, *_ in llamadas)


def test_estado_se_actualiza_con_ultima_pasada():
    cliente = cliente_falso([])
    assert "ultima_pasada" in A.leer(cliente=lambda _: cliente)["estado"]


def test_sesiones_google_alex_y_fundacion():
    assert "google-alex" in A.SESIONES and "google-fundacion" in A.SESIONES