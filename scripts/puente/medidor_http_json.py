#!/usr/bin/env python3
"""Adaptadores por configuración para medidores de crédito en StarSeed OS (Ola 1007M).

Ayudan a cualquier API con `tipo: http_json` o `tipo: declarado` en
`~/.starseed/medidores.json` (fuera del repo).

Cada adaptador implementa `leer(entrada_config, ahora, **inyectables)` → dict|list[dict]
que sigue el contrato de §2.3 (medidor_http_json.py del contrato) y la salida de §3 (medidores-credito.json).
"""
from __future__ import annotations
import json
import os
import time
from typing import Any

import urllib.request
import urllib.error


def extraer(doc: Any, ruta: str) -> float | str | None:
    """Extrae un valor desde un camino con puntos desde un documento JSON.

    Ejemplo:
      extraer({"data": {"usage": 2.5}}, "data.usage") -> 2.5
    """
    if not ruta:
        return None

    partes = ruta.split(".")
    valor: Any = doc
    for p in partes:
        if isinstance(valor, dict) and p in valor:
            valor = valor[p]
        elif isinstance(valor, (list, tuple)):
            try:
                i = int(p)
                valor = valor[i]
            except (ValueError, IndexError, TypeError):
                return None
        else:
            return None

    if isinstance(valor, (int, float)):
        return float(valor)
    if isinstance(valor, str):
        if valor.replace(".", "", 1).isdigit():
            return float(valor)
    return None


def leer_entorno(nombre: str, entorno: dict | None = None, rutas: tuple[str, ...] = (
        "~/.starseed/env", "~/.hermes/.env"
)) -> str | None:
    """Lee el valor de una variable de entorno desde un dict o archivos.

    Busca primero en `entorno` (por defecto os.environ); luego en las `rutas`
    como DATOS (líneas `export NOMBRE=valor`, comillas fuera).
    Nunca ejecuta archivos.
    """
    if entorno is not None and nombre in entorno:
        return entorno[nombre]
    if nombre in os.environ:
        return os.environ[nombre]

    for ruta_archivo in rutas:
        ruta_expandida = os.path.expanduser(ruta_archivo)
        if os.path.isfile(ruta_expandida):
            try:
                with open(ruta_expandida, encoding="utf-8") as f:
                    for linea in f:
                        linea = linea.strip()
                        if linea.startswith("export "):
                            linea = linea[7:]
                        if linea.startswith("#") or not linea:
                            continue
                        if "=" in linea:
                            k, v = linea.split("=", 1)
                            if k.strip() == nombre:
                                valor = v.strip()
                                if (valor.startswith('"') and valor.endswith('"')) or (
                                    valor.startswith("'") and valor.endswith("'")
                                ):
                                    valor = valor[1:-1]
                                return valor
            except (OSError, ValueError):
                continue
    return None


def leer_http_json(
        entrada: dict,
        ahora: str,
        abrir_url: Any = urllib.request.urlopen,
        entorno: dict | None = None) -> dict:
    """Extrae usage/limit de una API HTTP con `clave_env` obligatoria.

    Reglas (§2.3):
    - URL solo https:// (si no, ok: false, error: "solo https")
    - Falta la clave: ok: false, error: "falta <clave>" (el NOMBRE sí, el valor nunca)
    - GET con Authorization: Bearer <valor_de_clave_env>, User-Agent: starseed-medidor,
      timeout 20, máximo 256 KB.
    - Medidor de §3: id, nombre, proveedor, tipo "saldo",
      ventanas = {"id": "uso", "etiqueta": "Uso", "usado_pct": usado/limite*100, "reinicia": None}
        si hay límite > 0, si no ventanas = [].
      saldo = {"valor": restante (o limite-usado), "limite": limite, "unidad": entrada["unidad"]}
      fuente = "api: <host>"
    - HTTPError → ok: false con código
    - cualquier otro error → ok: false con su tipo
    Nunca guarda la respuesta.
    """
    if not entrada.get("url", "").startswith("https://"):
        return {
            "id": entrada.get("id"),
            "proveedor": entrada.get("proveedor"),
            "nombre": entrada.get("nombre"),
            "tipo": "saldo",
            "ok": False,
            "error": "solo https",
            "leido": ahora,
            "obsoleto": False,
        }

    clave_env = entrada.get("clave_env")
    if not clave_env:
        return {
            "id": entrada.get("id"),
            "proveedor": entrada.get("proveedor"),
            "nombre": entrada.get("nombre"),
            "tipo": "saldo",
            "ok": False,
            "error": f"falta {clave_env}" if clave_env else "falta clave_env",
            "leido": ahora,
            "obsoleto": False,
        }

    clave_valor = leer_entorno(clave_env, entorno)
    if not clave_valor:
        return {
            "id": entrada.get("id"),
            "proveedor": entrada.get("proveedor"),
            "nombre": entrada.get("nombre"),
            "tipo": "saldo",
            "ok": False,
            "error": f"falta {clave_env}",
            "leido": ahora,
            "obsoleto": False,
        }

    try:
        req = urllib.request.Request(
            entrada["url"],
            headers={
                "Authorization": f"Bearer {clave_valor}",
                "User-Agent": "starseed-medidor"
            }
        )
        with abrir_url(req, timeout=20) as resp:
            contenido = resp.read(256 * 1024)
            if not contenido:
                raise ValueError("respuesta vacía")
            datos = json.loads(contenido.decode("utf-8"))

        usado = extraer(datos, entrada.get("rutas", {}).get("usado", ""))
        limite = extraer(datos, entrada.get("rutas", {}).get("limite", ""))
        restante = extraer(datos, entrada.get("rutas", {}).get("restante", ""))

        if usado is None and limite is None and restante is None:
            usado = extraer(datos, "data.usage")
            limite = extraer(datos, "data.limit")
            restante = extraer(datos, "data.limit_remaining")

        ventanas = []
        if limite is not None and isinstance(limite, (int, float)) and limite > 0:
            if usado is not None and isinstance(usado, (int, float)):
                usado_pct = usado / limite * 100
            elif restante is not None and isinstance(restante, (int, float)):
                usado_pct = (limite - restante) / limite * 100
            else:
                usado_pct = None

            if usado_pct is not None:
                ventanas = [{
                    "id": "uso",
                    "etiqueta": "Uso",
                    "usado_pct": max(0.0, min(100.0, usado_pct)),
                    "reinicia": None
                }]

        saldo = None
        if limite is not None and isinstance(limite, (int, float)):
            if restante is not None and isinstance(restante, (int, float)):
                saldo_valor = restante
            elif usado is not None and isinstance(usado, (int, float)):
                saldo_valor = limite - usado
            else:
                saldo_valor = limite

            saldo = {
                "valor": saldo_valor,
                "limite": limite,
                "unidad": entrada.get("unidad", "")
            }

        return {
            "id": entrada.get("id"),
            "proveedor": entrada.get("proveedor"),
            "nombre": entrada.get("nombre"),
            "tipo": "saldo",
            "ok": True,
            "error": None,
            "ventanas": ventanas,
            "saldo": saldo,
            "fuente": f"api: {entrada['url'].split('://')[1].split('/')[0]}",
            "leido": ahora,
            "obsoleto": False,
        }

    except urllib.error.HTTPError as e:
        return {
            "id": entrada.get("id"),
            "proveedor": entrada.get("proveedor"),
            "nombre": entrada.get("nombre"),
            "tipo": "saldo",
            "ok": False,
            "error": f"HTTP {e.code}",
            "leido": ahora,
            "obsoleto": False,
        }
    except Exception as e:
        return {
            "id": entrada.get("id"),
            "proveedor": entrada.get("proveedor"),
            "nombre": entrada.get("nombre"),
            "tipo": "saldo",
            "ok": False,
            "error": type(e).__name__,
            "leido": ahora,
            "obsoleto": False,
        }


