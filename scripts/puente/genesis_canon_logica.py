# -*- coding: utf-8 -*-
"""GEN1114C · Registro canónico de chats de Genesis: la lógica PURA (sin red, sin disco, sin reloj).

Contrato: architecture/astraura-chats-identidad-firma.md §2.1–§2.4, §5.1 y §8.3 (copia de trabajo en
~/.starseed/opus1031/contratos/astraura-chats-identidad-firma-1114.md). El único que escribe
`~/.starseed/genesis-chats/canon.json` es `genesis_canon.py`; este archivo solo transforma datos.

Reglas que se cumplen aquí (y que las pruebas comprueban):
- Ids propios de StarSeed y estables: `genesis`, `genesis.canal.<canal>` y `telegram.<usuario del bot>`,
  este último congelado la primera vez que se descubre (si el bot cambia de usuario, el id se queda).
- Un nombre de un medio distinto del canónico se anota como «distinto»; el canónico no cambia solo (D4).
- El catálogo que sale de la Mac no lleva `refs`, ni ids nativos, ni tokens: solo huellas de 8 hex.
- Ids y alias únicos entre chats, y ningún alias de un chat es el id o el nombre de otro.
- Los nombres se limpian de controles y marcas bidi y se recortan a 80 caracteres.
"""
from __future__ import annotations

import copy
import hashlib
import hmac
import re
import unicodedata

TIPOS = ("direccion", "canal-director", "puente-telegram", "astraura")
MEDIOS = ("mac-direccion", "claude", "codex", "hermes", "antigravity", "ide", "terminal",
          "telegram", "a1-peticiones", "genesis-web", "astraura")
ESTADOS_NOMBRE = ("igual", "distinto", "sin-comprobar", "no-se-puede")

RE_ID = re.compile(r"^[a-z0-9][a-z0-9._-]{1,62}$")
RE_HUELLA = re.compile(r"^[0-9a-f]{8}$")
RE_DIGITOS = re.compile(r"\d{7,}")
# Una ref guarda NOMBRES (de variable o de clave), nunca valores.
RE_CLAVE_REF = re.compile(r"^[A-Za-z0-9_.:/~\-]{1,120}$")

NOMBRE_DIRECCION = "GENESIS · StarSeed OS"
MAX_NOMBRE = 80
MAX_ALIAS = 20
MAX_MEDIOS = 16
POR_MAC = "mac:mac"

# Las tres fuentes de transporte de los puentes (GEN1113, no cambian) y lo que se sabe de cada uno.
# `env` lista los archivos donde se buscan las variables, en orden; aquí solo hay NOMBRES.
PUENTES = {
    "hermes-avisos": {
        "fuente": "puente:hermes-avisos", "etiqueta": "Hermes y avisos", "letra": "A",
        "medios": ("telegram", "hermes", "genesis-web"),
        "env": ("~/.hermes/.env",), "token": "TELEGRAM_BOT_TOKEN", "chat": "TELEGRAM_CHAT_ID",
    },
    "peticiones": {
        "fuente": "puente:peticiones", "etiqueta": "Peticiones y encargos", "letra": "B",
        "medios": ("telegram", "a1-peticiones", "genesis-web"),
        "env": ("~/.starseed/env", "~/.hermes/.env"),
        "token": "TELEGRAM_SINTESIS_BOT_TOKEN", "chat": "TELEGRAM_SINTESIS_CHAT_ID",
    },
    "avisos-directores": {
        "fuente": "puente:avisos-directores", "etiqueta": "Avisos de los directores", "letra": "C",
        "medios": ("telegram", "genesis-web"),
        "env": ("~/.starseed/env",), "token": "TELEGRAM_BOT_TOKEN", "chat": "TELEGRAM_CHAT_ID",
    },
}

# Canal del chat de dirección → medio donde vive su motor o su bandeja (además de la Mac y la web).
MEDIO_DE_CANAL = {
    "claude-cowork": "claude", "claude-mac": "claude", "hermes": "hermes", "telegram": "telegram",
    "chatgpt": "codex", "antigravity": "antigravity", "ide": "ide", "terminal": "terminal",
}
ENTORNOS_GENESIS = ("claude", "codex", "hermes", "antigravity")

# Campos que pueden salir de la Mac (todo lo demás se queda: refs, versiones, permisos, contexto…).
CAMPOS_PUBLICOS = ("v", "id", "nombre", "nombreProvisional", "tipo", "padre", "fuente", "alias", "medios",
                   "version", "actualizado")
