#!/usr/bin/env python3
"""Servidor MCP del Chat Director: JSON-RPC 2.0 por stdio, sin dependencias."""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import director_chat

PROTOCOLOS = ("2025-06-18", "2025-03-26", "2024-11-05")
PROTOCOLO = PROTOCOLOS[0]
INSTRUCCIONES = "Lee y escribe en el Chat Director del Puente de Mando de StarSeed."


def _s(tipo, descripcion, **extra):
    return {"type": tipo, "description": descripcion, **extra}


_P_LIMITE = _s(
    "integer", "Máximo de mensajes a devolver (por defecto 20).", minimum=1, maximum=200
)
_P_DESDE = _s("string", "ISO-8601: solo mensajes posteriores a esta fecha.")
_P_TEXTO = _s("string", "Texto del mensaje a publicar.")
_P_DE = _s("string", "Quién habla (p. ej. «antigravity», «cursor», «codex»).")
_P_CANAL = _s(
    "string", "Canal del chat (por defecto «ide»).", enum=list(director_chat.CANALES)
)
_P_MODELO = _s("string", "Motor/modelo que firma el mensaje («motor/modelo»).")


def _esquema(propiedades, requeridos):
    return {
        "type": "object",
        "properties": propiedades,
        "required": requeridos,
        "additionalProperties": False,
    }


ESQUEMAS = {
    "director_leer": _esquema({"limite": _P_LIMITE, "desde": _P_DESDE}, []),
    "director_decir": _esquema(
        {
            "texto": _P_TEXTO,
            "de": _P_DE,
            "canal": _P_CANAL,
            "modelo": _P_MODELO,
        },
        ["texto"],
    ),
    "director_bandeja": _esquema(
        {
            "canal": _s(
                "string",
                "Canal cuya bandeja de pendientes se lista.",
                enum=list(director_chat.CANALES_BANDEJA),
            )
        },
        ["canal"],
    ),
    "director_responder": _esquema(
        {
            "id": _s("string", "Identificador del mensaje al que se responde."),
            "texto": _P_TEXTO,
            "de": _P_DE,
            "canal": _s("string", "Canal del chat.", enum=list(director_chat.CANALES)),
            "modelo": _P_MODELO,
        },
        ["id", "texto", "de", "canal"],
    ),
}

_HERR = [
    ("director_leer", "Lee los últimos mensajes del chat."),
    ("director_decir", "Publica un mensaje en el chat."),
    ("director_bandeja", "Lista los mensajes pendientes de un canal."),
    ("director_responder", "Responde a un mensaje y marca la entrega."),
]
HERRAMIENTAS = [
    {"name": n, "description": d, "inputSchema": ESQUEMAS[n]} for n, d in _HERR
]


def _error(ident, codigo, mensaje):
    err = {"code": codigo, "message": mensaje}
    return {"jsonrpc": "2.0", "id": ident, "error": err}


def _publicar(texto, de, tipo, canal, modelo, responde_a=None):
    rol = "director" if de.startswith("claude") else "agente"
    return director_chat.publicar(
        texto,
        de=de,
        rol=rol,
        tipo=tipo,
        canal=canal,
        modelo=modelo,
        responde_a=responde_a,
    )


def _listar(registros, vacio):
    lineas = [director_chat._formatear(r) for r in registros]
    return "\n".join(lineas) if lineas else vacio


def _llamar(nombre, args):
    """Ejecuta una herramienta y devuelve su texto; ValueError si falla."""
    args = args or {}
    if nombre == "director_leer":
        limite = args.get("limite")
        limite = 20 if limite is None else int(limite)
        if not 1 <= limite <= 200:
            raise ValueError("limite fuera de rango (1-200): %d" % limite)
        registros = director_chat.leer(desde=args.get("desde"), limite=limite)
        return _listar(registros, "Todavía no hay mensajes.")
    if nombre == "director_decir":
        de = args.get("de") or "agente"
        m = _publicar(
            args["texto"], de, "mensaje", args.get("canal") or "ide", args.get("modelo")
        )
        return "Publicado como %s" % m["id"]
    if nombre == "director_bandeja":
        canal = args["canal"]
        if canal not in director_chat.CANALES_BANDEJA:
            raise ValueError("canal sin bandeja: %s" % canal)
        return _listar(director_chat.bandeja(canal), "No hay pendientes en %s." % canal)
    if nombre == "director_responder":
        canal = args["canal"]
        if canal not in director_chat.CANALES:
            raise ValueError("canal no válido: %s" % canal)
        m = _publicar(
            args["texto"], args["de"], "respuesta", canal, args.get("modelo"),
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
    metodo = peticion.get("method") or ""
    if "id" not in peticion or metodo.startswith("notifications/"):
        return None
    ident = peticion["id"]
    if metodo == "initialize":
        params = peticion.get("params") or {}
        version = params.get("protocolVersion")
        if version not in PROTOCOLOS:
            version = PROTOCOLO
        resultado = {
            "protocolVersion": version,
            "serverInfo": {"name": "starseed-director", "version": "1.0.0"},
            "capabilities": {"tools": {}},
            "instructions": INSTRUCCIONES,
        }
        return {"jsonrpc": "2.0", "id": ident, "result": resultado}
    if metodo == "ping":
        return {"jsonrpc": "2.0", "id": ident, "result": {}}
    if metodo == "tools/list":
        return {"jsonrpc": "2.0", "id": ident, "result": {"tools": HERRAMIENTAS}}
    if metodo == "tools/call":
        params = peticion.get("params") or {}
        nombre = params.get("name")
        if nombre not in ESQUEMAS:
            return _error(ident, -32602, "herramienta desconocida: %s" % nombre)
        try:
            texto = _llamar(nombre, params.get("arguments"))
        except (ValueError, KeyError) as e:
            contenido = {
                "content": [{"type": "text", "text": "Error: %s" % e}],
                "isError": True,
            }
            return {"jsonrpc": "2.0", "id": ident, "result": contenido}
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
