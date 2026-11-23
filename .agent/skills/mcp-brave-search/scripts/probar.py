#!/usr/bin/env python3
"""Sonda del MCP brave-search del Chat Director: usa BRAVE_API_KEY/BRAVE_SEARCH_API_KEY.
Con `--simular` levanta un servidor HTTP local (STARSEED_BRAVE_ENDPOINT), verifica
la cabecera X-Subscription-Token y no gasta cuota.
"""

import argparse, json, os, subprocess, sys, threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
RAIZ = Path(__file__).resolve().parents[4]
MCP = RAIZ / "scripts" / "puente" / "mcp_director.py"
HERRAMIENTAS = ("brave_estado", "brave_probar", "brave_buscar")
VARIABLES = ("BRAVE_API_KEY", "BRAVE_SEARCH_API_KEY")
CLAVE_PRUEBA = "clave-de-prueba"
def _llamada(ident, nombre, argumentos=None):
    return {"jsonrpc": "2.0", "id": ident, "method": "tools/call",
            "params": {"name": nombre, "arguments": argumentos or {}}}
def _respuestas(salida):
    encontradas = {}
    for linea in salida.splitlines():
        try:
            datos = json.loads(linea)
        except json.JSONDecodeError:
            continue
        if isinstance(datos.get("id"), int):
            encontradas[datos["id"]] = datos
    return encontradas
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
        texto = texto.replace(valor, "***") if valor else texto
    return texto
class _FalsoBrave(BaseHTTPRequestHandler):
    recibidas = []
    def do_GET(self):
        _FalsoBrave.recibidas.append(
            (self.path, self.headers.get("X-Subscription-Token")))
        resultados = [{"title": "StarSeed OS", "url": "https://starseed-os.vercel.app",
                       "description": "Sistema operativo social descentralizado"}]
        cuerpo = json.dumps({"web": {"results": resultados}}).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(cuerpo)))
        self.end_headers()
        self.wfile.write(cuerpo)
    def log_message(self, format, *args):
        return
def _simular(entorno):
    _FalsoBrave.recibidas.clear()
    servidor = ThreadingHTTPServer(("127.0.0.1", 0), _FalsoBrave)
    threading.Thread(target=servidor.serve_forever, daemon=True).start()
    base = "http://127.0.0.1:%d/res/v1/web/search" % servidor.server_address[1]
    entorno.update({"STARSEED_BRAVE_ENDPOINT": base, "BRAVE_API_KEY": CLAVE_PRUEBA})
    return servidor, [CLAVE_PRUEBA]
def probar(consulta=None, simular=False):
    entorno = dict(os.environ)
    secretos, servidor = [], None
    if simular:
        servidor, secretos = _simular(entorno)
    peticiones = [
        {"jsonrpc": "2.0", "id": 1, "method": "initialize",
         "params": {"protocolVersion": "2025-06-18"}},
        {"jsonrpc": "2.0", "id": 2, "method": "tools/list"},
        _llamada(3, "brave_estado"), _llamada(4, "brave_probar"),
    ]
    if consulta:
        peticiones.append(_llamada(5, "brave_buscar", {"consulta": consulta, "cuenta": 3}))
    entrada = "\n".join(json.dumps(p, ensure_ascii=False) for p in peticiones) + "\n"
    try:
        hecho = subprocess.run([sys.executable, str(MCP)], input=entrada,
                               capture_output=True, text=True, timeout=30, env=entorno)
    finally:
        if servidor is not None:
            servidor.shutdown()
            servidor.server_close()
    if hecho.returncode != 0:
        raise ValueError("el MCP terminó con %d: %s" % (hecho.returncode, hecho.stderr.strip()))
    respuestas = _respuestas(hecho.stdout)
    if "protocolVersion" not in respuestas.get(1, {}).get("result", {}):
        raise ValueError("initialize no respondió")
    tools = [h["name"] for h in respuestas.get(2, {}).get("result", {}).get("tools", [])]
    if any(nombre not in tools for nombre in HERRAMIENTAS):
        raise ValueError("faltan herramientas brave-search")
    estado = json.loads(_texto(respuestas.get(3), secretos))
    if not estado.get("configurada"):
        raise ValueError("sin conexión: define %s" % ", ".join(VARIABLES))
    prueba = _texto(respuestas.get(4), secretos)
    if "Conexión OK" not in prueba:
        raise ValueError(prueba)
    lineas = ["MCP brave-search OK · variable=%s · endpoint=%s" % (estado["variable"], estado.get("endpoint")), prueba]
    if simular:
        if not _FalsoBrave.recibidas or _FalsoBrave.recibidas[0][1] != CLAVE_PRUEBA:
            raise ValueError("la prueba simulada no recibió la clave en la cabecera")
        lineas.append("Cabecera verificada; la clave no aparece en la URL.")
    if consulta:
        datos = json.loads(_texto(respuestas.get(5), secretos))
        lineas.append("Consulta «%s»: %d resultado(s)"
                      % (datos.get("consulta"), len(datos.get("resultados", []))))
    return "\n".join(linea.replace(CLAVE_PRUEBA, "***") for linea in lineas)
def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--consulta", help="búsqueda opcional de prueba")
    parser.add_argument("--simular", action="store_true", help="prueba sin clave real")
    args = parser.parse_args()
    try:
        print(probar(args.consulta, args.simular))
    except (ValueError, OSError, subprocess.TimeoutExpired) as fallo:
        print("Fallo: %s" % fallo, file=sys.stderr)
        return 1
    return 0

if __name__ == "__main__":
    sys.exit(main())
