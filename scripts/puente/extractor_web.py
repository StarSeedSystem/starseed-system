#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Extractor web local (INV1025C · Ola 1025R): ScrapeGraphAI en caja, sin nube ni telemetría (R9).

Recibe {url | html, prompt, esquema?} y extrae datos con un modelo LOCAL (Ollama u otro
servidor OpenAI-compatible declarado en STARSEED_EXTRACTOR_*). La URL solo se lee por
`lector_cortes.leer` —R4 vive ahí— y su HTML entra al grafo como texto (input_key
«local_dir» de ScrapeGraphAI, que no toca la red por su cuenta). Telemetría apagada
ANTES de importar la librería: solo `SCRAPEGRAPHAI_TELEMETRY_ENABLED=false` (si el
entorno la declara en abierto, en rojo; si no, se fija). Si la librería no está, la
respuesta no es un muro: es la receta exacta del venv para instalar v2.3.1.

El resultado de la extracción se valida con jsonschema ANTES de recortarse a 20 KB por
poda recursiva de folios —nada de truncar a garrotazos hilos de texto—. Respuesta:
{ok, respuesta, truncado, mantenido}. Serve opcional:
`python3 scripts/puente/extractor_web.py serve --puerto 8793` (solo 127.0.0.1;
POST /extraer exige Bearer con STARSEED_EXTRACTOR_TOKEN, GET /salud libre).

Ejemplos:
  python3 - <<'PY'
  import sys; sys.path.insert(0, "scripts/puente")
  from extractor_web import extraer
  print(extraer({"url": "https://example.com", "prompt": "título de la página"}, {}))
  PY
