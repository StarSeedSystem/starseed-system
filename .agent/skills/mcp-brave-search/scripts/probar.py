#!/usr/bin/env python3
"""Prueba de extremo a extremo del MCP brave-search del Chat Director (solo lectura)."""
import argparse
import json
import os
import subprocess
import sys
import tempfile
import threading
import time
from http.server import HTTPServer, BaseHTTPRequestHandler
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[4]
MCP = RAIZ / "scripts" / "puente" / "mcp_director.py"
VARIABLES = ("BRAVE_API_KEY", "BRAVE_SEARCH_API_KEY")
HERRAMIENTAS = ("brave_estado", "brave_probar", "brave_buscar")


class FalsoBraveHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path.startswith("/res/v1/web/search"):
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            respuesta = {
                "web": {"results": [
                    {"title": "StarSeed OS", "url": "https://starseed-os.vercel.app", "description": "Sistema Operativo Social Descentralizado"},
                ]}
            }
            self.wfile.write(json.dumps(respuesta).encode("utf-8"))
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, format, *args):
        pass


def _servidor_falso(puerto, listo):
    servidor = HTTPServer(("127.0.0.1", puerto), FalsoBraveHandler)
    listo.set()
    servidor.serve_forever()


def _peticion(ident, metodo, params=None):
    return {"jsonrpc": "2.0", "id": ident, "method": metodo, "params": params or {}}


def _llamada(ident, nombre, argumentos=None):
    return _peticion(ident, "tools/call", {"name": nombre, "arguments": argumentos or {}})


def _configurar(entorno):
    """Configura un servidor HTTP falso para simular Brave Search."""
    entorno = dict(entorno)
    entorno["BRAVE_API_KEY"] = "clave-de-prueba-falsa"
    # Encontrar puerto libre
    import socket
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        puerto = s.getsockname()[1]
    listo = threading.Event()
    hilo = threading.Thread(target=_servidor_falso, args=(puerto, listo), daemon=True)
    hilo.start()
    listo.wait(timeout=2)
    entorno["STARSEED_BRAVE_URL"] = "http://127.0.0.1:%d/res/v1/web/search" % puerto
    return entorno, [entorno["BRAVE_API_KEY"]]


def _respuestas(salida):
    found = {}
    for linea in salida.splitlines():
        try:
            datos = json.loads(linea)
        except json.JSONDecodeError:
            continue
        if isinstance(datos.get("id"), int):
            found[datos["id"]] = datos
    return found


def _texto(respuesta, secretos):
    if not respuesta:
        return "(sin respuesta)"
    if "error" in respuesta:
        return "Error JSON-RPC: %s" % respuesta["error"].get("message")
    resultado = respuesta.get("result", {})
    texto = str(resultado.get("content", [{}])[0].get("text", ""))
    if resultado.get("isError"):
        raise ValueError(texto)
    for valor in secretos:
        if valor:
            texto = texto.replace(valor, "***")
    return texto


def probar(consulta=None, simular=False):
    entorno = dict(os.environ)
    secretos = []
    peticiones = [
        _peticion(1, "initialize", {"protocolVersion": "2025-06-18"}),
        _peticion(2, "tools/list"),
        _llamada(3, "brave_estado"),
        _llamada(4, "brave_probar"),
    ]
    if consulta:
        peticiones.append(_llamada(5, "brave_buscar", {"q": consulta}))
    entrada = "\n".join(json.dumps(p, ensure_ascii=False) for p in peticiones) + "\n"
    if simular:
        entorno, secretos = _configurar(entorno)
    hecho = subprocess.run(
        [sys.executable, str(MCP)], input=entrada, capture_output=True, text=True,
        timeout=30, env=entorno,
    )
    if hecho.returncode != 0:
        raise ValueError("el MCP terminó con %d: %s" % (hecho.returncode, hecho.stderr.strip()))
    respuestas = _respuestas(hecho.stdout)
    if "protocolVersion" not in respuestas.get(1, {}).get("result", {}):
        raise ValueError("initialize no respondió")
    tools = [h["name"] for h in respuestas.get(2, {}).get("result", {}).get("tools", [])]
    for nombre in HERRAMIENTAS:
        if nombre not in tools:
            raise ValueError("falta la herramienta %s" % nombre)
    estado = json.loads(_texto(respuestas.get(3), secretos))
    if not estado.get("configurada"):
        raise ValueError("sin conexión: define %s" % ", ".join(VARIABLES))
    prueba = _texto(respuestas.get(4), secretos)
    if "Conexión OK" not in prueba:
        raise ValueError(prueba)
    lineas = ["MCP brave-search OK · variable=%s · modo=%s" % (estado["variable"], estado["modo"]),
              prueba]
    if consulta:
        lineas.append("Búsqueda: " + _texto(respuestas.get(5), secretos))
    return "\n".join(lineas)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--q", "--consulta", dest="consulta", help="consulta de búsqueda opcional")
    parser.add_argument("--simular", action="store_true",
                        help="prueba el cableado con servidor HTTP falso, sin credenciales reales")
    args = parser.parse_args()
    try:
        print(probar(args.consulta, args.simular))
    except (ValueError, OSError, subprocess.TimeoutExpired) as fallo:
        print("Fallo: %s" % fallo, file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())