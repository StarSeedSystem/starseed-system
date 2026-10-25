# -*- coding: utf-8 -*-
"""Pruebas del extractor web (INV1025C): sin red, sin librería y sin esperas.

El grafo, la red, el resolver y el reloj son falsos e inyectados. Se
comprueban SSRF, robots.txt, noai (cabecera y meta), la pausa por dominio,
la telemetría apagada (R9), el esquema inválido y el token del servicio.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import pytest

import extractor_web as E
import lector_cortes as L

PUBLICA = "93.184.216.34"
ESQUINAS = {"127.0.0.1": "127.0.0.1", "10.interno.test": "10.1.2.3",
            "169.254.169.254": "169.254.169.254"}
ROBOTS_ABIERTO = b"User-agent: *\nDisallow: /privado/\n"
ROBOTS_CERRADO = b"User-agent: *\nDisallow: /\n"


def respuesta(status=200, cabeceras=None,
              cuerpo=b"<html><p>hola</p></html>"):
    cabeceras = {"Content-Type": "text/html; charset=utf-8", **(cabeceras or {})}
    return {"status": status, "cabeceras": cabeceras, "cuerpo": cuerpo}


class RedFalsa:
    """obtener falso: respuesta fija por URL y registro de lo pedido."""

    def __init__(self, respuestas=None):
        self.respuestas = respuestas or {}
        self.peticiones = []

    def __call__(self, url):
        self.peticiones.append(url)
        salido = self.respuestas.get(url)
        return salido() if callable(salido) else salido


class RelojFalso:
    """Reloj que avanza 1 s en cada llamada, para medir la pausa."""

    def __init__(self):
        self.ahora = 0.0

    def __call__(self):
        self.ahora += 1.0
        return self.ahora


class GrafoFalso:
    """SmartScraperGraph falso: run() devuelve los datos que le den."""

    def __init__(self, datos):
        self.datos = datos

    def run(self):
        return self.datos


def resolver_falso(host, puerto=None):
    return [(2, 1, 6, "", (ESQUINAS.get(host, PUBLICA), 0))]


def crear_ctx(red, esperas=None, grafo=None, reloj=None):
    """ctx del extractor con lector cortés inyectado y grafo falso opcionales."""
    esperas = esperas if esperas is not None else []
    lector = L.crear_contexto(red, resolver=resolver_falso,
                              dormir=esperas.append, reloj=reloj or RelojFalso())
    c = {"lector": lector}
    if grafo is not None:
        c["fabrica_grafo"] = grafo
    return c


# ---------- lector_cortes ----------

@pytest.mark.parametrize("url,motivo", [
    ("ftp://ejemplo.test/pag", "esquema"),
    ("http://127.0.0.1/pag", "ssrf"),
    ("http://10.interno.test/pag", "ssrf"),
    ("http://169.254.169.254/latest/meta-data", "ssrf"),
    ("http://", "host"),
])
def test_ssrf_y_esquemas_prohibidos(url, motivo):
    red = RedFalsa()
    salida = L.leer(url, crear_ctx(red).get("lector"))
    assert salida["ok"] is False
    assert salida["bloqueado_por"] == motivo
    assert red.peticiones == []


def _sitio(robots=ROBOTS_ABIERTO, pagina=None):
    """Red falsa de ejemplo.test: robots.txt y la página con lo que digan."""
    red = RedFalsa({
        "https://ejemplo.test/robots.txt": respuesta(200, {}, robots),
        "https://ejemplo.test/pag": pagina or respuesta(),
    })
    return red


def test_robots_prohibe_antes_de_pedir():
    esperas = []
    red = _sitio(robots=ROBOTS_CERRADO)
    salida = L.leer("https://ejemplo.test/pag", crear_ctx(red, esperas)["lector"])
    assert salida["bloqueado_por"] == "robots" and salida["ok"] is False
    assert red.peticiones == ["https://ejemplo.test/robots.txt"]
    assert red.peticiones.count("https://ejemplo.test/robots.txt") == 1


def test_ok_con_y_sin_noai():
    red = _sitio()
    salida = L.leer("https://ejemplo.test/pag", crear_ctx(red)["lector"])
    assert salida["ok"] is True
    assert salida["bytes"] == len(salida["html"])
    assert salida["bloqueado_por"] is None
    meta_noai = respuesta(
        cuerpo=b"<html><meta name=\"robots\" content=\"noai, nofollow\"></html>")
    noimageai = respuesta(
        cabeceras={"Content-Type": "text/html; charset=utf-8",
                   "X-Robots-Tag": "noimageai"})
    casos = [(_sitio(pagina=meta_noai), "noai"), (_sitio(pagina=noimageai), "noimageai")]
    for red, prohibida in casos:
        salida = L.leer("https://ejemplo.test/pag", crear_ctx(red)["lector"])
        assert salida["bloqueado_por"] == prohibida
        assert salida["html"] is None


def test_pausa_por_dominio():
    esperas = []
    reloj = RelojFalso()
    red = _sitio()
    ctx_ = crear_ctx(red, esperas, reloj=reloj)["lector"]
    L.leer("https://ejemplo.test/pag", ctx_)
    L.leer("https://ejemplo.test/pag", ctx_)
    red_otra = RedFalsa({
        "https://otra.test/robots.txt": respuesta(200, {}, ROBOTS_ABIERTO),
        "https://otra.test/pag": respuesta(),
    })
    ctx_ = crear_ctx(red_otra, esperas)["lector"]
    L.leer("https://otra.test/pag", ctx_)
    assert esperas == [0.0, 9.0, 0.0]


def test_redireccion_se_sigue_y_se_vuelve_a_revisar():
    red = _sitio(pagina=respuesta(301, {"Location": "/destino"}))
    red.respuestas["https://ejemplo.test/destino"] = \
        respuesta(cuerpo=b"<html>destino</html>")
    salida = L.leer("https://ejemplo.test/pag", crear_ctx(red)["lector"])
    assert salida["ok"] is True
    assert salida["url_final"] == "https://ejemplo.test/destino"
    interna = _sitio(pagina=respuesta(302, {"Location": "http://127.0.0.1/x"}))
    salida = L.leer("https://ejemplo.test/pag", crear_ctx(interna)["lector"])
    assert salida["ok"] is False
    assert salida["bloqueado_por"] == "redireccion"


# ---------- extractor_web ----------

def test_telemetria_encendida_rechaza():
    previo = os.environ.get("SCRAPEGRAPHAI_TELEMETRY_ENABLED")
    os.environ["SCRAPEGRAPHAI_TELEMETRY_ENABLED"] = "true"
    try:
        salida = E.extraer({"html": "<p>x</p>", "prompt": "resumen"})
    finally:
        os.environ["SCRAPEGRAPHAI_TELEMETRY_ENABLED"] = previo or "false"
    assert salida == {"ok": False, "motivo": "telemetria"}


def test_extraer_ok_con_grafo_falso():
    red = _sitio()
    grafo = lambda prompt, html, config: GrafoFalso({"titulo": "Hola"})  # noqa: E731
    salida = E.extraer({"url": "https://ejemplo.test/pag", "prompt": "dame el título"},
                       crear_ctx(red, grafo=grafo))
    assert salida["ok"] is True
    assert salida["url_final"] == "https://ejemplo.test/pag"
    assert "Hola" in salida["datos"]
    assert salida["bytes"] <= E.TOPE_RESULTADO


def test_esquema_invalido():
    esquema = {"type": "object", "required": ["titulo"],
               "properties": {"titulo": {"type": "string"}}}
    malo = lambda prompt, html, config: GrafoFalso({"titulo": 1})  # noqa: E731
    salida = E.extraer({"html": "<p>x</p>", "prompt": "título", "esquema": esquema},
                       {"fabrica_grafo": malo})
    assert salida["ok"] is False and salida["motivo"] == "esquema"

    bueno = lambda prompt, html, config: GrafoFalso({"titulo": "hola"})  # noqa: E731
    salida = E.extraer({"html": "<p>x</p>", "prompt": "título", "esquema": esquema},
                       {"fabrica_grafo": bueno})
    assert salida["ok"] is True


def test_sin_libreria_da_pista():
    salida = E.extraer({"html": "<p>x</p>", "prompt": "título"},
                       {"fabrica_grafo": lambda *args: None})
    assert salida["ok"] is False and salida["motivo"] == "sin-libreria"
    assert salida["hint"] == E.HINT_INSTALAR


def test_token_bearer():
    token = "secreto-123"
    assert E.autorizado("Bearer secreto-123", token) is True
    assert E.autorizado("Bearer otro", token) is False
    assert E.autorizado("Basic secreto-123", token) is False
    assert E.autorizado(None, token) is False
    assert E.autorizado("Bearer secreto-123", "") is False


def test_entrada_vacia_no_pide_titulo():
    salida = E.extraer({}, None)
    assert salida["ok"] is False and salida["motivo"] == "entrada"




