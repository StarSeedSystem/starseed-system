#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# fmt: off
"""Extractor web local del OS (Ola 1025R · INV1025C).

ScrapeGraphAI convierte en datos un HTML ya leído con cortesía por
`lector_cortes` (R4). No usa sus cargadores, proxys ni sigilo; la telemetría
queda apagada antes de importar (R9). La clave solo sale de variables de
entorno. Uso: `python3 extractor_web.py serve --puerto 8793` (loopback).
"""
import os
if os.environ.get("SCRAPEGRAPHAI_TELEMETRY_ENABLED", "").strip().lower() not in {"", "false", "0", "no", "off"}:
    raise RuntimeError("SCRAPEGRAPHAI_TELEMETRY_ENABLED debe ser 'false' (R9: cero telemetría)")
os.environ["SCRAPEGRAPHAI_TELEMETRY_ENABLED"] = "false"
import argparse, hmac, json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import lector_cortes
MAX_BYTES = 20 * 1024
HINT_VENV = "python3 -m venv ~/.starseed/venvs/scrapegraph && ~/.starseed/venvs/scrapegraph/bin/pip install 'scrapegraphai==2.3.1'"
class _FaltaScrapeGraph(Exception): pass
def _config_modelo(modelo=None):
    """Modelo del servidor de IA del OS: base_url, nombre y clave solo por entorno."""
    nombre = str(modelo or os.environ.get("STARSEED_EXTRACTOR_MODEL", "") or "openai/local").strip()
    if "/" not in nombre: nombre = f"openai/{nombre}"
    config = {"llm": {"model": nombre, "model_tokens": int(os.environ.get("STARSEED_EXTRACTOR_MODEL_TOKENS", "8192"))}}
    base, clave = os.environ.get("STARSEED_EXTRACTOR_BASE_URL", "").strip(), os.environ.get("STARSEED_EXTRACTOR_API_KEY", "")
    if base: config["llm"]["base_url"] = base
    if clave: config["llm"]["api_key"] = clave
    return config
def _grafo(prompt, fuente, config, ctx):
    """Fábrica inyectable; el HTML entra como texto y cae en la entrada `local_dir`."""
    fabrica = ctx.get("grafo")
    if fabrica: return fabrica(prompt, fuente, config)
    if fuente.startswith("http"): fuente = "\n" + fuente
    try: from scrapegraphai.graphs import SmartScraperGraph
    except ImportError as error: raise _FaltaScrapeGraph() from error
    return SmartScraperGraph(prompt=prompt, source=fuente, config=config)
def _validar_esquema(datos, esquema):
    if esquema is None: return ""
    try: import jsonschema
    except ImportError: return "jsonschema no instalada"
    try: jsonschema.validate(instance=datos, schema=esquema)
    except Exception as error: return str(getattr(error, "message", error))[:300]
    return ""
