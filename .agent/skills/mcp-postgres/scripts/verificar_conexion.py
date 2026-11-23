#!/usr/bin/env python3
"""Prueba la conexión PostgreSQL del MCP del Chat Director sin imprimir secretos."""

import importlib.util
import json
import os
import subprocess
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[4]
SERVIDOR = RAIZ / "scripts" / "puente" / "mcp_director.py"
ENTORNO = Path.home() / ".starseed" / "env"


def cargar_variable():
    if os.environ.get("STARSEED_POSTGRES_URL", "").strip():
        return True
    try:
        for linea in ENTORNO.read_text(encoding="utf-8").splitlines():
            if linea.strip().startswith("STARSEED_POSTGRES_URL="):
                valor = linea.split("=", 1)[1].strip().strip('"').strip("'")
                if valor:
                    os.environ["STARSEED_POSTGRES_URL"] = valor
                    return True
    except OSError:
        pass
    return False


def cargar_modulo():
    spec = importlib.util.spec_from_file_location("mcp_director", SERVIDOR)
    if spec is None or spec.loader is None:
        raise RuntimeError("no se pudo cargar el servidor MCP")
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


def peticion(proc, ident, metodo, params=None):
    mensaje = {"jsonrpc": "2.0", "id": ident, "method": metodo}
    if params is not None:
        mensaje["params"] = params
    proc.stdin.write(json.dumps(mensaje) + "\n")
    proc.stdin.flush()
    while True:
        linea = proc.stdout.readline()
        if not linea:
            raise RuntimeError("el servidor MCP cerró stdio")
        respuesta = json.loads(linea)
        if respuesta.get("id") == ident:
            return respuesta


def texto(respuesta):
    if "error" in respuesta:
        raise RuntimeError(respuesta["error"]["message"])
    contenido = respuesta["result"]["content"][0]["text"]
    if respuesta["result"].get("isError"):
        raise RuntimeError(contenido)
    return contenido


def main():
    director = cargar_modulo()

    configurada = cargar_variable()
    estado = json.loads(director._postgres("postgres_estado", {}))
    for clave in ("configurada", "variable", "host", "controlador", "modo"):
        valor = estado[clave]
        if clave == "configurada":
            valor = "sí" if valor else "no"
        elif clave == "controlador" and not valor:
            valor = "sin instalar"
        elif clave == "host" and not valor:
            valor = "sin configurar"
        print("%s: %s" % (clave, valor))
    if not configurada:
        print("SIN CONEXIÓN: exporta STARSEED_POSTGRES_URL desde ~/.starseed/env")
        return 2
    with subprocess.Popen(
        [sys.executable, str(SERVIDOR)],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        env=os.environ.copy(),
    ) as proc:
        peticion(proc, 1, "initialize", {"protocolVersion": "2025-06-18"})
        nombres = [h["name"] for h in peticion(proc, 2, "tools/list")["result"]["tools"]]
        print("herramientas postgres: %s" % ", ".join(n for n in nombres if n.startswith("postgres_")))
        try:
            print(texto(peticion(proc, 3, "tools/call", {
                "name": "postgres_probar", "arguments": {},
            })))
        except RuntimeError as e:
            mensaje = str(e)[:300]
            print(mensaje if mensaje.lower().startswith("error:") else "Error: %s" % mensaje)
            return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
