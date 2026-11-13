# -*- coding: utf-8 -*-
"""Entradas firmadas por el aparato del dueño · lógica PURA de verificación (GEN1114B).

Contrato: architecture/astraura-chats-identidad-firma.md §3.3–§3.7, §5.1 y §8.2 (con las correcciones
[REV] de §13). Aquí no hay disco, red, reloj ni entorno: todo llega por argumento. Lo usan la Mac
(`genesis_chats_puerta.py`, `genesis_aparatos.py`) y el A1 (`peticiones_puerta.py`, GEN1114D), así que
este archivo NO importa nada del resto del puente: solo la biblioteca estándar y `cryptography`.

Reglas (y por qué):
- Sin `v: 2` con carga, firma y aparato no se ejecuta nada. No existe ninguna opción, variable ni
  archivo que haga aceptar `v: 1`: la puerta no es de confianza y una lista de cuentas no prueba nada.
- La firma se comprueba sobre los BYTES exactos que firmó el aparato (la carga en base64url), y solo
  después se lee el JSON de esos mismos bytes. Nada de lo que la puerta añade decide: solo puede bajar
  el rol o adelantar la caducidad.
- Vale un aparato que esté en la lista de altas (de root en la Mac) y NO en la de retirados.
- El nombre del chat que la persona vio va firmado y se compara con el registro de la Mac.
- Lo `alto` (despierta a un agente o cambia algo) caduca a los 30 min y exige un aparato `completo`.
- Repetir no sirve: `aparato:seq` y `cuenta:nonce` se guardan 8 días (más que la vida máxima de una
  carga: 7 días + 5 min de adelanto).
"""
import base64
import hashlib
import hmac
import json
import re
import unicodedata
from datetime import datetime, timezone

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec, utils

AUD = "starseed.genesis.chats.v1"
MAX_ADELANTO_S = 300
LIMITE_CAMBIA_S = 1800
LIMITE_MENSAJE_S = 7 * 86400
VISTOS_S = 8 * 86400
MAX_ALTO_POR_HORA = 20
MAX_CARGA_BYTES = 32 * 1024
RUTA_ALTAS = "/Library/Application Support/StarSeed/genesis-aparatos.json"
PREFIJO_CODIGO = "starseed.genesis.emparejar.v1\n"

MOTIVOS = ("sin-firma", "aparato-desconocido", "aparato-revocado", "firma-mala", "aud", "cuenta-distinta",
           "destino", "chat-distinto", "nombre-distinto", "futuro", "caducada", "nivel", "limite",
           "seq-repetido", "nonce-repetido")

#: Lo que se le dice a la persona por cada motivo (§3.9). Nunca lleva texto de quien escribe.
TEXTOS = {
    "sin-firma": "Este aparato no está emparejado para escribir: la entrada llegó sin firma y no se ejecutó nada",
    "aparato-desconocido": "La Mac no conoce este aparato: el emparejamiento no llegó a hacerse. Vuelve a emparejarlo",
    "aparato-revocado": "Este aparato fue retirado en la Mac%s. Para volver a escribir, emparéjalo de nuevo",
    "firma-mala": "La firma no cuadra: la entrada se cambió por el camino; no se ejecutó nada",
    "aud": "La firma es de otro uso; no se ejecutó nada",
    "cuenta-distinta": "La cuenta firmada no es la del aparato; no se ejecutó nada",
    "destino": "Esta entrada iba firmada para otro destino; no se ejecutó nada",
    "chat-distinto": "El chat firmado no es el de esta conversación en la Mac; no se ejecutó nada",
    "nombre-distinto": ("El nombre del chat que viste no es el de la Mac; puede que la puerta mostrara uno falso. "
                        "No se ejecutó nada"),
    "futuro": "La hora de este aparato va adelantada; corrígela y vuelve a enviar",
    "caducada": "Caducó sin ejecutarse; vuelve a enviarla si aún la quieres",
    "nivel": ("Este aparato solo puede escribir texto en el hilo; para poner agentes a trabajar, emparéjalo "
              "como completo en la Mac"),
    "limite": "Demasiadas órdenes de este aparato en la última hora; espera un poco",
    "seq-repetido": "Esta entrada ya se había recibido; no se ejecutó otra vez",
    "nonce-repetido": "Esta entrada ya se había recibido; no se ejecutó otra vez",
}