def _serializar(datos):
    return json.dumps(datos, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
def _podar(valor, corte, maximo):
    if isinstance(valor, str): return valor[:corte]
    if isinstance(valor, list): return [_podar(v, corte, maximo) for v in valor[:maximo]]
    if isinstance(valor, dict): return {str(k)[:corte]: _podar(v, corte, maximo) for k, v in list(valor.items())[:maximo]}
    return valor
def _recortar(datos):
    """Recorta el JSON hasta 20 KB sin romperlo."""
    try: texto = _serializar(datos)
    except (TypeError, ValueError): return {"ok": False, "error": "resultado-no-json"}
    if len(texto) <= MAX_BYTES: return {"ok": True, "datos": datos, "bytes": len(texto)}
    for corte, elementos in ((2000, 50), (500, 20), (120, 10), (40, 5), (0, 1)):
        recortado = _podar(datos, corte, elementos)
        try: texto = _serializar(recortado)
        except (TypeError, ValueError): return {"ok": False, "error": "resultado-no-json"}
        if len(texto) <= MAX_BYTES: return {"ok": True, "datos": recortado, "bytes": len(texto), "recortado": True}
    return {"ok": False, "error": "resultado-grande"}
def extraer(entrada, ctx=None):
    """Extrae {url|html, prompt, esquema?}; con url lee SOLO con `lector_cortes`."""
    ctx = ctx or {}
    if not isinstance(entrada, dict): return {"ok": False, "error": "entrada"}
    prompt = str(entrada.get("prompt") or "").strip()
    if not prompt: return {"ok": False, "error": "falta-prompt"}
    if entrada.get("url"):
        lectura = lector_cortes.leer(entrada["url"], ctx.get("lector") or ctx)
        if not lectura.get("ok"): return {"ok": False, "error": "lectura", "bloqueado_por": lectura.get("bloqueado_por")}
        fuente = lectura.get("html") or ""
    elif entrada.get("html") is not None: fuente = entrada["html"]
    else: return {"ok": False, "error": "falta-fuente"}
    if not isinstance(fuente, str) or not fuente.strip(): return {"ok": False, "error": "fuente-vacia"}
    try: config = ctx.get("config") or _config_modelo(ctx.get("modelo"))
    except (TypeError, ValueError) as error: return {"ok": False, "error": str(error)}
    try: resultado = _grafo(prompt, fuente, config, ctx).run()
    except _FaltaScrapeGraph: return {"ok": False, "hint": HINT_VENV}
    except Exception as error: return {"ok": False, "error": "extraccion", "detalle": str(error)[:300]}
    fallo = _validar_esquema(resultado, entrada.get("esquema"))
    if fallo: return {"ok": False, "error": "esquema", "detalle": fallo}
    return _recortar(resultado)
def autorizado(cabecera, token):
    """True solo con `Authorization: Bearer <token>` exacto."""
    if not token: return False
    return hmac.compare_digest(str(cabecera or "").strip(), f"Bearer {token}")
class _Manejador(BaseHTTPRequestHandler):
    token = ""
    def log_message(self, format, *args): pass
    def _json(self, codigo, datos):
        cuerpo = json.dumps(datos, ensure_ascii=False).encode("utf-8")
        self.send_response(codigo); self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(cuerpo))); self.end_headers(); self.wfile.write(cuerpo)
    def do_GET(self):
        if self.path.split("?", 1)[0] == "/salud": return self._json(200, {"ok": True, "servicio": "extractor-web"})
        return self._json(404, {"ok": False, "error": "ruta"})
    def do_POST(self):
        if self.path.split("?", 1)[0] != "/extraer": return self._json(404, {"ok": False, "error": "ruta"})
        if not autorizado(self.headers.get("Authorization", ""), self.token): return self._json(401, {"ok": False, "error": "token"})
        try: largo = int(self.headers.get("Content-Length", "0") or 0)
        except ValueError: largo = 0
        if largo <= 0 or largo > lector_cortes.MAX_BYTES: return self._json(413, {"ok": False, "error": "tamano"})
        try: entrada = json.loads(self.rfile.read(largo).decode("utf-8"))
        except (ValueError, UnicodeDecodeError): return self._json(400, {"ok": False, "error": "json"})
        return self._json(200, extraer(entrada))
def servir(puerto=8793):
    """Levanta el servicio solo en loopback; exige token de entorno."""
    token = os.environ.get("STARSEED_EXTRACTOR_TOKEN", "").strip()
    if not token: raise SystemExit("falta STARSEED_EXTRACTOR_TOKEN")
    _Manejador.token = token
    ThreadingHTTPServer(("127.0.0.1", int(puerto)), _Manejador).serve_forever()
def main(argv=None):
    analizador = argparse.ArgumentParser(description="Extractor web local de StarSeed OS")
    analizador.add_argument("modo", choices=("serve",)); analizador.add_argument("--puerto", type=int, default=8793)
    servir(analizador.parse_args(argv).puerto)
if __name__ == "__main__": main()
