#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Extractor web local con ScrapeGraphAI, sin sigilo ni telemetría (INV1025C).

Reglas R4 + R9 del contrato (architecture/repos-libreria-1025.md):
- La telemetría de ScrapeGraphAI se apaga ANTES de importar nada; si tras eso
  el valor no es «false», el módulo se niega a arrancar.
- Si hay URL se lee SOLO con `lector_cortes` (robots.txt, pausas, noai, SSRF):
  a ScrapeGraphAI se le entrega el HTML ya leído, jamás sus cargadores, que
  usan sigilo anti-detección, proxys y no miran robots. Ni ScriptCreatorGraph
  ni la API en la nube; no instala nada ni baja Playwright.
- El LLM es el del servidor de IA del OS: base_url y modelo por variables
  STARSEED_EXTRACTOR_*; la clave solo por entorno (nunca en el código).
- Resultado validado con jsonschema contra `esquema` (si lo hay) y recortado
  a 20 KB.

Modo servicio: `python3 -m scripts.puente.extractor_web serve --puerto 8793`
en 127.0.0.1 con token Bearer de STARSEED_EXTRACTOR_TOKEN (POST /extraer,
GET /salud). Si la librería no está instalada responde {ok, hint} con la
orden de instalación en un venv propio, y no instala nada por sí mismo.
"""

import os

os.environ["SCRAPEGRAPHAI_TELEMETRY_ENABLED"] = "false"  # antes de nada

import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from scripts.puente import lector_cortes

HINT_INSTALAR = ("python3 -m venv ~/.starseed/venvs/scrapegraph && "
                 "~/.starseed/venvs/scrapegraph/bin/pip install 'scrapegraphai==2.3.1'")
TOPE_TEXTO = 20 * 1024


def telemetria_ok():
    """R9: solo arranca si la variable quedó a «false» tras fijarla arriba."""
    return os.environ.get("SCRAPEGRAPHAI_TELEMETRY_ENABLED") == "false"


def configuracion_llm():
    """Config del grafo con el servidor de IA del OS; None si falta algo."""
    base = os.environ.get("STARSEED_EXTRACTOR_BASE_URL")
    modelo = os.environ.get("STARSEED_EXTRACTOR_MODELO")
    clave = os.environ.get("STARSEED_EXTRACTOR_CLAVE")
    if not (base and modelo):
        return None
    return {"llm": {"model": modelo, "openai_api_base": base, "openai_api_key": clave},
            "verbose": False}


def _fabrica_real():
    """SmartScraperGraph de la librería instalada, o None si no está."""
    try:
        from scrapegraphai.graphs import SmartScraperGraph
    except ImportError:
        return None
    return lambda prompt, source, config: SmartScraperGraph(
        prompt=prompt, source=source, config=config)


def validar(datos, esquema, validador="jsonschema"):
    """Valida el resultado contra `esquema`; (True, None) o (False, motivo)."""
    if not esquema:
        return True, None
    try:
        import jsonschema
    except ImportError:
        return False, "jsonschema no instalada"
    try:
        jsonschema.validate(datos, esquema)
    except (jsonschema.ValidationError, jsonschema.SchemaError) as fallo:
        return False, str(fallo).splitlines()[0]
    return True, None


def extraer(entrada, grafo_fabrica=None, lector_ctx=None):
    """Extrae datos estructurados de una URL o de un HTML ya leído.

    `entrada` lleva {url | html, prompt, esquema?}. Con url, la lectura es
    siempre del lector cortés (R4). `grafo_fabrica` es inyectable para las
    pruebas puras; si falta y la librería no está instalada se responde hint.
    """
    if not telemetria_ok():
        return {"ok": False, "error": "la telemetría no está apagada (R9)"}
    prompt = (entrada.get("prompt") or "").strip()
    if not prompt:
        return {"ok": False, "error": "falta el prompt"}
    fuente = entrada.get("html")
    if not fuente:
        leido = lector_cortes.leer(entrada.get("url") or "", lector_ctx)
        if not leido.get("ok"):
            return {"ok": False, "error": "lectura bloqueada",
                    "bloqueado_por": leido.get("bloqueado_por")}
        fuente = leido["html"]
    fabrica = grafo_fabrica or _fabrica_real()
    if fabrica is None:
        return {"ok": False, "hint": HINT_INSTALAR}
    config = configuracion_llm()
    if config is None:
        return {"ok": False, "error": "falta STARSEED_EXTRACTOR_BASE_URL o MODELO"}
    try:
        resultado = fabrica(prompt=prompt, source=fuente, config=config).run()
    except Exception as fallo:  # noqa: BLE001 — el servicio responde, no muere
        return {"ok": False, "error": f"el grafo falló: {fallo}"}
    bien, motivo = validar(resultado, entrada.get("esquema"))
    if not bien:
        return {"ok": False, "error": "esquema inválido", "detalle": motivo}
    return {"ok": True, "datos": json.dumps(resultado, ensure_ascii=False)[:TOPE_TEXTO]}


def _estado_extraer(cuerpo, autorizacion, fabrica=None):
    """POST /extraer: token Bearer obligatorio y cuerpo JSON válido."""
    token = os.environ.get("STARSEED_EXTRACTOR_TOKEN")
    if not token:
        return 503, json.dumps({"ok": False, "error": "falta STARSEED_EXTRACTOR_TOKEN"})
    if autorizacion != f"Bearer {token}":
        return 401, json.dumps({"ok": False, "error": "token rechazado"})
    try:
        entrada = json.loads(cuerpo.decode("utf-8"))
    except (ValueError, UnicodeDecodeError):
        return 400, json.dumps({"ok": False, "error": "JSON inválido"})
    return 200, json.dumps(extraer(entrada, grafo_fabrica=fabrica), ensure_ascii=False)


def servir(puerto=8793, fabrica=None, probar=False):
    """Sirve POST /extraer y GET /salud en 127.0.0.1, solo si la telemetría está apagada."""
    if not telemetria_ok():
        print("Extractor: la telemetría no está apagada; no arranca (R9)")
        return 1

    class Trato(BaseHTTPRequestHandler):
        def do_GET(self):
            cuerpo = json.dumps({"ok": True, "servicio": "extraer"}, ensure_ascii=False)
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(cuerpo.encode())))
            self.end_headers()
            self.wfile.write(cuerpo.encode())

        def do_POST(self):
            tope = int(lector_cortes.MAX_BYTES)
            codigo, respuesta = _estado_extraer(self.rfile.read(min(tope, 1 << 20)),
                                                self.headers.get("Authorization"),
                                                fabrica)
            self.send_response(codigo)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(respuesta.encode())))
            self.end_headers()
            self.wfile.write(respuesta.encode())

        def log_message(self, format, *args):  # noqa: A002 — firma de la clase base
            pass  # los tokens no van jamás a un registro

    servidor = ThreadingHTTPServer(("127.0.0.1", puerto), Trato)
    if probar:
        servidor.server_close()
        return 0
    print(f"Extractor en 127.0.0.1:{puerto}")
    servidor.serve_forever()
    return 0


def main(argumentos=None):
    """Punto de entrada: `serve --puerto 8793` (único modo previsto)."""
    import argparse
    parser = argparse.ArgumentParser(description="Extractor web local del OS")
    parser.add_argument("orden", choices=("serve",))
    parser.add_argument("--puerto", type=int, default=8793)
    opciones = parser.parse_args(argumentos)
    return servir(opciones.puerto)


if __name__ == "__main__":
    raise SystemExit(main())
