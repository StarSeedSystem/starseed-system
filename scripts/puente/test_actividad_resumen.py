#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas de actividad_resumen sin red: clasificador y recuerdo van inyectados (SDP1111K)."""
import json, os, sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import actividad_resumen as R  # noqa: E402

HOY = datetime(2026, 11, 12, tzinfo=timezone.utc)
FECHA = "2026-11-12"


def ficha(titulo, enlace="https://ejemplo.org/a", fuente="youtube", **extra):
    base = {"fuente": fuente, "cuenta": "alex", "titulo": titulo, "enlace": enlace,
            "fecha": FECHA + "T10:00:00Z", "privado": True}
    base.update(extra)
    return base


def crear_fichas(tmp_path, fecha, fichas):
    destino = tmp_path / ("fichas/" + fecha + "-google-alex.json")
    destino.parent.mkdir(parents=True, exist_ok=True)
    destino.write_text(json.dumps({"cuenta": "alex", "fecha": fecha, "privado": True, "fichas": fichas},
                                  ensure_ascii=False), encoding="utf-8")


def clasificador_falso(temas):
    def clasificar(f):
        tema = temas.get(f["titulo"])
        return {"relevante": tema is not None, "tema": tema} if tema else {"relevante": False, "tema": None}
    return clasificar


def test_carga_del_dia_sin_cuerpos(tmp_path):
    crear_fichas(tmp_path, FECHA, [ficha("Correo", fuente="gmail", texto="cuerpo completo del correo…")])
    crear_fichas(tmp_path, "2026-11-11", [ficha("Vieja")])
    cargadas = R.cargar_fichas(str(tmp_path / "fichas"), FECHA)
    assert len(cargadas) == 1 and cargadas[0]["titulo"] == "Correo"
    assert "texto" not in cargadas[0] and "cuerpo" not in cargadas[0]


def test_clasificador_inyectable_separa_temas(tmp_path):
    crear_fichas(tmp_path, FECHA, [ficha("Mesh del barrio", fuente="gmail"), ficha("Cena de navidad")])
    temas = {"Mesh del barrio": "mesh"}
    r = R.resumen(R.cargar_fichas(str(tmp_path / "fichas"), FECHA), clasificador_falso(temas))
    assert r["descartadas"] == 1
    assert [e["titulo"] for e in r["temas"]["mesh"]["elementos"]] == ["Mesh del barrio"]
    assert set(r["temas"]) == {"mesh"}


def test_recuerdo_inyectable(tmp_path):
    crear_fichas(tmp_path, FECHA, [ficha("Solarpunk en la ciudad")])
    recuerdo = lambda t: ("ya se sabe: " + t) if t == "solarpunk" else None  # noqa: E731
    r = R.resumen([ficha("Solarpunk en la ciudad")], clasificador_falso({"Solarpunk en la ciudad": "solarpunk"}), recuerdo)
    assert r["temas"]["solarpunk"]["recuerdo"] == "ya se sabe: solarpunk"


def test_tope_de_caracteres():
    largas = [ficha("Título larguísimo " + "x" * 200 + str(n)) for n in range(80)]
    r = R.resumen(largas, clasificador_falso({f["titulo"]: "mesh" for f in largas}), None, tope=3000)
    assert len(json.dumps(r, ensure_ascii=False)) <= 3000
    assert r["temas"]["mesh"]["elementos"]


def test_escribir_marca_privado_y_sin_cuerpos(tmp_path):
    r = R.resumen([ficha("Noticia", fuente="gmail", cuerpo="todo el correo entero…")],
                  clasificador_falso({"Noticia": "comunidades"}))
    ruta = R.escribir(r, FECHA, dir_actividad=str(tmp_path))
    datos = json.loads(open(ruta, encoding="utf-8").read())
    assert os.path.basename(ruta) == "resumen-" + FECHA + ".json"
    assert datos["privado"] is True and datos["fecha"] == FECHA
    plana = json.dumps(datos, ensure_ascii=False)
    assert "cuerpo" not in plana and "todo el correo" not in plana


def test_veredicto_de_laya_lee_temas():
    res = {"pregunta": "sí, relevante, tema: diseño y mesh del vecindario", "motor": "laya-local"}
    assert R.veredicto_laya(res, ficha("x")) == {"relevante": True, "tema": "diseno"}
    assert R.veredicto_laya({"pregunta": "no, no es relevante"}, ficha("x")) == {"relevante": False, "tema": None}
    assert R.veredicto_laya(None, ficha("x")) == {"relevante": False, "tema": None}


def test_recordar_con_buscar_inyectado():
    assert R.recordar("mesh", buscar=lambda i, c, k: [{"texto": "lo leído"}]) == "lo leído"
    assert R.recordar("mesh", buscar=lambda i, c, k: None) is None