RE_HUELLA = re.compile(r"^[0-9a-f]{64}$")
RE_B64URL = re.compile(r"^[A-Za-z0-9_-]*$")
RE_CUENTA = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
RE_NONCE = re.compile(r"^[A-Za-z0-9_-]{22,32}$")
RE_ID_CHAT = re.compile(r"^[a-z0-9][a-z0-9._-]{1,62}$")
RE_CODIGO = re.compile(r"^[A-Z2-7]{12}$")
#: Controles y marcas de dirección (bidi) que pueden disfrazar un nombre (§8.3 `limpiar_nombre`).
RE_INVISIBLES = re.compile("[‎‏‪-‮⁦-⁩؜﻿]")

FUENTES_PUENTE = ("puente:hermes-avisos", "puente:peticiones", "puente:avisos-directores")
CANALES = ("mando", "director-presidente", "claude-cowork", "claude-mac", "hermes", "telegram",
           "chatgpt", "antigravity", "ide", "terminal")
LECTURA_A = frozenset(("estado", "olas", "cola", "puertas", "agentes", "ayuda"))
LECTURA_B = frozenset(("estado", "ayuda"))
RETIRADAS = ("revocarme", "revocar-aparato")

#: Sin canon.json (la Mac aún no lo sembró) solo valen estos ids y nombres, fijos en el código (§3.5.4).
#: (GEN1114INT) Un solo esquema de ids en B, C y E: el id de un puente antes de descubrirlo es
#: `telegram.<clave de GEN1113>`, el mismo que siembra `genesis_canon_logica.id_provisional_de_puente` (C) y que
#: firma la web con un catálogo sembrado (E). Así lo que firma E es lo que acepta B, haya o no registro.
ALIAS_GEN1113 = {
    "direccion": {"chat": "genesis", "nombres": ("direccion", "mando", "Dirección", "GENESIS · StarSeed OS")},
    "puente:hermes-avisos": {"chat": "telegram.hermes-avisos",
                             "nombres": ("puente:hermes-avisos", "hermes-avisos", "Hermes y avisos")},
    "puente:peticiones": {"chat": "telegram.peticiones",
                          "nombres": ("puente:peticiones", "peticiones", "Peticiones y encargos")},
    "puente:avisos-directores": {"chat": "telegram.avisos-directores",
                                 "nombres": ("puente:avisos-directores", "avisos-directores", "Avisos de los directores")},
}

#: (GEN1114INT) Los nombres de los nueve canales tal como los pinta la web sin catálogo (`CANALES` de
#: src/lib/mando/chat-director-tipos.ts): sin canon.json, la cabecera de un hilo con un solo canal enseña este
#: nombre y es el que se firma. Una prueba compara esta tabla con el archivo TS (no se pueden separar).
NOMBRES_CANAL = {
    "director-presidente": "Director presidente",
    "claude-cowork": "Claude Opus 5.5 · dirección (Cowork)",
    "claude-mac": "Claude Opus 5.5 · Mac (Claude Code)",
    "hermes": "Hermes",
    "telegram": "Telegram (tu móvil)",
    "chatgpt": "ChatGPT (Codex)",
    "antigravity": "Antigravity",
    "ide": "Chat de un IDE",
    "terminal": "Terminal",
}


def _txt(v):
    return v if isinstance(v, str) else ""


def _entero(v):
    return isinstance(v, int) and not isinstance(v, bool)


