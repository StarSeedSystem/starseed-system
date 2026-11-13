# -*- coding: utf-8 -*-
"""Chats de Genesis en Astraura · lógica PURA del puente de la Mac (GEN1113B).

Contrato: architecture/astraura-chats-genesis.md §4.3.2, §4.4, §4.5, §5.2 y §7.5. Aquí no hay disco,
red, reloj ni entorno: todo llega por argumento y sale como dato. El servicio que hace los efectos es
`genesis_chats_puerta.py`.

Reglas que se comprueban (y por qué):
- Sin la lista local de cuentas (`~/.starseed/genesis-chats/cuentas.json`) no se ejecuta nada (D8).
- El rol que vale es el MENOR entre el de la puerta y el de la lista local: un dueño en la puerta que no
  está en la lista local es solo lector, y una fila de Supabase cambiada no basta. (GEN1113INT) Una puerta
  COMPROMETIDA sí basta: la cuenta y el rol los pone la puerta y nada viene firmado desde el aparato, así
  que puede presentar entradas a nombre de un dueño de la lista. Ver el contrato, §4.3, «Límite conocido».
- Solo el dueño pone a trabajar a un agente o da órdenes (D5); el desarrollador escribe al hilo `mando`.
- Las órdenes que cambian algo caducan a los 30 min de recibirse (D7); los mensajes no.
- El registro nunca lleva texto ni argumentos de texto.
"""
import json
import re
import time
from datetime import datetime, timezone

FUENTES = ("direccion", "puente:hermes-avisos", "puente:peticiones", "puente:avisos-directores")
ORDENES_A = {"estado", "olas", "cola", "puertas", "agentes", "ayuda", "aprobar", "rechazar", "soltar", "reasignar", "decir", "a"}
CAMBIAN = {"aprobar", "rechazar", "soltar", "reasignar"}            # + dirección con motor
LECTURA_A = {"estado", "olas", "cola", "puertas", "agentes", "ayuda"}
CADUCIDAD_S = 1800
VISTOS_S = 7 * 24 * 3600

#: Fuentes en las que la Mac acepta entradas (el puente B va al A1, §7.1 «Destinos»).
FUENTES_ENTRADA_MAC = ("direccion", "puente:hermes-avisos")
ACCIONES = {"direccion": ("decir", "responder", "reenviar"), "puente:hermes-avisos": ("orden", "texto")}
#: El mismo orden que `CANALES` de director_chat.py y chat-director-tipos.ts.
CANALES = ("mando", "director-presidente", "claude-cowork", "claude-mac", "hermes", "telegram",
           "chatgpt", "antigravity", "ide", "terminal")
MODELO_HERMES = "hermes/predeterminado"
RUTA_DIRECTOR = "/api/mando/director-chat"
RUTA_ESTADO = "/api/mando/estado"

RE_NONCE = re.compile(r"^[A-Za-z0-9_-]{22,32}$")
RE_CUENTA = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
RE_ID_TAREA = re.compile(r"^[A-Za-z0-9_.-]{2,40}$")
RE_MODELO = re.compile(r"^[a-z0-9._/:-]{3,120}$")
RE_MD = re.compile(r"^md-\d{10,16}-[0-9a-f]{4}$")
RE_AGENTE = re.compile(r"^[A-Za-z0-9_.-]{1,40}$")
MAX_TEXTO = 8000
MAX_ARGS = 10
MAX_ARG = 120

# Motivos fijos: nunca llevan texto de quien escribe (van al registro y al acuse).
SIN_LISTA = "falta la lista de cuentas en la Mac"
FUERA_DE_LISTA = "tu cuenta no está en la lista de la Mac: solo lectura"
SOLO_DUENO = "esta orden solo la puede dar un dueño de MetaGenesis"
NO_PERMITIDA = "orden no permitida"
CADUCADA = "caducó sin ejecutarse (la Mac estaba apagada); vuelve a enviarla si aún la quieres"
REPETIDO = "nonce repetido"
FORMA = "entrada mal formada"
DESTINO = "esta entrada no es para la Mac"


