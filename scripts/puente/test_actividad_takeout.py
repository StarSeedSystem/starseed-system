#!/usr/bin/env python3
"""Pruebas de actividad_takeout sin red ni Drive: muestras pequeñas e inyección (SDP1111H)."""
import datetime, io, json, os, sys, zipfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import actividad_takeout as A  # noqa: E402

AHORA = datetime.datetime(2026, 11, 11, 12, 0, tzinfo=datetime.timezone.utc)

EVENTOS = [
    {"header": "Search", "title": "Searched for meshes de cristal",
     "titleUrl": "https://www.google.com/search?q=mesh", "time": "2026-11-11T10:30:00.000Z",
     "subtitles": [{"name": "Producto", "nameUrl": "https://www.google.com"}]},
    {"header": "Search", "title": "Searched for solarpunk", "time": "2026-11-10T08:00:00.000Z"},
]
FILAS = [{"Título": "Vídeo de la malla", "URL del título": "https://www.youtube.com/watch?v=m1",
          "Visto el": "2026-11-11 09:12"}]


def zip_muestra():
    """Un Takeout en memoria: Mi actividad (Búsqueda y Gemini) e historial de YouTube."""
    memoria = io.BytesIO()
    with zipfile.ZipFile(memoria, "w") as paquete:
        paquete.writestr("Takeout/Mi actividad/Búsqueda/MyActivity.json", json.dumps(EVENTOS))
        paquete.writestr("Takeout/Mi actividad/Gemini Apps/MyActivity.json", json.dumps(
            [{"title": "Chat con Gemini", "titleUrl": "https://g.co/gemini", "time": "2026-11-11T10:00:00Z"}]))
        paquete.writestr("Takeout/YouTube and YouTube Music/history/watch-history.csv",
                         "Título,URL del título,Visto el\n"
                         "Vídeo de la malla,https://www.youtube.com/watch?v=m1,2026-11-11 09:12")
    return memoria.getvalue()


def test_fichas_de_mi_actividad_filtran_por_marca():
    fichas = A.fichas_actividad(EVENTOS, "alex", "busqueda", marca="2026-11-11T09:00:00Z")
    assert len(fichas) == 1 and fichas[0]["fuente"] == "busqueda" and fichas[0]["cuenta"] == "alex"
    assert fichas[0]["fecha"] == "2026-11-11T10:30:00Z" and fichas[0]["privado"] is True
    assert fichas[0]["enlace"].startswith("https://www.google.com/search")


def test_fichas_de_youtube_leen_csv_espanol_y_json():
    fichas = A.fichas_youtube(FILAS, "alex", "")
    assert len(fichas) == 1 and fichas[0]["fuente"] == "youtube" and fichas[0]["privado"] is True
    assert fichas[0]["fecha"] == "2026-11-11T09:12:00Z" and fichas[0]["enlace"].endswith("watch?v=m1")
    en_json = A.fichas_youtube([{"title": "Otro", "titleUrl": "https://youtu.be/x",
                                 "time": "2026-11-11T11:00:00.123Z"}], "alex", "")
    assert en_json[0]["fecha"] == "2026-11-11T11:00:00Z" and en_json[0]["titulo"] == "Otro"


def test_extraer_lee_busqueda_gemini_y_youtube():
    datos = A.extraer(zip_muestra())
    assert [d["title"] for d in datos["busqueda"]] == ["Searched for meshes de cristal", "Searched for solarpunk"]
    assert datos["gemini"][0]["title"] == "Chat con Gemini"
    assert datos["youtube"][0]["URL del título"].endswith("watch?v=m1")


def drive_falso(llamadas):
    def pedir(url, cabeceras=None):
        llamadas.append(url)
        return {"files": [{"id": "z1", "name": "takeout-2026-11-11.zip", "modifiedTime": "2026-11-11T09:00:00Z"}]}
    return pedir


def test_leer_es_incremental_y_borra_el_zip(tmp_path):
    resultado = A.leer(pedir=drive_falso([]), token_de=lambda a: "t-" + a,
                       descargar=lambda url, cabeceras=None: zip_muestra(), alias=("alex",),
                       ahora=AHORA, dir_actividad=str(tmp_path), dir_tmp=str(tmp_path))
    assert resultado["ok"] is True and resultado["errores"] == []
    fichas = json.load(open(tmp_path / "fichas" / "2026-11-11-takeout-alex.json", encoding="utf-8"))
    assert fichas["privado"] is True and len(fichas["fichas"]) == 4
    marca = json.load(open(tmp_path / "takeout" / "marca-alex.json", encoding="utf-8"))
    assert marca["ultima"] == "2026-11-11T10:30:00Z" and marca["privado"] is True
    assert not list(tmp_path.glob("*.zip"))


def test_segunda_pasada_no_emite_nada(tmp_path):
    argumentos = dict(pedir=drive_falso([]), token_de=lambda a: "t", descargar=lambda u, c=None: zip_muestra(),
                      alias=("alex",), ahora=AHORA, dir_actividad=str(tmp_path))
    A.leer(**argumentos)
    otra = A.leer(**argumentos)
    assert otra["fichas"] == [] and otra["ok"] is True


def test_sin_token_lo_dice_sin_fallar(tmp_path):
    resultado = A.leer(pedir=drive_falso([]), token_de=lambda a: None, alias=("alex",),
                       ahora=AHORA, dir_actividad=str(tmp_path))
    assert resultado["ok"] is True and resultado["fichas"] == []
    assert "sin token" in resultado["errores"][0]