def epoch_de(t):
    """Epoch de un ISO 8601 con zona (o «Z»). Sin zona o ilegible → 0 (no vale como hora firmada)."""
    s = _txt(t).strip()
    if not s or len(s) > 40:
        return 0.0
    try:
        d = datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        return 0.0
    if d.tzinfo is None:
        return 0.0
    return d.timestamp()


def iso_utc(epoch):
    return datetime.fromtimestamp(epoch, timezone.utc).isoformat().replace("+00:00", "Z")


# ── codificación y claves ────────────────────────────────────────────────────

def b64url_dec(s):
    """Bytes de un base64url SIN relleno. Cualquier otro carácter, o un relleno, → ValueError."""
    if not isinstance(s, str) or not RE_B64URL.match(s) or len(s) % 4 == 1:
        raise ValueError("base64url no válido")
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def b64url_cod(b):
    return base64.urlsafe_b64encode(bytes(b)).decode("ascii").rstrip("=")


def clave_de_spki(spki_der):
    """La clave pública P-256 de una SPKI DER, o ValueError. Se exige la codificación canónica (punto sin
    comprimir, la que exporta WebCrypto): así una misma clave tiene una sola huella."""
    if not isinstance(spki_der, (bytes, bytearray)) or not 0 < len(spki_der) <= 200:
        raise ValueError("SPKI de tamaño no válido")
    try:
        clave = serialization.load_der_public_key(bytes(spki_der))
    except Exception as e:  # noqa: BLE001 — cualquier fallo de lectura es «no es una clave válida»
        raise ValueError("SPKI ilegible") from e
    if not isinstance(clave, ec.EllipticCurvePublicKey) or not isinstance(clave.curve, ec.SECP256R1):
        raise ValueError("la clave no es P-256")
    canon = clave.public_bytes(serialization.Encoding.DER, serialization.PublicFormat.SubjectPublicKeyInfo)
    if canon != bytes(spki_der):
        raise ValueError("SPKI no canónica")
    return clave


def huella_de_spki(spki_der):
    """sha256 en hex de la SPKI; exige una P-256 válida (si no, ValueError)."""
    clave_de_spki(spki_der)
    return hashlib.sha256(bytes(spki_der)).hexdigest()


def verificar_firma(spki_der, datos, firma_rs):
    """ECDSA P-256 + SHA-256 sobre `datos`, con la firma WebCrypto r‖s (64 bytes). Nunca lanza."""
    try:
        if not isinstance(firma_rs, (bytes, bytearray)) or len(firma_rs) != 64:
            return False
        r = int.from_bytes(firma_rs[:32], "big")
        s = int.from_bytes(firma_rs[32:], "big")
        if r == 0 or s == 0:
            return False
        clave = clave_de_spki(spki_der)
        clave.verify(utils.encode_dss_signature(r, s), bytes(datos), ec.ECDSA(hashes.SHA256()))
        return True
    except (InvalidSignature, ValueError, TypeError, OverflowError):
        return False
    except Exception:  # noqa: BLE001 — «nunca lanza»: cualquier otra cosa es una firma que no vale
        return False


# ── el código de emparejar (§3.3) ────────────────────────────────────────────

def codigo_de(huella, cuenta):
    """`XXXX-XXXX-XXXX`: 60 bits de sha256(prefijo ‖ huella ‖ "\\n" ‖ cuenta) en base32 RFC 4648."""
    datos = (PREFIJO_CODIGO + _txt(huella).lower() + "\n" + _txt(cuenta).lower()).encode("utf-8")
    s = base64.b32encode(hashlib.sha256(datos).digest()[:8]).decode("ascii")[:12]
    return "%s-%s-%s" % (s[:4], s[4:8], s[8:])


def normalizar_codigo(tecleado):
    """Lo tecleado en mayúsculas, sin espacios ni guiones. None si queda algo fuera de A–Z y 2–7 o si no
    son 12 caracteres (un código más corto o más largo tampoco puede coincidir)."""
    if not isinstance(tecleado, str):
        return None
    s = re.sub(r"[\s\-]", "", tecleado).upper()
    return s if RE_CODIGO.match(s) else None