CAMPOS_MEDIO = ("medio", "nombreEnMedio", "estadoNombre", "comprobado", "huella", "usuario")
# Claves que `sin_ids` no mira: la huella (8 hex que pueden ser todo cifras), versiones y fechas.
EXENTAS = frozenset(("huella", "version", "actualizado", "t", "comprobado", "n"))

_BIDI = set(range(0x202A, 0x202F)) | set(range(0x2066, 0x206A)) | {0x200E, 0x200F, 0x061C, 0xFEFF}


# ── nombres e ids ─────────────────────────────────────────────────────────────────────────────────

def limpiar_nombre(s) -> str:
    """Quita controles y marcas bidi, junta espacios y recorta a 80 caracteres."""
    if not isinstance(s, str):
        return ""
    limpio = "".join(
        " " if ch in "\t\n\r" else ch
        for ch in s
        if ch in "\t\n\r" or (unicodedata.category(ch) != "Cc" and ord(ch) not in _BIDI)
    )
    limpio = re.sub(r"\s+", " ", limpio).strip()
    return limpio[:MAX_NOMBRE].rstrip()


def _partir_digitos(texto: str) -> str:
    """Una racha de 7 o más cifras se parte con «-» cada 6: ningún id parece un id nativo."""
    return RE_DIGITOS.sub(lambda m: "-".join(m.group(0)[i:i + 6] for i in range(0, len(m.group(0)), 6)), texto)


def id_telegram(usuario: str) -> str:
    """`telegram.` + el @usuario del bot en minúsculas, sin `@` (con las rachas de cifras partidas)."""
    u = str(usuario or "").strip().lstrip("@").lower()
    u = re.sub(r"[^a-z0-9._-]", "", u)
    if not u:
        raise ValueError("usuario de bot vacío")
    ident = ("telegram." + _partir_digitos(u))[:63]
    if not RE_ID.match(ident):
        raise ValueError("usuario de bot no válido")
    return ident


def nombre_de_puente(me: dict, chat: dict) -> tuple:
    """(nombre, tipo_chat). Chat privado → el nombre del bot (`getMe().first_name`); grupo, supergrupo o
    canal → el título del chat (`getChat().title`). Es el nombre con que Alex ve ese chat en Telegram (D2b)."""
    me = me if isinstance(me, dict) else {}
    chat = chat if isinstance(chat, dict) else {}
    tipo = str(chat.get("type") or "")
    if tipo in ("group", "supergroup", "channel"):
        nombre = limpiar_nombre(chat.get("title"))
    else:
        nombre = limpiar_nombre(me.get("first_name"))
    if not nombre:
        raise ValueError("Telegram no dio nombre para este chat")
    return nombre, tipo or "desconocido"


def _plegar(s) -> str:
    return limpiar_nombre(s).casefold()


def problemas_de_unicidad(chats: list) -> list:
    """Lista de problemas (vacía si todo cuadra): ids repetidos o mal formados, alias repetidos, y alias
    de un chat que son el id o el nombre de otro. Se compara sin mayúsculas."""
    problemas = []
    dueno = {}  # texto plegado → id del chat que lo usa como id, nombre o alias
    ids = set()
    for c in chats:
        ident = c.get("id")
        if not isinstance(ident, str) or not RE_ID.match(ident):
            problemas.append("id no válido: %r" % (ident,))
            continue
        if ident in ids:
            problemas.append("id repetido: %s" % ident)
        ids.add(ident)
    for c in chats:
        ident = c.get("id")
        propios = [("id", ident)] + [("alias", a) for a in (c.get("alias") or [])]
        vistos_aqui = set()
        for clase, texto in propios:
            k = _plegar(texto)
            if not k or k in vistos_aqui:
                continue
            vistos_aqui.add(k)
            otro = dueno.get(k)
            if otro is not None and otro != ident:
                problemas.append("«%s» (%s de %s) ya es de %s" % (texto, clase, ident, otro))
            else:
                dueno[k] = ident
    for c in chats:  # un alias ajeno no puede ser el nombre de otro chat
        k = _plegar(c.get("nombre"))
        otro = dueno.get(k)
        if k and otro is not None and otro != c.get("id"):
            problemas.append("el nombre «%s» de %s es alias o id de %s" % (c.get("nombre"), c.get("id"), otro))
    return problemas