def _txt(v):
    return v if isinstance(v, str) else ""


def epoch_de(t):
    """Epoch en segundos de un ISO con zona, o «AAAA-MM-DD HH:MM:SS» como hora local. Ilegible → 0."""
    s = _txt(t).strip()
    if not s:
        return 0.0
    m = re.match(r"^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$", s)
    if m:
        try:
            return time.mktime(tuple(int(x or 0) for x in m.groups()) + (0, 0, -1))
        except (OverflowError, ValueError):
            return 0.0
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00")).timestamp()
    except ValueError:
        return 0.0


def iso_utc(epoch):
    return datetime.fromtimestamp(epoch, timezone.utc).isoformat().replace("+00:00", "Z")


def cuenta8(cuenta):
    return re.sub(r"[^0-9a-f-]", "", _txt(cuenta).lower())[:8]


def quien_web(cuenta):
    """`quien` de lo que se ejecuta desde la web (§4.4): «genesis-web-» + 8 primeros de la cuenta."""
    return "genesis-web-%s" % cuenta8(cuenta)


# ── cuentas y roles ──────────────────────────────────────────────────────────

def cuentas_validas(crudo):
    """{"duenos": [...], "desarrolladores": [...]} con uuids en minúscula, o None si no sirve."""
    if not isinstance(crudo, dict):
        return None
    salida = {}
    for clave in ("duenos", "desarrolladores"):
        lista = crudo.get(clave, [])
        if not isinstance(lista, list):
            return None
        salida[clave] = sorted({c for c in (_txt(x).strip().lower() for x in lista) if RE_CUENTA.match(c)})
    salida["desarrolladores"] = [c for c in salida["desarrolladores"] if c not in salida["duenos"]]
    return salida


def _rol_puerta(rol):
    return {"dueño": "dueño", "dueno": "dueño", "desarrollador": "desarrollador"}.get(_txt(rol))


def rol_local(cuenta, cuentas):
    c = cuentas_validas(cuentas) or {"duenos": [], "desarrolladores": []}
    cuenta = _txt(cuenta).lower()
    if cuenta in c["duenos"]:
        return "dueño"
    if cuenta in c["desarrolladores"]:
        return "desarrollador"
    return None


def rol_efectivo(e, cuentas):
    """El menor de los dos roles (puerta y lista local). None = solo lector."""
    puerta = _rol_puerta(e.get("rol")) if isinstance(e, dict) else None
    local = rol_local(e.get("cuenta") if isinstance(e, dict) else None, cuentas)
    if not puerta or not local:
        return None
    return "dueño" if puerta == local == "dueño" else "desarrollador"


def clave_nonce(e):
    """El nonce es único por cuenta (§4.3.1): la clave de `vistos` lleva las dos cosas."""
    return "%s:%s" % (_txt(e.get("cuenta")).lower(), _txt(e.get("nonce")))


# ── normalización de una orden del puente A ──────────────────────────────────

def normalizar_entrada(e, parsear=None):
    """Copia de `e` con `orden` resuelta. Un `texto` que empieza por «/» es una orden y se analiza con
    `parsear` (el `parsear_orden` de telegram-puente.py, inyectado: aquí no se carga nada)."""
    if not isinstance(e, dict):
        return e
    e = dict(e)
    if e.get("fuente") != "puente:hermes-avisos":
        return e
    if e.get("accion") == "texto" and _txt(e.get("texto")).strip().startswith("/") and parsear:
        r = parsear(e.get("texto"))
        if r:
            tipo, args, _ = r
            nombre = {"personal": "a"}.get(tipo, tipo)
            e["accion"] = "orden"
            e["orden"] = {"nombre": nombre if nombre in ORDENES_A else "desconocida", "args": list(args or [])}
            e.pop("texto", None)
    return e