def leer_declarado(
        entrada: dict,
        ahora: str,
        abrir: Any = open) -> dict:
    """Lee JSON local desde entrada["archivo"] con las mismas rutas.

    Reglas (§2.3):
    - Formato real de `scripts/puente/credito_claude_nube.py`
      (`restante_usd`, `total_usd`, `vence`, `declarado_en`), más `extras["vence"]`.
    - Se marca `fuente: "declarado"`, `leido` = `declarado_en` del archivo si existe
      (si no, su fecha de modificación) y `extras["vence"]`.
    """
    archivo = entrada.get("archivo")
    if not archivo:
        return {
            "id": entrada.get("id"),
            "proveedor": entrada.get("proveedor"),
            "nombre": entrada.get("nombre"),
            "tipo": "saldo",
            "ok": False,
            "error": "falta archivo",
            "leido": ahora,
            "obsoleto": False,
        }

    try:
        ruta_expandida = os.path.expanduser(archivo)
        import stat
        leido_archivo = ahora
        if os.path.isfile(ruta_expandida):
            leido_archivo = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(os.path.getmtime(ruta_expandida)))

        with abrir(ruta_expandida, encoding="utf-8") as f:
            datos = json.load(f)

        rutas = entrada.get("rutas", {})
        restante = extraer(datos, rutas.get("restante", ""))
        limite = extraer(datos, rutas.get("limite", ""))
        vence = extraer(datos, rutas.get("vence", ""))

        ventanas = []
        if limite is not None and isinstance(limite, (int, float)) and limite > 0:
            if restante is not None and isinstance(restante, (int, float)):
                usado_pct = (limite - restante) / limite * 100
                if usado_pct is not None:
                    ventanas = [{
                        "id": "uso",
                        "etiqueta": "Uso",
                        "usado_pct": max(0.0, min(100.0, usado_pct)),
                        "reinicia": vence if isinstance(vence, str) else None
                    }]

        saldo = None
        if limite is not None and isinstance(limite, (int, float)):
            saldo_valor = restante if isinstance(restante, (int, float)) else limite
            saldo = {
                "valor": saldo_valor,
                "limite": limite,
                "unidad": entrada.get("unidad", "")
            }

        extras = {}
        if vence:
            extras["vence"] = vence

        return {
            "id": entrada.get("id"),
            "proveedor": entrada.get("proveedor"),
            "nombre": entrada.get("nombre"),
            "tipo": "saldo",
            "ok": True,
            "error": None,
            "ventanas": ventanas,
            "saldo": saldo,
            "extras": extras,
            "fuente": "declarado",
            "leido": leido_archivo,
            "obsoleto": False,
        }

    except Exception as e:
        return {
            "id": entrada.get("id"),
            "proveedor": entrada.get("proveedor"),
            "nombre": entrada.get("nombre"),
            "tipo": "saldo",
            "ok": False,
            "error": type(e).__name__,
            "leido": ahora,
            "obsoleto": False,
        }
