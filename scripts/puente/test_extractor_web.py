#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas puras del lector cortés y del extractor (INV1025C).

Sin red ni librería: peticiones, DNS, reloj y grafo de ScrapeGraphAI son
falsos inyectados. Cubren lo exigido: SSOF —perdón, SSRF—, robots.txt,
noai (cabecera y meta), pausa por dominio, telemetría (R9), esquema
inválido con jsonschema y token Bearer del servicio.
"""

import json
import os
import urllib.parse

import pytest

from scripts.puente import extractor_web as ex
from scripts.puente import lector_cortes as le

PAGINA = {"estado": 200, "cabeceras": {"Content-Type": "text/html"},
          "cuerpo": "<html><body>hola</body></html>".encode()}
PUBLICA = ["93.184.216.34"]


class FalsoObtener:
    """Servidor de mentira: robots.txt común y páginas por ruta del URL."""

    def __init__(self, robots=b"", paginas=None):
        self.robots = robots
        self.paginas = paginas or {}
        self.pedidas = []

    def __call__(self, url):
        self.pedidas.append(url)
        if url.endswith("/robots.txt"):
            return {"estado": 200, "cabeceras": {"Content-Type": "text/plain"},
                    "cuerpo": self.robots}
        hallada = self.paginas.get(urllib.parse.urlparse(url).path)
        return hallada if hallada else {"estado": 404, "cabeceras": {}, "cuerpo": b""}


class GrafoFalso:
    """Sustituto de SmartScraperGraph: registra la llamada y responde fijo."""

    ultima: dict = {}

    def __init__(self, prompt, source, config, resultado=None, excepcion=None):
        GrafoFalso.ultima = {"prompt": prompt, "source": source, "config": config}
        self.resultado = {"resumen": "hola"} if resultado is None else resultado
        self.excepcion = excepcion

    def run(self):
        if self.excepcion:
            raise self.excepcion
        return self.resultado


def contexto(obtener, ips=PUBLICA):
    """ctx con DNS y reloj falsos, pausa 0 y estado vacío."""
    dormidos = []
    return {"obtener": obtener, "resolver": lambda h: list(ips),
            "dormir": lambda s: dormidos.append(s), "monotonic": lambda: 0.0,
            "registros": {}, "robots_vistos": {}, "dormidos": dormidos}


@pytest.fixture(autouse=True)
def llm_local():
    """Servidor de IA del OS de mentira: extraer siempre tiene configuración."""
    os.environ["STARSEED_EXTRACTOR_BASE_URL"] = "http://127.0.0.1:8000"
    os.environ["STARSEED_EXTRACTOR_MODELO"] = "prueba-local"
    yield
    for nombre in list(os.environ):
        if nombre.startswith("STARSEED_EXTRACTOR_"):
            os.environ.pop(nombre)


def test_esquemas_y_ssrf():
    for mala in ("ftp://ejemplo.org/a", "file:///etc/passwd"):
        assert le.leer(mala, contexto(FalsoObtener()))["bloqueado_por"] == "esquema"
    for dns in (["127.0.0.1"], ["10.1.2.3"], ["fe80::1"], ["169.254.169.254"], []):
        assert le.leer("https://ejemplo.org/a", contexto(FalsoObtener(), dns
                                                          ))["bloqueado_por"] == "ssrf"


def test_robots_prohibe_y_no_pide_la_pagina():
    mentira = FalsoObtener("User-agent: *\nDisallow: /".encode(), {"/a": PAGINA})
    leido = le.leer("https://ejemplo.org/a", contexto(mentira))
    assert leido["ok"] is False and leido["bloqueado_por"] == "robots"
    assert mentira.pedidas == ["https://ejemplo.org/robots.txt"]


@pytest.mark.parametrize(("llave", "bloqueo"),
                         (("X-Robots-Tag", "noai"), ("X-Robots-Tag", "noindex"),
                          ("X-Robots-Tag", "noimageai"),
                          ("meta", "noai"), ("meta", "noindex"), ("meta", "noimageai")))
def test_noai_cabecera_o_meta(llave, bloqueo):
    if llave == "X-Robots-Tag":
        pagina = {"estado": 200, "cabeceras": {"Content-Type": "text/html", llave: bloqueo},
                  "cuerpo": b"<html></html>"}
    else:
        pagina = {"estado": 200, "cabeceras": {"Content-Type": "text/html"},
                  "cuerpo": f'<meta name="robots" content="{bloqueo}">'.encode()}
    leido = le.leer("https://ejemplo.org/a", contexto(FalsoObtener(b"", {"/a": pagina})))
    assert leido["ok"] is False and leido["bloqueado_por"] == bloqueo


def test_pausa_de_10_segundos_por_dominio():
    mentira = FalsoObtener(b"", {"/a": PAGINA, "/b": PAGINA})
    ctx = contexto(mentira)
    assert le.leer("https://ejemplo.org/a", ctx)["ok"]
    assert le.leer("https://ejemplo.org/b", ctx)["ok"]
    assert ctx["dormidos"] == [0.0, 10.0]  # la de mentira registra la espera pedida
    assert [u for u in mentira.pedidas if "/robots.txt" not in u].__len__() == 2


def test_html_ya_leido_entra_al_grafo():
    mentira = FalsoObtener(b"", {"/a": PAGINA})
    salido = ex.extraer({"url": "https://ejemplo.org/a", "prompt": "p"},
                        lambda **k: GrafoFalso(k["prompt"], k["source"], k["config"]),
                        contexto(mentira))
    assert salido["ok"] is True and json.loads(salido["datos"]) == {"resumen": "hola"}
    assert GrafoFalso.ultima["source"] == PAGINA["cuerpo"].decode()
    assert GrafoFalso.ultima["config"]["llm"]["model"] == "prueba-local"


def test_telemetria_y_hint_sin_libreria():
    os.environ["SCRAPEGRAPHAI_TELEMETRY_ENABLED"] = "true"
    try:
        assert ex.telemetria_ok() is False
        salido = ex.extraer({"url": "https://ejemplo.org/a", "prompt": "p"})
        assert salido["ok"] is False and "telemetría" in salido["error"]
    finally:
        os.environ["SCRAPEGRAPHAI_TELEMETRY_ENABLED"] = "false"
    salido = ex.extraer({"html": "<p>x</p>", "prompt": "p"})
    assert salido["ok"] is False and "venvs/scrapegraph" in salido["hint"]


def test_esquema_invalido_se_rechaza():
    esquema = {"type": "object", "required": ["resumen"],
               "properties": {"resumen": {"type": "string"}}}
    fabrica = lambda **k: GrafoFalso(k["prompt"], k["source"], k["config"])  # noqa: E731
    mal = ex.extraer({"html": "<p>hola</p>", "prompt": "p", "esquema": esquema},
                     lambda **k: GrafoFalso(k["prompt"], k["source"], k["config"],
                                            resultado={"resumen": 5}))
    assert mal["ok"] is False and mal["error"] == "esquema inválido"
    bien = ex.extraer({"html": "<p>hola</p>", "prompt": "p", "esquema": esquema}, fabrica)
    assert bien["ok"] is True
    recortado = ex.extraer({"html": "<p>hola</p>", "prompt": "p"},
                           lambda **k: GrafoFalso(k["prompt"], k["source"], k["config"],
                                                  resultado={"t": "x" * 30000}))
    assert recortado["ok"] is True and len(recortado["datos"]) <= ex.TOPE_TEXTO


def test_token_bearer_del_servicio():
    cuerpo = json.dumps({"html": "<p>hola</p>", "prompt": "p"}).encode()
    os.environ["STARSEED_EXTRACTOR_TOKEN"] = "secreto-del-OS"
    try:
        assert ex._estado_extraer(cuerpo, "Bearer salahuda")[0] == 401
        assert ex._estado_extraer(cuerpo, "Bearer secreto-del-OS")[0] == 200
        codigo, mensaje = ex._estado_extraer(b"{'roto':", "Bearer secreto-del-OS")
        assert codigo == 400 and json.loads(mensaje)["ok"] is False
    finally:
        os.environ.pop("STARSEED_EXTRACTOR_TOKEN", None)
    codigo, mensaje = ex._estado_extraer(cuerpo, "Bearer secreto-del-OS")
    assert codigo == 503 and "TOKEN" in json.loads(mensaje)["error"]
