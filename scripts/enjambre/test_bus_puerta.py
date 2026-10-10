# -*- coding: utf-8 -*-
"""PDA1011: el bus del enjambre por la puerta de datos del A1, con Supabase de respaldo."""
import importlib.util
import os
import sys

RUTA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "starseed-enjambre.py")
ESPEC = importlib.util.spec_from_file_location("enjambre_bus_puerta", RUTA)
enjambre = importlib.util.module_from_spec(ESPEC)
sys.modules["enjambre_bus_puerta"] = enjambre
ESPEC.loader.exec_module(enjambre)


class PuertaFalsa:
    def __init__(self, sana=True):
        self.sana = sana
        self.eventos = []

    def publicar_evento(self, quien, tipo, texto="", tarea=None, datos=None, respaldo=None):
        if self.sana:
            self.eventos.append((quien, tipo, tarea))
            return {"id": len(self.eventos), "via": "puerta"}
        respaldo({"quien": quien, "tipo": tipo})
        return {"via": "supabase", "resultado": True}


def _supabase(monkeypatch):
    llamadas = []
    monkeypatch.setattr(enjambre, "_publicar_supabase", lambda cuerpo: llamadas.append(cuerpo["tipo"]) or True)
    return llamadas


def test_lo_importante_va_por_la_puerta_y_no_toca_supabase(monkeypatch):
    p = PuertaFalsa()
    monkeypatch.setattr(enjambre, "_PUERTA_BUS", [p])
    sb = _supabase(monkeypatch)
    assert enjambre.publicar_en_bus({"quien": "enjambre", "tipo": "commit", "tarea": "T1", "texto": "x"}) == "puerta"
    assert p.eventos == [("enjambre", "commit", "T1")] and sb == []


def test_el_latido_sigue_directo_a_supabase(monkeypatch):
    p = PuertaFalsa()
    monkeypatch.setattr(enjambre, "_PUERTA_BUS", [p])
    sb = _supabase(monkeypatch)
    assert enjambre.publicar_en_bus({"quien": "enjambre", "tipo": "latido", "texto": "vivo"}) == "supabase"
    assert p.eventos == [] and sb == ["latido"]


def test_puerta_caida_respaldo_en_supabase(monkeypatch):
    monkeypatch.setattr(enjambre, "_PUERTA_BUS", [PuertaFalsa(sana=False)])
    sb = _supabase(monkeypatch)
    assert enjambre.publicar_en_bus({"quien": "enjambre", "tipo": "fallo", "texto": "x"}) == "supabase"
    assert sb == ["fallo"]


def test_sin_puerta_como_siempre(monkeypatch):
    monkeypatch.setattr(enjambre, "_PUERTA_BUS", [None])
    sb = _supabase(monkeypatch)
    assert enjambre.publicar_en_bus({"quien": "enjambre", "tipo": "inicio", "texto": "x"}) == "supabase"
    assert sb == ["inicio"]


def test_interruptor_apagada(monkeypatch):
    monkeypatch.setenv("STARSEED_BUS_PUERTA", "apagada")
    monkeypatch.setattr(enjambre, "_PUERTA_BUS", [PuertaFalsa()])
    assert enjambre._puerta_bus() is None