def _args_orden(nombre, args, texto=None):
    """Argumentos ya validados de una orden del puente A, o None si no valen.

    (GEN1113INT) El texto libre de `decir` y `a` llega en `texto` (≤ 8000) desde la web: `decir` con
    `args: []` y `a` con `args: [<agente>]`, que es lo que valida la puerta. Lo escrito como «/decir …»
    en un texto suelto (analizado con `parsear_orden`) sigue llegando en `args` y también vale."""
    if not isinstance(args, list) or len(args) > MAX_ARGS or not all(isinstance(a, str) for a in args):
        return None
    if nombre in ("decir", "a"):
        if isinstance(texto, str) and texto.strip():
            libre = texto.strip()
            if nombre == "a":
                if len(args) != 1 or not RE_AGENTE.match(args[0]):
                    return None
                return [args[0], libre] if len(libre) <= MAX_TEXTO else None
            return [libre] if not args and len(libre) <= MAX_TEXTO else None
        if nombre == "a":
            if len(args) < 2 or not RE_AGENTE.match(args[0]):
                return None
            libre = " ".join(args[1:]).strip()
            return [args[0], libre] if 0 < len(libre) <= MAX_TEXTO else None
        libre = " ".join(args).strip()
        return [libre] if 0 < len(libre) <= MAX_TEXTO else None
    if texto is not None:
        return None   # solo `decir` y `a` llevan texto
    if any(len(a) > MAX_ARG for a in args):
        return None
    if nombre in ("aprobar", "rechazar", "soltar"):
        return list(args) if args and all(RE_ID_TAREA.match(a) for a in args) else None
    if nombre == "reasignar":
        ok = len(args) == 2 and RE_ID_TAREA.match(args[0]) and RE_MODELO.match(args[1])
        return list(args) if ok else None
    if nombre == "olas":
        if not args:
            return []
        return [args[0]] if len(args) == 1 and args[0].isdigit() and 0 < int(args[0]) <= 50 else None
    return [] if not args else None


# ── dirección ────────────────────────────────────────────────────────────────

def _canales(v):
    if v is None:
        return []
    if not isinstance(v, list) or not all(isinstance(c, str) and c in CANALES for c in v):
        return None
    return list(dict.fromkeys(v))


def solo_hilo(e):
    """True si la entrada de dirección solo escribe en el hilo `mando` y no despierta a nadie:
    `decir` a `mando` sin modelo, o cualquier `decir` a `mando` de quien no es dueño (§4.2)."""
    if not isinstance(e, dict) or e.get("fuente") != "direccion" or e.get("accion") != "decir":
        return False
    canales = _canales(e.get("canales"))
    if canales is None or any(c != "mando" for c in canales):
        return False
    return not e.get("modelo") or _rol_puerta(e.get("rol")) != "dueño"


def _direccion_valida(e):
    accion = e.get("accion")
    if e.get("modelo") is not None and not RE_MODELO.match(_txt(e.get("modelo"))):
        return False
    canales = _canales(e.get("canales"))
    if canales is None:
        return False
    if accion == "decir":
        texto = _txt(e.get("texto"))
        return 0 < len(texto.strip()) and len(texto) <= MAX_TEXTO
    if accion == "responder":
        return bool(RE_MD.match(_txt(e.get("respondeA"))))
    if accion == "reenviar":
        return bool(RE_MD.match(_txt(e.get("reenviar")))) and len(canales) > 0
    return False


def cambia(e):
    """¿La entrada pone a trabajar a un agente o cambia algo? (caduca a los 30 min y exige dueño)."""
    if not isinstance(e, dict):
        return False
    if e.get("fuente") == "direccion":
        return not solo_hilo(e)
    orden = e.get("orden") if e.get("accion") == "orden" else None
    return isinstance(orden, dict) and orden.get("nombre") in CAMBIAN


# ── la comprobación de la Mac (§4.3.2) ───────────────────────────────────────

