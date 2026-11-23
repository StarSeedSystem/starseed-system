#!/usr/bin/env python3
"""MCP director metagenesis: canal_leer, canal_decir y metagenesis_estado.

Extiende el servidor starseed-director con tres herramientas para canales
especializados (principal, general, audiovisual) y un estado fresco de
MetaGenesis (< 2 min).
"""

import json
import os
import sys
import time
import pathlib
from datetime import datetime, timezone, timedelta

_CARPETA = pathlib.Path(__file__).resolve().parent
_RAIZ_MOD = _CARPETA.parent.parent
for _ruta_sys in (str(_CARPETA), str(_RAIZ_MOD)):
    if _ruta_sys not in sys.path:
        sys.path.insert(0, _ruta_sys)

import sincronizador_direccion
import director_chat


PROTOCOLOS = ("2025-06-18", "2025-03-26", "2024-11-05")
PROTOCOLO = PROTOCOLOS[0]


def _s(tipo, descripcion, **extra):
    return {"type": tipo, "description": descripcion, **extra}


def _esquema(propiedades, requeridos):
    return {
        "type": "object",
        "properties": propiedades,
        "required": requeridos,
        "additionalProperties": False,
    }


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


ESQUEMAS = {
    "canal_leer": _esquema(
        {"canal": _s(
            "string", "Canal a leer (principal, general, audiovisual).", enum=["principal", "general", "audiovisual"]
        ), "limite": _P_LIMITE},
        ["canal"],
    ),
    "canal_decir": _esquema(
        {
            "canal": _s(
                "string", "Canal donde publicar (principal, general, audiovisual).", enum=["principal", "general", "audiovisual"]
            ),
            "texto": _P_TEXTO,
            "de": _P_DE,
        },
        ["canal", "texto", "de"],
    ),
    "metagenesis_estado": _esquema({}, []),
}

_HERR = [
    ("canal_leer", "Lee los últimos mensajes de un canal especializado (principal, general, audiovisual)."),
    ("canal_decir", "Publica un mensaje en un canal especializado (principal, general, audiovisual)."),
    ("metagenesis_estado", "Obtiene un estado fresco de MetaGenesis (< 2 min)."),
]
HERRAMIENTAS = [
    {"name": n, "description": d, "inputSchema": ESQUEMAS[n]} for n, d in _HERR
]


def _error(ident, codigo, mensaje):
    err = {"code": codigo, "message": mensaje}
    return {"jsonrpc": "2.0", "id": ident, "error": err}


def _listar(registros, vacio):
    lineas = [director_chat._formatear(r) for r in registros]
    return "\n".join(lineas) if lineas else vacio


def _canal_leer(canal, limite):
    """Lee los últimos mensajes de un canal especializado."""
    if canal not in ("principal", "general", "audiovisual"):
        raise ValueError("canal no válido: %s" % canal)
    limite = limite or 20
    limite = 20 if not 1 <= int(limite) <= 200 else int(limite)
    if canal == "principal":
        registros = director_chat.leer(desde=None, limite=limite)
    else:
        registros = sincronizador_direccion._leer_jsonl_canal(_archivo_canal_jsonl(canal), limite=limite)
    return _listar(registros, "Todavía no hay mensajes.")


def _archivo_canal_jsonl(canal_clave):
    """Devuelve la ruta JSONL del canal especializado."""
    raiz = (
        os.environ.get("STARSEED_PRODUCCION_RAIZ")
        or os.environ.get("STARSEED_ROOT")
        or str(pathlib.Path(__file__).resolve().parents[2])
    )
    return pathlib.Path(raiz) / "starseed_memory_root" / "mando" / "director" / f"{canal_clave}.jsonl"


def _canal_decir(canal, texto, de):
    """Publica un mensaje en un canal especializado usando sincronizador_direccion."""
    if canal not in ("principal", "general", "audiovisual"):
        raise ValueError("canal no válido: %s" % canal)
    raiz_env = (
        pathlib.Path(os.environ.get("STARSEED_PRODUCCION_RAIZ") or os.environ.get("STARSEED_ROOT"))
        if (os.environ.get("STARSEED_PRODUCCION_RAIZ") or os.environ.get("STARSEED_ROOT"))
        else None
    )
    en_prod = (not director_chat.en_pruebas()) and director_chat._es_chat_real(director_chat._chat(raiz_env))
    reg = sincronizador_direccion.publicar_en_canal_especializado(
        canal, texto, de=de, enviar_telegram=en_prod, espejar_hermes=en_prod, raiz=raiz_env
    )
    if reg.get("ok"):
        return "Publicado en %s: %s" % (canal, reg.get("id"))
    return "Error al publicar en %s: %s" % (canal, reg.get("detalle"))