def codigos_iguales(a, b):
    """Compara dos códigos (con o sin guiones) sin atajos de tiempo."""
    na, nb = normalizar_codigo(a), normalizar_codigo(b)
    return bool(na and nb) and hmac.compare_digest(na, nb)


# ── nombres ──────────────────────────────────────────────────────────────────

def limpiar_nombre(s, maximo=80):
    """Sin controles ni marcas bidi, espacios plegados y recortado (igual que `limpiar_nombre` de C)."""
    t = RE_INVISIBLES.sub("", _txt(s))
    t = "".join(c for c in t if unicodedata.category(c) not in ("Cc", "Cf", "Zl", "Zp"))
    return re.sub(r"\s+", " ", t).strip()[:maximo]


# ── riesgo y caducidad (§3.6) ────────────────────────────────────────────────

def _solo_mando(canales):
    if canales is None:
        return True
    return isinstance(canales, list) and all(c == "mando" for c in canales)


def riesgo_de_entrada(entrada):
    """"bajo" (no despierta a ningún agente) o "alto". Lo desconocido es "alto". La misma tabla que
    `riesgoDeEntrada` de la puerta (A) y de la web (E). Se mira la entrada TAL COMO SE FIRMÓ: un texto que
    empieza por «/» sigue siendo texto (alto), aunque la Mac lo lea después como orden."""
    if not isinstance(entrada, dict):
        return "alto"
    fuente, accion = entrada.get("fuente"), entrada.get("accion")
    if fuente == "direccion":
        if accion in RETIRADAS:
            return "bajo"
        if accion == "decir" and not entrada.get("modelo") and _solo_mando(entrada.get("canales")):
            return "bajo"
        return "alto"
    orden = entrada.get("orden") if accion == "orden" else None
    nombre = orden.get("nombre") if isinstance(orden, dict) else None
    if fuente == "puente:hermes-avisos" and nombre in LECTURA_A:
        return "bajo"
    if fuente == "puente:peticiones" and nombre in LECTURA_B:
        return "bajo"
    return "alto"


def caduca_efectiva(carga, recibido, riesgo):
    """min(caduca firmada, t + límite, recibido + límite). El aparato no puede alargarla y la puerta solo
    puede adelantarla. Una hora ilegible caduca ya (0)."""
    limite = LIMITE_MENSAJE_S if riesgo == "bajo" else LIMITE_CAMBIA_S
    carga = carga if isinstance(carga, dict) else {}
    caduca, t = epoch_de(carga.get("caduca")), epoch_de(carga.get("t"))
    if caduca <= 0 or t <= 0:
        return 0.0
    tope = min(caduca, t + limite)
    if isinstance(recibido, (int, float)) and not isinstance(recibido, bool) and recibido > 0:
        tope = min(tope, recibido + limite)
    return tope


# ── listas de aparatos (§5.1) ────────────────────────────────────────────────

def aparatos_validos(crudo):
    """{"v": 1, "aparatos": [...]} solo con filas que valen: huella = sha256 de su SPKI P-256, cuenta uuid,
    nivel `texto`/`completo` (otro valor → `texto`). Una huella repetida se queda con la primera fila y
    con el nivel más bajo de las dos. Tolerante: nunca lanza."""
    salida, vistas = [], {}
    filas = crudo.get("aparatos") if isinstance(crudo, dict) else None
    for f in filas if isinstance(filas, list) else []:
        if not isinstance(f, dict):
            continue
        huella, cuenta = _txt(f.get("huella")).lower(), _txt(f.get("cuenta")).lower()
        if not RE_HUELLA.match(huella) or not RE_CUENTA.match(cuenta):
            continue
        try:
            if huella_de_spki(b64url_dec(f.get("spki"))) != huella:
                continue
        except ValueError:
            continue
        nivel = f.get("nivel") if f.get("nivel") in ("texto", "completo") else "texto"
        if huella in vistas:
            if nivel == "texto":
                vistas[huella]["nivel"] = "texto"
            continue
        fila = {"huella": huella, "spki": f.get("spki"), "cuenta": cuenta,
                "nombre": limpiar_nombre(f.get("nombre"), 60), "plataforma": _txt(f.get("plataforma"))[:20],
                "nivel": nivel, "alta": _txt(f.get("alta"))[:40]}
        vistas[huella] = fila
        salida.append(fila)
    return {"v": 1, "aparatos": salida}


