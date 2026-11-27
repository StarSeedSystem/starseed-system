# -*- coding: utf-8 -*-
"""BAP1127Z · pruebas sin red del conductor: registro único, recoger por espejo, lanzar."""
from __future__ import annotations

import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import pruebas_malla as PM  # noqa: E402

HUELLA = "a" * 64


def _preparar(tmp_path, monkeypatch):
    pruebas = tmp_path / "pruebas"
    pruebas.mkdir()
    (pruebas / "bateria.json").write_text(
        json.dumps({"pruebas": [{"id": "B1-MT-A1", "titulo": "Uno"}, {"id": "B2-MT-A1", "titulo": "Dos"}]}),
        encoding="utf-8",
    )
    monkeypatch.setattr(PM, "BATERIA_JSON", pruebas / "bateria.json")
    monkeypatch.setattr(PM, "REGISTRO_JSONL", pruebas / "registro.jsonl")
    monkeypatch.setattr(PM, "EVIDENCIAS_DIR", pruebas / "evidencias")
    monkeypatch.setattr(PM, "DATOS_APP", tmp_path / "datos")
    monkeypatch.setattr(PM, "BANCO_DIR", tmp_path / "banco")
    monkeypatch.setattr(PM, "MAC_LOGS", tmp_path / "maclogs")
    (tmp_path / "datos").mkdir()
    return pruebas


def _manual(pruebas):
    linea = {"fecha": "2026-11-20T10:00:00Z", "version": "1", "ronda": 1, "prueba": "PIN-BLE-MAC", "resultado": "ok", "nota": "x"}
    (pruebas / "registro.jsonl").write_text(json.dumps(linea) + "\n", encoding="utf-8")


def test_informe_sin_publicar_ve_manuales_cerradas(tmp_path, monkeypatch, capsys):
    _manual(_preparar(tmp_path, monkeypatch))
    llamadas: list[str] = []
    monkeypatch.setattr(PM, "_publicar_chat_director", lambda *a, **k: llamadas.append("x"))
    assert PM.main(["informe", "--sin-publicar"]) == 0
    fila = next(f for f in capsys.readouterr().out.splitlines() if "B1-MT-A1" in f)
    assert "pendiente" not in fila and llamadas == []


def test_siguiente_salta_la_manual_cerrada(tmp_path, monkeypatch, capsys):
    _manual(_preparar(tmp_path, monkeypatch))
    assert PM.main(["siguiente"]) == 0
    assert capsys.readouterr().out.strip() == "B2-MT-A1"


def _recoger(tmp_path, monkeypatch, espejo: bool):
    pruebas = _preparar(tmp_path, monkeypatch)
    inicio = datetime.now(timezone.utc) - timedelta(minutes=5)
    (pruebas / "registro.jsonl").write_text(
        json.dumps({"tipo": "inicio", "id": "B1-MT-A1", "inicio": inicio.strftime("%Y-%m-%dT%H:%M:%SZ")}) + "\n", encoding="utf-8"
    )
    ahora = (datetime.now(timezone.utc) - timedelta(minutes=1)).strftime("%Y-%m-%dT%H:%M:%SZ")
    if espejo:
        (tmp_path / "datos" / "espejo-tableta.log").write_text(f"{ahora} web (tab) hola\n", encoding="utf-8")
    monkeypatch.setattr(PM, "_ejecutar_ssh", lambda c: ["SSH_TIMEOUT"])
    monkeypatch.setattr(PM, "_ejecutar_adb", lambda: [f"{ahora} adb linea"])
    assert PM.main(["recoger", "B1-MT-A1"]) == 0
    resumen = next((pruebas / "evidencias").glob("B1-MT-A1-*/resumen.json"))
    return json.loads(resumen.read_text(encoding="utf-8"))


def test_recoger_prefiere_espejo_a_adb(tmp_path, monkeypatch):
    r = _recoger(tmp_path, monkeypatch, espejo=True)
    assert r["aparatos"]["tableta"] == {"lineas": 1, "fuente": "espejo"}


def test_recoger_cae_a_adb_y_marca_sin_acceso(tmp_path, monkeypatch):
    r = _recoger(tmp_path, monkeypatch, espejo=False)
    assert r["id"] == "B1-MT-A1" and "inicio" in r["ventana"]
    assert r["aparatos"]["tableta"]["fuente"] == "adb"
    assert r["aparatos"]["maggabox"] == {"lineas": 0, "fuente": "sin-acceso"}


def test_lanzar_valida_y_no_escribe_si_es_invalido(tmp_path, monkeypatch):
    _preparar(tmp_path, monkeypatch)
    assert PM.main(["lanzar", "p1", "--origen", "neu", "--destino", "corto"]) == 1
    assert PM.main(["lanzar", "p1", "--origen", "neu", "--destino", HUELLA, "--duracion", "5"]) == 1
    assert not (tmp_path / "banco" / "orden.json").exists()


def test_lanzar_caduca_sin_respuesta(tmp_path, monkeypatch, capsys):
    _preparar(tmp_path, monkeypatch)
    monkeypatch.setattr(PM, "ESPERA_RESULTADO_S", 0.2)
    assert PM.main(["lanzar", "p1", "--origen", "neu", "--destino", HUELLA]) == 2
    assert "sin respuesta de la app de dirección" in capsys.readouterr().out
    orden = json.loads((tmp_path / "banco" / "orden.json").read_text(encoding="utf-8"))
    assert orden["tipo"] == "prueba-control" and orden["duracion_ms"] == 60_000


def test_lanzar_lee_el_resultado(tmp_path, monkeypatch, capsys):
    _preparar(tmp_path, monkeypatch)
    (tmp_path / "banco").mkdir()
    monkeypatch.setattr(PM.Path, "unlink", lambda self, missing_ok=False: None)
    (tmp_path / "banco" / "p1.resultado.json").write_text(json.dumps({"ok": True, "motivo": "hecho"}), encoding="utf-8")
    assert PM.main(["lanzar", "p1", "--origen", "neu", "--destino", HUELLA]) == 0
    assert "ok: hecho" in capsys.readouterr().out
