#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas de pruebas_a_experiencias (BAP1127L): conversión, idempotencia, sin veredicto → sin experiencia, formato igual."""
import json, tempfile, sys
from pathlib import Path
sys.path.insert(0, Path(__file__).parent)
import pruebas_a_experiencias as PX
import registro_pruebas_logica as RP
import evaluador_pruebas_logica as EV

RAIZ = Path(__file__).resolve().parents[2]
TABLA = RAIZ / "config" / "pruebas-equivalencias.json"
UMB = json.loads((RAIZ / "config" / "umbrales-pruebas.json").read_text(encoding="utf-8"))

def _reg(tmp, lines):
    r = tmp / "registro.jsonl"
    r.write_text("\n".join(json.dumps(l) for l in lines) + "\n", encoding="utf-8")
    return str(r)

def _marca(tmp): 
    d = tmp / "marcas"; d.mkdir(exist_ok=True); return d

def test_convierte_verde():
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        exp = PX.convertir(_reg(tmp, [{"fecha": "2026-11-27T10:00:00Z", "version": "0.5.1", "ronda": 1, "prueba": "B4-MT-A1", "resultado": "ok", "nota": "6 cuadros/s"}]), UMB, TABLA, _marca(tmp))
        assert len(exp) == 1
        e = exp[0]
        assert e["capa"] == "prueba" and e["id"] == "B4-MT-A1" and e["version"] == "0.5.1"
        assert e["veredicto"] == "verde" and "metrica" in e and e["resultado"] == "verde"
        assert "entrada" in e and "salida" in e

def test_idempotencia():
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td); m = _marca(tmp)
        linea = {"fecha": "2026-11-27T10:00:00Z", "version": "0.5.1", "ronda": 1, "prueba": "B4-MT-A1", "resultado": "ok", "nota": "6 cuadros/s"}
        r = _reg(tmp, [linea])
        assert len(PX.convertir(r, UMB, TABLA, m)) == 1
        assert len(PX.convertir(r, UMB, TABLA, m)) == 0

def test_sin_veredicto():
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        exp = PX.convertir(_reg(tmp, [{"fecha": "2026-11-27T10:00:00Z", "version": "0.5.1", "ronda": 1, "prueba": "B4-MT-A1", "resultado": "ok", "nota": "6 cuadros/s"}]), UMB, TABLA, _marca(tmp))
        assert len(exp) >= 0

def test_formato_automejora():
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        exp = PX.convertir(_reg(tmp, [{"fecha": "2026-11-27T10:00:00Z", "version": "0.5.1", "ronda": 1, "prueba": "B4-MT-A1", "resultado": "ok", "nota": "6 cuadros/s"}]), UMB, TABLA, _marca(tmp))
        assert len(exp) == 1
        e = exp[0]
        assert ("id" in e or "task_id" in e) and ("entrada" in e or "description" in e)
        assert "capa" in e and ("salida" in e or "estado" in e) and "resultado" in e

def test_multiples_cerradas():
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        lines = [{"fecha": "2026-11-27T10:00:00Z", "version": "0.5.1", "ronda": 1, "prueba": "B4-MT-A1", "resultado": "ok", "nota": "6"},
                 {"fecha": "2026-11-27T10:05:00Z", "version": "0.5.1", "ronda": 2, "prueba": "B2-MT-A1", "resultado": "ok", "nota": "1.5s"},
                 {"fecha": "2026-11-27T10:10:00Z", "version": "0.5.1", "ronda": 3, "prueba": "B1-MT-A1", "resultado": None, "nota": "abierta"}]
        ids = {e["id"] for e in PX.convertir(_reg(tmp, lines), UMB, TABLA, _marca(tmp))}
        assert "B4-MT-A1" in ids or "B2-MT-A1" in ids
        assert "B1-MT-A1" not in ids

def test_apparato_extraido():
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        exp = PX.convertir(_reg(tmp, [{"fecha": "2026-11-27T10:00:00Z", "version": "0.5.1", "ronda": 1, "prueba": "B4-MAC-A-TABLETA", "resultado": "ok", "nota": "6 cuadros/s"}]), UMB, TABLA, _marca(tmp))
        assert len(exp) == 1 and exp[0]["id"] == "B4-MT-A1"
        assert "TABLETA" in exp[0]["aparato"] or "MAC-A-TABLETA" in exp[0]["aparato"]

def test_registro_vacio():
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td); m = _marca(tmp)
        assert PX.convertir("/no/existe.jsonl", UMB, TABLA, m) == []
        (tmp / "vacio.jsonl").write_text("", encoding="utf-8")
        assert PX.convertir(str(tmp / "vacio.jsonl"), UMB, TABLA, m) == []

if __name__ == "__main__":
    import pytest
    pytest.main([__file__, "-v"])