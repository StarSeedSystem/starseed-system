#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Extractor web (Ola 1025R · INV1025C): ScrapeGraphAI local, cortés y sin sigilo.

R9: pone SCRAPEGRAPHAI_TELEMETRY_ENABLED=false ANTES de importar nada y se
niega a trabajar si en el entorno vivo vale otra cosa. Con una `url` usa SOLO
`lector_cortes` (jamás los cargadores de ScrapeGraphAI: aplican sigilo
anti-detección y proxys y no miran robots.txt, incompatible con R4); con
`html` entra directo. Construye SmartScraperGraph(prompt, source=el HTML como
texto) con el modelo del servidor de IA del OS (base_url y modelo por
STARSEED_EXTRACTOR_*; la clave solo por entorno, R3). Valida el resultado
contra `esquema` con jsonschema y lo recorta a 20 KB. `serve --puerto 8793`
escucha en 127.0.0.1 con Bearer STARSEED_EXTRACTOR_TOKEN (POST /extraer,
GET /salud). Sin Playwright, sin ScriptCreatorGraph, sin API en la nube; sin
librería responde {ok: false, hint: …} sin instalar nada (R10).
"""

import os
os.environ["SCRAPEGRAPHAI_TELEMETRY_ENABLED"] = "false"

import argparse
import json
from http.server import BaseHTTPRequestHandler, HTTPServer

import lector_cortes

HINT_INSTALAR = (
    "python3 -m venv ~/.starseed/venvs/scrapegraph && "
    "~/.starseed/venvs/scrapegraph/bin/pip install 'scrapegraphai==2.3.1'")
TOPE_RESULTADO = 20480


def telemetria_apagada(entorno=None):
    """R9: True solo si en el entorno vivo sigue a false la telemetría."""
    ent = entorno if entorno is not None else os.environ
    return ent.get("SCRAPEGRAPHAI_TELEMETRY_ENABLED") == "false"


def config_llm(entorno=None):
    """Config del grafo: modelo y base_url del servidor de IA del OS (R3)."""
    ent = entorno or os.environ
    return {"llm": {"model": ent.get("STARSEED_EXTRACTOR_MODELO", ""),
                    "base_url": ent.get("STARSEED_EXTRACTOR_BASE_URL", ""),
                    "api_key": ent.get("STARSEED_EXTRACTOR_API_KEY", "")},
            "verbose": False}


def fabrica_grafo(prompt, html, config):
    """SmartScraperGraph real; None si scrapegraphai no está instalada (R10)."""
    try:
        from scrapegraphai.graphs import SmartScraperGraph
    except ImportError:
        return None
    return SmartScraperGraph(prompt=prompt, source=html, config=config)


def valida_esquema(datos, esquema):
    """(True, None) si `datos` cumple el jsonschema `esquema`; (False, motivo)."""
    if esquema is None:
        return (True, None)
    try:
        import jsonschema
    except ImportError:
        return (False, "falta-jsonschema")
    try:
        jsonschema.validate(datos, esquema)
    except jsonschema.ValidationError:
        return (False, "esquema")
    except jsonschema.SchemaError:
        return (False, "esquema-erroneo")
    return (True, None)


def extraer(entrada, ctx=None):
    """De una página pública ya leída con cortesía, JSON estructurado con LLM.

    entrada: {url|html, prompt, esquema?}. ctx inyecta `fabrica_grafo` y el
    `lector` (contexto de lector_cortes) para las pruebas sin red ni librería.
    """
    ctx = dict(ctx or {})
    if not telemetria_apagada():
        return {"ok": False, "motivo": "telemetria"}
    url_final = None
    if entrada.get("url"):
        lectura = lector_cortes.leer(entrada["url"], ctx.get("lector"))
        if not lectura.get("ok"):
            return {"ok": False, "motivo": "no-leido",
                    "bloqueado_por": lectura.get("bloqueado_por")}
        html = lectura.get("html")
        url_final = lectura.get("url_final")
    else:
        html = entrada.get("html")
    if not html or not entrada.get("prompt"):
        return {"ok": False, "motivo": "entrada"}
    grafo = (ctx.get("fabrica_grafo") or fabrica_grafo)(
        entrada["prompt"], html, config_llm())
    if grafo is None:
        return {"ok": False, "motivo": "sin-libreria", "hint": HINT_INSTALAR}
    datos = grafo.run()
    es_valido, motivo = valida_esquema(datos, entrada.get("esquema"))
    if not es_valido:
        return {"ok": False, "motivo": motivo}
    texto = json.dumps(datos, ensure_ascii=False).encode("utf-8")[:TOPE_RESULTADO]
    return {"ok": True, "datos": texto.decode("utf-8", "replace"),
            "bytes": len(texto), "url_final": url_final}


def autorizado(cabecera, token):
    """True solo con «Bearer <token>»; sin token configurado, nada pasa (R3)."""
    trozos = (cabecera or "").strip().split(None, 1)
    return (bool(token) and len(trozos) == 2 and trozos[0].lower() == "bearer"
            and trozos[1].strip() == token)


def crear_handler(token, _extraer=extraer):
    """Manejador del servicio local: GET /salud y POST /extraer en 127.0.0.1."""

    class Manejador(BaseHTTPRequestHandler):
        def _responder(self, codigo, cuerpo):
            datos = json.dumps(cuerpo, ensure_ascii=False).encode("utf-8")
            self.send_response(codigo)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(datos)))
            self.end_headers()
            self.wfile.write(datos)

        def do_GET(self):
            if self.path == "/salud":
                self._responder(200, {"ok": True, "servicio": "extractor-web"})
            else:
                self._responder(404, {"ok": False, "motivo": "ruta"})

        def do_POST(self):
            if self.path != "/extraer":
                self._responder(404, {"ok": False, "motivo": "ruta"})
                return
            if not autorizado(self.headers.get("Authorization"), token):
                self._responder(401, {"ok": False, "motivo": "token"})
                return
            largo = int(self.headers.get("Content-Length") or 0)
            try:
                resultado = _extraer(json.loads(self.rfile.read(largo) or b"{}"))
            except (ValueError, OSError):
                self._responder(400, {"ok": False, "motivo": "entrada-rota"})
                return
            self._responder(200, resultado)

        def log_message(self, formato, *args):
            pass
    return Manejador


def servir(puerto=8793, token=None, _extraer=extraer):
    """Servicio local (127.0.0.1, Bearer); sin token no arranca (R3)."""
    if not token:
        print("Extractor web: falta STARSEED_EXTRACTOR_TOKEN; sin él no arranca.")
        return 1
    servidor = HTTPServer(("127.0.0.1", puerto), crear_handler(token, _extraer))
    print(f"Extractor web en 127.0.0.1:{puerto}")
    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        pass
    return 0


def main(argv=None):
    """Modo consola: `extraer '<entrada json>'` o `serve --puerto 8793`."""
    parser = argparse.ArgumentParser(
        description="Extractor web local (ScrapeGraphAI sobre lector cortés)")
    parser.add_argument("modo", choices=("extraer", "serve"))
    parser.add_argument("entrada", nargs="?",
                        help="JSON con {url|html, prompt, esquema?} (modo extraer)")
    parser.add_argument("--puerto", type=int, default=8793)
    args = parser.parse_args(argv)
    if args.modo == "serve":
        return servir(args.puerto, os.environ.get("STARSEED_EXTRACTOR_TOKEN", ""))
    try:
        entrada = json.loads(args.entrada or "{}")
    except ValueError:
        print("La entrada no es JSON válido")
        return 1
    print(json.dumps(extraer(entrada), ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
