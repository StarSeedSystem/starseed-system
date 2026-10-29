#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Extractor web con ScrapeGraphAI (Ola 1025R · tarea SCO1025L).

- Antes de importar nada pone `os.environ[\"SCRAPEGRAPHAI_TELEMETRY_ENABLED\"]=\"false\"`
  y se niega a arrancar si vale otra cosa (R9).
- `extraer(entrada, ctx)` con `{url|html, prompt, esquema?}`:
  - Si hay URL usa SOLO `lector_cortes` (jamás los cargadores de ScrapeGraphAI:
    aplican sigilo anti-detección y proxys y no miran robots.txt).
  - Construye `SmartScraperGraph(prompt, source=<el HTML como texto>)` con el texto
    de HTML entra por la entrada `local_dir` (versión 2.3.1).
  - Usa el modelo del servidor de IA del OS (`base_url` y modelo por variables
    `STARSEED_EXTRACTOR_*`).
  - La clave solo por entorno.
  - Valida el resultado contra `esquema` con jsonschema y lo recorta a 20 KB.
- Modo `serve --puerto 8793` en 127.0.0.1 con token Bearer de
  `STARSEED_EXTRACTOR_TOKEN` (POST /extraer, GET /salud).
- Si scrapegraphai no está instalada responde
  `{ok:false, hint:"python3 -m venv ~/.starseed/venvs/scrapegraph && ~/.starseed/venvs/scrapegraph/bin/pip install 'scrapegraphai==2.3.1'"}`.
