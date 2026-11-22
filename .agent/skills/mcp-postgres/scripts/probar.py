#!/usr/bin/env python3
"""Prueba de extremo a extremo del MCP postgres del Chat Director (solo lectura)."""
import argparse
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[4]
MCP = RAIZ / "scripts" / "puente" / "mcp_director.py"
VARIABLES = ("STARSEED_SUPABASE_DB_URL", "SUPABASE_DB_URL", "DATABASE_URL",
             "POSTGRES_URL", "POSTGRES_PRISMA_URL")
HERRAMIENTAS = ("postgres_estado", "postgres_probar", "postgres_consultar")


def _peticion(ident, metodo, params=None):
    return {"jsonrpc": "2.0", "id": ident, "method": metodo, "params": params or {}}


def _llamada(ident, nombre, argumentos=None):
    return _peticion(ident, "tools/call", {"name": nombre, "arguments": argumentos or {}})


def _configurar(entorno, temporal):
    """Prepara un `psql` falso y una URL de prueba; no toca credenciales reales."""
    entorno = dict(entorno)
    entorno["STARSEED_SUPABASE_DB_URL"] = "postgresql://prueba:prueba@localhost:5432/prueba"
    falso = Path(temporal) / "psql"
    falso.write_text("#!/bin/sh\nprintf '1\\n'\n", encoding="utf-8")
    falso.chmod(0o700)
    entorno["PATH"] = temporal + os.pathsep + entorno.get("PATH", "")
    return entorno, [entorno["STARSEED_SUPABASE_DB_URL"]]


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


def probar(sql=None, simular=False):
    entorno = dict(os.environ)
    secretos = []
    peticiones = [
        _peticion(1, "initialize", {"protocolVersion": "2025-06-18"}),
        _peticion(2, "tools/list"),
        _llamada(3, "postgres_estado"),
        _llamada(4, "postgres_probar"),
    ]
    if sql:
        peticiones.append(_llamada(5, "postgres_consultar", {"sql": sql}))
    entrada = "\n".join(json.dumps(p, ensure_ascii=False) for p in peticiones) + "\n"
    with tempfile.TemporaryDirectory() as temporal:
        if simular:
            entorno, secretos = _configurar(entorno, temporal)
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
    if not estado.get("configurado"):
        raise ValueError("sin conexión: define %s" % ", ".join(VARIABLES))
    prueba = _texto(respuestas.get(4), secretos)
    if "Conexión OK" not in prueba:
        raise ValueError(prueba)
    lineas = ["MCP postgres OK · variable=%s · modo=%s" % (estado["variable"], estado["modo"]),
              prueba]
    if sql:
        lineas.append("Consulta: " + _texto(respuestas.get(5), secretos))
    return "\n".join(lineas)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sql", help="consulta SELECT/CTE opcional de solo lectura")
    parser.add_argument("--simular", action="store_true",
                        help="prueba el cableado con psql falso, sin credenciales reales")
    args = parser.parse_args()
    try:
        print(probar(args.sql, args.simular))
    except (ValueError, OSError, subprocess.TimeoutExpired) as fallo:
        print("Fallo: %s" % fallo, file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