def _exigir_unicos(chats: list) -> None:
    p = problemas_de_unicidad(chats)
    if p:
        raise ValueError("; ".join(p))


# ── semilla ───────────────────────────────────────────────────────────────────────────────────────

def _medio(medio: str) -> dict:
    return {"medio": medio, "nombreEnMedio": None, "estadoNombre": "sin-comprobar", "comprobado": None, "huella": None}


def _chat(ident, nombre, tipo, fuente, alias, medios, refs, ahora, provisional=False, padre=None) -> dict:
    c = {"v": 2, "id": ident, "nombre": nombre, "nombreProvisional": bool(provisional), "tipo": tipo}
    if padre:
        c["padre"] = padre
    c.update({"fuente": fuente, "alias": list(alias), "medios": [_medio(m) for m in medios], "version": 1,
              "actualizado": ahora, "refs": list(refs), "versiones": {}})
    return c


def id_provisional_de_puente(puente: str) -> str:
    """El id que lleva un puente mientras no se ha descubierto (pasa a alias cuando se congela el real)."""
    return "telegram.%s" % puente


def semilla(chats_json: dict, canales: tuple, nombres_canal: dict, ahora: str = "1970-01-01T00:00:00Z") -> dict:
    """CanonChats v2 con los 13 chats de la fase 1: la dirección, sus nueve canales y los tres puentes sin
    descubrir (nombre provisional = la etiqueta de GEN1113). Solo usa NOMBRES de `chats.json`, nunca sus ids."""
    cj = chats_json if isinstance(chats_json, dict) else {}
    entornos = cj.get("entornos") if isinstance(cj.get("entornos"), dict) else {}
    nombre_dir = limpiar_nombre(cj.get("nombre_canonico")) or NOMBRE_DIRECCION
    medios_dir = ["mac-direccion"] + [e for e in ENTORNOS_GENESIS if e in entornos]
    if isinstance(entornos.get("telegram"), dict) and entornos["telegram"].get("id") is not None:
        medios_dir.append("telegram")
    medios_dir.append("genesis-web")
    refs_dir = [{"medio": "mac-direccion", "clave": "director_chat.CANALES:mando"}]
    refs_dir += [{"medio": e, "clave": "chats.json:entornos.%s" % e} for e in ENTORNOS_GENESIS if e in entornos]
    if "telegram" in medios_dir:
        refs_dir.append({"medio": "telegram", "clave": "chats.json:entornos.telegram"})
    chats = [_chat("genesis", nombre_dir, "direccion", "direccion", ["direccion", "mando"], medios_dir, refs_dir,
                   ahora, provisional=not limpiar_nombre(cj.get("nombre_canonico")))]
    nombres_canal = nombres_canal if isinstance(nombres_canal, dict) else {}
    for canal in canales:
        if canal == "mando":
            continue
        nombre = limpiar_nombre(nombres_canal.get(canal))
        medios = ["mac-direccion"]
        if MEDIO_DE_CANAL.get(canal) and MEDIO_DE_CANAL[canal] not in medios:
            medios.append(MEDIO_DE_CANAL[canal])
        medios.append("genesis-web")
        chats.append(_chat("genesis.canal.%s" % canal, nombre or canal, "canal-director", None, [], medios,
                           [{"medio": "mac-direccion", "clave": "director_chat.CANALES:%s" % canal}], ahora,
                           provisional=not nombre, padre="genesis"))
    for puente, d in PUENTES.items():
        refs = [{"medio": "telegram", "clave": "%s:%s" % (d["env"][0], d["chat"])},
                {"medio": "telegram", "clave": "%s:%s" % (d["env"][0], d["token"])}]
        chats.append(_chat(id_provisional_de_puente(puente), d["etiqueta"], "puente-telegram", d["fuente"],
                           [d["fuente"], puente, d["etiqueta"]], d["medios"], refs, ahora, provisional=True))
    _exigir_unicos(chats)
    return {"v": 2, "version": 1, "actualizado": ahora, "chats": chats}


