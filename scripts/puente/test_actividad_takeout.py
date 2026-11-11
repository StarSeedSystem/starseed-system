#!/usr/bin/env python3
"""Pruebas de actividad_takeout sin red: Drive, token y directorio temporal van inyectados (SDP1111H)."""
import json, os, sys, zipfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import actividad_takeout as T  # noqa: E402

YOUTUBE = [{"header": "YouTube", "title": "Viste Primeros pasos", "titleUrl": "https://www.youtube.com/watch?v=a1",
            "time": "2026-11-10T10:00:00.000Z",
            "subtitles": [{"name": "Canal Uno", "url": "https://youtube.com/channel/c1"}]},
           {"header": "YouTube", "title": "Viste Recorrido", "titleUrl": "https://www.youtube.com/watch?v=a2",
            "time": "2026-11-09T08:00:00.000Z"}]
BUSQUEDA = [{"header": "Buscando en la Web", "title": "Buscado starseed diseño", "time": "2026-11-10T09:00:00.000Z"}]
GEMINI = [{"header": "Gemini", "title": "Añadido un prompt en la app de Gemini", "time": "2026-11-10T11:00:00.000Z"}]


def zip_muestra(tmp_path):
    ruta = str(tmp_path / "takeout.zip")
    with zipfile.ZipFile(ruta, "w") as z:
        z.writestr("Takeout/YouTube and YouTube Music/history/watch-history.json", json.dumps(YOUTUBE))
        z.writestr("Takeout/MyActivity/Búsqueda/MyActivity.json", json.dumps(BUSQUEDA))
        z.writestr("Takeout/MyActivity/Gemini/MyActivity.json", json.dumps(GEMINI))
        z.writestr("Takeout/Takeout.html", "<html></html>")
    return ruta


def drive_falso(llamadas, cuerpo_zip=b"datos-zip", con_zip=True):
    """Un `pedir` de mentira: responde a carpeta, zip y descarga; deja constancia de lo que pidió."""
    def pedir(url, token=None):
        llamadas.append((url, token))
        if "alt=media" in url:
            return cuerpo_zip
        if "folder" in url:
            return {"files": [{"id": "carpeta1"}]} if con_zip else {"files": []}
        if "in%20parents" in url:
            return {"files": [{"id": "zip1", "name": "takeout-2026-11-10.zip"}]}
        return {}
    return pedir

def test_leer_actividad_del_historial_de_youtube():
    fichas = T.leer_actividad(YOUTUBE, "youtube", "alex")
    assert len(fichas) == 2 and fichas[0]["titulo"] == "Viste Primeros pasos"
    assert fichas[0]["enlace"] == "https://www.youtube.com/watch?v=a1"
    assert fichas[0]["canal"] == "Canal Uno" and fichas[0]["fecha"] == "2026-11-10T10:00:00.000Z"
    assert fichas[0]["privado"] is True and fichas[0]["fuente"] == "takeout" and fichas[0]["servicio"] == "youtube"
    assert fichas[1]["canal"] is None
    assert T.leer_actividad([{"title": "sin fecha"}], "youtube", "alex") == []
    assert T.leer_actividad("no es lista", "youtube", "alex") == []

def test_leer_actividad_de_busqueda_y_gemini_ignora_los_desconocidos():
    fichas = T.leer_actividad(BUSQUEDA, "Búsqueda", "alex")
    assert fichas[0]["servicio"] == "Búsqueda" and fichas[0]["privado"] is True
    assert fichas[0]["titulo"] == "Buscado starseed diseño"
    assert T.leer_actividad(GEMINI, "Gemini", "alex")[0]["servicio"] == "Gemini"
    assert T.leer_actividad(BUSQUEDA, "Maps", "alex") == []


def test_miembros_extrae_las_tres_exportaciones_y_ignora_lo_demas(tmp_path):
    miembros = dict(T.miembros(zip_muestra(tmp_path)))
    assert sorted(miembros) == ["Búsqueda", "Gemini", "youtube"]
    assert miembros["youtube"][0]["title"] == "Viste Primeros pasos"
    assert miembros["Búsqueda"] == BUSQUEDA and miembros["Gemini"] == GEMINI