def _forma(e):
    if not isinstance(e, dict) or e.get("v") != 1:
        return False
    if not isinstance(e.get("id"), int) or isinstance(e.get("id"), bool):
        return False
    if not RE_NONCE.match(_txt(e.get("nonce"))) or not RE_CUENTA.match(_txt(e.get("cuenta"))):
        return False
    if _rol_puerta(e.get("rol")) is None or epoch_de(e.get("recibido")) <= 0:
        return False
    texto = e.get("texto")
    return texto is None or (isinstance(texto, str) and len(texto) <= MAX_TEXTO)


def validar_entrada(e, cuentas, ahora, vistos):
    """(ok, motivo). `cuentas` es lo leído de la lista local (None si falta); `vistos`, los nonces de
    los últimos 7 días. El nonce se mira lo primero tras la forma: una entrada ya atendida no se vuelve
    a juzgar (su acuse se repite tal cual), aunque la lista haya cambiado después."""
    if not _forma(e):
        return False, FORMA
    if isinstance(vistos, dict) and clave_nonce(e) in vistos:
        return False, REPETIDO
    if e.get("destino", "mac") != "mac" or e.get("fuente") not in FUENTES_ENTRADA_MAC:
        return False, DESTINO
    if cuentas_validas(cuentas) is None:
        return False, SIN_LISTA
    rol = rol_efectivo(e, cuentas)
    if rol is None:
        return False, FUERA_DE_LISTA
    fuente, accion = e.get("fuente"), e.get("accion")
    if accion not in ACCIONES[fuente]:
        return False, NO_PERMITIDA
    if fuente == "direccion":
        if not _direccion_valida(e):
            return False, NO_PERMITIDA
        if rol != "dueño" and not solo_hilo(dict(e, rol=rol)):
            return False, SOLO_DUENO
    else:
        if rol != "dueño":
            return False, SOLO_DUENO
        if accion == "texto":
            texto = _txt(e.get("texto")).strip()
            if not texto or texto.startswith("/"):
                return False, NO_PERMITIDA
        else:
            orden = e.get("orden")
            nombre = orden.get("nombre") if isinstance(orden, dict) else None
            if nombre not in ORDENES_A or _args_orden(nombre, orden.get("args", []), e.get("texto")) is None:
                return False, NO_PERMITIDA
    if cambia(dict(e, rol=rol)) and ahora - epoch_de(e.get("recibido")) > CADUCIDAD_S:
        return False, CADUCADA
    return True, "ok"


def resultado_de_motivo(motivo):
    return "caducado" if motivo == CADUCADA else "rechazado"


def podar_vistos(vistos, ahora):
    """Nonces de los últimos 7 días (§4.3.2)."""
    if not isinstance(vistos, dict):
        return {}
    return {k: v for k, v in vistos.items()
            if isinstance(v, dict) and isinstance(v.get("t"), (int, float)) and ahora - v["t"] <= VISTOS_S}


# ── el plan (§4.4), sin efectos ──────────────────────────────────────────────

