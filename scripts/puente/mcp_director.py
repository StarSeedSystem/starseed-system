#!/usr/bin/env python3
"""Servidor MCP del Chat Director: JSON-RPC 2.0 por stdio, sin dependencias."""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import director_chat

PROTOCOLO = "2025-06-18"

_OBJETO = {"type": "object"}
_HERR = [
    ("director_leer", "Lee los últimos mensajes del chat."),
    ("director_decir", "Publica un mensaje en el chat."),
    ("director_bandeja", "Lista los mensajes pendientes de un canal."),
    ("director_responder", "Responde a un mensaje y marca la entrega."),
]
HERRAMIENTAS = [{"name": n, "description": d, "inputSchema": _OBJETO} for n, d in _HERR]


def _error(ident, codigo, mensaje):
    err = {"code": codigo, "message": mensaje}
    return {"jsonrpc": "2.0", "id": ident, "error": err}


def _publicar(texto, de, tipo, canal, modelo, responde_a=None):
    rol = "director" if de.startswith("claude") else "agente"
    kw = {"de": de, "rol": rol, "tipo": tipo, "canal": canal, "modelo": modelo}
    kw["responde_a"] = responde_a
    return director_chat.publicar(texto, **kw)


def _listar(registros, vacio):
    lineas = [director_chat._formatear(r) for r in registros]
    return "\n".join(lineas) if lineas else vacio


def _llamar(nombre, args):
    """Ejecuta una herramienta y devuelve su texto; ValueError si falla."""
    args = args or {}
    if nombre == "director_leer":
        limite = int(args.get("limite") or 20)
        registros = director_chat.leer(desde=args.get("desde"), limite=limite)
        return _listar(registros, "Todavía no hay mensajes.")
    if nombre == "director_decir":
        de = args.get("de") or "agente"
        m = _publicar(
            args["texto"], de, "mensaje", args.get("canal") or "ide", args.get("modelo")
        )
        return "Publicado como %s" % m["id"]
    if nombre == "director_bandeja":
        canal = args.get("canal")
        if canal not in director_chat.CANALES_BANDEJA:
            raise ValueError("canal sin bandeja: %s" % canal)
        return _listar(director_chat.bandeja(canal), "No hay pendientes en %s." % canal)
    if nombre == "director_responder":
        canal = args["canal"]
        if canal not in director_chat.CANALES:
            raise ValueError("canal no válido: %s" % canal)
        m = _publicar(
            args["texto"],
            args["de"],
            "respuesta",
            canal,
            args.get("modelo"),
            responde_a=args["id"],
        )
        director_chat.entrega(args["id"], canal, "respondido")
        return "Respondido a %s como %s" % (args["id"], m["id"])
    raise ValueError("herramienta desconocida: %s" % nombre)


def atender(peticion):
    """Atiende una petición JSON-RPC; None para notificaciones sin respuesta."""
    if not isinstance(peticion, dict) or peticion.get("jsonrpc") != "2.0":
        ident = peticion.get("id") if isinstance(peticion, dict) else None
        return _error(ident, -32600, "Petición no válida")
    metodo, ident = peticion.get("method"), peticion.get("id")
    if metodo == "initialize":
        servidor = {"name": "starseed-director"}
        resultado = {
            "protocolVersion": PROTOCOLO,
            "serverInfo": servidor,
            "capabilities": {"tools": {}},
        }
        return {"jsonrpc": "2.0", "id": ident, "result": resultado}
    if metodo == "notifications/initialized":
        return None
    if metodo == "tools/list":
        return {"jsonrpc": "2.0", "id": ident, "result": {"tools": HERRAMIENTAS}}
    if metodo == "tools/call":
        params = peticion.get("params") or {}
        try:
            texto = _llamar(params.get("name"), params.get("arguments"))
        except (ValueError, KeyError) as e:
            return _error(ident, -32602, str(e))
        contenido = {"content": [{"type": "text", "text": texto}]}
        return {"jsonrpc": "2.0", "id": ident, "result": contenido}
    return _error(ident, -32601, "Método desconocido: %s" % metodo)


def _bucle():
    for linea in sys.stdin:
        linea = linea.strip()
        if not linea:
            continue
        try:
            respuesta = atender(json.loads(linea))
        except json.JSONDecodeError:
            respuesta = _error(None, -32700, "JSON no válido")
        if respuesta is not None:
            sys.stdout.write(json.dumps(respuesta, ensure_ascii=False) + "\n")
            sys.stdout.flush()


if __name__ == "__main__":
    _bucle()