def test_fichas_de_une_youtube_y_mi_actividad_con_la_cuenta(tmp_path):
    fichas = T.fichas_de(zip_muestra(tmp_path), "alex")
    assert len(fichas) == 4 and sorted({f["servicio"] for f in fichas}) == ["Búsqueda", "Gemini", "youtube"]
    assert all(f["cuenta"] == "alex" and f["privado"] is True for f in fichas)


def test_nuevas_emite_solo_lo_posterior_a_la_marca_y_la_actualiza():
    todas = [{"fecha": "2026-11-10T10:00:00.000Z"}, {"fecha": "2026-11-09T08:00:00.000Z"}]
    fichas, marca = T.nuevas(todas, "2026-11-10T00:00:00.000Z")
    assert len(fichas) == 1 and marca == "2026-11-10T10:00:00.000Z"
    assert [len(T.nuevas(todas, None)[0]), T.nuevas(todas, None)[1]] == [2, "2026-11-10T10:00:00.000Z"]


def test_ultimo_zip_busca_la_carpeta_y_su_zip_mas_reciente():
    llamadas = []
    assert T.ultimo_zip("tok", drive_falso(llamadas)) == {"id": "zip1", "name": "takeout-2026-11-10.zip"}
    assert "folder" in llamadas[0][0] and llamadas[0][1] == "tok"
    assert "in%20parents" in llamadas[1][0] and "carpeta1" in llamadas[1][0]
    assert T.ultimo_zip("tok", drive_falso([], con_zip=False)) is None


def test_ejecutar_descarga_extrae_emite_y_borra_el_zip(tmp_path):
    cuerpo = open(zip_muestra(tmp_path), "rb").read()
    llamadas, destino = [], str(tmp_path / "temporal")
    os.makedirs(destino); pedir = drive_falso(llamadas, cuerpo)
    r = T.ejecutar("alex", lambda alias: "tok-" + alias, pedir, dir_actividad=None,
                   estado={}, dir_temp=lambda: destino)
    assert r["ok"] is True and len(r["fichas"]) == 4
    assert all(f["privado"] is True for f in r["fichas"]) and r["alias"] == "alex"
    assert r["marca"] == "2026-11-10T11:00:00.000Z" and r["zip"] == "takeout-2026-11-10.zip"
    assert not os.path.exists(destino)  # el zip (y su temporal) borrados al terminar


def test_la_segunda_pasada_solo_emite_lo_nuevo(tmp_path):
    cuerpo = open(zip_muestra(tmp_path), "rb").read()
    pedir, token_de = drive_falso([], cuerpo), lambda alias: "tok"
    os.makedirs(str(tmp_path / "t1")); os.makedirs(str(tmp_path / "t2"))
    primera = T.ejecutar("alex", token_de, pedir, estado={}, dir_actividad=None, dir_temp=lambda: str(tmp_path / "t1"))
    segunda = T.ejecutar("alex", token_de, pedir, estado=primera["estado"], dir_actividad=None,
                         dir_temp=lambda: str(tmp_path / "t2"))
    assert segunda["fichas"] == [] and segunda["marca"] == primera["marca"]


def test_sin_token_o_sin_exportacion_dice_el_motivo_y_no_falla():
    assert T.ejecutar("alex", lambda a: None, drive_falso([]))["motivo"] == "sin token de Drive para alex"
    r = T.ejecutar("alex", lambda a: "tok", drive_falso([], con_zip=False))
    assert r["ok"] is False and "Takeout" in r["motivo"]


def test_guardar_deja_fichas_privadas_y_estado_leible(tmp_path):
    guardado = T.guardar({"alex": "2026-11-10T11:00:00.000Z"}, [{"servicio": "youtube"}], "alex",
                         dir_actividad=str(tmp_path))
    volcado = json.load(open(guardado["fichas"], encoding="utf-8"))
    assert volcado["privado"] is True and "takeout" in os.path.basename(guardado["fichas"])
    assert T.leer_estado(guardado["estado"]) == {"alex": "2026-11-10T11:00:00.000Z"}
    assert T.leer_estado(str(tmp_path / "no-esta.json")) == {}
