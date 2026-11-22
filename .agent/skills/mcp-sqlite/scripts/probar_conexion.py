#!/usr/bin/env python3
"""Comprueba la conexión MCP sqlite contra el servidor real por stdio."""

import argparse
import json
import os
import select
import sqlite3
import subprocess
import sys
import tempfile
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[4]
SERVIDOR = RAIZ / "scripts" / "puente" / "mcp_director.py"
PLAZO_S = 30
HERRAMIENTAS = ("sqlite_estado", "sqlite_tablas", "sqlite_esquema", "sqlite_consulta")

def _base_temporal(directorio):
    base = os.path.join(directorio, "prueba.sqlite")
    con = sqlite3.connect(base)
    con.execute("CREATE TABLE tarea (id INTEGER PRIMARY KEY, titulo TEXT)")
    con.executemany("INSERT INTO tarea (titulo) VALUES (?)", [("alfa",), ("beta",)])
    con.commit()
    con.close()
    return base

class Cliente:
    def __init__(self, base):
        entorno = dict(os.environ)
        if base:
            entorno["STARSEED_SQLITE_RUTA"] = str(base)
        self.proc = subprocess.Popen(
            [sys.executable, str(SERVIDOR)], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
            stderr=subprocess.PIPE, env=entorno, text=True,
        )
        assert self.proc.stdin is not None and self.proc.stdout is not None
        self.stdin, self.stdout = self.proc.stdin, self.proc.stdout
        self.ident = 0

    def __enter__(self):
        return self

    def __exit__(self, *_exc):
        for canal in (self.proc.stdin, self.proc.stdout, self.proc.stderr):
            if canal is not None: canal.close()
        self.proc.kill()
        self.proc.wait()

    def enviar(self, metodo, params=None):
        self.ident += 1
        peticion = {"jsonrpc": "2.0", "id": self.ident, "method": metodo, "params": params or {}}
        self.stdin.write(json.dumps(peticion) + "\n")
        self.stdin.flush()
        if not select.select([self.stdout], [], [], PLAZO_S)[0]:
            raise TimeoutError("el servidor MCP no respondió en %d s" % PLAZO_S)
        respuesta = json.loads(self.stdout.readline())
        if "error" in respuesta:
            raise RuntimeError(str(respuesta["error"]))
        return respuesta["result"]

    def herramienta(self, nombre, argumentos=None):
        r = self.enviar("tools/call", {"name": nombre, "arguments": argumentos or {}})
        if r.get("isError"):
            raise RuntimeError(r["content"][0]["text"])
        return r["content"][0]["text"]

def probar(base):
    pasos = {}
    with Cliente(base) as c:
        pasos["initialize"] = c.enviar("initialize", {"protocolVersion": "2025-06-18"})["serverInfo"]["name"]
        nombres = [h["name"] for h in c.enviar("tools/list")["tools"]]
        if [h for h in HERRAMIENTAS if h not in nombres]: raise RuntimeError("faltan herramientas sqlite")
        pasos["tools/list"] = list(HERRAMIENTAS)
        estado = json.loads(c.herramienta("sqlite_estado"))
        if not estado.get("configurada") or not estado.get("conectada"):
            raise RuntimeError("sqlite no conectó: %s" % estado)
        pasos["sqlite_estado"] = estado
        tablas = json.loads(c.herramienta("sqlite_tablas"))
        pasos["sqlite_tablas"] = tablas
        if tablas:
            tabla = "tarea" if "tarea" in tablas else tablas[0]
            pasos["sqlite_esquema"] = c.herramienta("sqlite_esquema", {"tabla": tabla})[:80]
            sql = 'SELECT * FROM "%s" LIMIT 3' % tabla.replace('"', '""')
            consulta = json.loads(c.herramienta("sqlite_consulta", {"sql": sql, "limite": 3}))
            pasos["sqlite_consulta"] = {"columnas": consulta["columnas"], "filas": len(consulta["filas"])}
        param = json.loads(c.herramienta("sqlite_consulta", {"sql": "SELECT ? AS valor", "parametros": ["ok"]}))
        pasos["parametros"] = param["filas"][0]["valor"] == "ok"
        rechazo = c.enviar("tools/call", {"name": "sqlite_consulta", "arguments": {"sql": "DELETE FROM tarea"}})
        if not rechazo.get("isError"): raise RuntimeError("la conexión aceptó una escritura")
        pasos["solo_lectura"] = "DELETE rechazado"
    return pasos

def main():
    ap = argparse.ArgumentParser(description=(__doc__ or "Prueba MCP sqlite").splitlines()[0])
    ap.add_argument("--ruta", help="base a probar (por defecto STARSEED_SQLITE_RUTA)")
    ap.add_argument("--temporal", action="store_true", help="crea una base desechable")
    op = ap.parse_args()
    if not SERVIDOR.is_file():
        print(json.dumps({"ok": False, "detalle": "falta %s" % SERVIDOR}, ensure_ascii=False))
        return 1
    tmp = tempfile.TemporaryDirectory() if op.temporal else None
    try:
        base = _base_temporal(tmp.name) if tmp else op.ruta
        pasos = {}
        try:
            pasos = probar(base)
            datos, codigo = {"ok": True, "pasos": pasos}, 0
        except (OSError, RuntimeError, TimeoutError, ValueError, KeyError, IndexError) as e:
            datos, codigo = {"ok": False, "detalle": str(e), "pasos": pasos}, 1
        if base: datos["ruta"] = base
        print(json.dumps(datos, ensure_ascii=False, indent=2, default=str))
        return codigo
    finally:
        if tmp is not None: tmp.cleanup()

if __name__ == "__main__":
    sys.exit(main())
