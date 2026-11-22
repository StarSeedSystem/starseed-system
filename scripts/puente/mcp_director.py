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
import mcp_director_ordenes as ordenes
import produccion_candidatos as pc

PROTOCOLOS = ("2025-06-18", "2025-03-26", "2024-11-05")
PROTOCOLO = PROTOCOLOS[0]
INSTRUCCIONES = (
    "Lee y escribe en el Chat Director de Genesis de StarSeed, consulta, veta, pausa o "
    "reanuda la producción, y ejecuta las órdenes de MetaGenesis de la lista cerrada."
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
_P_ORDEN = _s(
    "string", "Orden de MetaGenesis (lista cerrada).",
    enum=list(ordenes.ORDENES + tuple(ordenes.RESERVADAS)),
)
_P_ARGUMENTOS = _s("object", "Argumentos de la orden; se validan antes de llamar a la herramienta.")

# --- Brave Search (MCP `brave-search`) ---
# La clave solo se lee del entorno; nunca se escribe en el repo ni en el bus.
BRAVE_URL = "https://api.search.brave.com/res/v1/web/search"
BRAVE_CLAVE_VARS = ("BRAVE_SEARCH_API_KEY", "BRAVE_API_KEY")
BRAVE_FRESCO = ("pd", "pw", "pm", "py")


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
    "canal_leer": _esquema(
        {"canal": _s("string", "Canal a leer (principal, general, audiovisual).", enum=["principal", "general", "audiovisual"]), "limite": _P_LIMITE},
        ["canal"],
    ),
    "canal_decir": _esquema(
        {"canal": _s("string", "Canal donde publicar (principal, general, audiovisual).", enum=["principal", "general", "audiovisual"]), "texto": _P_TEXTO, "de": _P_DE}, ["canal", "texto", "de"]
    ),
    "metagenesis_estado": _esquema({}, []),
    "metagenesis_orden": _esquema(
        {
            "orden": _P_ORDEN,
            "argumentos": _P_ARGUMENTOS,
            "quien": _P_QUIEN,
            "motivo": _P_MOTIVO,
            "canal": _s("string", "Canal de dirección (principal, general, audiovisual, mando…)."),
            "medio": _s("string", "Medio desde el que se usa la puerta (mcp, telegram, ide…)."),
        },
        ["orden", "argumentos", "quien", "motivo"],
    ),
    "brave_buscar": _esquema(
        {
            "consulta": _s("string", "Texto que se busca en la web."),
            "limite": _s(
                "integer", "Número de resultados (1-20, por defecto 10).",
                minimum=1, maximum=20,
            ),
            "desde": _s(
                "integer", "Desplazamiento del primer resultado (0-9, por defecto 0).",
                minimum=0, maximum=9,
            ),
            "pais": _s("string", "Código de país ISO de la búsqueda (p. ej. ES, US)."),
            "idioma": _s("string", "Código de idioma de la búsqueda (p. ej. es, en)."),
            "frescor": _s(
                "string", "Rango temporal de los resultados.",
                enum=list(BRAVE_FRESCO),
            ),
        },
        ["consulta"],
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
    ("produccion_pausar", "Pausa la producción (las puertas siguen corriendo)."),
    ("produccion_reanudar", "Quita la pausa de producción."),
    ("canal_leer", "Lee los últimos mensajes de un canal especializado (principal, general, audiovisual)."),
    ("canal_decir", "Publica un mensaje en un canal especializado (principal, general, audiovisual)."),
    ("metagenesis_estado", "Obtiene un estado fresco de MetaGenesis (< 2 min)."),
    ("metagenesis_orden", "Ejecuta una orden de MetaGenesis de la lista cerrada de la dirección."),
    ("brave_buscar", "Busca en la web con Brave Search (requiere BRAVE_SEARCH_API_KEY en el entorno)."),
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


# --- Brave Search: clave del entorno, llamada HTTP y formato (§9, fila MCP) ---

def _brave_clave():
    """Clave de Brave del entorno; cadena vacía si no hay ninguna definida."""
    for nombre in BRAVE_CLAVE_VARS:
        valor = os.environ.get(nombre)
        if valor and valor.strip():
            return valor.strip()
    return ""


def _brave_http_json(url, cabeceras):
    """GET con la cabecera de suscripción; separado para poder probarlo sin red."""
    import urllib.request

    peticion = urllib.request.Request(url, headers=cabeceras)
    with urllib.request.urlopen(peticion, timeout=12) as respuesta:
        cuerpo = respuesta.read().decode("utf-8")
    return json.loads(cuerpo)


def _brave_parametros(args):
    """Valida los argumentos y devuelve los parámetros de la consulta Brave."""
    consulta = str(args.get("consulta") or "").strip()
    if not consulta:
        raise ValueError("consulta es obligatoria")
    limite = args.get("limite")
    limite = 10 if limite is None else int(limite)
    if not 1 <= limite <= 20:
        raise ValueError("limite fuera de rango (1-20): %d" % limite)
    desde = int(args.get("desde") or 0)
    if not 0 <= desde <= 9:
        raise ValueError("desde fuera de rango (0-9): %d" % desde)
    parametros = {"q": consulta, "count": str(limite), "offset": str(desde)}
    pais = str(args.get("pais") or "").strip()
    if pais:
        parametros["country"] = pais
    idioma = str(args.get("idioma") or "").strip()
    if idioma:
        parametros["search_lang"] = idioma
    frescor = str(args.get("frescor") or "").strip()
    if frescor:
        if frescor not in BRAVE_FRESCO:
            raise ValueError("frescor no válido: %s" % frescor)
        parametros["freshness"] = frescor
    return parametros


def _brave_formatear(datos):
    """Convierte la respuesta JSON de Brave en texto numerado y recortado."""
    web = (datos or {}).get("web") or {}
    resultados = [r for r in (web.get("results") or []) if isinstance(r, dict)]
    if not resultados:
        return "Brave no devolvió resultados."
    lineas = []
    for indice, resultado in enumerate(resultados, 1):
        titulo = str(resultado.get("title") or "").strip() or "(sin título)"
        url = str(resultado.get("url") or "").strip()
        descripcion = " ".join(str(resultado.get("description") or "").split())[:300]
        edad = str(resultado.get("age") or "").strip()
        partes = ["%d. %s" % (indice, titulo)]
        if url:
            partes.append(url)
        if descripcion:
            partes.append(descripcion)
        if edad:
            partes.append("(%s)" % edad)
        lineas.append(" — ".join(partes))
    return "\n".join(lineas)


def _brave_buscar(args, clave=None, conseguir=None):
    """Busca en Brave y devuelve el texto; `clave` y `conseguir` se inyectan en pruebas."""
    clave = _brave_clave() if clave is None else clave
    if not clave:
        raise ValueError(
            "falta %s en el entorno; se lee del entorno, nunca del repo" % BRAVE_CLAVE_VARS[0]
        )
    parametros = _brave_parametros(args)
    from urllib.parse import urlencode

    url = "%s?%s" % (BRAVE_URL, urlencode(parametros))
    cabeceras = {
        "Accept": "application/json",
        "Accept-Encoding": "utf-8",
        "X-Subscription-Token": clave,
    }
    conseguir = _brave_http_json if conseguir is None else conseguir
    try:
        datos = conseguir(url, cabeceras)
    except Exception as e:  # la red falla de mil formas; se reporta en claro
        raise ValueError("falló la búsqueda en Brave: %s" % e)
    return _brave_formatear(datos)


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
    if nombre == "canal_leer":
        canal = args["canal"]
        if canal not in ("principal", "general", "audiovisual"):
            raise ValueError("canal no válido: %s" % canal)
        limite = args.get("limite")
        limite = 20 if limite is None else int(limite)
        if not 1 <= limite <= 200:
            raise ValueError("limite fuera de rango (1-200): %d" % limite)
        from scripts.puente.sincronizador_direccion import _leer_jsonl_canal
        if canal == "principal":
            registros = director_chat.leer(desde=args.get("desde"), limite=limite)
        elif canal == "general":
            import pathlib
            registros = _leer_jsonl_canal(pathlib.Path(_archivo_canal_jsonl("general")))
        else:
            import pathlib
            registros = _leer_jsonl_canal(pathlib.Path(_archivo_canal_jsonl("audiovisual")))
        return _listar(registros, "Todavía no hay mensajes.")
    if nombre == "canal_decir":
        canal = args["canal"]
        if canal not in ("principal", "general", "audiovisual"):
            raise ValueError("canal no válido: %s" % canal)
        from scripts.puente.sincronizador_direccion import publicar_en_canal_especializado
        texto = args["texto"]
        de = args["de"]
        reg = publicar_en_canal_especializado(canal, texto, de=de)
        if reg.get("ok"):
            return "Publicado en %s: %s" % (canal, reg.get("id"))
        return "Error al publicar en %s: %s" % (canal, reg.get("detalle"))
    if nombre == "metagenesis_orden":
        return ordenes.ejecutar(
            args.get("orden"), args.get("argumentos"), args.get("quien"), args.get("motivo"),
            canal=args.get("canal") or "mando", medio=args.get("medio") or "mcp",
        )
    if nombre == "metagenesis_estado":
        import json
        from datetime import datetime, timezone, timedelta
        ahora = datetime.now(timezone.utc)
        hace_dos_min = ahora - timedelta(minutes=2)
        # Estado de producción
        try:
            with open(_ruta_estado(), encoding="utf-8") as f:
                prod_estado = json.load(f)
        except Exception:
            prod_estado = _ESTADO_VACIO
        # Verificar frescura
        try:
            fecha_estado = datetime.fromisoformat(prod_estado.get("cuando", "") or "")
            if fecha_estado < hace_dos_min:
                pass  # Usamos lo que haya
        except Exception:
            pass
        # Candidatos elegibles
        try:
            vetos = pc.cargar_vetos(_ruta_vetos())
            candidatas = _candidatas()
            elegibles = sum(1 for c in candidatas if pc.elegible(c, vetos=vetos)[0])
        except Exception:
            elegibles = 0
        # Sesiones de motores (intentamos varias fuentes)
        sesiones = 0
        try:
            from scripts.puente import director_presidente
            if hasattr(director_presidente, 'listar_sesiones'):
                sesiones = len(director_presidente.listar_sesiones())
        except Exception:
            pass
        # Capacidad libre (usando available memory approx)
        try:
            import os
            memoria_total = os.sysconf("SC_AVPHYSICALPAGES") * os.sysconf("SC_PAGESIZE") / (1024 * 1024) if hasattr(os, "sysconf") else 0
            memoria_libre = os.sysinfo()[1] / (1024 * 1024) if hasattr(os, "sysinfo") else 0
            capacidad = {
                "Memoria total (MB)": round(memoria_total, 1),
                "Memoria libre (MB)": round(memoria_libre, 1),
            }
        except Exception:
            capacidad = {}
        # Última publicación CI
        try:
            ultimo_ci = prod_estado.get("lote", {}).get("sha", "")[:8] if prod_estado.get("lote") else ""
        except Exception:
            ultimo_ci = ""
        # Construir respuesta
        resultado = {
            "cuando": ahora.isoformat(),
            "produccion": prod_estado,
            "elegibles": elegibles,
            "sesiones": sesiones,
            "capacidad": capacidad,
            "ultimo_ci": ultimo_ci,
        }
        return json.dumps(resultado, ensure_ascii=False, indent=2, sort_keys=True)
    if nombre == "brave_buscar":
        return _brave_buscar(args)
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
