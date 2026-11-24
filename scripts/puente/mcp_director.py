#!/usr/bin/env python3
"""Servidor MCP del Chat Director: JSON-RPC 2.0 por stdio, sin dependencias.

Además de las herramientas del Chat Director, suma las de producción de
`architecture/director-produccion.md` §9 (fila MCP): estado, candidatos,
historial, vetar, pausar y reanudar, cuatro herramientas sqlite de solo
lectura (estado, tablas, esquema y consulta) sobre una base permitida, tres
herramientas postgres de solo lectura (CAP1119): estado, prueba y consulta, y
tres herramientas brave-search de solo lectura (CAP1119): estado, prueba y
búsqueda web.

La base sqlite se elige con `STARSEED_SQLITE_RUTA` (por defecto
`~/.starseed/mcp-sqlite/starseed.db`) y se confina al repo, a ese directorio
o al directorio de la ruta fijada. Las consultas son SELECT/WITH parametrizadas.

La conexión postgres se toma de la primera variable definida entre
`STARSEED_SUPABASE_DB_URL`, `SUPABASE_DB_URL`, `DATABASE_URL`, `POSTGRES_URL` o
`POSTGRES_PRISMA_URL`; su valor nunca se escribe en el repo, se pasa por argv ni
se devuelve en un mensaje. Las consultas son SELECT/CTE con tope de filas.

La clave de Brave Search se toma de `BRAVE_API_KEY` o `BRAVE_SEARCH_API_KEY` y
solo viaja en la cabecera `X-Subscription-Token`; su valor nunca se escribe en el
repo, se pasa por argv ni se devuelve en un mensaje. El endpoint se puede inyectar
con `STARSEED_BRAVE_URL` (útil para probar con un servidor local).

Las rutas se pueden inyectar con variables de entorno (útil en pruebas):
STARSEED_PRODUCCION_ESTADO, STARSEED_PRODUCCION_HISTORIAL,
STARSEED_PRODUCCION_VETOS, STARSEED_PRODUCCION_PAUSA,
STARSEED_PRODUCCION_RAIZ (raíz del repo para `candidatos`) y
STARSEED_PRODUCCION_CANDIDATOS (JSON de candidatas, en vez de git).
"""

import gzip
import json
import os
import re
import sqlite3
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlencode, urlsplit

sys.path.insert(0, str(Path(__file__).resolve().parent))

import director_chat
import mcp_director_ordenes as ordenes
import produccion_candidatos as pc

PROTOCOLOS = ("2025-06-18", "2025-03-26", "2024-11-05")
PROTOCOLO = PROTOCOLOS[0]
INSTRUCCIONES = (
    "Lee y escribe en el Chat Director de Genesis de StarSeed, consulta, veta, pausa o "
    "reanuda la producción, ejecuta las órdenes de MetaGenesis de la lista cerrada, "
    "consulta bases sqlite locales y postgres remoto en solo lectura y busca en la web con "
    "brave-search sin revelar credenciales."
)

