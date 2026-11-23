"""Pruebas del puente PostgreSQL del servidor MCP del Chat Director (CAP1119)."""

import json
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

_CARPETA = Path(__file__).resolve().parent
sys.path.insert(0, str(_CARPETA))

import mcp_director


class _Cursor:
    def __init__(self, conexion):
        self.conexion, self.description = conexion, [("ok",)]
    def execute(self, sql): self.conexion.registro.append(sql)
    def fetchmany(self, cantidad): return self.conexion.filas[:cantidad]
    def close(self): self.conexion.registro.append("CERRAR-CURSOR")


class _Fabrica:
    def __init__(self, registro, estado):
        self.registro, self.estado = registro, estado
    def connect(self, dsn, **kwargs):
        self.registro.append("CONECTAR")
        if self.estado.get("fallar"): raise RuntimeError("fallo con %s" % dsn)
        conn = SimpleNamespace(registro=self.registro, filas=self.estado.get("filas", []))
        conn.cursor = lambda: _Cursor(conn)
        conn.rollback = lambda: self.registro.append("ROLLBACK")
        conn.close = lambda: self.registro.append("CERRAR")
        return conn


@pytest.fixture
def postgres(monkeypatch):
    registro, estado = [], {}
    monkeypatch.setenv("STARSEED_POSTGRES_URL", "postgresql://usuario:secreto@localhost:5432/os")
    monkeypatch.setattr(mcp_director, "_controlador", lambda: ("falso", _Fabrica(registro, estado)))
    return SimpleNamespace(registro=registro, estado=estado)


def _llamar(nombre, argumentos=None):
    respuesta = mcp_director.atender({"jsonrpc": "2.0", "id": 7, "method": "tools/call",
        "params": {"name": nombre, "arguments": argumentos or {}}})
    assert respuesta is not None
    return respuesta


def _texto(respuesta): return respuesta["result"]["content"][0]["text"]


def _nombres_tools():
    respuesta = mcp_director.atender({"jsonrpc": "2.0", "id": 1, "method": "tools/list"})
    assert respuesta is not None
    return [h["name"] for h in respuesta["result"]["tools"]]


def test_herramientas_ocultas_sin_configuracion(monkeypatch):
    monkeypatch.delenv("STARSEED_POSTGRES_URL", raising=False)
    assert "postgres_consulta" not in _nombres_tools()
    assert "metagenesis_orden" in _nombres_tools()

def test_herramientas_visibles_al_configurar(postgres):
    esperadas = {"postgres_estado", "postgres_probar", "postgres_tablas", "postgres_consulta"}
    assert esperadas <= set(_nombres_tools())

def test_estado_no_revela_el_secreto(postgres):
    estado = json.loads(_texto(_llamar("postgres_estado")))
    assert (estado["configurada"], estado["host"], estado["controlador"]) == (True, "localhost", "falso")
    assert estado["modo"] == "solo-lectura" and "secreto" not in json.dumps(estado)

def test_probar_conexion_ejecuta_select_1(postgres):
    postgres.estado["filas"] = [(1,)]
    assert "correcta" in _texto(_llamar("postgres_probar"))
    assert {"SELECT 1 AS ok", "SET TRANSACTION READ ONLY", "ROLLBACK"} <= set(postgres.registro)

def test_consulta_devuelve_columnas_y_respeta_limite(postgres):
    postgres.estado["filas"] = [(n,) for n in range(1, 6)]
    salida = json.loads(_texto(_llamar("postgres_consulta", {
        "sql": "SELECT id FROM os_posts ORDER BY created_at DESC", "limite": 2})))
    assert (salida["columnas"], salida["filas"], salida["limitada"]) == (["ok"], [[1], [2]], True)
    assert {"CONECTAR", "CERRAR"} <= set(postgres.registro)

@pytest.mark.parametrize("sql", ["DELETE FROM os_posts", "SELECT 1; DROP TABLE os_posts",
    "WITH x AS (DELETE FROM os_posts RETURNING *) SELECT * FROM x",
    "/* comentario */ DROP TABLE os_posts", "SELECT 1 -- comentario\n; SELECT 2"])
def test_consulta_rechaza_escritura(postgres, sql):
    respuesta = _llamar("postgres_consulta", {"sql": sql})
    assert respuesta["result"]["isError"] is True and "solo" in _texto(respuesta).lower()
    assert postgres.registro == []

def test_tablas_lista_information_schema(postgres):
    postgres.estado["filas"] = [("public", "os_posts")]
    assert "public.os_posts" in _texto(_llamar("postgres_tablas", {"esquema": "public"}))
    assert "information_schema.tables" in postgres.registro[-4]

@pytest.mark.parametrize("esquema", ["public; DROP TABLE os_posts", "1mala", "a-b"])
def test_tablas_rechaza_esquema_invalido(postgres, esquema):
    respuesta = _llamar("postgres_tablas", {"esquema": esquema})
    assert respuesta["result"]["isError"] is True and postgres.registro == []

def test_fallo_de_conexion_no_fuga_la_url(postgres):
    postgres.estado["fallar"] = True
    respuesta = _llamar("postgres_probar")
    texto = _texto(respuesta)
    assert respuesta["result"]["isError"] is True and "secreto" not in texto
    assert "REDACTED" in texto

def test_sin_url_la_herramienta_no_existe(monkeypatch):
    monkeypatch.delenv("STARSEED_POSTGRES_URL", raising=False)
    assert _llamar("postgres_probar")["error"]["code"] == -32602