def completar(canon: dict, base: dict, ahora: str) -> tuple:
    """Funde una semilla nueva en un registro que ya existe SIN perder nada de lo que hay: añade los chats que
    falten y, en los que ya están, solo añade alias, medios y refs nuevos. Un nombre que el dueño cambió no se
    toca; un nombre automático provisional sí se mejora si la semilla trae el real. Devuelve (canon, cambios)."""
    canon = copy.deepcopy(canon)
    cambios = []
    por_id = {c["id"]: c for c in canon["chats"]}
    por_fuente = {c.get("fuente"): c for c in canon["chats"] if c.get("fuente")}
    for s in base.get("chats", []):
        actual = por_id.get(s["id"]) or (por_fuente.get(s.get("fuente")) if s.get("fuente") else None)
        if actual is None:
            nuevo = copy.deepcopy(s)
            prueba = canon["chats"] + [nuevo]
            if problemas_de_unicidad(prueba):
                cambios.append("no añado %s: choca con otro chat" % s["id"])
                continue
            canon["chats"].append(nuevo)
            cambios.append("añadido %s" % s["id"])
            continue
        tocado = False
        for a in s.get("alias", []):
            if a not in actual["alias"] and len(actual["alias"]) < MAX_ALIAS:
                actual["alias"].append(a)
                if problemas_de_unicidad(canon["chats"]):
                    actual["alias"].pop()
                else:
                    tocado = True
        medios = {m.get("medio") for m in actual.get("medios", [])}
        for m in s.get("medios", []):
            if m["medio"] not in medios and len(actual["medios"]) < MAX_MEDIOS:
                actual["medios"].append(copy.deepcopy(m))
                tocado = True
        refs = {(r.get("medio"), r.get("clave")) for r in actual.get("refs", [])}
        for r in s.get("refs", []):
            if (r["medio"], r["clave"]) not in refs:
                actual.setdefault("refs", []).append(dict(r))
                tocado = True
        automatico = actual.get("nombre") in (actual["id"], actual["id"].rsplit(".", 1)[-1])
        if actual.get("nombreProvisional") and not s.get("nombreProvisional") and automatico \
                and actual.get("tipo") != "puente-telegram":
            actual["nombre"], actual["nombreProvisional"] = s["nombre"], False
            if problemas_de_unicidad(canon["chats"]):
                actual["nombre"], actual["nombreProvisional"] = actual["id"], True
            else:
                tocado = True
        if tocado:
            _subir_version(canon, actual, ahora)
            cambios.append("completado %s" % actual["id"])
    _exigir_unicos(canon["chats"])
    return canon, cambios


def _subir_version(canon: dict, chat: dict, ahora: str) -> None:
    chat["version"] = int(chat.get("version") or 0) + 1
    chat["actualizado"] = ahora
    canon["version"] = int(canon.get("version") or 0) + 1
    canon["actualizado"] = ahora


def _anotar_version(chat: dict, campo: str, ahora: str) -> None:
    v = chat.setdefault("versiones", {}).get(campo) or {"n": 0}
    chat["versiones"][campo] = {"n": int(v.get("n") or 0) + 1, "t": ahora, "por": POR_MAC}


# ── descubrimiento de los puentes ─────────────────────────────────────────────────────────────────

def chat_de_fuente(canon: dict, fuente: str):
    """El chat cuya `fuente` es esa Y que la lleva también entre sus alias (relación fija de §3.4).
    None si no hay ninguno o si hay más de uno (un registro ambiguo no decide nada)."""
    if not isinstance(canon, dict) or not isinstance(fuente, str) or not fuente:
        return None
    hallados = []
    for c in canon.get("chats") or []:
        if not isinstance(c, dict) or c.get("fuente") != fuente:
            continue
        if fuente in (c.get("alias") or []):
            hallados.append(c)
    return hallados[0] if len(hallados) == 1 else None


def _medio_de(chat: dict, medio: str) -> dict:
    for m in chat.setdefault("medios", []):
        if m.get("medio") == medio:
            return m
    m = _medio(medio)
    chat["medios"].append(m)
    return m