def plan_de_entrada(e):
    """Qué hacer con una entrada YA validada, cuyo `rol` es el efectivo (`rol_efectivo`).

    Tipos: «http-local» (la ruta local de Genesis, la misma que el compositor de /genesis), «puente-orden»
    y «puente-decir» (las funciones de puente.py) y «chat-hilo» (solo escribe en el hilo `mando`
    con director_chat.publicar: la ruta local siempre despierta a un motor, ver el informe)."""
    quien = quien_web(e.get("cuenta"))
    if e.get("fuente") == "direccion":
        if solo_hilo(e):
            return {"tipo": "chat-hilo", "texto": e.get("texto"), "quien": quien,
                    "rol": "alex" if _rol_puerta(e.get("rol")) == "dueño" else "agente"}
        accion = e.get("accion")
        cuerpo = {"accion": accion}
        if accion == "decir":
            cuerpo.update(texto=e.get("texto"), canales=_canales(e.get("canales")) or [])
        elif accion == "responder":
            cuerpo["respondeA"] = e.get("respondeA")
        else:
            cuerpo.update(reenviar=e.get("reenviar"), canales=_canales(e.get("canales")) or [])
        if accion != "reenviar" and e.get("modelo"):
            cuerpo["modelo"] = e.get("modelo")
        return {"tipo": "http-local", "metodo": "POST", "ruta": RUTA_DIRECTOR, "cuerpo": cuerpo}
    if e.get("accion") == "texto":
        return {"tipo": "http-local", "metodo": "POST", "ruta": RUTA_DIRECTOR,
                "cuerpo": {"accion": "decir", "texto": _txt(e.get("texto")).strip(),
                           "modelo": MODELO_HERMES, "canales": ["hermes"]}}
    orden = e.get("orden") or {}
    nombre = orden.get("nombre")
    args = _args_orden(nombre, orden.get("args", []), e.get("texto"))
    if nombre in LECTURA_A:
        return {"tipo": "http-local", "metodo": "GET", "ruta": RUTA_ESTADO, "orden": nombre, "args": args}
    if nombre in ("aprobar", "rechazar", "soltar"):
        extra = {"donde": "agentes-ia"} if nombre == "soltar" else None
        return {"tipo": "puente-orden", "accion": nombre, "ids": args, "extra": extra, "quien": quien}
    if nombre == "reasignar":
        return {"tipo": "puente-orden", "accion": "reasignar", "ids": [args[0]],
                "extra": {"modelo": args[1]}, "quien": quien}
    if nombre == "a":
        return {"tipo": "puente-decir", "texto": args[1], "quien": "%s|%s" % (quien, args[0])}
    return {"tipo": "puente-decir", "texto": args[0], "quien": quien}


AYUDA_A = ("Órdenes de «Hermes y avisos»:\n/estado /agentes /olas [n] /cola /puertas /ayuda\n"
           "/aprobar <id…>  /rechazar <id…>  /soltar <id…>  /reasignar <id> <modelo>\n"
           "/decir <texto> → canal común · /a <agente> <texto>\nEl texto suelto va a Hermes.")


def respuesta_lectura(nombre, args, estado):
    """Texto de respuesta de una orden de lectura del puente A a partir de `/api/mando/estado`."""
    if nombre == "ayuda":
        return AYUDA_A
    if nombre == "puertas":
        return "Tres puertas: tsc · vitest · next build (nunca con el enjambre vivo)."
    if not isinstance(estado, dict) or estado.get("_error"):
        return "Genesis no responde en la Mac."
    c = estado.get("cuentas") or {}
    if nombre == "olas":
        n = int(args[0]) if args else 5
        olas = [o for o in (estado.get("olas") or []) if isinstance(o, dict)][:n]
        return "\n".join("· %s" % _txt(o.get("id"))[:70] for o in olas) or "Sin olas recientes."
    if nombre == "agentes":
        return "Agentes escribiendo ahora: %d" % len(estado.get("latidos") or [])
    ola = _txt(str(c.get("ola", "—")))
    ola = ola if ola.lower().startswith("ola") else "OLA %s" % ola
    base = "%s · integradas %s · en curso %s · aprobación %s · pendientes %s" % (
        ola, c.get("integradas", 0), c.get("enCurso", 0), c.get("esperandoAprobacion", 0), c.get("pendientes", 0))
    return base if nombre == "estado" else "Cola: " + base


def limpiar_detalle(texto):
    """≤ 300 caracteres, sin rutas, URL ni direcciones IP (para el acuse)."""
    t = _txt(texto)
    t = re.sub(r"https?://\S+", "<url>", t)
    t = re.sub(r"(?:~|/(?:Users|home|private|tmp|opt|var))/\S*", "<ruta>", t)
    t = re.sub(r"(?<![\d.])\d{1,3}(?:\.\d{1,3}){3}(?![\d.])", "<ip>", t)
    return t[:300]


# ── espejo (§5.2) ────────────────────────────────────────────────────────────

