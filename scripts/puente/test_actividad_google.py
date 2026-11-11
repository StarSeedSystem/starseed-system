#!/usr/bin/env python3
"""Pruebas de actividad_google sin red: `pedir` y `token_de` van inyectados (SDP1111F)."""
import base64, datetime, json, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import actividad_google as A  # noqa: E402

AHORA = datetime.datetime(2026, 11, 11, 12, 0, tzinfo=datetime.timezone.utc)
BASE_GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me/messages"
BASE_DRIVE = "https://www.googleapis.com/drive/v3/files"
MIME_DOC = "application/vnd.google-apps.document"


def correo(subject="Asunto", to="comunidad@ejemplo.org", horas=0, cuerpo="Hola"):
    """Un mensaje de Gmail con su cuerpo en base64url, como lo devuelve la API."""
    fecha = AHORA - datetime.timedelta(hours=horas)
    datos = base64.urlsafe_b64encode(cuerpo.encode("utf-8")).decode("ascii")
    return {"id": "m" + str(int(fecha.timestamp())), "internalDate": str(int(fecha.timestamp() * 1000)),
            "payload": {"mimeType": "text/plain", "body": {"data": datos},
                        "headers": [{"name": "Subject", "value": subject}, {"name": "To", "value": to}]}}


def red_falsa(llamadas, mensajes=None, archivos=None, exportado="Texto del doc"):
    """Un `pedir` de mentira que responde a las URLs de Gmail y Drive y apunta lo pedido."""
    mensajes = mensajes or {}

    def pedir(url, datos=None, cabeceras=None):
        llamadas.append({"url": url, "datos": datos, "cabeceras": cabeceras or {}})
        if url.startswith(BASE_GMAIL + "/"):
            return mensajes[url[len(BASE_GMAIL) + 1:].split("?")[0]]
        if url.startswith(BASE_GMAIL):
            return {"messages": [{"id": clave} for clave in mensajes]}
        if url.endswith("/export?mimeType=text/plain"):
            return exportado
        return {"files": archivos or []}
    return pedir


ARCHIVO = {"id": "d1", "name": "Nota.txt", "mimeType": "text/plain",
           "webViewLink": "https://drive.google.com/file/d/d1", "modifiedTime": "2026-11-11T10:00:00Z"}
DOC = {"id": "d2", "name": "Guion", "mimeType": MIME_DOC,
       "webViewLink": "https://docs.google.com/document/d/d2", "createdTime": "2026-11-11T09:00:00Z"}


def test_corte_son_las_ultimas_36_horas():
    assert A.corte(AHORA) == "2026-11-10T00:00:00Z"


def test_la_ficha_del_correo_es_privada_y_recorta_el_cuerpo():
    ficha = A.ficha_correo(correo(cuerpo="x" * 4000), "alex")
    assert ficha["fuente"] == "gmail" and ficha["cuenta"] == "alex" and ficha["privado"] is True
    assert ficha["titulo"] == "Asunto" and ficha["destinatario"] == "comunidad@ejemplo.org"
    assert ficha["fecha"] == "2026-11-11T12:00:00Z" and len(ficha["texto"]) == 1500


def test_la_ficha_del_archivo_distingue_doc_y_su_texto():
    normal = A.ficha_archivo(ARCHIVO, "alex")
    doc = A.ficha_archivo(DOC, "alex", "x" * 7000)
    assert normal["fuente"] == "drive" and normal["texto"] == "" and normal["tipo"] == "text/plain"
    assert doc["fuente"] == "docs" and len(doc["texto"]) == 6000 and doc["privado"] is True


def test_lee_correos_y_archivos_de_las_ultimas_36_horas(tmp_path):
    llamadas = []
    mensajes = {"nuevo": correo(), "viejo": correo(horas=40)}
    resultado = A.leer(pedir=red_falsa(llamadas, mensajes, [ARCHIVO, DOC]), token_de=lambda alias: "t-" + alias,
                       ahora=AHORA, alias=("alex",), dir_actividad=str(tmp_path))
    assert resultado["ok"] is True and resultado["errores"] == []
    assert [f["fuente"] for f in resultado["fichas"]] == ["gmail", "drive", "docs"]
    assert resultado["fichas"][2]["texto"] == "Texto del doc"
    assert all(f["cuenta"] == "alex" and f["privado"] is True for f in resultado["fichas"])


def test_la_consulta_de_enviados_y_los_filtros_de_fecha():
    llamadas = []
    A.leer(pedir=red_falsa(llamadas, {"nuevo": correo()}, [ARCHIVO]), token_de=lambda a: "t",
           ahora=AHORA, alias=("alex",), dir_actividad=None)
    lista = [c["url"] for c in llamadas if c["url"].startswith(BASE_GMAIL) and "?" in c["url"]][0]
    assert "in%3Asent%20newer_than%3A2d" in lista
    drive = [c["url"] for c in llamadas if c["url"].startswith(BASE_DRIVE) and "?" in c["url"]][0]
    assert "2026-11-10T00%3A00%3A00Z" in drive


def test_nunca_escribe_en_las_cuentas():
    llamadas = []
    A.leer(pedir=red_falsa(llamadas, {"nuevo": correo()}, [ARCHIVO]), token_de=lambda a: "t",
           ahora=AHORA, alias=("alex",), dir_actividad=None)
    assert llamadas and all(c["datos"] is None for c in llamadas)


def test_guarda_una_ficha_por_alias_y_fecha(tmp_path):
    A.leer(pedir=red_falsa([], {"nuevo": correo()}, [ARCHIVO]), token_de=lambda a: "t",
           ahora=AHORA, alias=("alex", "fundacion"), dir_actividad=str(tmp_path))
    fichas = tmp_path / "fichas"
    assert (fichas / "2026-11-11-google-alex.json").exists()
    assert (fichas / "2026-11-11-google-fundacion.json").exists()
    volcado = json.load(open(fichas / "2026-11-11-google-alex.json", encoding="utf-8"))
    assert volcado["privado"] is True and volcado["cuenta"] == "alex" and volcado["fichas"]


def test_sin_token_lo_dice_sin_fallar(tmp_path):
    resultado = A.leer(pedir=red_falsa([]), token_de=lambda alias: None, ahora=AHORA,
                       alias=("alex",), dir_actividad=str(tmp_path))
    assert resultado["ok"] is True and resultado["fichas"] == []
    assert "sin token" in resultado["errores"][0]