def fusionar_descubierto(canon: dict, puente: str, descubierto: dict, ahora: str) -> dict:
    """Aplica lo que `descubrir` leyó de Telegram para un puente. `descubierto` es
    `{"usuario": "x_bot", "nombre": "…", "tipoChat": "private"}` o `{"error": "motivo"}`.

    - La primera vez congela el id `telegram.<usuario>` (el provisional pasa a alias) y pone el nombre real.
    - Después, el id NUNCA cambia, aunque el bot cambie de @usuario: se anota el usuario nuevo en el medio.
    - Si el nombre en Telegram ya no es el canónico, se anota `estadoNombre: "distinto"` y el canónico se queda (D4).
    - Con error, el registro no cambia (el puente sigue provisional si nunca se descubrió).
    """
    if puente not in PUENTES:
        raise ValueError("puente desconocido: %s" % puente)
    canon = copy.deepcopy(canon)
    chat = chat_de_fuente(canon, PUENTES[puente]["fuente"])
    if chat is None:
        raise ValueError("el registro no tiene un chat único para %s" % PUENTES[puente]["fuente"])
    if not isinstance(descubierto, dict) or descubierto.get("error"):
        return canon
    nombre = limpiar_nombre(descubierto.get("nombre"))
    if not nombre:
        return canon
    usuario = str(descubierto.get("usuario") or "").strip().lstrip("@")
    antes = copy.deepcopy(chat)
    tg = _medio_de(chat, "telegram")
    if "id" not in chat.get("versiones", {}):
        nuevo = id_telegram(usuario)
        otros = {c["id"] for c in canon["chats"] if c is not chat}
        if nuevo in otros:  # dos puentes con el mismo bot: el segundo lleva el puente detrás
            nuevo = (nuevo + "." + puente)[:63]
        viejo = chat["id"]
        chat["id"] = nuevo
        if viejo != nuevo and viejo not in chat["alias"]:
            chat["alias"].append(viejo)
        chat["nombre"], chat["nombreProvisional"] = nombre, False
        problemas = problemas_de_unicidad(canon["chats"])
        if problemas:
            raise ValueError("no aplico %s: %s" % (puente, "; ".join(problemas)))
        _anotar_version(chat, "id", ahora)
        _anotar_version(chat, "nombre", ahora)
    elif chat.get("nombreProvisional"):
        chat["nombre"], chat["nombreProvisional"] = nombre, False
        if problemas_de_unicidad(canon["chats"]):
            raise ValueError("no aplico %s: el nombre «%s» choca con otro chat" % (puente, nombre))
        _anotar_version(chat, "nombre", ahora)
    tg["nombreEnMedio"] = nombre
    tg["estadoNombre"] = "igual" if nombre == chat["nombre"] else "distinto"
    if usuario:
        tg["usuario"] = "@" + usuario
    sustancia = antes != chat
    tg["comprobado"] = ahora
    if sustancia:
        _subir_version(canon, chat, ahora)
    return canon


def marcar_no_se_puede(canon: dict, puente: str, ahora: str) -> dict:
    """El medio Telegram de un puente que no se pudo comprobar (sin variable o sin red) queda «no-se-puede»
    solo si nunca se comprobó; si ya tenía nombre, se conserva lo último que se supo."""
    canon = copy.deepcopy(canon)
    chat = chat_de_fuente(canon, PUENTES[puente]["fuente"])
    if chat is None:
        return canon
    tg = _medio_de(chat, "telegram")
    if tg.get("comprobado") is None and tg.get("estadoNombre") != "no-se-puede":
        tg["estadoNombre"] = "no-se-puede"
        _subir_version(canon, chat, ahora)
    return canon


# ── lectura tolerante del registro ────────────────────────────────────────────────────────────────

def _texto(x, tope):
    return x[:tope] if isinstance(x, str) else None


def _medio_valido(m):
    if not isinstance(m, dict) or m.get("medio") not in MEDIOS:
        return None
    sal = {"medio": m["medio"],
           "nombreEnMedio": limpiar_nombre(m.get("nombreEnMedio")) or None,
           "estadoNombre": m.get("estadoNombre") if m.get("estadoNombre") in ESTADOS_NOMBRE else "sin-comprobar",
           "comprobado": _texto(m.get("comprobado"), 40),
           "huella": m.get("huella") if isinstance(m.get("huella"), str) and RE_HUELLA.match(m["huella"]) else None}
    u = m.get("usuario")
    if isinstance(u, str) and re.match(r"^@[A-Za-z0-9_]{1,64}$", u):
        sal["usuario"] = u
    return sal


