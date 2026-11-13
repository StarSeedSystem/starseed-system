#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""GEN1114C · Registro canónico de chats de Genesis en la Mac: el ÚNICO que escribe canon.json.

  python3 scripts/puente/genesis_canon.py descubrir              # lee los nombres reales de los 3 puentes (no escribe)
  python3 scripts/puente/genesis_canon.py descubrir --aplicar    # … y siembra / actualiza ~/.starseed/genesis-chats/canon.json
  python3 scripts/puente/genesis_canon.py estado                 # los chats con su id y su nombre
  python3 scripts/puente/genesis_canon.py subir                  # sube el catálogo SIN secretos a la puerta del A1
  python3 scripts/puente/genesis_canon.py aplicar-nombres --telegram   # fase 1: solo enseña lo que cambiaría

Contrato: architecture/astraura-chats-identidad-firma.md §2.2–§2.4, §5.1, §7.1–§7.4 y §8.3.

Reglas (las comprueban test_genesis_canon.py y test_genesis_canon_logica.py):
- De Telegram solo se llama a `getMe` y `getChat`. NUNCA a `getUpdates`: el gateway de Hermes escucha al bot A
  y le robaría los mensajes. La clase `TelegramSoloLectura` se niega a cualquier otro método.
- Nada de lo que imprime lleva un token ni un id numérico: toda salida pasa por `tachar` (7 o más cifras → «…»).
- `canon.json` en 600, escrito atómicamente (temporal en la misma carpeta + rename) con copias rotadas
  `canon.json.1..5` y bajo un cerrojo: un solo escritor.
- Las variables se leen por su NOMBRE de los archivos de entorno; sus valores no salen de este proceso salvo
  hacia Telegram (token) y como huella HMAC con sal (ids de chat y de sesión).