"""

import argparse
import http.server
import json
import os
import re
import sys

from lector_cortes import crear_ctx as _ctx_lector
from lector_cortes import leer as _leer_cortes


def _env_llave(nombre):
    return os.environ.get(nombre) or ""


_TELES = "SCRAPEGRAPHAI_TELEMETRY_ENABLED"

if (_env_llave(_TELES) or "").strip().lower() not in ("", "false", "0", "no", "off"):
    raise RuntimeError(
        "Telemetría censada en el entorno: %s='%s'. Caja cerrada (R9): "
        "bórrala o declárala en 'false' antes de arrancar el extractor." % (_TELES, _env_llave(_TELES)))

os.environ[_TELES] = "false"

HINT_INSTALAR = (
    "python3 -m venv ~/.starseed/venvs/scrapegraph && "
    "~/.starseed/venvs/scrapegraph/bin/pip install 'scrapegraphai==2.3.1'"
)

TOPE_RESPUESTA = 20 * 1024
TOPE_PETICION_HTTP = 2 * 1024 * 1024


def _config_llm():
    """{llm, embedder} para SmartScraperGraph desde las tres variables del OS; None si falta
    alguna (el modelo corre donde mande el OS, nunca en la nube del proveedor)."""
    base = _env_llave("STARSEED_EXTRACTOR_BASE_URL")
    modelo = _env_llave("STARSEED_EXTRACTOR_MODEL")
    api = _env_llave("STARSEED_EXTRACTOR_API_KEY")
    if not (base and modelo):
        return None
    return {"llm": {"model_name": modelo, "base_url": base, "api_key": api or None},
            "embedder": {"model_name": modelo, "base_url": base, "api_key": api or None}}


def _crear_grapho(prompt, texto, config, ctx):
    """SmartScraperGraph con import perezoso (importlib, entro solo si el OS ya puso la
    caja) y fuente local_dir: si la librería no está, se devuelve (None, "instalar"); su
    telemetría ya se apagó al cargar este módulo."""
    try:
        import importlib
        modulo = importlib.import_module("scrapegraphai.graphs")
        clase = getattr(modulo, "SmartScraperGraph")
    except ImportError:
        return None, "instalar"
    return clase(prompt=prompt, source=texto, config=config), ""


def _a_datos(salida):
    """El .run() del grafo a datos: str JSON → dict, otra frase → {respuesta: texto}, resto
    tal cual; error/None → None."""
    if salida is None:
        return None
    if isinstance(salida, str):
        try:
            return json.loads(salida)
        except ValueError:
            return {"respuesta": salida}
    return salida


def _pelar_textos(dato, techo):
    """Texto a un trozo de techo caracteres; si da igual, cadena vacía —cada folio dentro
    de un respetado—."""
    if not isinstance(dato, str):
        return dato
    if len(dato) <= techo:
        return dato
    return dato[:techo].rstrip()


def _recortar(dato, techo):
    """Poda recursiva: los textos largos se pellan a «techo» caracteres y lo demás se pasa
    tal cual; dict, list y árboles que aniden se waterlinean depth-first, sin derrame."""
    if isinstance(dato, dict):
        return {clave: _recortar(valor, techo) for clave, valor in dato.items()}
    if isinstance(dato, list):
        return [_recortar(rama, techo) for rama in dato]
    if isinstance(dato, str):
        return _pelar_textos(dato, techo)
    return dato


def _con_techo(dato,_bytes=None):
    """El dato con «bytes» bajo el cupo: se prueba a JSON-serializarlo con techos de podas
    menguantes (4096… 16); si ni a 4 llega, se seca ({}, "{}", False)."""
    for techo in (4096, 2048, 1024, 512, 256, 128, 64, 32, 16, 8, 4, 2, 1):
        cubo = json.dumps(_recortar(dato, techo), ensure_ascii=False, default=str)
        if len(cubo.encode("utf-8")) <= TOPE_RESPUESTA:
            return cubo, True
    return "{}", False


def _entrada_valida(entrada):
    """Texto a extraer y prompt, y nada más: {url} o {html} (uno de los dos) + prompt."""
    if not isinstance(entrada, dict):
        return None
    url = entrada.get("url")
    html = entrada.get("html")
    prompt = entrada.get("prompt")
    if not isinstance(prompt, str) or not prompt.strip():
        return None
    if bool(isinstance(url, str) and url.strip()) != bool(isinstance(html, str) and html.strip()):
        return entrada
    return None


def _leer(url, ctx):
    """La URL SE LEE SOLO con lector_cortes (R4); ctx["leer"] la sustituye en pruebas
    y ctx["lector"] es el ctx reutilizable del lector (hitas de robots y pausas)."""
    dictada = ctx.get("leer")
    if dictada is not None:
        return dictada(url)
    heredado = ctx.get("lector")
    marco = heredado if isinstance(heredado, dict) and heredado else _ctx_lector()
    return _leer_cortes(url, marco)


def extraer(entrada, ctx=None):
    """Extracción local de una página → {ok, respuesta, truncado} | {ok: False, …}.

    entrada: {url | html, prompt, esquema?}; con url, SOLO se lee con lector_cortes
    (R4). Con html en limpio, directo. Telemetría R9 cuidada al módulo y re-verificada
    aquí; sin librería, la respuesta trae el hint exacto del venv; sin caja LLM,
    {"error": "config"}.
    """
    ctx = dict(ctx or {})
    if (os.environ.get(_TELES, "") or "").strip().lower() not in ("", "false", "0", "no", "off"):
        raise RuntimeError("Telemetría en abierto al extraer (R9): %s" % _TELES)
    os.environ[_TELES] = "false"
    entrada = _entrada_valida(entrada)
    if entrada is None:
        return {"ok": False, "error": "entrada"}
    config = _config_llm()
    if config is None:
        return {"ok": False, "error": "config",
                "por": "hacen falta STARSEED_EXTRACTOR_BASE_URL y STARSEED_EXTRACTOR_MODEL"}
    texto = ""
    if isinstance(entrada.get("html"), str):
        texto = entrada["html"]
    else:
        lectura = _leer(entrada["url"], ctx)
        if not lectura.get("ok"):
            salida = {"ok": False, "error": "lectura"}
            if lectura.get("bloqueado_por"):
                salida["bloqueado_por"] = lectura["bloqueado_por"]
            return salida
        texto = lectura["html"]
    grafo, estado = _crear_grapho(entrada["prompt"], texto, config, ctx)
    if grafo is None:
        return {"ok": False, "error": estado, "hint": HINT_INSTALAR}
    try:
        respuesta = _responder(grafo, entrada["prompt"], entrada.get("esquema"))
    except Exception as error:  # noqa: BLE001 — el grafo lleva todo casual
        return {"ok": False, "error": "grafo", "por": str(error)[:300]}
    return respuesta


def _validar_esquema(datos, esquema):
    """El jsonschema (import perezoso) ensuada la respuesta del grafo; se devuelve el texto
    del primer error o cadena vacía si calza."""
    try:
        import jsonschema
    except ImportError:
        return ""
    try:
        jsonschema.validate(datos, esquema)
    except jsonschema.ValidationError as error:
        return error.message
    return ""


def _resumir(datos, prompt):
    """Un vistazo por clave: solo deja los datos cuyas claves asoman en el prompt."""
    if not isinstance(datos, dict):
        return datos
    palabras = {norm.lower() for norm in re.findall(r"\w+", prompt or "")}
    limpio = {}
    for clave, valor in datos.items():
        if any(norm.lower() in palabras for norm in re.findall(r"\w+", str(clave))):
            limpio[clave] = valor
    return limpio or datos


def _responder(grapho, prompt, esquema):
    """Ejecuta el grafo y enrasa la respuesta: datos, validación del esquema ANTES de
    podar y recorte por pulsos menguantes a 20 KB.
    """
    salida = grapho.run()
    datos = _a_datos(salida)
    if datos is None:
        return {"ok": False, "error": "grafo"}
    if esquema:
        defecto = _validar_esquema(datos, esquema)
        if defecto:
            return {"ok": False, "error": "esquema", "por": defecto}
    cubo, asoma = _con_techo(datos)
    return {"ok": True, "respuesta": json.loads(cubo), "truncado": not asoma}


_RAIZ = r"(?P<raiz>.*?)"


def _trae(cuerpo):
    """El JSON del POST {url|html, prompt, esquema?}; None si no es JSON decente o mide
    más de 2 MB."""
    if len(cuerpo) > TOPE_PETICION_HTTP:
        return None
    try:
        return json.loads(cuerpo.decode("utf-8"))
    except (ValueError, UnicodeError):
        return None


class _Ruta(http.server.BaseHTTPRequestHandler):
    """Serve HTTP del extractor: solo 127.0.0.1; /salud sin candado, /extraer con token."""

    def log_message(self, format, *args):  # noqa: A002 — firma de la base, silencio total
        return

    def do_GET(self):
        if self.path == "/salud":
            self._contesta(200, {"ok": True, "servicio": "extractor-web"})
        else:
            self._contesta(404, {"ok": False, "error": "ruta"})

    def do_POST(self):
        if self.path != "/extraer":
            self._contesta(404, {"ok": False, "error": "ruta"})
            return
        token = getattr(self.server, "token", "") or ""
        traido = self.headers.get("Authorization") or ""
        if token and traido != "Bearer " + token:
            self._contesta(401, {"ok": False, "error": "token"})
            return
        largo = int(self.headers.get("Content-Length") or 0)
        entrada = _trae(self.rfile.read(largo))
        if entrada is None:
            self._contesta(400, {"ok": False, "error": "cuerpo"})
            return
        try:
            respuesta = extraer(entrada, getattr(self.server, "ctx", None))
        except RuntimeError as error:
            self._contesta(503, {"ok": False, "error": "telemetria", "por": str(error)})
            return
        self._contesta(200 if respuesta.get("ok") else 409, respuesta)

    def _contesta(self, codigo, payload):
        cubo = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(codigo)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(cubo)))
        self.end_headers()
        self.wfile.write(cubo)


class _Servidor(http.server.ThreadingHTTPServer):
    """ThreadingHTTPServer anclado a 127.0.0.1, con token y ctx a la vista del gestor."""

    token = ""
    ctx = None  # type: dict | None


def construir_servidor(puerto=8793, token=None, ctx=None):
    """Servidor del extractor anclado a 127.0.0.1 (lanzar en un hilo o con serve_forever)."""
    llave = token if token else _env_llave("STARSEED_EXTRACTOR_TOKEN")
    if not llave:
        raise ValueError("Candado exigido: STARSEED_EXTRACTOR_TOKEN o parámetro token")
    servidor = _Servidor(("127.0.0.1", int(puerto)), _Ruta)
    servidor.token = llave
    servidor.ctx = ctx if isinstance(ctx, dict) else {}
    return servidor


def main(argv=None):
    """CLI mínima: «serve» levanta el extractor cerrado en 127.0.0.1."""
    orden = argparse.ArgumentParser(description="Extractor web local del OS")
    sub = orden.add_subparsers(dest="accion")
    sirve = sub.add_parser("serve", help="levanta el extractor en 127.0.0.1")
    sirve.add_argument("--puerto", type=int, default=8793)
    elegido = orden.parse_args(argv)
    if elegido.accion != "serve":
        orden.print_usage(sys.stderr)
        return 2
    servidor = construir_servidor(elegido.puerto)
    print("extractor-web en 127.0.0.1:%d (POST /extraer con Bearer)" % elegido.puerto)
    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        servidor.server_close()
    return 0


if __name__ == "__main__":
    sys.exit(main())