def migrar_canon(crudo) -> tuple:
    """(canon, avisos). Acepta cualquier cosa y nunca lanza. Lo que no se entiende se deja fuera y se dice en
    `avisos` (el CLI guarda entonces una copia del original antes de escribir: nada se pierde)."""
    avisos = []
    vacio = {"v": 2, "version": 0, "actualizado": None, "chats": []}
    if not isinstance(crudo, dict):
        return vacio, (["el registro no es un objeto JSON"] if crudo is not None else [])
    if crudo.get("v") != 2:
        avisos.append("versión del registro desconocida (%r): se lee como v2" % (crudo.get("v"),))
    chats = []
    for c in crudo.get("chats") if isinstance(crudo.get("chats"), list) else []:
        if not isinstance(c, dict):
            avisos.append("un chat no es un objeto: fuera")
            continue
        ident = c.get("id")
        if not isinstance(ident, str) or not RE_ID.match(ident):
            avisos.append("chat con id no válido (%r): fuera" % (str(ident)[:40],))
            continue
        nombre = limpiar_nombre(c.get("nombre"))
        nuevo = {"v": 2, "id": ident, "nombre": nombre or ident,
                 "nombreProvisional": bool(c.get("nombreProvisional")) or not nombre,
                 "tipo": c.get("tipo") if c.get("tipo") in TIPOS else "astraura"}
        if c.get("tipo") not in TIPOS:
            avisos.append("%s: tipo desconocido, queda «astraura»" % ident)
        if isinstance(c.get("padre"), str) and RE_ID.match(c["padre"]):
            nuevo["padre"] = c["padre"]
        nuevo["fuente"] = c.get("fuente") if isinstance(c.get("fuente"), str) else None
        alias = []
        for a in c.get("alias") if isinstance(c.get("alias"), list) else []:
            a2 = limpiar_nombre(a)
            if a2 and a2 not in alias and len(alias) < MAX_ALIAS:
                alias.append(a2)
        nuevo["alias"] = alias
        nuevo["medios"] = [m for m in (_medio_valido(x) for x in (c.get("medios") or [])[:MAX_MEDIOS]) if m]
        nuevo["version"] = c.get("version") if isinstance(c.get("version"), int) and c["version"] >= 0 else 1
        nuevo["actualizado"] = _texto(c.get("actualizado"), 40)
        refs = []
        for r in c.get("refs") if isinstance(c.get("refs"), list) else []:
            if isinstance(r, dict) and r.get("medio") in MEDIOS and isinstance(r.get("clave"), str) \
                    and RE_CLAVE_REF.match(r["clave"]) and not RE_DIGITOS.search(r["clave"]):
                refs.append({"medio": r["medio"], "clave": r["clave"]})
            else:
                avisos.append("%s: una ref que no es un nombre se quita" % ident)
        nuevo["refs"] = refs
        nuevo["versiones"] = {k: v for k, v in (c.get("versiones") or {}).items()
                              if isinstance(k, str) and isinstance(v, dict)} if isinstance(c.get("versiones"), dict) else {}
        for extra in ("config", "contexto", "permisos"):
            if extra in c:
                nuevo[extra] = copy.deepcopy(c[extra])
        chats.append(nuevo)
    vistos, unicos = set(), []
    for c in chats:
        if c["id"] in vistos:
            avisos.append("id repetido %s: se queda el primero" % c["id"])
            continue
        vistos.add(c["id"])
        unicos.append(c)
    for p in problemas_de_unicidad(unicos):
        avisos.append("unicidad: " + p)
    version = crudo.get("version") if isinstance(crudo.get("version"), int) and crudo["version"] >= 0 else 0
    return {"v": 2, "version": version, "actualizado": _texto(crudo.get("actualizado"), 40), "chats": unicos}, avisos


# ── catálogo público ──────────────────────────────────────────────────────────────────────────────

def sin_ids(x, _clave=None) -> bool:
    """True si ningún texto ni número tiene 7 o más cifras seguidas (salvo huella, versiones y fechas)."""
    if _clave in EXENTAS:
        return True
    if isinstance(x, dict):
        return all(sin_ids(v, k) for k, v in x.items()) and all(not RE_DIGITOS.search(str(k)) for k in x)
    if isinstance(x, (list, tuple)):
        return all(sin_ids(v) for v in x)
    if isinstance(x, bool) or x is None:
        return True
    if isinstance(x, (int, float)):
        return not RE_DIGITOS.search(str(x))
    if isinstance(x, str):
        return not RE_DIGITOS.search(x)
    return False


def huella_de(sal: bytes, id_nativo) -> str:
    """HMAC-SHA256(sal, id nativo)[:8]: deja ver que dos medios son el mismo chat sin revelar el id."""
    return hmac.new(bytes(sal), str(id_nativo).encode("utf-8"), hashlib.sha256).hexdigest()[:8]


