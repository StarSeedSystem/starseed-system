#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas de actividad_resumen sin red ni Laya: clasificador y recuerdo inyectados (SDP1111K)."""
import datetime, json, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import actividad_resumen as A  # noqa: E402

FECHA = "2026-11-12"


def escribir_ficha(dir_fichas, nombre, fichas):
    dir_fichas.mkdir(parents=True, exist_ok=True)
    (dir_fichas / nombre).write_text(json.dumps(fichas, ensure_ascii=False), encoding="utf-8")


def ficha(titulo="Nodo de malla en la huerta", texto="  Primer párrafo.\n\nSegundo párrafo. " + "x" * 4000,
          enlace="https://ejemplo.org/nodo", privado=True):
    return {"fuente": "gmail", "titulo": titulo, "enlace": enlace, "texto": texto, "privado": privado}


def clasificador(veredicto):
    return lambda ficha: veredicto


def test_solo_lee_los_archivos_de_la_fecha_y_con_fichas_validas(tmp_path):
    escribir_ficha(tmp_path, "2026-11-12-google-alex.json", {"privado": True, "fichas": [ficha()]})
    escribir_ficha(tmp_path, "2026-11-11-youtube-alex.json", {"fichas": [ficha()]})
    escribir_ficha(tmp_path, "2026-11-12-lista-plana.json", [ficha()])
    escribir_ficha(tmp_path, "2026-11-12-roto.json", "{'no es json'")
    fichas = A.fichas_del_dia(FECHA, str(tmp_path))
    assert len(fichas) == 2  # el de otro día y el roto quedan fuera
    assert all(f["privado"] is True for f in fichas)


def test_una_linea_recorta_y_quita_saltos():
    linea = A.una_linea(ficha().get("texto"))
    assert len(linea) == A.TOPE_LINEA and "\n" not in linea


def test_clasificar_valida_relevancia_y_tema():
    bueno = A.clasificar_ficha(ficha(), clasificador({"relevante": True, "tema": "mesh"}))
    assert bueno == "mesh"
    no_relevante = A.clasificar_ficha(ficha(), clasificador({"relevante": False, "tema": "mesh"}))
    tema_raro = A.clasificar_ficha(ficha(), clasificador({"relevante": True, "tema": "cripto"}))
    basura = A.clasificar_ficha(ficha(), clasificador("sí"))
    assert no_relevante is None and tema_raro is None and basura is None


def test_reunir_agrupa_por_tema_con_recuerdo_inyectado(tmp_path):
    veredictos = {"Tema mesh": {"relevante": True, "tema": "mesh"},
                  "Ruido": {"relevante": False, "tema": "mesh"},
                  "Paleta": {"relevante": True, "tema": "diseno"}}
    escribir_ficha(tmp_path, "%s-google-alex.json" % FECHA, {"fichas": [
        ficha(titulo="Tema mesh"), ficha(titulo="Ruido"),
        ficha(titulo="Paleta", texto="ficha de diseño")]})
    resumen = A.reunir(FECHA, str(tmp_path), lambda f: veredictos.get(f["titulo"]),
                       recordar=lambda tema: "Ya sabemos esto del tema " + tema, dir_actividad=str(tmp_path))
    assert resumen["privado"] is True and resumen["fecha"] == FECHA
    assert [f["titulo"] for f in resumen["temas"]["mesh"]["fichas"]] == ["Tema mesh"]
    assert resumen["temas"]["diseno"]["conocido"].startswith("Ya sabemos")
    assert "Ruido" not in json.dumps(resumen, ensure_ascii=False)


def test_el_resumen_guardado_es_privado_y_sin_cuerpos_completos(tmp_path):
    escribir_ficha(tmp_path, "%s-google-alex.json" % FECHA, {"fichas": [ficha()]})
    destino = tmp_path / ("resumen-%s.json" % FECHA)
    A.reunir(FECHA, str(tmp_path), clasificador({"relevante": True, "tema": "mesh"}),
             recordar=lambda t: "", dir_actividad=str(tmp_path))
    volcado = destino.read_text(encoding="utf-8")
    assert json.loads(volcado)["privado"] is True
    assert "x" * 200 not in volcado  # solo la línea recortada, nunca el cuerpo completo
    import stat
    assert stat.S_IMODE(os.stat(destino).st_mode) == 0o600


def test_el_resumen_nunca_pasa_de_12000_caracteres(tmp_path):
    muchas = [ficha(titulo="ficha %d" % i, enlace="https://ejemplo.org/%d" % i,
                    texto="linea larga " + "y" * A.TOPE_LINEA) for i in range(200)]
    escribir_ficha(tmp_path, "%s-comunidades.json" % FECHA, {"fichas": muchas})
    resumen = A.reunir(FECHA, str(tmp_path), clasificador({"relevante": True, "tema": "comunidades"}),
                       recordar=lambda t: "recuerdo " + "z" * A.TOPE_CONOCIDO, dir_actividad=None)
    assert len(json.dumps(resumen, ensure_ascii=False)) <= A.TOPE
    assert resumen["temas"]["comunidades"]["fichas"]  # algo sobrevive, no vacía por miedo


def test_sin_fichas_ni_carpetas_da_un_resumen_vacio_y_valido(tmp_path):
    resumen = A.reunir(FECHA, str(tmp_path / "no-existe"), clasificador({"relevante": True, "tema": "mesh"}),
                       recordar=lambda t: "", dir_actividad=None)
    assert resumen == {"fecha": FECHA, "privado": True, "temas": {}}


def test_los_temas_son_los_de_la_tarea():
    assert A.TEMAS == ("mesh", "ia-abierta", "democracia-directa", "economia-ecologica",
                       "comunidades", "solarpunk", "diseno", "programacion")