_SQLITE_DIR = os.path.join(os.path.expanduser("~"), ".starseed", "mcp-sqlite")
_SQLITE_DEFECTO = os.path.join(_SQLITE_DIR, "starseed.db")


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
_P_SQLITE_RUTA = _s("string", "Ruta de la base sqlite (por defecto STARSEED_SQLITE_RUTA).")
_P_SQLITE_TABLA = _s("string", "Nombre de una tabla listada por sqlite_tablas.")
_P_SQLITE_SQL = _s("string", "Consulta SELECT o WITH; la conexión es de solo lectura.")
_P_SQLITE_PARAMETROS = _s("array", "Parámetros de la consulta en orden; nunca interpolados en el SQL.")
_P_SQLITE_LIMITE = _s(
    "integer", "Máximo de filas a devolver (por defecto 50).", minimum=1, maximum=200
)
_P_SQL = _s("string", "Una sola consulta SELECT/CTE de solo lectura (sin ';' ni comentarios).")
_P_BRAVE_Q = _s("string", "Qué buscar en la web (máximo 400 caracteres).")
_P_BRAVE_PAIS = _s("string", "Código ISO de dos letras para regionalizar (ES, US…).")
_P_BRAVE_LIMITE = _s(
    "integer", "Máximo de resultados a devolver (por defecto 5).", minimum=1, maximum=20
)


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
    "sqlite_estado": _esquema({}, []),
    "sqlite_tablas": _esquema({"ruta": _P_SQLITE_RUTA}, []),
    "sqlite_esquema": _esquema(
        {"tabla": _P_SQLITE_TABLA, "ruta": _P_SQLITE_RUTA}, ["tabla"]
    ),
    "sqlite_consulta": _esquema(
        {
            "sql": _P_SQLITE_SQL,
            "parametros": _P_SQLITE_PARAMETROS,
            "limite": _P_SQLITE_LIMITE,
            "ruta": _P_SQLITE_RUTA,
        },
        ["sql"],
    ),
    "postgres_estado": _esquema({}, []),
    "postgres_probar": _esquema({}, []),
    "postgres_consultar": _esquema({"sql": _P_SQL, "limite": _P_SQLITE_LIMITE}, ["sql"]),
    "brave_estado": _esquema({}, []),
    "brave_probar": _esquema({}, []),
    "brave_buscar": _esquema(
        {"q": _P_BRAVE_Q, "limite": _P_BRAVE_LIMITE, "pais": _P_BRAVE_PAIS}, ["q"]
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
    ("sqlite_estado", "Comprueba la conexión sqlite: base configurada, abierta y número de tablas."),
    ("sqlite_tablas", "Lista las tablas de la base sqlite permitida."),
    ("sqlite_esquema", "Devuelve el CREATE TABLE de una tabla sqlite."),
    ("sqlite_consulta", "Ejecuta un SELECT o WITH parametrizado sobre sqlite (solo lectura)."),
    ("postgres_estado", "Informa si hay conexión postgres configurada, sin revelar credenciales."),
    ("postgres_probar", "Comprueba la conexión postgres con SELECT 1, en modo solo lectura."),
    ("postgres_consultar", "Consulta postgres en solo lectura (SELECT/CTE), con límite de filas."),
    ("brave_estado", "Informa si hay clave de brave-search configurada, sin revelar su valor."),
    ("brave_probar", "Comprueba la conexión con brave-search con una búsqueda mínima."),
    ("brave_buscar", "Busca en la web con brave-search y devuelve título, url y descripción."),
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


# --- SQLite: conexión de solo lectura a bases permitidas ---

def _sqlite_ruta(args=None):
    """Resuelve la base y la confina al repo, a ~/.starseed/mcp-sqlite o a la ruta fijada."""
    args = args or {}
    indicada = args.get("ruta") or os.environ.get("STARSEED_SQLITE_RUTA") or _SQLITE_DEFECTO
    real = os.path.realpath(os.path.expanduser(str(indicada)))
    raices = [os.path.realpath(_raiz_repo()), os.path.realpath(_SQLITE_DIR)]
    fija = os.environ.get("STARSEED_SQLITE_RUTA")
    if fija:
        raices.append(os.path.dirname(os.path.realpath(os.path.expanduser(fija))))
    if not any(real == r or real.startswith(r + os.sep) for r in raices):
        raise ValueError("base sqlite fuera de las raíces permitidas")
    if not os.path.isfile(real):
        raise ValueError("no existe la base sqlite: %s" % real)
    return real


def _sqlite_conectar(ruta):
    """Abre con `mode=ro`: un DELETE o DROP no puede escribir aunque se filtre."""
    return sqlite3.connect(Path(ruta).as_uri() + "?mode=ro", uri=True)


def _sqlite_objetos(ruta, tipo, nombre=None):
    sql = "SELECT name, sql FROM sqlite_master WHERE type = ?"
    parametros = [tipo]
    if nombre is not None:
        sql += " AND name = ?"
        parametros.append(nombre)
    con = _sqlite_conectar(ruta)
    try:
        return con.execute(sql + " ORDER BY name", parametros).fetchall()
    finally:
        con.close()


def _sqlite(nombre, args):
    if nombre == "sqlite_estado":
        try:
            ruta = _sqlite_ruta()
        except ValueError as e:
            return json.dumps({"configurada": False, "detalle": str(e)}, ensure_ascii=False, indent=2)
        try:
            con = _sqlite_conectar(ruta)
            try:
                con.execute("SELECT 1").fetchone()
            finally:
                con.close()
            tablas = len(_sqlite_objetos(ruta, "table"))
            datos = {"configurada": True, "ruta": ruta, "conectada": True, "tablas": tablas}
        except sqlite3.Error as e:
            datos = {"configurada": True, "ruta": ruta, "conectada": False, "detalle": str(e)}
        return json.dumps(datos, ensure_ascii=False, indent=2)
    ruta = _sqlite_ruta(args)
    if nombre == "sqlite_tablas":
        nombres = [f[0] for f in _sqlite_objetos(ruta, "table") if not f[0].startswith("sqlite_")]
        return json.dumps(nombres, ensure_ascii=False, indent=2)
    if nombre == "sqlite_esquema":
        tabla = str(args.get("tabla") or "").strip()
        if not tabla:
            raise ValueError("tabla es obligatoria")
        filas = _sqlite_objetos(ruta, "table", tabla)
        if not filas:
            raise ValueError("no existe la tabla: %s" % tabla)
        return str(filas[0][1] or "")
    if nombre == "sqlite_consulta":
        sql = str(args.get("sql") or "").strip()
        primera = sql.split(None, 1)[0].upper() if sql else ""
        if primera not in ("SELECT", "WITH"):
            raise ValueError("solo se permiten SELECT o WITH: sqlite es de solo lectura")
        parametros = args.get("parametros") or []
        if not isinstance(parametros, list):
            raise ValueError("parametros debe ser una lista")
        limite = _limite(args, defecto=50)
        con = _sqlite_conectar(ruta)
        try:
            cur = con.execute(sql, parametros)
            columnas = [d[0] for d in cur.description] if cur.description else []
            filas = [dict(zip(columnas, fila)) for fila in cur.fetchmany(limite + 1)]
        finally:
            con.close()
        datos = {
            "columnas": columnas,
            "filas": filas[:limite],
            "truncada": len(filas) > limite,
        }
        return json.dumps(datos, ensure_ascii=False, indent=2, default=str)
    raise ValueError("herramienta desconocida: %s" % nombre)


# --- Postgres de solo lectura para tareas (CAP1119) ---
# Un solo sitio define la conexión: el NOMBRE de la variable de entorno. El valor
# nunca se escribe en el repo, se pasa por argv ni se devuelve en un mensaje.

VARIABLES_DB = ("STARSEED_SUPABASE_DB_URL", "SUPABASE_DB_URL", "DATABASE_URL",
                "POSTGRES_URL", "POSTGRES_PRISMA_URL")
_SQL_LECTURA = re.compile(r"^\s*(select|with)\b", re.I)
_SQL_ESCRITURA = re.compile(
    r"\b(insert|update|delete|drop|alter|create|truncate|grant|revoke|copy|call|execute)\b", re.I
)
_SQL_LIMIT = re.compile(r"\blimit\b", re.I)


def _variable_db(entorno=None):
    """PURA: nombre de la primera variable de conexión definida, nunca su valor."""
    fuente = os.environ if entorno is None else entorno
    for nombre in VARIABLES_DB:
        if (fuente.get(nombre) or "").strip():
            return nombre
    return None


def _sin_secreto(texto, secretos):
    """PURA: tacha la URL y su contraseña antes de devolver salida o error."""
    valores = secretos if isinstance(secretos, tuple) else (secretos,)
    for valor in valores:
        if valor:
            texto = texto.replace(valor, "***")
    return texto


def _entorno_psql(valor, base):
    """PURA: reparte la URL entre variables libpq; jamás va en argv ni en un log."""
    env = dict(base)
    partes = urlsplit(valor)
    if partes.scheme in ("postgres", "postgresql") and partes.hostname:
        try:
            puerto = partes.port or 5432
        except ValueError:
            puerto = 5432
        host = partes.hostname
        # urlsplit devuelve el host IPv6 sin corchetes; libpq los necesita.
        if ":" in host and not host.startswith("["):
            host = "[%s]" % host
        env["PGHOST"] = unquote(host)
        env["PGPORT"] = str(puerto)
        env["PGUSER"] = unquote(partes.username or "")
        env["PGPASSWORD"] = unquote(partes.password or "")
        env["PGDATABASE"] = unquote(partes.path.lstrip("/")) or "postgres"
        opciones = parse_qs(partes.query)
        if opciones.get("sslmode"):
            env["PGSSLMODE"] = opciones["sslmode"][0]
        elif host not in ("localhost", "127.0.0.1", "::1", "[::1]"):
            env["PGSSLMODE"] = "require"
    else:
        env["PGDATABASE"] = valor
    env["PGOPTIONS"] = "-c default_transaction_read_only=on -c statement_timeout=8000"
    env["PGCONNECT_TIMEOUT"] = "5"
    return env


def _validar_sql(sql, limite=50):
    """PURA: exige una sola consulta SELECT/CTE, sin comentarios, con tope de filas."""
    consulta = str(sql or "").strip().rstrip(";").strip()
    if not consulta or ";" in consulta:
        raise ValueError("una sola consulta SELECT/CTE, sin ';'")
    if "--" in consulta or "/*" in consulta or "*/" in consulta:
        raise ValueError("sin comentarios SQL: escribe la consulta completa")
    if not _SQL_LECTURA.match(consulta) or _SQL_ESCRITURA.search(consulta):
        raise ValueError("solo lectura: usa SELECT o WITH; están prohibidas las escrituras")
    try:
        tope = 50 if limite is None else int(limite)
    except (TypeError, ValueError):
        raise ValueError("limite debe ser un número entero (1-200)")
    if not 1 <= tope <= 200:
        raise ValueError("limite fuera de rango (1-200)")
    if not _SQL_LIMIT.search(consulta):
        consulta += " LIMIT %d" % tope
    return consulta, tope


def _ejecutar_psql(consulta, variable, entorno=None, ejecutar=None):
    """Ejecuta la consulta con `psql`; la URL viaja por entorno y la sesión es read-only."""
    base = os.environ if entorno is None else entorno
    valor = (base.get(variable) or "").strip()
    env = _entorno_psql(valor, base)
    secretos = (valor, env.get("PGPASSWORD", ""))
    orden = ["psql", "-X", "-q", "-v", "ON_ERROR_STOP=1", "-c", consulta]
    corr = ejecutar or subprocess.run
    try:
        hecho = corr(orden, capture_output=True, text=True, timeout=15, env=env)
    except (OSError, subprocess.TimeoutExpired) as fallo:
        raise ValueError("psql no disponible o sin respuesta: %s" % type(fallo).__name__)
    if getattr(hecho, "returncode", 1) != 0:
        error = (getattr(hecho, "stderr", "") or "error de psql").strip()
        raise ValueError(_sin_secreto(error, secretos))
    salida = (getattr(hecho, "stdout", "") or "").strip()
    return _sin_secreto(salida, secretos) or "(sin filas)"


def _postgres(nombre, args):
    """Despacha las herramientas postgres; la URL nunca aparece en la respuesta."""
    if nombre == "postgres_estado":
        variable = _variable_db()
        return json.dumps({
            "configurado": bool(variable),
            "variable": variable,
            "modo": "solo-lectura",
            "controlador": "psql",
            "variables_aceptadas": list(VARIABLES_DB),
        }, ensure_ascii=False, indent=2, sort_keys=True)
    variable = _variable_db()
    if not variable:
        raise ValueError("sin conexión: define una de %s" % ", ".join(VARIABLES_DB))
    if nombre == "postgres_probar":
        return "Conexión OK con %s (solo lectura): %s" % (
            variable, _ejecutar_psql("SELECT 1 AS ok", variable))
    if nombre == "postgres_consultar":
        consulta, _tope = _validar_sql(args.get("sql"), args.get("limite"))
        return _ejecutar_psql(consulta, variable)
    raise ValueError("herramienta desconocida: %s" % nombre)


# --- Brave Search de solo lectura para tareas (CAP1119) ---
# La clave se toma del NOMBRE de la variable de entorno; su valor nunca se
# escribe en el repo, se pasa por argv ni se devuelve en un mensaje. El
# endpoint se puede inyectar con STARSEED_BRAVE_URL (útil en pruebas).

VARIABLES_BRAVE = ("BRAVE_API_KEY", "BRAVE_SEARCH_API_KEY")
_URL_BRAVE = "https://api.search.brave.com/res/v1/web/search"


def _variable_brave(entorno=None):
    """PURA: nombre de la primera variable de la clave de Brave, nunca su valor."""
    fuente = os.environ if entorno is None else entorno
    for nombre in VARIABLES_BRAVE:
        if (fuente.get(nombre) or "").strip():
            return nombre
    return None


def _url_brave(q, limite, pais=None, base=None):
    """PURA: URL del endpoint web de Brave con los parámetros escapados."""
    parametros = {"q": q, "count": str(limite)}
    if pais:
        parametros["country"] = str(pais).upper()
    return "%s?%s" % (base or _URL_BRAVE, urlencode(parametros))


def _validar_busqueda(q, limite=5, pais=None):
    """PURA: consulta no vacía (≤400), tope 1-20 y país ISO de dos letras."""
    texto = " ".join(str(q or "").split())
    if not texto:
        raise ValueError("q es obligatoria: escribe qué buscar")
    if len(texto) > 400:
        raise ValueError("q supera los 400 caracteres")
    try:
        tope = 5 if limite is None else int(limite)
    except (TypeError, ValueError):
        raise ValueError("limite debe ser un número entero (1-20)")
    if not 1 <= tope <= 20:
        raise ValueError("limite fuera de rango (1-20)")
    codigo = None
    if pais:
        codigo = str(pais).strip().upper()
        if len(codigo) != 2 or not codigo.isalpha():
            raise ValueError("pais debe ser un código ISO de dos letras (ES, US…)")
    return texto, tope, codigo


def _extraer_resultados(datos, limite=5):
    """PURA: deja solo título, url y descripción sin etiquetas de cada resultado web."""
    if not isinstance(datos, dict):
        raise ValueError("respuesta de Brave no válida")
    web = datos.get("web")
    crudos = (web.get("results") if isinstance(web, dict) else None) or []
    salida = []
    for item in crudos[:limite]:
        if not isinstance(item, dict):
            continue
        salida.append({
            "titulo": str(item.get("title") or "").strip(),
            "url": str(item.get("url") or "").strip(),
            "descripcion": re.sub(r"<[^>]+>", "", str(item.get("description") or "")).strip(),
        })
    return salida


def _ejecutar_brave(url, clave, abrir=None):
    """Pide a Brave con la clave en cabecera; jamás en la URL, argv o un log."""
    secretos = (clave,)
    peticion = urllib.request.Request(url, headers={
        "Accept": "application/json",
        "Accept-Encoding": "gzip",
        "X-Subscription-Token": clave,
        "User-Agent": "starseed-director/1.0",
    })
    lector = abrir or urllib.request.urlopen
    try:
        with lector(peticion, timeout=10) as respuesta:
            cuerpo = respuesta.read()
            cabeceras = getattr(respuesta, "headers", None)
            codificacion = ""
            if cabeceras is not None:
                codificacion = (cabeceras.get("Content-Encoding") or "").lower()
            if codificacion == "gzip":
                cuerpo = gzip.decompress(cuerpo)
    except urllib.error.HTTPError as fallo:
        codigo = getattr(fallo, "code", 0)
        if codigo in (401, 403):
            raise ValueError("Brave rechazó la clave (HTTP %d): revisa la variable" % codigo)
        if codigo == 429:
            raise ValueError("Brave sin cuota ahora (HTTP 429): espera o usa otra fuente")
        detalle = getattr(fallo, "reason", "") or ""
        mensaje = "Brave respondió HTTP %d %s" % (codigo, detalle)
        raise ValueError(_sin_secreto(mensaje, secretos).rstrip())
    except (urllib.error.URLError, OSError, TimeoutError) as fallo:
        raise ValueError("sin conexión con Brave: %s" % type(fallo).__name__)
    try:
        datos = json.loads(cuerpo.decode("utf-8"))
    except (ValueError, UnicodeDecodeError):
        raise ValueError("Brave devolvió una respuesta ilegible")
    if isinstance(datos, dict) and isinstance(datos.get("error"), dict):
        error = datos["error"]
        detalle = error.get("detail") or error.get("message") or "error de Brave"
        raise ValueError(_sin_secreto(str(detalle), secretos))
    return datos


def _brave(nombre, args):
    """Despacha las herramientas brave-search; la clave nunca sale en la respuesta."""
    variable = _variable_brave()
    if nombre == "brave_estado":
        return json.dumps({
            "configurada": bool(variable),
            "variable": variable,
            "variables_aceptadas": list(VARIABLES_BRAVE),
            "endpoint": os.environ.get("STARSEED_BRAVE_URL") or _URL_BRAVE,
            "modo": "solo-lectura",
        }, ensure_ascii=False, indent=2, sort_keys=True)
    if not variable:
        raise ValueError("sin conexión: define una de %s" % ", ".join(VARIABLES_BRAVE))
    clave = (os.environ.get(variable) or "").strip()
    if nombre == "brave_probar":
        consulta, tope, pais = _validar_busqueda("StarSeed OS", 1)
        url = _url_brave(consulta, tope, pais, os.environ.get("STARSEED_BRAVE_URL"))
        encontrados = _extraer_resultados(_ejecutar_brave(url, clave), tope)
        return "Conexión OK con %s: %d resultado(s) para «%s»." % (
            variable, len(encontrados), consulta)
    if nombre == "brave_buscar":
        consulta, tope, pais = _validar_busqueda(
            args.get("q"), args.get("limite"), args.get("pais"))
        url = _url_brave(consulta, tope, pais, os.environ.get("STARSEED_BRAVE_URL"))
        return json.dumps(
            _extraer_resultados(_ejecutar_brave(url, clave), tope),
            ensure_ascii=False, indent=2,
        )
    raise ValueError("herramienta desconocida: %s" % nombre)


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
    if nombre.startswith("sqlite_"):
        return _sqlite(nombre, args)
    if nombre.startswith("postgres_"):
        return _postgres(nombre, args)
    if nombre.startswith("brave_"):
        return _brave(nombre, args)
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