def catalogo_publico(canon: dict, sal: bytes, ids_nativos: dict, ahora: str = None, avisos: list = None) -> dict:
    """CatalogoCanon v2 que puede salir de la Mac. Copia SOLO los campos públicos (nunca refs, versiones,
    permisos ni contexto) y calcula la huella de cada medio con `ids_nativos = {id_chat: {medio: id nativo}}`.
    Un nombre con 7 o más cifras seguidas (un teléfono en un título) se sustituye por el id del chat con
    `nombreProvisional: true` y se dice en `avisos`; nunca bloquea el catálogo entero."""
    avisos = avisos if avisos is not None else []
    if not isinstance(sal, (bytes, bytearray)) or len(sal) < 16:
        raise ValueError("sal de huellas no válida")
    ids_nativos = ids_nativos if isinstance(ids_nativos, dict) else {}
    chats = []
    for c in canon.get("chats") or []:
        p = {k: copy.deepcopy(c[k]) for k in CAMPOS_PUBLICOS if k in c}
        p["v"] = 2
        if not sin_ids(p.get("nombre")):
            avisos.append("%s: el nombre tiene un número largo; sale como «%s» (provisional)" % (c["id"], c["id"]))
            p["nombre"], p["nombreProvisional"] = c["id"], True
        p["alias"] = [a for a in (p.get("alias") or []) if sin_ids(a)][:MAX_ALIAS]
        nativos = ids_nativos.get(c["id"]) if isinstance(ids_nativos.get(c["id"]), dict) else {}
        medios = []
        for m in (c.get("medios") or [])[:MAX_MEDIOS]:
            mp = {k: m.get(k) for k in CAMPOS_MEDIO if k in m}
            for k in ("nombreEnMedio", "estadoNombre", "comprobado", "huella"):
                mp.setdefault(k, None)
            if mp.get("nombreEnMedio") is not None and not sin_ids(mp["nombreEnMedio"]):
                mp["nombreEnMedio"] = None
            if "usuario" in mp and (mp["usuario"] is None or not sin_ids(mp["usuario"])):
                del mp["usuario"]
            nativo = nativos.get(m.get("medio"))
            mp["huella"] = huella_de(sal, nativo) if nativo not in (None, "") else None
            medios.append(mp)
        p["medios"] = medios
        chats.append(p)
    _exigir_unicos(chats)
    cat = {"v": 2, "chats": chats, "version": int(canon.get("version") or 0),
           "t": ahora or canon.get("actualizado") or "1970-01-01T00:00:00Z"}
    if not sin_ids(cat):
        raise ValueError("el catálogo lleva algo que parece un id nativo: no sale")
    return cat


# ── punteros de los IDE ───────────────────────────────────────────────────────────────────────────

TIPO_LEGIBLE = {"direccion": "dirección", "canal-director": "canal de la dirección",
                "puente-telegram": "puente de Telegram", "astraura": "Astraura"}


def seccion_punteros(canon: dict) -> str:
    """La sección «Chats de Genesis» que llevan los punteros de todos los IDE (idéntica en todos). Sin horas
    ni nada que cambie entre dos llamadas con el mismo registro, y sin ids nativos."""
    filas = ["## Chats de Genesis", "",
             "Cada chat tiene un solo nombre y un solo id en todos los medios (Telegram, la dirección en la Mac,",
             "Hermes, los IDE y la pestaña Genesis). Usa estos nombres e ids al hablar de ellos.", "",
             "| Nombre | Id | Tipo |", "|---|---|---|"]
    chats = canon.get("chats") if isinstance(canon, dict) else None
    for c in chats or []:
        nombre = limpiar_nombre(c.get("nombre")).replace("|", "/")
        if c.get("nombreProvisional"):
            nombre += " (nombre provisional)"
        filas.append("| %s | `%s` | %s |" % (nombre, c.get("id"), TIPO_LEGIBLE.get(c.get("tipo"), c.get("tipo"))))
    if not chats:
        filas.append("| (el registro aún no existe: `python3 scripts/puente/genesis_canon.py descubrir --aplicar`) | | |")
    filas += ["", "Registro: `~/.starseed/genesis-chats/canon.json` (versión %s), lo escribe solo `genesis_canon.py`."
              % (canon.get("version") if isinstance(canon, dict) else "—")]
    texto = "\n".join(filas) + "\n"
    return texto if sin_ids(texto) else RE_DIGITOS.sub("…", texto)