- `subir` no escribe canon.json (el servicio lo vigila con WatchPaths): lo último subido va a canon-subido.json.
"""
from __future__ import annotations

import fcntl
import json
import os
import re
import secrets
import shutil
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

AQUI = os.path.dirname(os.path.abspath(__file__))
if AQUI not in sys.path:
    sys.path.insert(0, AQUI)

import genesis_canon_logica as L  # noqa: E402

HOME = os.path.expanduser("~")
RAIZ = os.path.dirname(os.path.dirname(AQUI))
COPIAS = 5
VAR_URL = "PUERTA_DATOS_URL"
VAR_FICHA = "STARSEED_PUERTA_FICHA_GENESIS_MAC"
RUTA_CANON_PUERTA = "/v1/genesis/chats/canon"
API_TELEGRAM = "https://api.telegram.org"
METODOS_PERMITIDOS = frozenset(("getMe", "getChat"))
TIPO_CHAT_LEGIBLE = {"private": "chat privado", "group": "grupo", "supergroup": "supergrupo", "channel": "canal"}


def base_dir(entorno=None):
    entorno = os.environ if entorno is None else entorno
    return entorno.get("STARSEED_GENESIS_CHATS_DIR") or os.path.join(HOME, ".starseed", "genesis-chats")


def ruta_canon(base=None):
    return os.path.join(base or base_dir(), "canon.json")


def ahora_iso(t=None):
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(time.time() if t is None else t))


def tachar(texto) -> str:
    """Lo que se imprime nunca lleva un id numérico, un token de bot ni una URL."""
    t = str(texto)
    t = re.sub(r"bot\d+:[A-Za-z0-9_-]+", "bot<token>", t)
    t = re.sub(r"https?://\S+", "<url>", t)
    t = re.sub(r"\b\d{1,3}(?:\.\d{1,3}){3}\b", "<ip>", t)
    return L.RE_DIGITOS.sub("…", t)


def decir(salida, texto=""):
    salida(tachar(texto))


# ── archivos de entrada (solo lectura) ────────────────────────────────────────────────────────────

def leer_json(ruta, defecto=None):
    try:
        with open(ruta, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return defecto


def leer_env(ruta):
    """{NOMBRE: valor} de un archivo de entorno; mismo formato que puerta_datos_cliente.leer_env."""
    datos = {}
    try:
        with open(ruta, encoding="utf-8") as f:
            for linea in f:
                linea = linea.strip()
                if not linea or linea.startswith("#") or "=" not in linea:
                    continue
                if linea.startswith("export "):
                    linea = linea[7:]
                k, v = linea.split("=", 1)
                datos[k.strip()] = v.strip().strip('"').strip("'")
    except OSError:
        pass
    return datos


def canales_y_nombres(raiz=RAIZ):
    """(CANALES de director_chat.py, {canal: nombre} de chat-director-tipos.ts). Se leen como texto, con una
    expresión regular, igual que la prueba que ya compara los dos órdenes. Si no se puede, nombres vacíos."""
    canales = ()
    try:
        with open(os.path.join(raiz, "scripts", "puente", "director_chat.py"), encoding="utf-8") as f:
            m = re.search(r"^CANALES\s*=\s*\((.*?)\)", f.read(), re.S | re.M)
        if m:
            canales = tuple(re.findall(r'"([a-z0-9-]+)"', m.group(1)))
    except OSError:
        pass
    nombres = {}
    try:
        with open(os.path.join(raiz, "src", "lib", "mando", "chat-director-tipos.ts"), encoding="utf-8") as f:
            m = re.search(r"export const CANALES[^=]*=\s*\[(.*?)\];", f.read(), re.S)
        if m:
            for ident, nombre in re.findall(r'\{\s*id:\s*"([a-z0-9-]+)",\s*nombre:\s*"([^"]+)"', m.group(1)):
                nombres[ident] = nombre
    except OSError:
        pass
    if canales and nombres and [c for c in canales if c in nombres] != list(canales):
        nombres = {c: nombres[c] for c in canales if c in nombres}
    return canales, nombres


def semilla_desde_disco(raiz=RAIZ, ahora=None):
    chats_json = leer_json(os.path.join(raiz, "scripts", "puente", "chats.json"), {})
    canales, nombres = canales_y_nombres(raiz)
    if not canales:
        raise SystemExit("no puedo leer CANALES de director_chat.py: no siembro nada")
    return L.semilla(chats_json, canales, nombres, ahora or ahora_iso())


def env_de_puente(puente, home=HOME):
    """(token, chat_id, archivo, avisos) del puente, buscando sus variables por NOMBRE en sus archivos."""
    d = L.PUENTES[puente]
    token = chat = archivo = None
    for nombre_archivo in d["env"]:
        datos = leer_env(nombre_archivo.replace("~", home, 1))
        if datos.get(d["token"]) and datos.get(d["chat"]):
            return datos[d["token"]], datos[d["chat"]], nombre_archivo, []
        token = token or datos.get(d["token"])
        chat = chat or datos.get(d["chat"])
    faltan = [v for v, x in ((d["token"], token), (d["chat"], chat)) if not x]
    return None, None, archivo, ["falta %s en %s" % (" y ".join(faltan) or "el par completo", " o ".join(d["env"]))]


# ── Telegram: solo lectura ────────────────────────────────────────────────────────────────────────

def _red_urllib(url, timeout=15):
    """GET a la API de Telegram. Los errores salen sin la URL (lleva el token)."""
    req = urllib.request.Request(url, headers={"User-Agent": "starseed-genesis-canon/1"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read().decode("utf-8", "replace") or "null")
    except urllib.error.HTTPError as e:
        try:
            return json.loads(e.read().decode("utf-8", "replace") or "null")
        except ValueError:
            return {"ok": False, "description": "HTTP %s" % e.code}
    except Exception as e:  # noqa: BLE001
        raise ConnectionError("sin red hacia Telegram (%s)" % type(e).__name__) from None


class TelegramSoloLectura:
    """Las DOS llamadas que `descubrir` puede hacer: getMe y getChat. Cualquier otro método (y getUpdates el
    primero: consume los mensajes que espera el gateway de Hermes) se rechaza antes de tocar la red.
    `red(url) -> dict` se inyecta en las pruebas."""

    def __init__(self, red=None):
        self.red = red or _red_urllib

    def _llamar(self, token, metodo, params=None):
        if metodo not in METODOS_PERMITIDOS:
            raise PermissionError("método de Telegram no permitido aquí: %s" % metodo)
        url = "%s/bot%s/%s" % (API_TELEGRAM, token, metodo)
        if params:
            url += "?" + urllib.parse.urlencode(params)
        r = self.red(url)
        if not isinstance(r, dict) or not r.get("ok"):
            raise ValueError("Telegram dijo que no a %s: %s" % (metodo, tachar((r or {}).get("description", "sin respuesta"))[:120]))
        return r.get("result") or {}

    def get_me(self, token):
        return self._llamar(token, "getMe")

    def get_chat(self, token, chat_id):
        return self._llamar(token, "getChat", {"chat_id": chat_id})


def descubrir_puente(puente, telegram, home=HOME):
    """{"usuario","nombre","tipoChat","archivo"} o {"error": motivo}. Nunca devuelve el id ni el token."""
    token, chat_id, archivo, avisos = env_de_puente(puente, home)
    if not token:
        return {"error": avisos[0] if avisos else "faltan sus variables"}
    try:
        me = telegram.get_me(token)
        chat = telegram.get_chat(token, chat_id)
        nombre, tipo = L.nombre_de_puente(me, chat)
    except ConnectionError as e:
        return {"error": tachar(e)}
    except (ValueError, PermissionError) as e:
        return {"error": tachar(e)}
    usuario = str(me.get("username") or "")
    if not usuario:
        return {"error": "getMe no dio el @usuario del bot"}
    return {"usuario": usuario, "nombre": nombre, "tipoChat": tipo, "archivo": archivo}


# ── el único escritor ─────────────────────────────────────────────────────────────────────────────

class Cerrojo:
    def __init__(self, base):
        self.ruta = os.path.join(base, "canon.lock")
        self.f = None

    def __enter__(self):
        self.f = open(self.ruta, "a")
        os.chmod(self.ruta, 0o600)
        fcntl.flock(self.f, fcntl.LOCK_EX)
        return self

    def __exit__(self, *a):
        fcntl.flock(self.f, fcntl.LOCK_UN)
        self.f.close()


def preparar_base(base):
    os.makedirs(base, exist_ok=True)
    try:
        os.chmod(base, 0o700)
    except OSError:
        pass


def rotar(ruta, copias=COPIAS):
    """canon.json → .1 → .2 … → .5 (la más vieja se pierde). Copias, no movimientos: el original sigue."""
    if not os.path.exists(ruta):
        return
    for i in range(copias - 1, 0, -1):
        if os.path.exists("%s.%d" % (ruta, i)):
            os.replace("%s.%d" % (ruta, i), "%s.%d" % (ruta, i + 1))
    shutil.copyfile(ruta, ruta + ".1")
    os.chmod(ruta + ".1", 0o600)


def escribir_canon(canon, base):
    """Escritura atómica en 600 con copia rotada. Solo la llaman las órdenes de este archivo."""
    preparar_base(base)
    ruta = ruta_canon(base)
    texto = json.dumps(canon, ensure_ascii=False, indent=1) + "\n"
    tmp = os.path.join(base, ".canon.json.%d.tmp" % os.getpid())
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(texto)
            f.flush()
            os.fsync(f.fileno())
        os.chmod(tmp, 0o600)
        rotar(ruta)
        os.replace(tmp, ruta)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)


def leer_canon(base):
    """(canon | None, avisos). Si hay algo que no se entiende, se aparta una copia del original."""
    ruta = ruta_canon(base)
    if not os.path.exists(ruta):
        return None, []
    crudo = leer_json(ruta, "ilegible")
    canon, avisos = L.migrar_canon(None if crudo == "ilegible" else crudo)
    if crudo == "ilegible":
        avisos = ["canon.json no es JSON válido"]
    if avisos:
        copia = "%s.descartado-%s" % (ruta, time.strftime("%Y%m%d-%H%M%S"))
        if not os.path.exists(copia):
            shutil.copyfile(ruta, copia)
            os.chmod(copia, 0o600)
        avisos.append("copia del original en %s" % os.path.basename(copia))
    return canon, avisos


def sal(base, crear=True):
    """32 bytes aleatorios en sal-medios (600); se crean una vez."""
    ruta = os.path.join(base, "sal-medios")
    try:
        with open(ruta, "rb") as f:
            datos = f.read()
        if len(datos) >= 32:
            return datos[:32]
    except OSError:
        pass
    if not crear:
        return None
    preparar_base(base)
    datos = secrets.token_bytes(32)
    fd = os.open(ruta, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "wb") as f:
        f.write(datos)
    return datos


def ids_nativos(canon, raiz=RAIZ, home=HOME):
    """{id_chat: {medio: id nativo}} para calcular las huellas. Se queda en memoria; nunca se imprime."""
    nativos = {}
    entornos = (leer_json(os.path.join(raiz, "scripts", "puente", "chats.json"), {}) or {}).get("entornos") or {}
    direccion = {}
    for medio in L.ENTORNOS_GENESIS + ("telegram",):
        e = entornos.get(medio)
        if isinstance(e, dict) and e.get("id") not in (None, ""):
            direccion[medio] = e["id"]
    if direccion:
        nativos["genesis"] = direccion
    for puente, d in L.PUENTES.items():
        chat = L.chat_de_fuente(canon, d["fuente"])
        _token, chat_id, _a, _av = env_de_puente(puente, home)
        if chat is not None and chat_id:
            nativos[chat["id"]] = {"telegram": chat_id}
    return nativos


# ── órdenes ───────────────────────────────────────────────────────────────────────────────────────

def orden_descubrir(aplicar=False, telegram=None, base=None, raiz=RAIZ, home=HOME, salida=print, ahora=None):
    """Lee el nombre real de los tres puentes. Sin `aplicar` no escribe NADA (ni la sal)."""
    base = base or base_dir()
    ahora = ahora or ahora_iso()
    telegram = telegram or TelegramSoloLectura()
    resultados = {}
    decir(salida, "Puentes de Telegram (solo getMe y getChat; nunca getUpdates):")
    for puente, d in L.PUENTES.items():
        r = descubrir_puente(puente, telegram, home)
        resultados[puente] = r
        if r.get("error"):
            decir(salida, "  %s · %s · %s · sin descubrir: %s → queda «%s» (nombre provisional)"
                  % (d["letra"], d["chat"], d["fuente"], r["error"], d["etiqueta"]))
            continue
        try:
            propuesto = L.id_telegram(r["usuario"])
        except ValueError as e:
            r.clear()
            r["error"] = str(e)
            decir(salida, "  %s · %s · sin descubrir: %s" % (d["letra"], d["chat"], e))
            continue
        decir(salida, "  %s · variable %s (%s) · %s · nombre «%s» · @%s · id propuesto %s"
              % (d["letra"], d["chat"], r["archivo"], TIPO_CHAT_LEGIBLE.get(r["tipoChat"], r["tipoChat"]),
                 r["nombre"], r["usuario"], propuesto))
    if not aplicar:
        decir(salida, "Sin --aplicar no se escribe nada.")
        return 0, resultados
    preparar_base(base)
    with Cerrojo(base):
        canon, avisos = leer_canon(base)
        for a in avisos:
            decir(salida, "  aviso: %s" % a)
        semilla = semilla_desde_disco(raiz, ahora)
        if canon is None or not canon["chats"]:
            canon, cambios = semilla, ["sembrado con %d chats" % len(semilla["chats"])]
        else:
            canon, cambios = L.completar(canon, semilla, ahora)
        for puente, r in resultados.items():
            try:
                if r.get("error"):
                    canon = L.marcar_no_se_puede(canon, puente, ahora)
                else:
                    canon = L.fusionar_descubierto(canon, puente, r, ahora)
            except ValueError as e:
                decir(salida, "  no aplico %s: %s" % (L.PUENTES[puente]["letra"], e))
        escribir_canon(canon, base)
    for c in cambios:
        decir(salida, "  %s" % c)
    decir(salida, "Escrito canon.json (600) con %d chats, versión %s." % (len(canon["chats"]), canon["version"]))
    return 0, resultados


def orden_estado(base=None, salida=print):
    base = base or base_dir()
    canon, avisos = leer_canon_sin_copias(base)
    if canon is None:
        decir(salida, "No hay registro todavía. Siémbralo con: genesis_canon.py descubrir --aplicar")
        return 1
    ruta = ruta_canon(base)
    modo = oct(os.stat(ruta).st_mode & 0o777)[2:]
    decir(salida, "Registro canónico · %d chats · versión %s · permisos %s" % (len(canon["chats"]), canon["version"], modo))
    for c in canon["chats"]:
        marca = " (nombre provisional)" if c.get("nombreProvisional") else ""
        distinto = [m for m in c.get("medios", []) if m.get("estadoNombre") == "distinto"]
        extra = "".join(" · en %s se llama «%s»" % (m["medio"], m.get("nombreEnMedio")) for m in distinto)
        decir(salida, "  %-38s %s%s%s" % (c["id"], c["nombre"], marca, extra))
    for a in avisos:
        decir(salida, "  aviso: %s" % a)
    subido = leer_json(os.path.join(base, "canon-subido.json"), {}) or {}
    if subido:
        decir(salida, "Última subida: %s · %s" % (subido.get("t", "?"), subido.get("resultado", "?")))
    return 0


def leer_canon_sin_copias(base):
    """Para `estado` y `subir`: leer sin escribir nada (ni la copia de descartados)."""
    ruta = ruta_canon(base)
    if not os.path.exists(ruta):
        return None, []
    return L.migrar_canon(leer_json(ruta, None))


def leer_config(home=HOME, entorno=None):
    """(url, ficha) de ~/.starseed/env y del entorno. Solo https (o local, para pruebas)."""
    entorno = os.environ if entorno is None else entorno
    datos = leer_env(os.path.join(home, ".starseed", "env"))
    for k in (VAR_URL, VAR_FICHA):
        if entorno.get(k):
            datos[k] = entorno[k]
    url = (datos.get(VAR_URL) or "").rstrip("/")
    if url and not (url.startswith("https://") or url.startswith("http://127.0.0.1") or url.startswith("http://localhost")):
        url = ""
    return url, datos.get(VAR_FICHA) or ""


def construir_catalogo(base=None, raiz=RAIZ, home=HOME, ahora=None, crear_sal=True):
    """(catalogo | None, avisos). Lo que de verdad sale de la Mac."""
    base = base or base_dir()
    canon, avisos = leer_canon_sin_copias(base)
    if canon is None:
        return None, ["no hay registro: genesis_canon.py descubrir --aplicar"]
    s = sal(base, crear=crear_sal)
    if s is None:
        return None, ["falta la sal de huellas"]
    cat = L.catalogo_publico(canon, s, ids_nativos(canon, raiz, home), ahora or ahora_iso(), avisos)
    return cat, avisos


def orden_subir(base=None, raiz=RAIZ, home=HOME, http=None, salida=print, entorno=None):
    base = base or base_dir()
    if not os.path.exists(ruta_canon(base)):
        decir(salida, "No hay registro todavía: no subo nada (se siembra con descubrir --aplicar).")
        return 0
    cat, avisos = construir_catalogo(base, raiz, home)
    for a in avisos:
        decir(salida, "  aviso: %s" % a)
    if cat is None:
        return 1
    url, ficha = leer_config(home, entorno)
    if not (url and ficha):
        decir(salida, "Faltan %s o %s en ~/.starseed/env: el catálogo está listo pero no se sube." % (VAR_URL, VAR_FICHA))
        return 0
    if http is None:
        import puerta_datos_cliente as P
        http = P._http
    cab = {"Accept": "application/json", "Content-Type": "application/json", "Authorization": "Bearer " + ficha}
    try:
        estado, j = http("POST", url + RUTA_CANON_PUERTA, cab, {"catalogo": cat}, timeout=15)
    except Exception as e:  # noqa: BLE001
        estado, j = 0, {"error": type(e).__name__}
    ok = isinstance(estado, int) and 200 <= estado < 300
    resultado = "ok · versión %s" % (j or {}).get("version", cat["version"]) if ok else \
        "falló (%s %s)" % (estado, tachar((j or {}).get("error", "")) if isinstance(j, dict) else "")
    preparar_base(base)
    registro = os.path.join(base, "canon-subido.json")
    tmp = registro + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump({"t": ahora_iso(), "version": cat["version"], "resultado": resultado}, f, ensure_ascii=False)
    os.chmod(tmp, 0o600)
    os.replace(tmp, registro)
    decir(salida, "Catálogo (%d chats, versión %s): %s" % (len(cat["chats"]), cat["version"], resultado))
    return 0 if ok else 1


def orden_aplicar_nombres(base=None, salida=print):
    """Fase 1: solo enseña qué nombres de Telegram no son el canónico. No llama a Telegram ni cambia nada."""
    canon, _ = leer_canon_sin_copias(base or base_dir())
    if canon is None:
        decir(salida, "No hay registro todavía.")
        return 1
    hay = False
    for c in canon["chats"]:
        for m in c.get("medios", []):
            if m.get("medio") == "telegram" and m.get("estadoNombre") == "distinto":
                hay = True
                decir(salida, "  %s: en Telegram «%s»; canónico «%s» → (fase 2) se pondría «%s» con confirmación"
                      % (c["id"], m.get("nombreEnMedio"), c["nombre"], c["nombre"]))
    if not hay:
        decir(salida, "Ningún nombre de Telegram es distinto del canónico.")
    decir(salida, "Fase 1: no se cambia nada en Telegram (setMyName/setChatTitle llegan en la fase 2).")
    return 0


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    orden = argv[0] if argv else "estado"
    if orden == "descubrir":
        return orden_descubrir(aplicar="--aplicar" in argv)[0]
    if orden == "estado":
        return orden_estado()
    if orden == "subir":
        return orden_subir()
    if orden == "aplicar-nombres":
        if "--telegram" not in argv:
            print("uso: genesis_canon.py aplicar-nombres --telegram")
            return 2
        return orden_aplicar_nombres()
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main())
