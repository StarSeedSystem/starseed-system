#!/usr/bin/env python3
"""Prueba de extremo a extremo del MCP brave-search del Chat Director.

Con clave definida lanza el servidor real por stdio y consulta Brave en vivo.
Con `--simular` comprueba el cableado en proceso con `urlopen` sustituido: no
necesita red ni clave real y no sustituye a la prueba en vivo.
"""

import argparse
import importlib.util
import json
import os
import subprocess
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[4]
MCP = RAIZ / "scripts" / "puente" / "mcp_director.py"
VARIABLES = ("BRAVE_API_KEY", "BRAVE_SEARCH_API_KEY")
HERRAMIENTAS = ("brave_estado", "brave_probar", "brave_buscar")
CLAVE_SIMULADA = "clave-brave-de-prueba"


def _peticion(ident, metodo, params=None):
    return {"jsonrpc": "2.0", "id": ident, "method": metodo, "params": params or {}}


def _llamada(ident, nombre, argumentos=None):
    return _peticion(ident, "tools/call", {"name": nombre, "arguments": argumentos or {}})


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


def _texto(respuesta):
    if not respuesta:
        return "(sin respuesta)"
    if "error" in respuesta:
        return "Error JSON-RPC: %s" % respuesta["error"].get("message")
    resultado = respuesta.get("result", {})
    texto = str(resultado.get("content", [{}])[0].get("text", ""))
    if resultado.get("isError"):
        raise ValueError(texto)
    return texto


class _Respuesta:
    """Respuesta mínima de `urlopen` con soporte de context manager."""

    def __init__(self, cuerpo):
        self.cuerpo = cuerpo

    def read(self):
        return self.cuerpo

    def __enter__(self):
        return self

    def __exit__(self, *_excepcion):
        return False


def _modulo():
    especificacion = importlib.util.spec_from_file_location("mcp_director_brave", MCP)
    modulo = importlib.util.module_from_spec(especificacion)
    especificacion.loader.exec_module(modulo)
    return modulo


def probar_simulado():
    """Cableado completo sin red ni clave real, sustituyendo `urlopen`."""
    modulo = _modulo()
    datos = json.dumps({"web": {"results": [
        {"title": "StarSeed OS", "url": "https://starseed.example", "description": "OS social"}
    ]}}).encode("utf-8")
    setattr(modulo, "urlopen", lambda _peticion, timeout=0: _Respuesta(datos))
    antes = os.environ.get("BRAVE_API_KEY")
    os.environ["BRAVE_API_KEY"] = CLAVE_SIMULADA
    try:
        estado = json.loads(_texto(modulo.atender(_llamada(1, "brave_estado"))))
        prueba = _texto(modulo.atender(_llamada(2, "brave_probar")))
        busqueda = _texto(modulo.atender(_llamada(3, "brave_buscar", {"q": "starseed", "count": 1})))
    finally:
        if antes is None:
            os.environ.pop("BRAVE_API_KEY", None)
        else:
            os.environ["BRAVE_API_KEY"] = antes
    if not estado.get("configurado"):
        raise ValueError("brave_estado no ve la variable BRAVE_API_KEY")
    if estado.get("variable") != "BRAVE_API_KEY":
        raise ValueError("brave_estado no devuelve el nombre de la variable")
    if CLAVE_SIMULADA in json.dumps(estado) or CLAVE_SIMULADA in prueba:
        raise ValueError("la clave simulada apareció en la respuesta")
    if "Conexión OK" not in prueba:
        raise ValueError(prueba)
    if "StarSeed OS" not in busqueda:
        raise ValueError(busqueda)
    return "MCP brave-search OK (simulado) · variable=BRAVE_API_KEY · resultados=1"


def probar_real(consulta=None):
    """Lanza el servidor real por stdio y consulta Brave con la clave del entorno."""
    peticiones = [
        _peticion(1, "initialize", {"protocolVersion": "2025-06-18"}),
        _peticion(2, "tools/list"),
        _llamada(3, "brave_estado"),
        _llamada(4, "brave_probar"),
    ]
    if consulta:
        peticiones.append(_llamada(5, "brave_buscar", {"q": consulta, "count": 3}))
    entrada = "\n".join(json.dumps(p, ensure_ascii=False) for p in peticiones) + "\n"
    hecho = subprocess.run(
        [sys.executable, str(MCP)], input=entrada, capture_output=True, text=True,
        timeout=60, env=dict(os.environ),
    )
    if hecho.returncode != 0:
        raise ValueError("el MCP terminó con %d: %s" % (hecho.returncode, hecho.stderr.strip()))
    respuestas = _respuestas(hecho.stdout)
    if "protocolVersion" not in respuestas.get(1, {}).get("result", {}):
        raise ValueError("initialize no respondió")
    nombres = [h["name"] for h in respuestas.get(2, {}).get("result", {}).get("tools", [])]
    for nombre in HERRAMIENTAS:
        if nombre not in nombres:
            raise ValueError("falta la herramienta %s" % nombre)
    estado = json.loads(_texto(respuestas.get(3)))
    if not estado.get("configurado"):
        raise ValueError("sin conexión: define %s" % ", ".join(VARIABLES))
    prueba = _texto(respuestas.get(4))
    if "Conexión OK" not in prueba:
        raise ValueError(prueba)
    lineas = [
        "MCP brave-search OK · variable=%s · modo=%s" % (estado["variable"], estado["modo"]),
        prueba,
    ]
    if consulta:
        lineas.append("Búsqueda «%s»:\n%s" % (consulta, _texto(respuestas.get(5))))
    return "\n".join(lineas)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--buscar", help="consulta web opcional para probar brave_buscar")
    parser.add_argument("--simular", action="store_true",
                        help="prueba el cableado sin red ni clave real")
    args = parser.parse_args()
    try:
        print(probar_simulado() if args.simular else probar_real(args.buscar))
    except (ValueError, OSError, subprocess.TimeoutExpired) as fallo:
        print("Fallo: %s" % fallo, file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