def retirados_validos(crudo):
    """{"v": 1, "retirados": [...]} con las filas de huella válida (la lista solo crece)."""
    filas = crudo.get("retirados") if isinstance(crudo, dict) else None
    salida = []
    for f in filas if isinstance(filas, list) else []:
        if isinstance(f, dict) and RE_HUELLA.match(_txt(f.get("huella")).lower()):
            salida.append({"huella": f["huella"].lower(), "t": _txt(f.get("t"))[:40], "por": _txt(f.get("por"))[:80]})
    return {"v": 1, "retirados": salida}


def retiro_de(huella, retirados):
    """La fila de retirada de esa huella, o None."""
    for f in retirados_validos(retirados)["retirados"]:
        if f["huella"] == _txt(huella).lower():
            return f
    return None


def aparato_valido(huella, altas, retirados):
    """(fila, motivo): (fila, None) si vale; (None, "aparato-desconocido") si no está en la lista de altas;
    (None, "aparato-revocado") si está retirado."""
    huella = _txt(huella).lower()
    fila = next((f for f in aparatos_validos(altas)["aparatos"] if f["huella"] == huella), None)
    if fila is None:
        return None, "aparato-desconocido"
    if retiro_de(huella, retirados) is not None:
        return None, "aparato-revocado"
    return fila, None


# ── el chat firmado contra el registro de la Mac (§3.4, §3.5.4) ──────────────

def _chats_de(canon):
    chats = canon.get("chats") if isinstance(canon, dict) else None
    return [c for c in chats if isinstance(c, dict)] if isinstance(chats, list) else None


def _nombres_de(chat):
    nombres = {limpiar_nombre(chat.get("nombre"))}
    for a in chat.get("alias") if isinstance(chat.get("alias"), list) else []:
        nombres.add(limpiar_nombre(a))
    nombres.discard("")
    return nombres