def rol_de_director(quien, tipo=None):
    """El mismo reparto que `rolDeDirector` de src/lib/mando/chat-director-feed.ts (TS, no importable)."""
    q = _txt(quien).lower()
    if q in ("director-presidente", "hermes", "chatgpt", "codex", "antigravity"):
        return "dirección"
    if q in ("vigia", "vigia-medidores", "vigia-3d", "revision-opus", "director-opus", "verificar"):
        return "verificador"
    if q in ("director", "director-orquestacion", "astra") or q.startswith("claude"):
        return "supervisor"
    if q in ("vigilante", "reconstruir", "curar", "desatascador"):
        return "restaurador"
    if q in ("guardia", "gobernador", "vigia-consumo", "freno"):
        return "protector"
    if q in ("enjambre", "eco", "orquestador", "reparto-nube"):
        return "procesos"
    if tipo in ("fallo_tests", "fallo_tsc"):
        return "pruebas"
    if q.startswith("informe") or q in ("director_suenos", "suenos"):
        return "informes"
    if q in ("uso", "consumo", "jev"):
        return "usos"
    return "agente"


def linea_canal(r):
    """La fila de `canal.jsonl` de la que salió un registro «cn-» del feed (para `_importa`)."""
    tipo = {"aviso": "aviso", "informe": "hecho"}.get(_txt(r.get("tipo")), "mensaje")
    fila = {"t": r.get("t"), "epoch": epoch_de(r.get("t")), "quien": r.get("de"), "tipo": tipo, "texto": r.get("texto")}
    if r.get("tarea"):
        fila["tarea"] = r.get("tarea")
    return fila


def fuente_de_registro(r, importa=None):
    """A qué fuentes del espejo va un registro del feed. Todo va a «direccion»; lo que telegram-puente.py
    mandaría al móvil (`importa`, su `_importa`) también a «puente:hermes-avisos»; los avisos e informes de
    los directores protector, restaurador y supervisor, a «puente:avisos-directores»."""
    if not isinstance(r, dict) or not isinstance(r.get("id"), str):
        return []
    fuentes = ["direccion"]
    de = _txt(r.get("de"))
    if r["id"].startswith("cn-") and not de.startswith("telegram-"):
        fila = linea_canal(r)
        if importa is None or importa(fila):
            fuentes.append("puente:hermes-avisos")
    if r.get("tipo") in ("aviso", "informe") and \
            rol_de_director(de, r.get("evento")) in ("protector", "restaurador", "supervisor"):
        fuentes.append("puente:avisos-directores")
    return fuentes


def tachar_registro(r, tachar):
    """Copia con TODAS las cadenas tachadas otra vez (`tachar` = director_chat.tachar, inyectada)."""
    if isinstance(r, str):
        return tachar(r)
    if isinstance(r, list):
        return [tachar_registro(x, tachar) for x in r]
    if isinstance(r, dict):
        return {k: tachar_registro(v, tachar) for k, v in r.items()}
    return r


#: (GEN1113INT) La puerta corta todo cuerpo en 64 KB y cada registro del espejo en 48 KB (se miden en
#: bytes de JSON). Con margen: lotes de ≤ 56 KB y registros de ≤ 40 KB.
MAX_LOTE_BYTES = 56 * 1024
MAX_REGISTRO_BYTES = 40 * 1024
RECORTADO = " … [recortado en la copia; completo en /genesis de la Mac]"


def bytes_json(x):
    return len(json.dumps(x, ensure_ascii=False).encode("utf-8"))


def recortar_registro(r, maximo=MAX_REGISTRO_BYTES):
    """Copia de `r` que cabe en `maximo` bytes de JSON: se acorta `texto` (y, si no basta, se quitan
    los detalles de las entregas). Un registro que no cabe en la puerta pararía el espejo entero."""
    if not isinstance(r, dict) or bytes_json(r) <= maximo:
        return r
    r = dict(r)
    texto = _txt(r.get("texto"))
    while texto and bytes_json(r) > maximo:
        texto = texto[: max(0, int(len(texto) * 0.7) - 1)]
        r["texto"] = texto + RECORTADO
    if bytes_json(r) > maximo and isinstance(r.get("entregas"), dict):
        r["entregas"] = {c: {"estado": _txt((v or {}).get("estado"))} for c, v in r["entregas"].items()}
    for k in ("eleccion", "uso"):
        if bytes_json(r) > maximo:
            r.pop(k, None)
    return r


