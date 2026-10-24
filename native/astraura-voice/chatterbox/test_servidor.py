#!/usr/bin/env python3
"""Pruebas del servicio Chatterbox local — sin red, GPU ni modelo.

Levantan el servidor real en un puerto libre y le hablan con urllib, que es
exactamente lo que hará `src/lib/aurora/tts-oss/chatterbox.ts`.
"""

import json
import os
import sys
import threading
import time
import urllib.error
import urllib.request
from typing import Any, Dict, Optional, Tuple

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__))))

import servidor as servicio
from servidor import (
    PERTH_WATERMARK,
    cargar_modelo,
    crear_servidor,
    descargar_modelos_inactivos,
    detectar_dispositivo,
    determinar_modelo,
    endpoint_generar,
    endpoint_generar_stream,
    endpoint_salud,
    motivo_no_disponible,
    puerto_configurado,
)


def _levantar() -> Tuple[Any, str]:
    """Servidor en un puerto libre (0) con su hilo, listo para urllib."""
    servidor_http = crear_servidor(0)
    hilo = threading.Thread(target=servidor_http.serve_forever, daemon=True)
    hilo.start()
    return servidor_http, f"http://127.0.0.1:{servidor_http.server_address[1]}"


def _pedir(url: str, datos: Optional[Dict[str, Any]] = None) -> Tuple[int, Any]:
    cuerpo = None if datos is None else json.dumps(datos).encode("utf-8")
    cabeceras = {"Content-Type": "application/json"} if cuerpo is not None else {}
    peticion = urllib.request.Request(url, data=cuerpo, headers=cabeceras)
    try:
        with urllib.request.urlopen(peticion, timeout=8) as respuesta:
            return respuesta.status, json.loads(respuesta.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        return error.code, json.loads(error.read().decode("utf-8"))


def _parar(servidor_http: Any) -> None:
    servidor_http.shutdown()
    servidor_http.server_close()


def test_dispositivo() -> None:
    assert detectar_dispositivo() in ("cpu", "mps", "cuda")


def test_modelo_simulado() -> None:
    modelo = cargar_modelo("multilingual-v3", "es")
    if motivo_no_disponible():
        assert isinstance(modelo, dict)
        assert modelo.get("simulado") is True
    else:
        assert modelo is not None


def test_marca_agua_conservada() -> None:
    assert PERTH_WATERMARK is True


def test_generar_conserva_marca_agua() -> None:
    resultado = endpoint_generar("Hola, soy Aurora.", idioma="es")
    assert resultado["marca_agua_perth"] is True
    assert "Perth" in resultado["mensaje"]
    assert resultado["tiempo_total_s"] >= 0


def test_stream_por_frases() -> None:
    respuestas = endpoint_generar_stream(["Primera frase.", "Segunda frase."], idioma="es")
    assert len(respuestas) == 2
    for respuesta in respuestas:
        assert respuesta["marca_agua_perth"] is True
        assert "frase" in respuesta
        assert "tiempo_total_s" in respuesta


def test_endpoint_salud() -> None:
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
        assert "motivo" not in salud
    else:
        assert isinstance(salud["motivo"], str) and salud["motivo"]


def test_idioma_espanol_usa_multilingual() -> None:
    assert determinar_modelo("es") == "v3"
    resultado = endpoint_generar("Hola mundo", idioma="es")
    assert resultado["idioma"] == "es"
    assert resultado["tiempo_total_s"] >= 0


def test_idioma_ingles_usa_turbo() -> None:
    assert determinar_modelo("en") == "turbo"
    resultado = endpoint_generar("Hello world", idioma="en")
    assert resultado["idioma"] == "en"
    assert resultado["tiempo_total_s"] >= 0


def test_descarga_por_inactividad() -> None:
    descargar_modelos_inactivos()


def test_puerto_por_argumento_entorno_y_defecto() -> None:
    assert puerto_configurado([]) == servicio.PORT
    assert puerto_configurado(["--puerto", "4599"]) == 4599
    assert puerto_configurado(["-p", "4500"]) == 4500
    assert puerto_configurado(["4510"]) == 4510


def test_servidor_http_salud_y_404() -> None:
    servidor_http, base = _levantar()
    try:
        estado, salud = _pedir(f"{base}/salud")
        assert estado == 200
        assert isinstance(salud.get("dispositivo"), str)
        assert isinstance(salud.get("disponible"), bool)
        assert salud.get("marca_agua_perth") is True
        assert salud.get("estado") == "activo"
        if not salud["disponible"]:
            assert isinstance(salud.get("motivo"), str) and salud["motivo"]

        estado_raiz, salud_raiz = _pedir(f"{base}/")
        assert estado_raiz == 200
        assert salud_raiz.get("estado") == "activo"

        estado_404, cuerpo = _pedir(f"{base}/inventado")
        assert estado_404 == 404
        assert "error" in cuerpo
    finally:
        _parar(servidor_http)


def test_servidor_http_generar_503_sin_modelo() -> None:
    original = servicio.motivo_no_disponible
    servicio.motivo_no_disponible = lambda: "modelo de prueba ausente"
    servidor_http, base = _levantar()
    try:
        inicio = time.time()
        estado, cuerpo = _pedir(
            f"{base}/generar",
            {"texto": "Hola, soy Aurora.", "idioma": "es", "exageracion": 0.5, "cfg_weight": 0.5},
        )
        assert estado == 503
        assert cuerpo.get("disponible") is False
        assert cuerpo.get("motivo") == "modelo de prueba ausente"
        assert cuerpo.get("marca_agua_perth") is True
        assert time.time() - inicio < 5

        estado_vacio, _ = _pedir(f"{base}/generar", {})
        assert estado_vacio == 400

        estado_stream, _ = _pedir(f"{base}/generar/stream", {"frases": ["Una."]})
        assert estado_stream == 503
    finally:
        _parar(servidor_http)
        servicio.motivo_no_disponible = original


def test_servidor_http_generar_200_contrato() -> None:
    class _ModeloFalso:
        def generate(self, texto: str, **_: Any) -> list:
            return [0.0, 0.1, -0.1, 0.0] * 200

    original_motivo = servicio.motivo_no_disponible
    original_cargar = servicio.cargar_modelo
    servicio.motivo_no_disponible = lambda: None
    servicio.cargar_modelo = lambda *_: _ModeloFalso()
    servidor_http, base = _levantar()
    try:
        estado, cuerpo = _pedir(
            f"{base}/generar",
            {"texto": "Hola, soy Aurora.", "idioma": "es", "exageracion": 0.6, "cfg_weight": 0.3},
        )
        assert estado == 200
        assert cuerpo.get("disponible") is True
        assert isinstance(cuerpo.get("audio_base64"), str) and cuerpo["audio_base64"]
        import base64

        audio = base64.b64decode(cuerpo["audio_base64"])
        assert audio[:4] == b"RIFF" and audio[8:12] == b"WAVE"
        assert cuerpo.get("factor_tiempo_real", 0) >= 0

        estado_stream, flujo = _pedir(
            f"{base}/generar/stream",
            {"frases": ["Primera.", "Segunda."], "idioma": "es"},
        )
        assert estado_stream == 200
        assert len(flujo.get("resultados", [])) == 2
    finally:
        _parar(servidor_http)
        servicio.motivo_no_disponible = original_motivo
        servicio.cargar_modelo = original_cargar


def test_servidor_http_json_invalido() -> None:
    servidor_http, base = _levantar()
    try:
        peticion = urllib.request.Request(
            f"{base}/generar",
            data=b"esto no es json",
            headers={"Content-Type": "application/json"},
        )
        try:
            with urllib.request.urlopen(peticion, timeout=8) as respuesta:
                estado = respuesta.status
        except urllib.error.HTTPError as error:
            estado = error.code
        assert estado == 400
    finally:
        _parar(servidor_http)


def main() -> int:
    pruebas = [
        valor
        for nombre, valor in sorted(globals().items())
        if nombre.startswith("test_") and callable(valor)
    ]
    fallos = 0
    for prueba in pruebas:
        try:
            prueba()
            print(f"✓ {prueba.__name__}")
        except Exception as error:  # noqa: BLE001 — el resumen es el contrato
            fallos += 1
            print(f"✗ {prueba.__name__}: {error}")
    print(f"\nResultado: {len(pruebas) - fallos}/{len(pruebas)} pruebas pasaron")
    print("Test Files … passed" if fallos == 0 else "Test Files … failed")
    return 0 if fallos == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