def chat_cuadra(carga, canon):
    """None si `carga.chat` y `carga.chatNombre` cuadran con `carga.entrada.fuente`; si no, "chat-distinto"
    o "nombre-distinto".

    La relación fuente → chat es FIJA (no la da ningún catálogo): `direccion` → `genesis`, o
    `genesis.canal.<c>` con `c` en `entrada.canales`; un puente → el ÚNICO chat de `canon` cuyo campo
    `fuente` es esa fuente y cuyos `alias` la incluyen (si hay dos, o el alias está en otro chat, no
    cuadra). El nombre visto debe ser el `nombre` de ese chat o uno de sus `alias`, tras quitar controles
    y marcas bidi. Sin `canon` solo valen los ids y nombres de `ALIAS_GEN1113`."""
    if not isinstance(carga, dict) or not isinstance(carga.get("entrada"), dict):
        return "chat-distinto"
    entrada = carga["entrada"]
    fuente, chat_id = entrada.get("fuente"), _txt(carga.get("chat"))
    visto = limpiar_nombre(carga.get("chatNombre"))
    if not visto:
        return "nombre-distinto"
    chats = _chats_de(canon)
    if fuente == "direccion":
        canales = entrada.get("canales") if isinstance(entrada.get("canales"), list) else []
        if chat_id != "genesis" and not (chat_id.startswith("genesis.canal.") and
                                         chat_id[len("genesis.canal."):] in canales and
                                         chat_id[len("genesis.canal."):] in CANALES[1:]):
            return "chat-distinto"
        if entrada.get("accion") in RETIRADAS and chat_id != "genesis":
            return "chat-distinto"
        if chats is None:
            if chat_id == "genesis":
                return None if visto in ALIAS_GEN1113["direccion"]["nombres"] else "nombre-distinto"
            canal = chat_id[len("genesis.canal."):]
            return None if visto in (canal, chat_id, NOMBRES_CANAL.get(canal)) else "nombre-distinto"
        iguales = [c for c in chats if c.get("id") == chat_id]
        if len(iguales) != 1:
            return "chat-distinto"
        chat = iguales[0]
        if chat_id == "genesis" and chat.get("fuente") != "direccion":
            return "chat-distinto"
        if chat_id != "genesis" and chat.get("padre") != "genesis":
            return "chat-distinto"
        return None if visto in _nombres_de(chat) else "nombre-distinto"
    if fuente not in FUENTES_PUENTE:
        return "chat-distinto"
    if chats is None:
        fijo = ALIAS_GEN1113[fuente]
        if chat_id != fijo["chat"]:
            return "chat-distinto"
        return None if visto in fijo["nombres"] else "nombre-distinto"
    candidatos = [c for c in chats if c.get("fuente") == fuente and fuente in (c.get("alias") or [])]
    con_alias = [c for c in chats if isinstance(c.get("alias"), list) and fuente in c["alias"]]
    if len(candidatos) != 1 or len(con_alias) != 1 or candidatos[0].get("id") != chat_id:
        return "chat-distinto"
    if len([c for c in chats if c.get("id") == chat_id]) != 1:
        return "chat-distinto"
    return None if visto in _nombres_de(candidatos[0]) else "nombre-distinto"


# ── repeticiones (§3.5.7) ────────────────────────────────────────────────────

def clave_seq(carga):
    return "aparato:%s:%s" % (_txt(carga.get("aparato")).lower(), carga.get("seq"))


def clave_nonce(carga):
    """Igual que `clave_nonce` de GEN1113 («cuenta:nonce»): comparten `vistos.json`."""
    entrada = carga.get("entrada") if isinstance(carga.get("entrada"), dict) else {}
    return "%s:%s" % (_txt(carga.get("cuenta")).lower(), _txt(entrada.get("nonce")))


def podar_vistos(vistos, ahora):
    """Lo visto en los últimos 8 días (más que la vida máxima de una carga)."""
    if not isinstance(vistos, dict):
        return {}
    return {k: v for k, v in vistos.items()
            if isinstance(v, dict) and isinstance(v.get("t"), (int, float)) and ahora - v["t"] <= VISTOS_S}


def anotar(vistos, carga, ahora):
    """Apunta `aparato:seq` y `cuenta:nonce` (con el riesgo, para el límite por hora)."""
    riesgo = riesgo_de_entrada(carga.get("entrada"))
    for clave in (clave_seq(carga), clave_nonce(carga)):
        previo = vistos.get(clave) if isinstance(vistos.get(clave), dict) else {}
        vistos[clave] = dict(previo, t=ahora, riesgo=riesgo)


def altos_en_la_ultima_hora(vistos, huella, ahora):
    prefijo = "aparato:%s:" % _txt(huella).lower()
    return sum(1 for k, v in (vistos or {}).items()
               if k.startswith(prefijo) and isinstance(v, dict) and v.get("riesgo") == "alto"
               and isinstance(v.get("t"), (int, float)) and 0 <= ahora - v["t"] < 3600)


# ── la comprobación (§3.5.2, en este orden; se para en el primer fallo) ──────

def _sin_constantes(nombre):
    raise ValueError("constante no admitida: %s" % nombre)


