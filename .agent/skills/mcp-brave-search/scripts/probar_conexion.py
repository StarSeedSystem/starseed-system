#!/usr/bin/env python3
"""Prueba el MCP brave-search por stdio; --simular usa un Brave falso local."""
import argparse
import json
import os
import subprocess
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[4]
SERVIDOR = RAIZ / "scripts" / "puente" / "mcp_director.py"
HERRAMIENTAS = ("brave_estado", "brave_probar", "brave_buscar")
VARIABLES = ("BRAVE_API_KEY", "BRAVE_SEARCH_API_KEY")
CLAVE_FALSA = "clave-falsa-de-prueba"
RUTA_CARPETA = ".agent/skills/mcp-brave-search"
RUTA_ANCLA = RUTA_CARPETA + "/SKILL.md"


class _BraveFalso(BaseHTTPRequestHandler):
    """Responde como el endpoint web de Brave con dos resultados fijos."""

    def do_GET(self):
        cuerpo = json.dumps({"web": {"results": [
            {"title": "StarSeed OS", "url": "https://starseed-os.vercel.app",
             "description": "<b>OS</b> social"},
            {"title": "Documentación", "url": "https://example.org", "description": "texto"},
        ]}}).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(cuerpo)))
        self.end_headers()
        self.wfile.write(cuerpo)

    def log_message(self, format, *args):  # noqa: A002 · firma de la clase base
        pass


def _peticion(ident, metodo, params=None):
    return {"jsonrpc": "2.0", "id": ident, "method": metodo, "params": params or {}}


def _llamada(ident, nombre, argumentos=None):
    return _peticion(ident, "tools/call", {"name": nombre, "arguments": argumentos or {}})


def _texto(respuesta):
    resultado = (respuesta or {}).get("result", {})
    texto = str(resultado.get("content", [{}])[0].get("text", ""))
    if resultado.get("isError"):
        raise ValueError(texto)
    return texto


def _git(raiz, *argumentos):
    return subprocess.run(["git", "-C", str(raiz), *argumentos],
                          capture_output=True, timeout=10)


def estado_rastreo(raiz, ignorado=None, seguido=None):
    """PURA con inyección: si .agent/ ignora la carpeta, da el `git add -f`.

    Un archivo NUEVO bajo `.agent/` no aparece en `git status` (lo tapa el
    .gitignore), así que la nube cerraba la tarea como «sin_cambios». Esta
    comprobación lo hace visible y dice cómo forzar el seguimiento.
    """
    ignorado = ignorado or (lambda r: _git(raiz, "check-ignore", "-q", "--", r).returncode == 0)
    seguido = seguido or (
        lambda r: _git(raiz, "ls-files", "--error-unmatch", "--", r).returncode == 0
    )
    ign, seg = bool(ignorado(RUTA_CARPETA)), bool(seguido(RUTA_ANCLA))
    return {
        "carpeta": RUTA_CARPETA,
        "ignorada": ign,
        "ancla_seguida": seg,
        "comando": None if seg else "git add -f %s" % RUTA_CARPETA,
    }


def _pasos(respuestas, clave, consulta):
    if "protocolVersion" not in respuestas.get(1, {}).get("result", {}):
        raise ValueError("initialize no respondió")
    nombres = [h["name"] for h in respuestas.get(2, {}).get("result", {}).get("tools", [])]
    faltan = [h for h in HERRAMIENTAS if h not in nombres]
    if faltan:
        raise ValueError("faltan herramientas: %s" % ", ".join(faltan))
    estado = json.loads(_texto(respuestas.get(3)))
    if not estado.get("configurada"):
        raise ValueError("sin conexión: define una de %s" % ", ".join(VARIABLES))
    prueba = _texto(respuestas.get(4))
    if "Conexión OK" not in prueba:
        raise ValueError(prueba)
    resultados = json.loads(_texto(respuestas.get(5)))
    if not resultados:
        raise ValueError("la búsqueda no devolvió resultados")
    if not respuestas.get(6, {}).get("result", {}).get("isError"):
        raise ValueError("la búsqueda aceptó una consulta vacía")
    pasos = {
        "initialize": "starseed-director",
        "tools/list": list(HERRAMIENTAS),
        "brave_estado": estado,
        "brave_probar": prueba,
        "brave_buscar": {
            "consulta": consulta,
            "resultados": len(resultados),
            "primero": resultados[0],
        },
        "consulta_vacia": "rechazada",
    }
    if clave and clave in json.dumps(pasos, ensure_ascii=False):
        raise ValueError("la clave apareció en la salida")
    return pasos


