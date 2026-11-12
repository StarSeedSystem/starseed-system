#!/usr/bin/env python3
"""Pruebas de actividad_resumen (SDP1111K): Laya y LEANN inyectados, sin red ni disco real."""
import json, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import actividad_resumen as R  # noqa: E402

FECHA = "2026-11-11"
CLASIFICA = {  # clasificador falso: dict titulo -> (relevante, tema)
    "Nota sobre Meshtastic": (True, "mesh"),
    "Guía de diseño áureo": (True, "diseno"),
    "Factura de la luz": (False, ""),
    "Blog de democracia líquida": (True, "democracia-directa"),
    "Chiste sin tema": (True, "otro-tema"),
}


def clasificar_falso(ficha):
    relevante, tema = CLASIFICA[ficha["titulo"]]
    return {"relevante": relevante, "tema": tema}


def recordar_falso(tema):
    return {"mesh": "Ya hay nodos comunitarios en el repo"}.get(tema, "")


def ficha(titulo, fuente="google", texto="cuerpo completo de un correo privado"):
    return {"fuente": fuente, "titulo": titulo, "enlace": "https://ejemplo/" + titulo.replace(" ", "-"),
            "texto": texto, "privado": True}


def escribir_fichas(tmp_path, nombre, fichas):
    ruta = tmp_path / nombre
    ruta.write_text(json.dumps(fichas), encoding="utf-8")
    return ruta


def test_solo_las_fichas_del_dia(tmp_path):
    escribir_fichas(tmp_path, FECHA + "-google-alex.json", [ficha("Nota sobre Meshtastic")])
    escribir_fichas(tmp_path, "2026-11-10-google-alex.json", [ficha("Del día anterior")])
    escribir_fichas(tmp_path, "otro-archivo.json", [ficha("Sin fecha")])
    (tmp_path / (FECHA + "-roto.json")).write_text("{no es json", encoding="utf-8")
    salida = R.fichas_del_dia(str(tmp_path), FECHA)
    assert [f["titulo"] for f in salida] == ["Nota sobre Meshtastic"]
    assert R.fichas_del_dia(str(tmp_path / "no-existe"), FECHA) == []


def test_clasificacion_solo_relevantes_con_tema_conocido():
    fichas = [ficha(t) for t in CLASIFICA]
    temas = R.agrupar(fichas, clasificar_falso)
    assert [e["titulo"] for e in temas["mesh"]] == ["Nota sobre Meshtastic"]
    assert [e["titulo"] for e in temas["diseno"]] == ["Guía de diseño áureo"]
    assert temas["democracia-directa"] and "Factura" not in json.dumps(temas)
    assert "otro-tema" not in temas  # Laya dijo un tema desconocido: se descarta


def test_resumen_estructura_privada_con_recuerdo(tmp_path):
    fichas = [ficha("Nota sobre Meshtastic"), ficha("Blog de democracia líquida")]
    resumen = R.construir(FECHA, fichas, clasificar_falso, recordar_falso)
    assert resumen["privado"] is True and resumen["fecha"] == FECHA
    mesh = resumen["temas"]["mesh"]
    assert mesh["fichas"] == [{"titulo": "Nota sobre Meshtastic",
                               "enlace": "https://ejemplo/Nota-sobre-Meshtastic"}]
    assert mesh["ya_sabido"] == "Ya hay nodos comunitarios en el repo"
    assert mesh["linea"] == "1 ficha: Nota sobre Meshtastic"
    assert "texto" not in json.dumps(resumen) or "cuerpo completo" not in json.dumps(resumen)
    assert len(json.dumps(resumen)) <= R.TOPE


def test_tope_12000_caracteres_y_escritura(tmp_path):
    def clasificar_todo_mesh(_):
        return {"relevante": True, "tema": "mesh"}

    muchas = [ficha("Título bastante largo para presionar el tope %03d" % n, texto="x" * 300)
              for n in range(120)]
    dir_salida = tmp_path / "actividad"
    R.escribir(dir_salida, R.construir(FECHA, muchas, clasificar_todo_mesh, recordar_falso))
    ruta = dir_salida / ("resumen-%s.json" % FECHA)
    contenido = ruta.read_text(encoding="utf-8")
    datos = json.loads(contenido)
    assert len(contenido) <= R.TOPE
    assert datos["privado"] is True
    assert datos["temas"]["mesh"]["fichas"] and datos["temas"]["mesh"]["fichas"][0]["titulo"] \
        == "Título bastante largo para presionar el tope 000"  # se pierde de atrás
    assert "texto" not in datos["temas"]["mesh"]


def test_linea_y_recuerdo_vacio():
    vacio = R.construir(FECHA, [], clasificar_falso, recordar_falso)
    assert vacio["temas"] == {} and vacio["privado"] is True
