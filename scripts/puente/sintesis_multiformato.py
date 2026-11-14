#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Síntesis multiformato: tras cada síntesis diaria, genera todos los formatos de NotebookLM y los entrega.

Núcleo puro con E/S inyectable. Se dispara cuando existe «Síntesis diaria <fecha>» en Drive › Síntesis diarias,
una sola vez por fecha (marca en ~/.starseed/peticiones/multiformato.json).
"""
from __future__ import annotations
import datetime
import json
import os
import tempfile
from typing import Any

from peticiones_notebooklm import (
    CUADERNO,
    TIPOS,
    asegurar_fuente,
    drive,
    enviar_resultado,
    esperar_y_bajar,
    lanzar,
    nombre_drive,
    sesion_viva,
    token_google,
    ultima_sintesis,
)

FORMATOS = [
    "report",
    "audio",
    "video",
    "infographic",
    "slide-deck",
    "mind-map",
    "quiz",
    "flashcards",
    "data-table",
]

AJUSTES: dict[str, dict[str, Any]] = {
    "report": {"formato": "a medida, detallado"},
    "audio": {"formato": "deep-dive"},
    "video": {},
    "infographic": {"orientacion": "vertical", "detalle": "detallada"},
    "slide-deck": {},
    "mind-map": {},
    "quiz": {},
    "flashcards": {},
    "data-table": {},
}

ESTADO_PATH = os.path.join(os.path.expanduser("~"), ".starseed", "peticiones", "multiformato.json")


def leer_estado() -> dict[str, Any]:
    try:
        with open(ESTADO_PATH, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {"fechas_procesadas": []}


def escribir_estado(estado: dict[str, Any]) -> None:
    os.makedirs(os.path.dirname(ESTADO_PATH), exist_ok=True)
    tmp = ESTADO_PATH + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(estado, f, ensure_ascii=False, indent=1)
    os.replace(tmp, ESTADO_PATH)


def ya_procesado(fecha: str) -> bool:
    return fecha in leer_estado().get("fechas_procesadas", [])


def marcar_procesado(fecha: str) -> None:
    estado = leer_estado()
    if fecha not in estado.get("fechas_procesadas", []):
        estado.setdefault("fechas_procesadas", []).append(fecha)
        escribir_estado(estado)


def _notebook_titulo(fecha: str) -> str:
    return f"Síntesis {fecha}"


def _carpeta_sintesis_fecha(fecha: str) -> str:
    return f"Síntesis diarias/{fecha}"


def _subir_a_drive(ruta: str, nombre: str, carpeta_id: str) -> str:
    tok = token_google("alex-docs")
    import uuid
    import urllib.request
    frontera = uuid.uuid4().hex
    with open(ruta, "rb") as f:
        contenido = f.read()
    metadata = json.dumps({"name": nombre, "parents": [carpeta_id]}).encode()
    partes = [
        (f'--{frontera}\r\nContent-Disposition: form-data; name="metadata"\r\nContent-Type: application/json\r\n\r\n').encode() + metadata + b'\r\n',
        (f'--{frontera}\r\nContent-Disposition: form-data; name="file"; filename="{nombre}"\r\nContent-Type: application/octet-stream\r\n\r\n').encode() + contenido + b'\r\n',
        (f'--{frontera}--\r\n').encode(),
    ]
    url = "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart"
    req = urllib.request.Request(url, b"".join(partes), {"Authorization": f"Bearer {tok}", "Content-Type": f"multipart/related; boundary={frontera}"})
    resp = json.loads(urllib.request.urlopen(req, timeout=60).read().decode())
    return resp.get("id", "")


def _enviar_al_chat(tipo: str, ruta: str, titulo: str, enviar_resultado_fn) -> None:
    enviar_resultado_fn(tipo, ruta, titulo)


def _subir_espejo(ruta: str, nombre: str) -> str:
    from peticiones_telegram import subir as subir_espejo
    return subir_espejo(ruta, nombre)


def _generar_formato(
    tipo: str,
    indicaciones: str,
    sid: str,
    lanzar_fn,
    esperar_y_bajar_fn,
) -> str:
    tarea = lanzar_fn(tipo, indicaciones, sid)
    return esperar_y_bajar_fn(tipo, tarea, "multiformato")


def _formato_fallido(indice: dict[str, Any], tipo: str, error: str) -> None:
    indice.setdefault("fallidos", []).append({"tipo": tipo, "error": error, "reintentos": 0})


def _reintentar_formato(
    tipo: str,
    indicaciones: str,
    sid: str,
    lanzar_fn,
    esperar_y_bajar_fn,
    max_reintentos: int = 2,
) -> str | None:
    for intento in range(max_reintentos):
        try:
            return _generar_formato(tipo, indicaciones, sid, lanzar_fn, esperar_y_bajar_fn)
        except Exception as e:
            if intento == max_reintentos - 1:
                raise
    return None


def procesar_sintesis_diaria(
    *,
    fecha: str | None = None,
    drive_fn=drive,
    token_google_fn=token_google,
    ultima_sintesis_fn=ultima_sintesis,
    nombre_drive_fn=nombre_drive,
    asegurar_fuente_fn=asegurar_fuente,
    lanzar_fn=lanzar,
    esperar_y_bajar_fn=esperar_y_bajar,
    enviar_resultado_fn=enviar_resultado,
    sesion_viva_fn=sesion_viva,
    subir_espejo_fn=_subir_espejo,
    _subir_a_drive_fn=_subir_a_drive,
) -> dict[str, Any]:
    """Procesa la síntesis diaria de una fecha: genera todos los formatos y los entrega.

    Args:
        fecha: Fecha en formato AAAA-MM-DD. Si es None, usa la fecha de hoy.
        Las funciones con sufijo _fn son inyectables para testing.

    Returns:
        Dict con el índice de resultados: {fecha, cuaderno, formatos: [{tipo, drive_id, enlace, estado}], fallidos}
    """
    if fecha is None:
        fecha = datetime.date.today().isoformat()

    if ya_procesado(fecha):
        return {"fecha": fecha, "estado": "ya_procesado", "formatos": []}

    fid_sintesis, titulo_sintesis = ultima_sintesis_fn()
    sid = asegurar_fuente_fn(fid_sintesis, _notebook_titulo(fecha))

    carpeta_id = os.environ.get("STARSEED_CARPETA_SINTESIS_FECHA", "1PenzAWw1VWpSAMXa7ms2VRrEhJ5uFbmI")

    indice: dict[str, Any] = {"fecha": fecha, "cuaderno": _notebook_titulo(fecha), "formatos": [], "fallidos": []}

    for tipo in FORMATOS:
        ajustes = AJUSTES.get(tipo, {})
        indicaciones = _construir_indicaciones(tipo, ajustes, titulo_sintesis)

        for intento in range(3):
            try:
                ruta = _generar_formato(tipo, indicaciones, sid, lanzar_fn, esperar_y_bajar_fn)
                nombre_archivo = f"{tipo}-{fecha}{TIPOS[tipo][1]}"
                drive_id = _subir_a_drive_fn(ruta, nombre_archivo, carpeta_id)
                _enviar_al_chat(tipo, ruta, titulo_sintesis, enviar_resultado_fn)
                subir_espejo_fn(ruta, nombre_archivo)
                indice["formatos"].append({"tipo": tipo, "drive_id": drive_id, "nombre": nombre_archivo, "estado": "ok"})
                break
            except Exception as e:
                if intento == 2:
                    _formato_fallido(indice, tipo, str(e))
                    indice["formatos"].append({"tipo": tipo, "drive_id": "", "nombre": "", "estado": "fallido", "error": str(e)})

    marcar_procesado(fecha)
    indice["estado"] = "completado"
    return indice


def _construir_indicaciones(tipo: str, ajustes: dict[str, Any], titulo: str) -> str:
    base = TIPOS.get(tipo, ("", "", [], 0, False, False))[0]
    if tipo == "report":
        return f"Informe detallado en español de «{titulo}»: resumen completo y detallado, notas, observaciones, avances, resultados, recomendaciones para próximos pasos, integración de cada desarrollo e investigación de los procesos agénticos y de cada área."
    if tipo == "audio":
        return f"Conversación en español, cálida y clara (deep-dive) que explique lo esencial de «{titulo}» y las recomendaciones accionables para la producción audiovisual de StarSeed."
    if tipo == "video":
        return f"Vídeo resumen en español de «{titulo}» con lo esencial: recomendaciones principales, ideas de vídeo y redes, referencias de diseño y próximos pasos."
    if tipo == "infographic":
        return f"Infografía en español, vertical y detallada, con lo esencial de «{titulo}»: recomendaciones principales, ideas de vídeo y redes, referencias de diseño y próximos pasos."
    if tipo == "slide-deck":
        return f"Presentación en español de «{titulo}» con diapositivas para: resumen, avances por área, recomendaciones, próximos pasos."
    if tipo == "mind-map":
        return f"Mapa mental en español de «{titulo}» estructurando áreas, desarrollos, investigaciones y recomendaciones."
    if tipo == "quiz":
        return f"Cuestionario en español sobre «{titulo}» para validar comprensión de los puntos clave."
    if tipo == "flashcards":
        return f"Tarjetas de estudio en español con los conceptos clave de «{titulo}»."
    if tipo == "data-table":
        return f"Tabla de datos en CSV con los elementos accionables de «{titulo}»: área, acción, responsable, prioridad, estado."
    return f"En español, con lo esencial de «{titulo}»."


if __name__ == "__main__":
    import sys
    fecha = sys.argv[1] if len(sys.argv) > 1 else None
    resultado = procesar_sintesis_diaria(fecha=fecha)
    print(json.dumps(resultado, ensure_ascii=False, indent=1))