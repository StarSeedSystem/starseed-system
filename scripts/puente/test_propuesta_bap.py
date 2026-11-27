# -*- coding: utf-8 -*-
import json
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import propuesta_bap as pb  # noqa: E402

AHORA = datetime(2026, 11, 27, 10, 0)


def prop(i="P1", archivos=None, ev="log: fallo X", conf=0.8):
    return {"id": i, "titulo": f"arreglo {i}", "evidencia": ev, "confianza": conf,
            "archivos_sospechosos": archivos if archivos is not None else ["src/lib/a.ts"]}


def test_tope_de_tres(tmp_path):
    out = pb.encolar([prop(f"P{i}") for i in range(6)], AHORA, tmp_path, tmp_path / "r.jsonl")
    assert len(out) == 3


def test_protegidos_rechazados():
    malos = ["scripts/puente/puerta_arreglos.py", "config/umbrales-pruebas.json",
             "scripts/puente/generar_bateria_1118.py", "scripts/puente/lanzador-tcc.py",
             "scripts/puente/produccion_puertas.py"]
    assert pb.filtrar([prop(archivos=[m]) for m in malos]) == []
    assert pb.filtrar([prop(archivos=["src/a.ts", malos[0]])]) == []


def test_sin_evidencia_rechazada():
    assert pb.filtrar([prop(ev=""), prop(ev=[]), prop(ev="  ")]) == []


def test_confianza_baja_rechazada():
    assert pb.filtrar([prop(conf=0.59)]) == []
    assert len(pb.filtrar([prop(conf=0.6)])) == 1


def test_formato_de_tarea():
    t = pb.a_tarea(prop(archivos=list("abcde")), "20261127", 2)
    assert t["id"] == "BAPP202611272" and t["ola"] == "bap-propuestas"
    assert len(t["archivos"]) == 3 and t["depende"] == []
    assert 70 <= t["prioridad"] <= 80
    assert "fallo X" in t["prompt"] and "prueba de aceptación" in t["prompt"]


def test_prioridad_segun_confianza():
    assert pb.a_tarea(prop(conf=0.6))["prioridad"] == 70
    assert pb.a_tarea(prop(conf=1.0))["prioridad"] == 80


def test_idempotencia_por_id(tmp_path):
    reg = tmp_path / "r.jsonl"
    pb.encolar([prop("P1")], AHORA, tmp_path, reg)
    assert pb.encolar([prop("P1")], AHORA, tmp_path, reg) == []
    cola = json.loads((tmp_path / "cola-bap-propuestas-20261127.json").read_text())
    assert len(cola["tareas"]) == 1


def test_segunda_iteracion_añade_con_ids_nuevos(tmp_path):
    reg = tmp_path / "r.jsonl"
    pb.encolar([prop("P1")], AHORA, tmp_path, reg)
    out = pb.encolar([prop("P2")], AHORA, tmp_path, reg)
    assert out[0]["id"] == "BAPP202611272"
    assert len(reg.read_text().splitlines()) == 2


def test_nada_que_encolar_no_crea_archivo(tmp_path):
    assert pb.encolar([prop(ev="")], AHORA, tmp_path, tmp_path / "r.jsonl") == []
    assert list(tmp_path.glob("cola-*")) == []