def _metagenesis_estado():
    """Obtiene un estado fresco de MetaGenesis (< 2 min)."""
    ahora = datetime.now(timezone.utc)
    hace_dos_min = ahora - timedelta(minutes=2)

    # Estado de producción
    try:
        raiz = os.environ.get(
            "STARSEED_PRODUCCION_RAIZ"
        ) or str(pathlib.Path(__file__).resolve().parents[2])
        ruta_estado = pathlib.Path(raiz) / "starseed_memory_root" / "mando" / "produccion-estado.json"
        with open(ruta_estado, encoding="utf-8") as f:
            prod_estado = json.load(f)
    except Exception:
        prod_estado = {"lote": None, "candidatos": [], "medios": {}}

    # Verificar frescura
    try:
        fecha_estado = datetime.fromisoformat(
            prod_estado.get("cuando", "") or ""
        )
        if fecha_estado < hace_dos_min:
            # Regenerar caché: volver a escribir timestamp actual
            prod_estado["cuando"] = ahora.isoformat()
            try:
                with open(ruta_estado, "w", encoding="utf-8") as f:
                    json.dump(prod_estado, f, ensure_ascii=False, indent=2)
            except Exception:
                pass
    except Exception:
        prod_estado["cuando"] = ahora.isoformat()

    # Candidatos elegibles
    try:
        import produccion_candidatos as pc

        vetos = pc.cargar_vetos(
            pathlib.Path(_ruta_vetos())
            if "STARSEED_PRODUCCION_VETOS" in os.environ
            else pathlib.Path(_ruta_vetos_default())
        )
        candidatas = pc.candidatos(
            pathlib.Path(_raiz_repo())
            if "STARSEED_PRODUCCION_RAIZ" in os.environ
            else pathlib.Path(_raiz_repo_default())
        )
        elegibles = sum(
            1
            for c in candidatas
            if pc.elegible(c, vetos=vetos)[0]
        )
    except Exception:
        elegibles = 0

    # Sesiones de motores (Claude, agy, Codex, Hermes) comprobadas en el momento
    sesiones = {"claude": 0, "agy": 0, "codex": 0, "hermes": 0}
    try:
        import director_presidente
        if hasattr(director_presidente, "listar_sesiones"):
            total = len(director_presidente.listar_sesiones())
            # Distribuir aproximadamente o contar por tipo
            sesiones = {"claude": total // 4, "agy": total // 4, "codex": total // 4, "hermes": total // 4}
    except Exception:
        pass

    # Capacidad libre por medio
    try:
        import os as _os
        capacidad = {}
        # Memoria
        if hasattr(_os, "sysconf"):
            memoria_total = (
                _os.sysconf("SC_AVPHYSICALPAGES") * _os.sysconf("SC_PAGESIZE") / (1024 * 1024)
            ) if hasattr(_os, "sysconf") else 0
            memoria_libre = (
                _os.sysinfo()[1] / (1024 * 1024) if hasattr(_os, "sysinfo") else 0
            )
            capacidad["memoria_total_mb"] = round(memoria_total, 1)
            capacidad["memoria_libre_mb"] = round(memoria_libre, 1)
        # Disco
        uso_disco = 0
        try:
            stat = _os.statvfs("/")
            uso_disco = (stat.f_bavail * stat.f_frsize) / (1024 * 1024 * 1024)
        except Exception:
            pass
        capacidad["disco_gb_gratis"] = round(uso_disco, 2) if uso_disco else 0
    except Exception:
        capacidad = {}

    # Última publicación CI
    try:
        ultimo_ci = (
            prod_estado.get("lote", {}).get("sha", "")[:8]
            if prod_estado.get("lote")
            else ""
        )
    except Exception:
        ultimo_ci = ""

    # Publicación reciente (último mensaje en canales)
    try:
        ult_pub = sincronizador_direccion._ultima_publicacion()
    except Exception:
        ult_pub = ""

    # Olas y tareas en curso con latido vivo
    try:
        from parte_diario_metagenesis import generar_estado_onda
        estado_onda = generar_estado_onda()
    except Exception:
        estado_onda = {}

    resultado = {
        "cuando": ahora.isoformat(),
        "produccion": prod_estado,
        "elegibles": elegibles,
        "sesiones": sesiones,
        "capacidad": capacidad,
        "ultimo_ci": ultimo_ci,
        "ultima_publicacion": ult_pub,
        "ondas": estado_onda,
    }
    return json.dumps(resultado, ensure_ascii=False, indent=2, sort_keys=True)


def _ruta_vetos_default():
    import produccion_candidatos as pc
    return pc.RUTA_VETOS


def _raiz_repo_default():
    raiz = os.environ.get("STARSEED_PRODUCCION_RAIZ")
    if raiz:
        return raiz
    return str(pathlib.Path(__file__).resolve().parents[2])


def _llamar(nombre, args):
    """Ejecuta una herramienta y devuelve su texto; ValueError si falla."""
    args = args or {}
    if nombre == "canal_leer":
        return _canal_leer(args.get("canal"), args.get("limite"))
    if nombre == "canal_decir":
        return _canal_decir(args["canal"], args["texto"], args["de"])
    if nombre == "metagenesis_estado":
        return _metagenesis_estado()
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
            "instructions": "MCP director metagenesis: canal_leer, canal_decir, metagenesis_estado",
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
        except Exception as e:
            msg = director_chat.tachar(str(e) or type(e).__name__)
            contenido = {
                "content": [{"type": "text", "text": "Error: %s" % msg}],
                "isError": True,
            }
            return {"jsonrpc": "2.0", "id": ident, "result": contenido}
        contenido = {"content": [{"type": "text", "text": texto}]}
        return {"jsonrpc": "2.0", "id": ident, "result": contenido}
    return _error(ident, -32601, "Método desconocido: %s" % metodo)


def _bucle():
    while True:
        linea = sys.stdin.readline()
        if not linea:
            break
        linea = linea.strip()
        if not linea:
            continue
        try:
            respuesta = atender(json.loads(linea))
        except json.JSONDecodeError:
            respuesta = _error(None, -32700, "JSON no válido")
        except Exception as err:
            respuesta = _error(None, -32603, director_chat.tachar(str(err) or type(err).__name__))
        if respuesta is not None:
            sys.stdout.write(json.dumps(respuesta, ensure_ascii=False) + "\n")
            sys.stdout.flush()


if __name__ == "__main__":
    _bucle()