def leer_carga(datos):
    """El objeto JSON de los bytes firmados, o None. UTF-8 estricto, sin BOM, sin NaN ni Infinity."""
    try:
        texto = bytes(datos).decode("utf-8")
        if texto.startswith("﻿"):
            return None
        obj = json.loads(texto, parse_constant=_sin_constantes)
    except (ValueError, UnicodeDecodeError, RecursionError, TypeError):
        return None
    return obj if isinstance(obj, dict) else None


def _carga_bien_formada(c):
    if not RE_CUENTA.match(_txt(c.get("cuenta"))) or not RE_HUELLA.match(_txt(c.get("aparato"))):
        return False
    seq = c.get("seq")
    if not _entero(seq) or not 1 <= seq <= 2 ** 53 - 1:
        return False
    if epoch_de(c.get("t")) <= 0 or epoch_de(c.get("caduca")) <= 0:
        return False
    if c.get("destino") not in ("mac", "a1") or not RE_ID_CHAT.match(_txt(c.get("chat"))):
        return False
    nombre = c.get("chatNombre")
    if not isinstance(nombre, str) or not 1 <= len(nombre) <= 80:
        return False
    e = c.get("entrada")
    return isinstance(e, dict) and e.get("v") == 1 and bool(RE_NONCE.match(_txt(e.get("nonce"))))


def _forma_sobre(e):
    return (isinstance(e, dict) and e.get("v") == 2 and isinstance(e.get("carga"), str) and e.get("carga")
            and isinstance(e.get("firma"), str) and isinstance(e.get("aparato"), str)
            and bool(RE_HUELLA.match(e.get("aparato"))))


def comprobar_entrada_firmada(e, altas, retirados, canon, vistos, ahora, destino):
    """(ok, motivo, carga). `e` es la fila que entrega la puerta (`EntradaRecibida` v2: id, cuenta, rol,
    destino, recibido, v, carga, firma, aparato). `carga` solo se devuelve si la firma es buena (aunque
    luego falle otra comprobación), para poder anotarla; si la firma no se pudo probar, es None.

    No escribe nada: `anotar` lo hace quien ejecuta, justo antes de ejecutar (§3.5.9)."""
    # 1. Forma del sobre. No hay ningún camino que acepte v:1.
    if not _forma_sobre(e):
        return False, "sin-firma", None
    huella = e["aparato"]
    # 2. Lista de altas y retirados.
    fila, motivo = aparato_valido(huella, altas, retirados)
    if fila is None:
        return False, motivo, None
    # 3. La firma sobre los BYTES de la carga; solo después, el JSON de esos mismos bytes.
    try:
        datos = b64url_dec(e["carga"])
        firma = b64url_dec(e["firma"])
        spki = b64url_dec(fila["spki"])
    except ValueError:
        return False, "firma-mala", None
    if len(datos) > MAX_CARGA_BYTES or not verificar_firma(spki, datos, firma):
        return False, "firma-mala", None
    carga = leer_carga(datos)
    if carga is None:
        return False, "firma-mala", None
    # 4. Lo firmado tiene que cuadrar.
    if carga.get("aud") != AUD:
        return False, "aud", carga
    if carga.get("aparato") != huella or not _carga_bien_formada(carga):
        return False, "firma-mala", carga
    cuenta_puerta = _txt(e.get("cuenta")).lower()
    if carga["cuenta"] != fila["cuenta"] or carga["cuenta"] != cuenta_puerta:
        return False, "cuenta-distinta", carga
    if carga["destino"] != destino:
        return False, "destino", carga
    distinto = chat_cuadra(carga, canon)
    if distinto:
        return False, distinto, carga
    # 5. Plazos.
    if epoch_de(carga["t"]) > ahora + MAX_ADELANTO_S:
        return False, "futuro", carga
    riesgo = riesgo_de_entrada(carga["entrada"])
    if ahora > caduca_efectiva(carga, epoch_de(e.get("recibido")), riesgo):
        return False, "caducada", carga
    # 6. Riesgo y nivel.
    if riesgo == "alto":
        if fila["nivel"] != "completo":
            return False, "nivel", carga
        if altos_en_la_ultima_hora(vistos, huella, ahora) >= MAX_ALTO_POR_HORA:
            return False, "limite", carga
    # 7. Repeticiones.
    vistos = vistos if isinstance(vistos, dict) else {}
    if clave_seq(carga) in vistos:
        return False, "seq-repetido", carga
    if clave_nonce(carga) in vistos:
        return False, "nonce-repetido", carga
    return True, "ok", carga


