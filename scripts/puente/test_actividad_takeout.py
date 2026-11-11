#!/usr/bin/env python3
"""Pruebas de actividad_takeout sin red: `pedir` y `token_de` van inyectados (SDP1111H)."""
import io, json, os, sys, time, zipfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import actividad_takeout as T  # noqa: E402
import cuentas_google_env as E  # noqa: E402


def zip_de_muestra(contenido=None):
    """Un Takeout pequeño: historial de YouTube y Mi actividad de Búsqueda y de Gemini."""
    contenido = contenido or {
        "YouTube and YouTube Music/history/watch-history.json": [
            {"header": "YouTube", "title": "Watched Vídeo A", "titleUrl": "https://www.youtube.com/watch?v=a",
             "time": "2026-11-10 10:00:00", "subtitles": [{"name": "Canal A"}]},
            {"header": "YouTube", "title": "Watched Vídeo B", "titleUrl": "https://www.youtube.com/watch?v=b",
             "time": "2026-11-09 09:00:00"}],
        "My Activity/Search/MyActivity.json": [
            {"header": "Search", "title": "Searched for mesh", "time": "2026-11-10 11:00:00"}],
        "My Activity/Gemini/MyActivity.json": [
            {"header": "Gemini", "title": "Prompted saludo", "time": "2026-11-10 12:00:00"}]}
    caja = io.BytesIO()
    with zipfile.ZipFile(caja, "w") as zip_:
        for nombre, carga in contenido.items():
            zip_.writestr(nombre, json.dumps(carga))
    return caja.getvalue()


def drive_falsa(bytes_zip, zip_id="zip1"):
    def pedir(url, token=None, crudo=False):
        assert token and url.startswith(T.API_DRIVE)
        if "alt=media" in url:
            return bytes_zip
        return {"files": [{"id": zip_id, "name": "takeout-20261111T000000.zip"}]}
    return pedir


def test_fichas_de_extrae_youtube_busqueda_y_gemini():
    fichas = T.leer_zip(zip_de_muestra(), "alex")
    assert len(fichas) == 4
    assert {f["fuente"] for f in fichas} == {"takeout-youtube", "takeout-busqueda", "takeout-gemini"}
    assert all(f["privado"] is True and f["cuenta"] == "alex" for f in fichas)
    video = fichas[0]
    assert video["titulo"] == "Vídeo A" and video["canal"] == "Canal A"
    assert video["enlace"].startswith("https://www.youtube.com") and video["fecha"] == "2026-11-10 10:00:00"


def test_leer_zip_ignora_filas_sin_fecha_y_miembros_que_falten():
    parcial = {"My Activity/Search/MyActivity.json": [{"header": "Search", "time": "2026-11-01 00:00:00"},
                                                      {"header": "Search", "title": "Searched sin fecha"}]}
    fichas = T.leer_zip(zip_de_muestra(parcial), "fundacion")
    assert len(fichas) == 1 and fichas[0]["fuente"] == "takeout-busqueda" and fichas[0]["cuenta"] == "fundacion"


def test_solo_nuevas_emite_solo_lo_posterior_y_devuelve_la_marca():
    fichas = T.leer_zip(zip_de_muestra(), "alex")
    nuevas, marca = T.solo_nuevas(fichas, "")
    assert len(nuevas) == 4 and marca == "2026-11-10 12:00:00"
    segundas, marca2 = T.solo_nuevas(fichas, marca)
    assert segundas == [] and marca2 == marca


def test_leer_sin_token_o_sin_zip_no_llama_a_nada(tmp_path):
    assert T.leer("alex", token_de=lambda alias: None)["ok"] is False
    assert "sin token" in T.leer("alex", token_de=lambda alias: None)["motivo"]
    resultado = T.leer("alex", pedir=lambda url, token=None, crudo=False: {"files": []},
                       token_de=lambda alias: "acc-1")
    assert resultado["ok"] is False and "sin exportación de Takeout" in resultado["motivo"]


def test_leer_descarga_extrae_guarda_y_borra_el_zip(tmp_path):
    dir_tmp = str(tmp_path / "temporal"); os.makedirs(dir_tmp)
    resultado = T.leer("alex", pedir=drive_falsa(zip_de_muestra()), token_de=lambda alias: "acc-1",
                       dir_actividad=str(tmp_path / "actividad"), dir_tmp=dir_tmp)
    assert resultado["ok"] is True and resultado["nuevas"] == {"youtube": 2, "busqueda": 1, "gemini": 1}
    assert os.listdir(dir_tmp) == []  # el zip se borró y el temporal quedó limpio
    fichas = json.load(open(os.path.join(str(tmp_path / "actividad"), "fichas",
                                         "2026-11-11-takeout-alex.json"), encoding="utf-8"))
    assert fichas["privado"] is True and len(fichas["fichas"]) == 4
    estado = T.leer_estado(str(tmp_path / "actividad"))
    assert estado["alex"]["gemini"] == "2026-11-10 12:00:00"


def test_la_segunda_pasada_solo_emite_lo_nuevo(tmp_path):
    dir_actividad = str(tmp_path / "actividad")
    T.leer("alex", pedir=drive_falsa(zip_de_muestra()), token_de=lambda alias: "acc-1", dir_actividad=dir_actividad)
    segunda = T.leer("alex", pedir=drive_falsa(zip_de_muestra()), token_de=lambda alias: "acc-1",
                     dir_actividad=dir_actividad)
    assert segunda["nuevas"] == {"youtube": 0, "busqueda": 0, "gemini": 0} and segunda["fichas"] == []
    mas_youtube = {"YouTube and YouTube Music/history/watch-history.json": [
        {"title": "Watched Vídeo C", "titleUrl": "https://www.youtube.com/watch?v=c",
         "time": "2026-11-11 08:00:00"}]}
    tercera = T.leer("alex", pedir=drive_falsa(zip_de_muestra(mas_youtube)), token_de=lambda alias: "acc-1",
                     dir_actividad=dir_actividad)
    assert tercera["nuevas"] == {"youtube": 1, "busqueda": 0, "gemini": 0}
    assert [f["titulo"] for f in tercera["fichas"]] == ["Vídeo C"]


def test_guarda_las_fichas_de_cada_alias_sin_meular_el_estado_del_otro(tmp_path):
    dir_actividad = str(tmp_path / "actividad")
    T.leer("alex", pedir=drive_falsa(zip_de_muestra()), token_de=lambda alias: "acc-1", dir_actividad=dir_actividad)
    T.leer("fundacion", pedir=drive_falsa(zip_de_muestra()), token_de=lambda alias: "acc-2",
           dir_actividad=dir_actividad)
    estado = T.leer_estado(dir_actividad)
    assert set(estado) == {"alex", "fundacion"} and estado["alex"]["busqueda"] == estado["fundacion"]["busqueda"]
    nombres = sorted(os.listdir(os.path.join(dir_actividad, "fichas")))
    assert nombres == ["2026-11-11-takeout-alex.json", "2026-11-11-takeout-fundacion.json"]
