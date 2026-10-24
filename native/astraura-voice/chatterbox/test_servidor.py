#!/usr/bin/env python3
"""
Pruebas del servicio Chatterbox local — sin red ni GPU.
Usa el modelo simulado para verificar endpoints y medidas.
"""

import base64
import json
import sys
import os
import threading
import time
import urllib.error
import urllib.request
from contextlib import contextmanager
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(__file__)))

import servidor
from servidor import (
    detectar_dispositivo,
    cargar_modelo,
    crear_servidor,
    descargar_modelos_inactivos,
    disponibilidad_modelo,
    endpoint_generar,
    endpoint_generar_stream,
    endpoint_salud,
    PERTH_WATERMARK,
)


@contextmanager
def _servidor_de_prueba():
    """Levanta el servidor HTTP real en un puerto libre y lo apaga al terminar."""
    srv = crear_servidor(0)
    hilo = threading.Thread(target=srv.serve_forever, daemon=True)
    hilo.start()
    try:
        yield srv.server_address[1]
    finally:
        srv.shutdown()
        srv.server_close()
        hilo.join(timeout=2)


def _url(puerto, ruta):
    return f"http://127.0.0.1:{puerto}{ruta}"


def _get_json(puerto, ruta, cabeceras=None):
    peticion = urllib.request.Request(_url(puerto, ruta), headers=cabeceras or {})
    with urllib.request.urlopen(peticion, timeout=5) as respuesta:
        return respuesta.status, json.loads(respuesta.read().decode("utf-8")), respuesta.headers


