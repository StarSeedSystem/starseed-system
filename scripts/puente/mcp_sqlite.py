#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Conexión SQLite (solo lectura) para el MCP `starseed-director` (CAP1119).

La base vive en `starseed_memory_root/mando/starseed.sqlite3` o en
`STARSEED_SQLITE_DB`. Un autorizador de SQLite rechaza toda escritura.
"""
import json, os, sqlite3
from pathlib import Path

_DEFECTO = ("starseed_memory_root", "mando", "starseed.sqlite3")
_ACCIONES = {sqlite3.SQLITE_SELECT, sqlite3.SQLITE_READ, sqlite3.SQLITE_FUNCTION,
             sqlite3.SQLITE_RECURSIVE, sqlite3.SQLITE_TRANSACTION}
_PRAGMAS = {"table_info", "table_list", "index_list",
            "foreign_key_list", "database_list", "compile_options"}


def _raiz():
    return Path(os.environ.get("STARSEED_ROOT") or Path(__file__).resolve().parents[2])


def ruta():
    valor = os.environ.get("STARSEED_SQLITE_DB")
    if not valor:
        return _raiz().joinpath(*_DEFECTO)
    destino = Path(valor).expanduser()
    return destino if destino.is_absolute() else _raiz() / destino


def _autorizador(accion, arg1, arg2, *_):
    if accion == sqlite3.SQLITE_PRAGMA:
        nombre = str(arg1).lower()
        ok = nombre in _PRAGMAS or (nombre == "user_version" and arg2 is None)
        return sqlite3.SQLITE_OK if ok else sqlite3.SQLITE_DENY
    return sqlite3.SQLITE_OK if accion in _ACCIONES else sqlite3.SQLITE_DENY


def conectar():
    destino = ruta()
    if not destino.exists():
        raise ValueError("la base sqlite no existe: %s" % destino)
    conexion = sqlite3.connect(str(destino))
    conexion.row_factory = sqlite3.Row
    conexion.set_authorizer(_autorizador)
    return conexion


def _cerrar(conexion):
    try:
        conexion.close()
    except sqlite3.Error:
        pass


def estado():
    destino = ruta()
    datos = {"ruta": str(destino), "existe": destino.exists(),
             "sqlite": sqlite3.sqlite_version, "solo_lectura": True, "tablas": 0}
    if not destino.exists():
        datos["detalle"] = "Aún no hay base; se crea con sqlite3 o un script de tareas."
        return json.dumps(datos, ensure_ascii=False, indent=2, sort_keys=True)
    conexion = conectar()
    try:
        datos["tablas"] = len(conexion.execute(
            "SELECT name FROM sqlite_master WHERE type = 'table' "
            "AND name NOT LIKE 'sqlite_%'").fetchall())
        datos["version_esquema"] = int(conexion.execute("PRAGMA user_version").fetchone()[0])
    finally:
        _cerrar(conexion)
    return json.dumps(datos, ensure_ascii=False, indent=2, sort_keys=True)


def tablas():
    conexion = conectar()
    try:
        nombres = [f[0] for f in conexion.execute(
            "SELECT name FROM sqlite_master WHERE type = 'table' "
            "AND name NOT LIKE 'sqlite_%' ORDER BY name")]
        lineas = []
        for nombre in nombres:
            cita = '"%s"' % str(nombre).replace('"', '""')
            total = conexion.execute("SELECT count(*) FROM %s" % cita).fetchone()[0]
            lineas.append("%s (%d filas)" % (nombre, int(total)))
    finally:
        _cerrar(conexion)
    return "\n".join(lineas) if lineas else "No hay tablas todavía."


def consultar(sql, limite=50):
    sentencia = str(sql or "").strip().rstrip(";").strip()
    if not sentencia:
        raise ValueError("sql es obligatoria")
    if ";" in sentencia:
        raise ValueError("solo se admite una sentencia por llamada")
    if sentencia.split(None, 1)[0].lower() not in ("select", "with", "pragma", "explain"):
        raise ValueError("solo consultas de lectura (select, with, pragma, explain)")
    tope = 50 if limite is None else int(limite)
    if not 1 <= tope <= 500:
        raise ValueError("limite fuera de rango (1-500): %d" % tope)
    conexion = conectar()
    try:
        cursor = conexion.execute(sentencia)
        columnas = [d[0] for d in cursor.description or []]
        filas = cursor.fetchmany(tope)
    except sqlite3.Error as e:
        raise ValueError("sqlite: %s" % e)
    finally:
        _cerrar(conexion)
    if not columnas:
        return "Consulta ejecutada sin filas."
    lineas = [" | ".join(columnas)]
    lineas += [" | ".join("" if v is None else str(v) for v in f) for f in filas]
    if not filas:
        lineas.append("(sin filas)")
    return "\n".join(lineas)