def probar(consulta="StarSeed OS", simular=True):
    peticiones = [
        _peticion(1, "initialize", {"protocolVersion": "2025-06-18"}),
        _peticion(2, "tools/list"),
        _llamada(3, "brave_estado"),
        _llamada(4, "brave_probar"),
        _llamada(5, "brave_buscar", {"q": consulta, "limite": 2, "pais": "es"}),
        _llamada(6, "brave_buscar", {"q": ""}),
    ]
    entorno, servidor = dict(os.environ), None
    try:
        if simular:
            servidor = ThreadingHTTPServer(("127.0.0.1", 0), _BraveFalso)
            threading.Thread(target=servidor.serve_forever, daemon=True).start()
            entorno["STARSEED_BRAVE_URL"] = (
                "http://127.0.0.1:%d/res/v1/web/search" % servidor.server_address[1]
            )
            entorno["BRAVE_API_KEY"] = CLAVE_FALSA
            entorno.pop("BRAVE_SEARCH_API_KEY", None)
            entorno["NO_PROXY"] = entorno["no_proxy"] = "127.0.0.1,localhost"
            clave = CLAVE_FALSA
        else:
            clave = next((entorno[v] for v in VARIABLES if (entorno.get(v) or "").strip()), "")
            if not clave:
                raise ValueError("sin conexión: define una de %s" % ", ".join(VARIABLES))
        entrada = "\n".join(json.dumps(p, ensure_ascii=False) for p in peticiones) + "\n"
        hecho = subprocess.run([sys.executable, str(SERVIDOR)], input=entrada,
                               capture_output=True, text=True, timeout=30, env=entorno)
        if hecho.returncode != 0:
            raise ValueError("el MCP terminó con %d: %s" % (
                hecho.returncode, hecho.stderr.strip()))
        encontradas = {}
        for linea in hecho.stdout.splitlines():
            try:
                datos = json.loads(linea)
            except json.JSONDecodeError:
                continue
            if isinstance(datos.get("id"), int):
                encontradas[datos["id"]] = datos
        return _pasos(encontradas, clave, consulta)
    finally:
        if servidor is not None:
            servidor.shutdown()
            servidor.server_close()


def main():
    ap = argparse.ArgumentParser(description=(__doc__ or "Prueba MCP brave-search").splitlines()[0])
    ap.add_argument("--consulta", default="StarSeed OS", help="qué buscar en la prueba")
    ap.add_argument("--simular", action="store_true",
                    help="usa un Brave falso local y una clave de prueba (por defecto)")
    ap.add_argument("--real", action="store_true", help="usa la clave real del entorno")
    ap.add_argument("--rastreo", action="store_true", help="comprueba el seguimiento en git")
    op = ap.parse_args()
    if not SERVIDOR.is_file():
        print(json.dumps({"ok": False, "detalle": "falta %s" % SERVIDOR}, ensure_ascii=False))
        return 1
    if op.rastreo:
        datos = estado_rastreo(RAIZ)
        print(json.dumps(datos, ensure_ascii=False, indent=2))
        return 0 if datos["ancla_seguida"] else 1
    try:
        pasos = probar(op.consulta, simular=op.simular or not op.real)
        print(json.dumps({"ok": True, "pasos": pasos}, ensure_ascii=False, indent=2))
        return 0
    except (ValueError, OSError, subprocess.TimeoutExpired) as fallo:
        print(json.dumps({"ok": False, "detalle": str(fallo)}, ensure_ascii=False))
        return 1


if __name__ == "__main__":
    sys.exit(main())
