#!/usr/bin/env python3
"""Servidor MCP del Chat Director: JSON-RPC 2.0 por stdio, sin dependencias.

Además de las herramientas del Chat Director, suma las de producción de
`architecture/director-produccion.md` §9 (fila MCP): estado, candidatos,
historial, vetar, pausar y reanudar.

Las rutas se pueden inyectar con variables de entorno (útil en pruebas):
STARSEED_PRODUCCION_ESTADO, STARSEED_PRODUCCION_HISTORIAL,
STARSEED_PRODUCCION_VETOS, STARSEED_PRODUCCION_PAUSA,
STARSEED_PRODUCCION_RAIZ (raíz del repo para `candidatos`) y
STARSEED_PRODUCCION_CANDIDATOS (JSON de candidatas, en vez de git).
"""

import json
import os
import sys
import tempfile
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import director_chat
import produccion_candidatos as pc

PROTOCOLOS = ("2025-06-18", "2025-03-26", "2024-11-05")
PROTOCOLO = PROTOCOLOS[0]
INSTRUCCIONES = (
    "Lee y escribe en el Chat Director del Puente de Mando de StarSeed, "
    "y consulta, veta, pausa o reanuda la producción."
)


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
_P_QUIEN = _s("string", "Quién firma la acción (director o persona). Obligatorio.")
_P_MOTIVO = _s("string", "Motivo de la acción; queda registrado. Obligatorio.")


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
    "produccion_estado": _esquema({}, []),
    "produccion_candidatos": _esquema({"limite": _P_LIMITE}, []),
    "produccion_historial": _esquema({"limite": _P_LIMITE}, []),
    "produccion_vetar": _esquema(
        {
            "clave": _s("string", "El `sha` del lote o el `tid` de la tarea a vetar."),
            "quien": _P_QUIEN,
            "motivo": _P_MOTIVO,
        },
        ["clave", "quien", "motivo"],
    ),
    "produccion_pausar": _esquema(
        {"quien": _P_QUIEN, "motivo": _P_MOTIVO}, ["quien", "motivo"]
    ),
    "produccion_reanudar": _esquema(
        {"quien": _P_QUIEN, "motivo": _P_MOTIVO}, ["quien", "motivo"]
    ),
}

