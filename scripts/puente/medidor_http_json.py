#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Adaptador por configuración: http_json y declarado (MC1007C · 2026-10-06).

El medidor de Claude debe usar la terminal para autoactualizarse y contar con un medidor
para cada crédito del usuario en sus APIs y modelos de pago (en nuestro caso, Claude y ChatGPT,
pero con espacio para cualquier medidor adaptado a cualquier modelo y APIs).

Tipos de entrada en ~/.starseed/medidores.json:

  {"id": "openrouter", "tipo": "http_json", "nombre": "OpenRouter · saldo", "proveedor": "openrouter",
   "url": "https://openrouter.ai/api/v1/key", "clave_env": "OPENROUTER_API_KEY",
   "rutas": {"usado": "data.usage", "limite": "data.limit", "restante": "data.limit_remaining"},
   "unidad": "USD", "cada_min": 60}

  {"id": "claude-nube", "tipo": "declarado", "nombre": "Claude · crédito nube", "proveedor": "anthropic",
   "archivo": "~/.starseed/credito-claude-nube.json",
   "rutas": {"restante": "restante_usd", "limite": "total_usd", "vence": "vence"}, "unidad": "USD"}

Cada adaptador expone `leer(entrada_config, ahora, **inyectables) -> dict` con la forma de
architecture/medidores-credito.md §3 (un medidor).
"""
from __future__ import annotations

import json
import os
import os.path
import unittest.mock as mock
import urllib.error
import urllib.request
from typing import Any, Optional, Dict


def extraer(doc: Any, ruta: str) -> Optional[float]:
    """Extrae un valor de doc usando puntos como navegación.

    Ejemplo: extraer({"data": {"limit_remaining": 7.5}}, "data.limit_remaining") -> 7.5

    Numeros (int/float) y texto numérico se convierten a float; cualquier otra cosa se descarta.
    Indices numéricos permiten navegación anidada como "items.0.x".
    Si no se puede extraer, devuelve None.
    """
    if not ruta:
        return None

    partes = ruta.split(".")
    actual = doc
    try:
        for i, parte in enumerate(partes):
            if isinstance(actual, dict):
                actual = actual.get(parte)
            elif isinstance(actual, (list, tuple)):
                idx = int(parte)
                actual = actual[idx] if idx < len(actual) else None
            else:
                actual = None
            if actual is None:
                return None
        if isinstance(actual, (int, float)):
            return float(actual)
        if isinstance(actual, str) and actual.replace(".", "", 1).isdigit():
            return float(actual)
        return None
    except (ValueError, KeyError, IndexError, TypeError):
        return None


def leer_entorno(nombre: str, entorno: Optional[Dict[str, str]] = None, rutas: tuple[str, ...] = (
    "~/.starseed/env", "~/.hermes/.env"
)) -> Optional[str]:
    """Lee valor de variable de entorno sin ejecutar archivo .env.

    Primero mira en `entorno` (por defecto os.environ). Luego intenta leer de cada ruta
    (expandir con os.path.expanduser), parseando líneas "[export ]NOMBRE=valor" (sin comillas,
    las comillas van fuera). Nunca se ejecuta como shell.
    Devuelve None si no hay valor.
    """
    if entorno is None:
        entorno = dict(os.environ)  # type: ignore[assignment]
    valor = entorno.get(nombre)
    if valor is not None:
        return valor
    for ruta in rutas:
        try:
            with open(os.path.expanduser(ruta), "r", encoding="utf-8") as f:
                for linea in f:
                    linea = linea.strip()
                    if not linea or linea.startswith("#"):
                        continue
                    if linea.startswith("export "):
                        linea = linea[7:]
                    if "=" in linea:
                        k, v = linea.split("=", 1)
                        if k.strip() == nombre:
                            return v.strip()
        except OSError:
            continue
    return None


def leer_http_json(entrada: dict, ahora: str, abrir_url=urllib.request.urlopen,
                   entorno: Optional[Dict[str, str]] = None) -> dict:
    """Lee una API JSON con endpoints por configuración.

    Sólo https://; si falla, se conserva lo anterior con ok:false, obsoleto:true.
    Usado en architecture/medidores-credito.md §2.3.
    """
    id_med = entrada.get("id", "")
    nombre = entrada.get("nombre", "")
    proveedor = entrada.get("proveedor", "")
    url = entrada.get("url", "")
    clave_env = entrada.get("clave_env", "")
    rutas = entrada.get("rutas", {})
    unidad = entrada.get("unidad", "")

    if not url.startswith("https://"):
        return {"ok": False, "error": "solo https", "id": id_med, "proveedor": proveedor}
    clave = leer_entorno(clave_env, entorno) if clave_env else None
    if not clave:
        return {"ok": False, "error": f"falta {clave_env}", "id": id_med, "proveedor": proveedor}

    leido = ahora
    try:
        req = urllib.request.Request(url, headers={
            "Authorization": f"Bearer {clave}",
            "User-Agent": "starseed-medidor",
        })
        with abrir_url(req, timeout=20) as resp:
            datos = resp.read(256 * 1024).decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return {"ok": False, "error": f"http {e.code}", "id": id_med, "proveedor": proveedor, "leido": leido}
    except Exception as e:
        return {"ok": False, "error": type(e).__name__, "id": id_med, "proveedor": proveedor, "leido": leido}

    try:
        doc = json.loads(datos)
    except ValueError:
        return {"ok": False, "error": "json inválido", "id": id_med, "proveedor": proveedor, "leido": leido}

    usado = extraer(doc, rutas.get("usado")) if "usado" in rutas else None
    limite = extraer(doc, rutas.get("limite")) if "limite" in rutas else None
    restante = extraer(doc, rutas.get("restante")) if "restante" in rutas else None

    if restante is None:
        restante = limite

    ventanas = []
    if limite is not None and limite > 0:
        usado_pct = usado / limite * 100.0 if usado is not None else 0.0
        ventanas.append({"id": "uso", "etiqueta": "Uso", "usado_pct": usado_pct, "reinicia": None})

    saldo = None
    if restante is not None:
        saldo = {"valor": restante, "limite": limite if limite is not None else restante, "unidad": unidad}

    return {"ok": True, "id": id_med, "proveedor": proveedor, "nombre": nombre, "tipo": "saldo",
            "ventanas": ventanas, "saldo": saldo, "extras": {}, "fuente": f"api: {url}",
            "leido": leido, "error": None, "obsoleto": False}


def leer_declarado(entrada: dict, ahora: str, abrir=open) -> dict:
    """Lee un JSON local declarado por una persona (architecture/medidores-credito.md §2.3).

    `entrada` debe tener:
      - archivo (ruta expandible)
      - rutas (dict de nombres de campos a rutas)
      - unidad (para saldo)
      - opcional vence (en extras)

    Devuelve medidor con fuente "declarado" y leido = archivo.declarado_en o timestamp de archivo.
    """
    archivo = entrada.get("archivo", "")
    rutas = entrada.get("rutas", {})
    unidad = entrada.get("unidad", "")
    archivo_expandido = os.path.expanduser(archivo)

    leido = ahora
    try:
        with abrir(archivo_expandido, "r", encoding="utf-8") as f:
            doc = json.load(f)
        declarado_en = doc.get("declarado_en")
        if declarado_en:
            leido = declarado_en
    except (OSError, ValueError, json.JSONDecodeError):
        doc = {}

    restante = extraer(doc, rutas.get("restante")) if "restante" in rutas else None
    limite = extraer(doc, rutas.get("limite")) if "limite" in rutas else None
    vence = extraer(doc, rutas.get("vence")) if "vence" in rutas else None

    ventanas = []
    if limite is not None and limite > 0:
        usado_pct = extraer(doc, rutas.get("usado")) if "usado" in rutas else 0.0
        if usado_pct is None:
            usado_pct = 0.0
        ventanas.append({"id": "uso", "etiqueta": "Uso", "usado_pct": usado_pct, "reinicia": None})

    saldo = None
    if restante is not None:
        saldo = {"valor": restante, "limite": limite if limite is not None else restante, "unidad": unidad}

    extras = {}
    if vence is not None:
        extras["vence"] = vence

    return {"ok": True, "id": entrada.get("id", ""), "proveedor": entrada.get("proveedor", ""),
            "nombre": entrada.get("nombre", ""), "tipo": "saldo", "ventanas": ventanas,
            "saldo": saldo, "extras": extras, "fuente": "declarado", "leido": leido,
            "error": None, "obsoleto": False}


if __name__ == "__main__":
    def test_extraer() -> None:
        doc = {"data": {"usage": 2.5, "limit": 10, "limit_remaining": 7.5}}
        assert extraer(doc, "data.usage") == 2.5
        assert extraer(doc, "data.limit") == 10.0
        assert extraer(doc, "data.limit_remaining") == 7.5
        assert extraer(doc, "data.missing") is None
        assert extraer({"items": [{"x": 1}, {"x": 2}]}, "items.0.x") == 1.0
        print("extraer tests passed")

    def test_leer_entorno() -> None:
        import tempfile
        with tempfile.NamedTemporaryFile(mode="w", suffix=".env", delete=False) as f:
            f.write("CLAVE_VALOR=123\nexport OTRO=abc\n# comentario\nSIN_IGUALDAD")
            tmp = f.name
        try:
            assert leer_entorno("CLAVE_VALOR") == "123"
            assert leer_entorno("OTRO") == "abc"
            assert leer_entorno("FALTA") is None
        finally:
            os.unlink(tmp)
        print("leer_entorno tests passed")

    def test_leer_http_json_mock() -> None:
        entrada = {
            "id": "test-http", "nombre": "Test HTTP", "proveedor": "test",
            "url": "https://example.com/api", "clave_env": "TEST_API_KEY",
            "rutas": {"usado": "data.usage", "limite": "data.limit", "restante": "data.limit_remaining"},
            "unidad": "USD",
        }
        mock_resp = mock.Mock()
        mock_resp.read.return_value = json.dumps({
            "data": {"usage": 25, "limit": 100, "limit_remaining": 75}
        }).encode("utf-8")
        with mock.patch("urllib.request.urlopen", return_value=mock_resp):
            with mock.patch("os.environ", {"TEST_API_KEY": "secret"}):
                resultado = leer_http_json(entrada, "2026-10-06T18:00:00Z")
        assert resultado["ok"] is True
        assert resultado["id"] == "test-http"
        assert resultado["saldo"]["valor"] == 75.0
        print("leer_http_json mock tests passed")

    def test_leer_declarado_mock() -> None:
        entrada = {
            "id": "test-declarado", "nombre": "Test Declarado", "proveedor": "test",
            "archivo": "/tmp/test-declarado.json",
            "rutas": {"restante": "restante_usd", "limite": "total_usd", "vence": "vence"},
            "unidad": "USD",
        }
        import tempfile
        with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
            json.dump({"restante_usd": 200, "total_usd": 300, "vence": "2026-11-01"},
                      f, ensure_ascii=False)
            tmp = f.name
        try:
            with mock.patch("os.path.expanduser", side_effect=lambda x: x.replace("~", "/tmp")):
                resultado = leer_declarado(entrada, "2026-10-06T18:00:00Z",
                                           abrir=lambda p, *a, **k: open(p, *a, **k))
        finally:
            os.unlink(tmp)
        assert resultado["ok"] is True
        assert resultado["fuente"] == "declarado"
        assert resultado["saldo"]["valor"] == 200.0
        print("leer_declarado mock tests passed")

    test_extraer()
    test_leer_entorno()
    test_leer_http_json_mock()
    test_leer_declarado_mock()
    print("\nTodos los tests del adaptador pasaron.")