def rechazo_definitivo(motivo, carga, altas):
    """(GEN1114INT) ¿Se anotan `aparato:seq` y `cuenta:nonce` de una carga con firma buena que se rechaza?

    Solo si el rechazo sale de lo FIRMADO (o del estado de la Mac), nunca de lo que la puerta pone en el sobre:
    si no, una puerta tomada «quemaría» una entrada buena entregándola antes con otra cuenta o con una hora de
    recepción vieja, y la entrega honrada posterior saldría `seq-repetido` (la prueba cruzada lo comprobó). No
    abre repeticiones: lo que no se anota tampoco se ejecutó, y si se vuelve a entregar se comprueba de nuevo."""
    if motivo in ("ok", "seq-repetido", "nonce-repetido", "caducada", "limite"):
        return False
    if motivo == "cuenta-distinta" and isinstance(carga, dict):
        huella = _txt(carga.get("aparato")).lower()
        fila = next((f for f in aparatos_validos(altas)["aparatos"] if f["huella"] == huella), None)
        return not (fila is not None and carga.get("cuenta") == fila["cuenta"])   # solo el sobre no cuadra
    return True


def entrada_para_gen1113(e, carga):
    """El objeto EXACTO que recibe `validar_entrada` de GEN1113 (§3.5, paso 8): la entrada firmada, más el
    id, el rol y la hora de recepción que pone la puerta (el rol solo puede bajar; la hora solo adelantar
    la caducidad), y la cuenta y el destino firmados."""
    return dict(carga["entrada"], id=e.get("id"), cuenta=carga["cuenta"], rol=e.get("rol"),
                recibido=e.get("recibido"), destino=carga["destino"])


def es_retirada(carga):
    return isinstance(carga, dict) and isinstance(carga.get("entrada"), dict) and \
        carga["entrada"].get("accion") in RETIRADAS


def objetivo_de_retirada(carga, altas):
    """(huella, None) de lo que hay que retirar, o (None, motivo fijo). `revocarme` retira el aparato que
    firma; `revocar-aparato` solo un aparato de la MISMA cuenta (el rol de dueño lo mira quien llama)."""
    entrada = carga.get("entrada") or {}
    if entrada.get("fuente") != "direccion" or carga.get("destino") != "mac":
        return None, "orden no permitida"
    extra = set(entrada) - {"v", "nonce", "t", "fuente", "accion", "huella"}
    if extra:
        return None, "orden no permitida"
    if entrada.get("accion") == "revocarme":
        return (carga["aparato"], None) if "huella" not in entrada else (None, "orden no permitida")
    objetivo = _txt(entrada.get("huella")).lower()
    if not RE_HUELLA.match(objetivo):
        return None, "orden no permitida"
    fila = next((f for f in aparatos_validos(altas)["aparatos"] if f["huella"] == objetivo), None)
    if fila is None or fila["cuenta"] != carga["cuenta"]:
        return None, "esa huella no es de un aparato de tu cuenta"
    return objetivo, None


def texto_de_motivo(motivo, retirado_el=None):
    """El detalle del acuse: «[motivo] texto». `retirado_el` (p. ej. «el 13-11 a las 14:02») solo para
    `aparato-revocado`. Nunca lleva texto, rutas ni cuentas."""
    texto = TEXTOS.get(motivo, "No se ejecutó nada")
    if motivo == "aparato-revocado":
        texto = texto % ((" " + retirado_el) if retirado_el else "")
    return "[%s] %s" % (motivo, texto)