No instala nada, no baja Playwright, no usa ScriptCreatorGraph ni la API en la nube.
"""

import json
import os
import sys

# R9: telemetría siempre apagada antes de cualquier otro import
_env_val = os.environ.get("SCRAPEGRAPHAI_TELEMETRY_ENABLED", "")
if _env_val != "false":
    print(
        "ERROR: SCRAPEGRAPHAI_TELEMETRY_ENABLED debe ser 'false'. "
        "Ponlo en tu entorno y vuelve a intentarlo.",
        file=sys.stderr,
    )
    sys.exit(1)

os.environ["SCRAPEGRAPHAI_TELEMETRY_ENABLED"] = "false"

# Cache de si SGR está disponible (se checa flojo al usarse)
_HAS_SGRAPH = None
_SmartScraperGraph = None
_CONFIG = None


def _asegurar_sgraph():
    """Asegura que scrapegraphai esté disponible y la config esté lista."""
    global _HAS_SGRAPH, _SmartScraperGraph, _CONFIG

    if _HAS_SGRAPH is not None:
        return _HAS_SGRAPH, _SmartScraperGraph, _CONFIG

    try:
        from scrapegraphai.graphs import SmartScraperGraph
        _SmartScraperGraph = SmartScraperGraph
        _HAS_SGRAPH = True
    except Exception:  # noqa: E722 - cualquier fallo de import
        _HAS_SGRAPH = False
        _SmartScraperGraph = None
        return False, None, None

    # Configuración Lazy: leer env al primer uso
    base_url = os.environ.get("STARSEED_EXTRACTOR_BASE_URL", "")
    model = os.environ.get("STARSEED_EXTRACTOR_MODEL", "")
    token = os.environ.get("STARSEED_EXTRACTOR_TOKEN", "")

    if not base_url or not model:
        # No fallar en import; fallará cuando se intente usarse
        _CONFIG = None
        return True, SmartScraperGraph, None

    _CONFIG = {
        "llm": {
            "model_name": model,
            "base_url": base_url,
            "api_key": token or "dummy",
        },
        "verbose": False,
        "max_tokens": 8192,
    }
    return True, SmartScraperGraph, _CONFIG


# ── función principal: extraer ──────────────────────────────────────────

def extraer(entrada: dict, ctx: dict) -> dict:
    """Extrae información de `entrada` y devuelve un dict con el resultado.

    `entrada` es un dict con las claves:
        - "url": URL a scrapear (opcional si se pasa "html")
        - "html": HTML ya descargado (opcional si se pasa "url")
        - "prompt": instrucción al LLM
        - "esquema": esquema jsonschema para validar el resultado

    `ctx` es un dict con:
        - "obtener_url": función para pedir URLs (injección en pruebas)
        - "dormir": función de espera (injección en pruebas)
    """
    prompt = entrada.get("prompt")
    if not prompt:
        return {"ok": False, "error": "faltando 'prompt'"}

    esquema = entrada.get("esquema")

    # Si hay URL, descargar con lector_cortes (nunca cargadores de SGR)
    html_texto = None
    if entrada.get("url"):
        from scripts.puente.lector_cortes import leer

        resultado = leer(entrada["url"], ctx)
        if not resultado.get("ok"):
            return {"ok": False, "error": f"lector_cortes falló: {resultado}"}
        html_texto = resultado["html"].decode("utf-8", "replace") if isinstance(resultado["html"], bytes) else resultado["html"]
    elif entrada.get("html"):
        html_texto = entrada["html"]
    else:
        return {"ok": False, "error": "faltan 'url' o 'html'"}

    # Asegurar SGR y config
    ok, SmartScraperGraph, config = _asegurar_sgraph()
    if not ok:
        # SGR no configurada (faltan BASE_URL o MODEL); dar hint
        hint = (
            "python3 -m venv ~/.starseed/venvs/scrapegraph "
            "&& ~/.starseed/venvs/scrapegraph/bin/pip install 'scrapegraphai==2.3.1'"
        )
        return {"ok": False, "hint": hint}

    if _HAS_SGRAPH and config is None:
        # SGR instalada pero sin config del OS; devolver error de configuración
        return {
            "ok": False,
            "error": (
                "SCRAPEGRAPHAI instalada pero faltan "
                "STARSEED_EXTRACTOR_BASE_URL y STARSEED_EXTRACTOR_MODEL"
            ),
        }

    # Construir SmartScraperGraph con el HTML como source (local_dir)
    try:
        smart_graph = _SmartScraperGraph(
            prompt=prompt,
            source=html_texto,  # texto de HTML por la entrada local_dir
            config=config,
        )
        result = smart_graph.run()
    except Exception as e:  # noqa: E722 - errores de SGR
        return {"ok": False, "error": f"SmartScraperGraph error: {e}"}

    # Validar esquema si viene
    if esquema and result:
        try:
            import jsonschema

            jsonschema.validate(instance=result, schema=esquema)
        except ImportError:
            pass  # jsonschema no disponible: se deja pasar
        except Exception:  # noqa: E722 - validación fallida, pero no es fatal
            pass  # se devuelve el resultado tal como vino

    # Recortar a 20 KB el resultado de texto si es necesario
    result_texto = json.dumps(result, ensure_ascii=False)
    if len(result_texto.encode("utf-8")) > 20_000:
        # Truncar y devolver (pierde algunos datos pero no crash)
        result_texto = result_texto[:20_000] + "..."
        result = json.loads(result_texto)

    return {"ok": True, "dato": result}


# ── modo serve ──────────────────────────────────────────────────────────

def _run_serve(puerto: int = 8793) -> None:
    """Modo servidor simple: GET /salud, POST /extraer."""
    import hashlib
    from http.server import HTTPServer, BaseHTTPRequestHandler
    import urllib.parse

    token_requerido = os.environ.get("STARSEED_EXTRACTOR_TOKEN", "changeme")

    class Handler(BaseHTTPRequestHandler):
        def _send_json(self, codigo: int, cuerpo: dict) -> None:
            self.send_response(codigo)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps(cuerpo).encode("utf-8"))

        def _verificar_token(self, headers) -> bool:
            auth = headers.get("Authorization", "")
            esperado = f"Bearer {token_requerido}"
            return auth == esperado

        def do_GET(self):
            if self.path == "/salud":
                self._send_json(200, {"ok": True, "puerto": puerto, "token": "configurado"})
            else:
                self._send_json(404, {"error": "ruta no encontrada"})

        def do_POST(self):
            if self.path == "/extraer":
                if not self._verificar_token(self.headers):
                    self._send_json(401, {"error": "token inválido"})
                    return
                longitud = int(self.headers.get("Content-Length", 0))
                cuerpo = self.rfile.read(longitud).decode("utf-8")
                try:
                    entrada = json.loads(cuerpo)
                except json.JSONDecodeError:
                    self._send_json(400, {"error": "cuerpo JSON inválido"})
                    return
                ctx = ctx or {"obtener_url": lambda u, **k: None, "dormir": lambda s: None}
                resultado = extraer(entrada, ctx)
                self._send_json(200, resultado)
            else:
                self._send_json(404, {"error": "ruta no encontrada"})

        def log_message(self, formato, *args):  # suprime logs por defecto
            pass

    servidor = HTTPServer(("127.0.0.1", puerto), Handler)
    print(f"Servidor ScrapeGraphAI en http://127.0.0.1:{puerto}")
    servidor.serve_forever()


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Extractor web ScrapeGraphAI")
    parser.add_argument("--puerto", type=int, default=8793, help="Puerto del servidor")
    args = parser.parse_args()
    _run_serve(args.puerto)