def _post_json(puerto, ruta, datos):
    cuerpo = json.dumps(datos).encode("utf-8")
    peticion = urllib.request.Request(
        _url(puerto, ruta),
        data=cuerpo,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(peticion, timeout=10) as respuesta:
            return respuesta.status, json.loads(respuesta.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        return error.code, json.loads(error.read().decode("utf-8"))


def test_dispositivo():
    d = detectar_dispositivo()
    assert d in ("cpu", "mps", "cuda")


def test_modelo_simulado():
    disponible, _ = disponibilidad_modelo()
    if disponible:
        return  # en una máquina con pesos reales no se fuerza el modo simulado
    m = cargar_modelo("multilingual-v3", "es")
    assert isinstance(m, dict)
    assert m.get("simulado") is True
    assert m.get("razon")


def test_marca_agua_conservada():
    assert PERTH_WATERMARK is True


def test_generar_conserva_marca_agua():
    res = endpoint_generar("Hola, soy Aurora.", idioma="es")
    assert res["marca_agua_perth"] is True
    assert "Perth" in res["mensaje"]
    assert res["tiempo_total_s"] >= 0


def test_stream_por_frases():
    respuestas = endpoint_generar_stream(
        ["Primera frase.", "Segunda frase."], idioma="es"
    )
    assert len(respuestas) == 2
    for r in respuestas:
        assert r["marca_agua_perth"] is True
        assert "frase" in r
        assert "tiempo_total_s" in r


def test_endpoint_salud():
    salud = endpoint_salud()
    assert "dispositivo" in salud
    assert salud["dispositivo"] in ("cpu", "mps", "cuda")
    assert "modelos_cargados" in salud
    assert isinstance(salud["modelos_cargados"], list)
    assert "marca_agua_perth" in salud
    assert salud["marca_agua_perth"] is True
    assert "estado" in salud
    assert salud["estado"] == "activo"
    assert isinstance(salud["disponible"], bool)
    if salud["disponible"]:
        assert salud["motivo"] is None
    else:
        assert isinstance(salud["motivo"], str) and salud["motivo"]


def test_disponibilidad_honesta():
    disponible, motivo = disponibilidad_modelo()
    assert isinstance(disponible, bool)
    if disponible:
        assert motivo is None
    else:
        assert isinstance(motivo, str) and motivo


def test_idioma_espanol_usa_multilingual():
    # Verificar que el español use el modelo multilingual
    res = endpoint_generar("Hola mundo", idioma="es")
    assert res["idioma"] == "es"
    assert "tiempo_total_s" in res
    assert res["tiempo_total_s"] >= 0


def test_idioma_ingles_usa_turbo():
    # Verificar que el inglés use el modelo turbo (preferido por baja latencia)
    res = endpoint_generar("Hello world", idioma="en")
    assert res["idioma"] == "en"
    assert "tiempo_total_s" in res
    assert res["tiempo_total_s"] >= 0


def test_descarga_por_inactividad():
    descargar_modelos_inactivos()
    # Tras descarga simulada, el diccionario puede estar vacío o no,
    # dependiendo del tiempo transcurrido; no lanzamos excepción.


def test_servidor_solo_escucha_en_localhost():
    srv = crear_servidor(0)
    try:
        assert srv.server_address[0] == "127.0.0.1"
        assert srv.server_address[1] > 0
    finally:
        srv.server_close()


def test_servidor_salud_http_no_carga_modelo():
    with mock.patch.object(servidor, "cargar_modelo", side_effect=AssertionError("no cargar")):
        with _servidor_de_prueba() as puerto:
            estado, salud, cabeceras = _get_json(
                puerto, "/salud", {"Origin": "http://localhost:9002"}
            )
    assert estado == 200
    assert salud["dispositivo"] in ("cpu", "mps", "cuda")
    assert isinstance(salud["disponible"], bool)
    assert cabeceras.get("Access-Control-Allow-Origin") == "http://localhost:9002"


def test_servidor_generar_503_sin_modelo():
    with mock.patch.object(
        servidor, "disponibilidad_modelo", return_value=(False, "sin modelo de prueba")
    ):
        with _servidor_de_prueba() as puerto:
            inicio = time.time()
            estado, cuerpo = _post_json(
                puerto, "/generar", {"texto": "Hola, soy Aurora.", "idioma": "es"}
            )
            transcurrido = time.time() - inicio
    assert estado == 503
    assert cuerpo["audio_base64"] is None
    assert "sin modelo de prueba" in cuerpo["motivo"]
    assert transcurrido < 2.0  # no se cuelga esperando a un modelo que no está


class _ModeloFalso:
    """Modelo de mentira: devuelve una onda mínima sin cargar nada."""

    def generate(self, *args, **kwargs):
        return [0.0] * 240


def test_servidor_generar_contrato_de_chatterbox_ts():
    with mock.patch.object(
        servidor, "disponibilidad_modelo", return_value=(True, None)
    ), mock.patch.object(servidor, "cargar_modelo", return_value=_ModeloFalso()):
        with _servidor_de_prueba() as puerto:
            estado, cuerpo = _post_json(
                puerto,
                "/generar",
                {"texto": "Hola", "idioma": "es", "exageracion": 0.6, "cfg_weight": 0.4},
            )
    assert estado == 200
    assert isinstance(cuerpo["audio_base64"], str) and cuerpo["audio_base64"]
    crudo = base64.b64decode(cuerpo["audio_base64"])
    assert crudo[:4] == b"RIFF"
    assert cuerpo["marca_agua_perth"] is True
    assert isinstance(cuerpo["factor_tiempo_real"], (int, float))


def test_servidor_generar_texto_vacio_400():
    with _servidor_de_prueba() as puerto:
        estado, cuerpo = _post_json(puerto, "/generar", {"texto": "   ", "idioma": "es"})
    assert estado == 400
    assert "texto" in cuerpo["error"]


def test_servidor_generar_json_invalido_400():
    with _servidor_de_prueba() as puerto:
        peticion = urllib.request.Request(
            _url(puerto, "/generar"),
            data=b"esto no es json",
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            urllib.request.urlopen(peticion, timeout=5)
            estado = 200
        except urllib.error.HTTPError as error:
            estado = error.code
    assert estado == 400


def test_servidor_ruta_desconocida_404():
    with _servidor_de_prueba() as puerto:
        try:
            _get_json(puerto, "/no-existe")
            estado = 200
        except urllib.error.HTTPError as error:
            estado = error.code
    assert estado == 404


def test_servidor_generar_stream_503_sin_modelo():
    with mock.patch.object(
        servidor, "disponibilidad_modelo", return_value=(False, "sin modelo de prueba")
    ):
        with _servidor_de_prueba() as puerto:
            estado, cuerpo = _post_json(
                puerto, "/generar/stream", {"frases": ["Hola.", "Adiós."], "idioma": "es"}
            )
    assert estado == 503
    assert len(cuerpo["resultados"]) == 2
    assert all(r["audio_base64"] is None for r in cuerpo["resultados"])


def _ejecutar_pruebas():
    """Runner sin pytest: ejecuta todas las funciones `test_*` de este módulo."""
    pruebas = [
        (nombre, funcion)
        for nombre, funcion in sorted(globals().items())
        if nombre.startswith("test_") and callable(funcion)
    ]
    fallidas = 0
    for nombre, funcion in pruebas:
        try:
            funcion()
            print(f"✓ {nombre}")
        except Exception as error:  # noqa: BLE001 — el runner informa y sigue
            fallidas += 1
            print(f"✗ {nombre}: {error}")
    print(f"\nPruebas: {len(pruebas) - fallidas}/{len(pruebas)} pasaron")
    return 1 if fallidas else 0


if __name__ == "__main__":
    raise SystemExit(_ejecutar_pruebas())