_HERR = [
    ("director_leer", "Lee los últimos mensajes del chat."),
    ("director_decir", "Publica un mensaje en el chat."),
    ("director_bandeja", "Lista los mensajes pendientes de un canal."),
    ("director_responder", "Responde a un mensaje y marca la entrega."),
    ("produccion_estado", "Estado del director de producción (y si está pausado)."),
    ("produccion_candidatos", "Candidatas a publicar y su elegibilidad (puerta 1)."),
    ("produccion_historial", "Últimas entradas del historial de producción."),
    ("produccion_vetar", "Veta un sha o una tarea con motivo."),
    ("produccion_pausar", "Pausa la publicación (las puertas siguen corriendo)."),
    ("produccion_reanudar", "Quita la pausa de producción."),
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


# --- Producción: rutas inyectables y helpers (§9, fila MCP) ---

_ESTADO_VACIO = {"lote": None, "candidatos": [], "medios": {}}


def _raiz_repo():
    return os.environ.get("STARSEED_PRODUCCION_RAIZ") or str(
        Path(__file__).resolve().parents[2]
    )


def _ruta_estado():
    return os.environ.get("STARSEED_PRODUCCION_ESTADO") or os.path.join(
        _raiz_repo(), "starseed_memory_root", "mando", "produccion-estado.json"
    )


def _ruta_historial():
    return os.environ.get("STARSEED_PRODUCCION_HISTORIAL") or os.path.expanduser(
        "~/.starseed/produccion/historial.jsonl"
    )


def _ruta_vetos():
    return os.environ.get("STARSEED_PRODUCCION_VETOS") or pc.RUTA_VETOS


def _ruta_pausa():
    return os.environ.get("STARSEED_PRODUCCION_PAUSA") or os.path.expanduser(
        "~/.starseed/produccion-pausada.json"
    )


def _quien_motivo(args):
    """Exige `quien` y `motivo` en las herramientas de escritura."""
    quien = str(args.get("quien") or "").strip()
    motivo = str(args.get("motivo") or "").strip()
    if not quien or not motivo:
        raise ValueError("quien y motivo son obligatorios")
    return quien, motivo


def _limite(args, defecto=20):
    limite = args.get("limite")
    limite = defecto if limite is None else int(limite)
    if not 1 <= limite <= 200:
        raise ValueError("limite fuera de rango (1-200): %d" % limite)
    return limite


def _estado():
    datos = None
    try:
        with open(_ruta_estado(), encoding="utf-8") as f:
            datos = json.load(f)
    except Exception:
        datos = None
    if not isinstance(datos, dict):
        datos = dict(_ESTADO_VACIO)
    datos["pausada"] = os.path.exists(_ruta_pausa())
    return json.dumps(datos, ensure_ascii=False, indent=2, sort_keys=True)


def _candidatas():
    """Candidatas: de un JSON inyectado si existe; si no, de git en la raíz."""
    inyeccion = os.environ.get("STARSEED_PRODUCCION_CANDIDATOS")
    if inyeccion:
        try:
            with open(inyeccion, encoding="utf-8") as f:
                datos = json.load(f)
            return [c for c in datos if isinstance(c, dict)]
        except Exception:
            return []
    return pc.candidatos(_raiz_repo())


def _candidatos(args):
    limite = _limite(args)
    vetos = pc.cargar_vetos(_ruta_vetos())
    lineas = []
    for c in _candidatas()[:limite]:
        ok, motivos = pc.elegible(c, vetos=vetos)
        estado = "elegible" if ok else "bloqueada: %s" % "; ".join(motivos)
        lineas.append(
            "%s [%s] %s — %s"
            % (
                c.get("tarea", "?"),
                str(c.get("sha") or "")[:8],
                estado,
                str(c.get("asunto") or "")[:80],
            )
        )
    return "\n".join(lineas) if lineas else "No hay candidatos pendientes."


def _historial(args):
    limite = _limite(args, defecto=10)
    try:
        with open(_ruta_historial(), encoding="utf-8") as f:
            lineas = [l for l in f.read().splitlines() if l.strip()]
    except OSError:
        return "Sin historial todavía."
    salida = []
    for linea in lineas[-limite:]:
        try:
            d = json.loads(linea)
            resumen = " ".join(
                str(d[k]) for k in ("cuando", "fecha", "sha", "resultado") if d.get(k)
            )
            salida.append(resumen or linea[:160])
        except (json.JSONDecodeError, AttributeError):
            salida.append(linea[:160])
    return "\n".join(salida) if salida else "Sin historial todavía."


def _escribir_pausa(quien, motivo):
    """Crea el interruptor de §4 con escritura atómica (tmp + replace)."""
    ruta = _ruta_pausa()
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    datos = {
        "desde": datetime.now().isoformat(timespec="seconds"),
        "quien": quien,
        "motivo": motivo,
    }
    fd, tmp = tempfile.mkstemp(prefix=".pausa-", dir=os.path.dirname(ruta))
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(datos, f, ensure_ascii=False, indent=2)
            f.write("\n")
        os.replace(tmp, ruta)
    except Exception:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        return False
    return True


def _produccion(nombre, args):
    if nombre == "produccion_estado":
        return _estado()
    if nombre == "produccion_candidatos":
        return _candidatos(args)
    if nombre == "produccion_historial":
        return _historial(args)
    if nombre == "produccion_vetar":
        clave = str(args.get("clave") or "").strip()
        quien, motivo = _quien_motivo(args)
        if not clave:
            raise ValueError("clave (sha o tarea) es obligatoria")
        if not pc.vetar(clave, quien, motivo, ruta=_ruta_vetos()):
            raise ValueError("no se pudo escribir el veto de %s" % clave)
        return "Vetado %s por %s." % (clave, quien)
    if nombre == "produccion_pausar":
        quien, motivo = _quien_motivo(args)
        if not _escribir_pausa(quien, motivo):
            raise ValueError("no se pudo escribir el interruptor de pausa")
        return "Producción pausada por %s: %s" % (quien, motivo)
    if nombre == "produccion_reanudar":
        quien, _motivo = _quien_motivo(args)
        try:
            os.unlink(_ruta_pausa())
        except FileNotFoundError:
            return "Producción no estaba pausada; se reanuda por %s." % quien
        return "Producción reanudada por %s." % quien
    raise ValueError("herramienta desconocida: %s" % nombre)


def _llamar(nombre, args):
    """Ejecuta una herramienta y devuelve su texto; ValueError si falla."""
    args = args or {}
    if nombre.startswith("produccion_"):
        return _produccion(nombre, args)
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