def lotes(registros, tam=200, max_bytes=MAX_LOTE_BYTES):
    """Lotes de ≤ `tam` registros y ≤ `max_bytes` de JSON (la puerta rechaza un cuerpo de más de 64 KB)."""
    salida, actual, peso = [], [], 0
    for r in registros:
        r = recortar_registro(r)
        b = bytes_json(r) + 2
        if actual and (len(actual) >= tam or peso + b > max_bytes):
            salida.append(actual)
            actual, peso = [], 0
        actual.append(r)
        peso += b
    if actual:
        salida.append(actual)
    return salida


# ── registro sin contenido (§4.5) ────────────────────────────────────────────

# GEN1114B · retiradas de aparatos pedidas con una entrada firmada (contrato GEN1114 §3.4 y §3.7). No pasan
# por `validar_entrada`: las atiende genesis_chats_puerta.py con genesis_firma_logica.objetivo_de_retirada.
ACCIONES_RETIRADA = ("revocarme", "revocar-aparato")


def aviso_retirada(nombre_retirado, nombre_desde):
    """La línea que se publica en el hilo tras una retirada (§3.5, paso 9). Los nombres son los de la lista
    de altas (los vio Alex al emparejar), ya limpios y cortos."""
    return "Se retiró el aparato «%s» desde «%s»." % (_txt(nombre_retirado)[:60] or "sin nombre",
                                                        _txt(nombre_desde)[:60] or "sin nombre")


def _firma_registro(firma):
    """(GEN1114B) Los campos de la firma para el registro: `aparato8`, `firma` (ok o motivo fijo) y `seq`."""
    firma = firma if isinstance(firma, dict) else {}
    aparato = _txt(firma.get("aparato"))
    aparato8 = aparato[:8] if re.match(r"^[0-9a-f]{64}$", aparato) else None
    motivo = firma.get("firma") if isinstance(firma.get("firma"), str) and \
        re.match(r"^[a-z-]{2,20}$", firma.get("firma")) else None
    seq = firma.get("seq") if isinstance(firma.get("seq"), int) and not isinstance(firma.get("seq"), bool) else None
    return {"aparato8": aparato8, "firma": motivo, "seq": seq}
# /GEN1114B


def linea_registro(e, resultado, motivo, t, firma=None):
    """Una línea de `registro.jsonl`: nunca texto ni argumentos (solo nombres de una lista cerrada).
    (GEN1114B) `firma` = {aparato, firma, seq}: se anotan `aparato8`, `firma` y `seq`, nunca la carga."""
    e = e if isinstance(e, dict) else {}
    orden = e.get("orden") if isinstance(e.get("orden"), dict) else None
    nombre = orden.get("nombre") if orden else None
    acciones = {"decir", "responder", "reenviar", "orden", "texto"} | set(ACCIONES_RETIRADA)   # GEN1114B
    fila = {
        "t": t,
        "id": e.get("id") if isinstance(e.get("id"), int) and not isinstance(e.get("id"), bool) else None,
        "cuenta8": cuenta8(e.get("cuenta")),
        "rol": _rol_puerta(e.get("rol")),
        "fuente": e.get("fuente") if e.get("fuente") in FUENTES else None,
        "accion": e.get("accion") if e.get("accion") in acciones else None,
        "orden": nombre if nombre in ORDENES_A else ("desconocida" if orden else None),
        "resultado": resultado if resultado in ("hecho", "rechazado", "caducado", "fallo") else "fallo",
        "motivo": limpiar_detalle(motivo)[:200],
    }
    if firma is not None:            # GEN1114B
        fila.update(_firma_registro(firma))
    return fila
