#!/usr/bin/env python3
"""Chat Director de Genesis: biblioteca y línea de órdenes (solo estándar)."""

import argparse
import fcntl
import json
import os
import re
import sys
import tempfile
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

CANALES = (
    "mando",
    "claude-cowork",
    "claude-mac",
    "hermes",
    "telegram",
    "chatgpt",
    "antigravity",
    "ide",
    "terminal",
)
CANALES_BANDEJA = ("claude-cowork", "antigravity", "ide", "terminal")
ESTADOS_ENTREGA = ("pendiente", "entregado", "respondido", "fallo")
MAX_TEXTO = 20000
LECTURA_BYTES = 256 * 1024

_PATRONES = [
    re.compile(r"sk-[A-Za-z0-9_\-]{8,}"),
    re.compile(r"gh[pousr]_[A-Za-z0-9]{8,}"),
    re.compile(r"AIza[0-9A-Za-z_\-]{10,}"),
    re.compile(r"hf_[A-Za-z0-9]{8,}"),
    re.compile(r"gsk_[A-Za-z0-9_\-]{8,}"),
    re.compile(r"eyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+"),
    re.compile(r"Bearer\s+[A-Za-z0-9_\-\.]{8,}", re.IGNORECASE),
    re.compile(r"https://[A-Za-z0-9\-\.]+\.trycloudflare\.com\S*"),
]


def _raiz(raiz=None):
    if raiz is not None:
        return Path(raiz)
    return Path(
        os.environ.get(
            "STARSEED_ROOT", str(Path.home() / "Documents" / "starseed-os-main")
        )
    )


def _directorio(raiz=None):
    return _raiz(raiz) / "starseed_memory_root" / "mando" / "director"


#: (2026-10-08) El Chat Director de Alex recibió «Flujo falló: f1 · Ejecución: e1 · Error: error»
#: (`flujos/test_servicio.py` llamaba a la `publicar` de verdad) y, medido en la carpeta real,
#: «Reparación automática · RM6» y «Eslabón roto reparado · CAMR1005Db → CAMR1005Dc» (las pruebas
#: de `desatascar.py` no parchean `publicar`): una prueba sin `raiz=` escribe en la carpeta REAL
#: (`~/Documents/starseed-os-main/…/director/`) porque `_raiz()` cae al valor por defecto. Aquí se
#: fijan, AL IMPORTAR, las carpetas reales: una prueba que redirige con `raiz=` o con
#: `STARSEED_ROOT` (después de importar) a una carpeta temporal sigue escribiendo; la que no
#: redirige no llega al chat de Alex. El canal común (`puente.decir`) tiene la misma guarda.
_DIRECTORIOS_REALES = tuple(
    {
        str(_directorio()),
        str(Path.home() / "Documents" / "starseed-os-main" / "starseed_memory_root" / "mando" / "director"),
    }
)


def en_pruebas():
    """True si este proceso es una prueba (pytest o un runner de unittest en marcha).

    `STARSEED_CHAT_EN_PRUEBAS=1` lo desactiva (una prueba que de verdad quiere escribir en el
    chat real). OJO: no basta `"unittest" in sys.modules`: `medidor_http_json.py` hace
    `import unittest.mock` al importarse (producción, `medidores_credito.py`) y cualquier
    servicio que lo trajera dejaría de publicar en silencio. Un runner de unittest registra su
    resultado en `unittest.signals._results` mientras ejecuta; eso sí distingue una prueba.
    """
    if os.environ.get("STARSEED_CHAT_EN_PRUEBAS") == "1":
        return False
    if "pytest" in sys.modules:
        return True
    if "unittest" in sys.modules:
        senales = sys.modules.get("unittest.signals")
        if senales is not None and len(getattr(senales, "_results", ())) > 0:
            return True
        # Sin resultado registrado aún (carga de módulos de prueba) o prueba lanzada a mano.
        arg0 = sys.argv[0] if sys.argv else ""
        return "unittest" in arg0 or os.path.basename(arg0).startswith("test_")
    return False


def _es_chat_real(ruta):
    """True si `ruta` cae dentro de la carpeta REAL del Chat Director (y no es temporal)."""
    destino = os.path.abspath(str(ruta))
    temporal = os.path.abspath(tempfile.gettempdir())
    if destino == temporal or destino.startswith(temporal + os.sep):
        return False
    return any(
        destino == real or destino.startswith(real + os.sep)
        for real in map(os.path.abspath, _DIRECTORIOS_REALES)
    )


def _chat(raiz=None):
    return _directorio(raiz) / "chat.jsonl"


def _bandejas(raiz=None):
    return _directorio(raiz) / "bandeja"


def tachar(texto):
    """Sustituye por «[oculto]» todo lo que parezca una clave."""
    for patron in _PATRONES:
        texto = patron.sub("[oculto]", texto)
    return texto


def _ahora_iso():
    return datetime.now(timezone.utc).astimezone().isoformat()


def _nuevo_id():
    return "md-%d-%s" % (int(time.time() * 1000), uuid.uuid4().hex[:4])


def _anadir(ruta, registros):
    # (2026-10-08) Único punto por el que `publicar`, `entrega` y las bandejas escriben: una
    # prueba nunca añade nada al chat real de Alex (ver `_DIRECTORIOS_REALES`).
    if en_pruebas() and _es_chat_real(ruta):
        return
    ruta.parent.mkdir(parents=True, exist_ok=True)
    with open(ruta, "a", encoding="utf-8") as f:
        fcntl.flock(f, fcntl.LOCK_EX)
        try:
            for r in registros:
                f.write(json.dumps(r, ensure_ascii=False) + "\n")
        finally:
            fcntl.flock(f, fcntl.LOCK_UN)


def publicar(
    texto,
    de,
    rol="director",
    tipo="informe",
    canal="mando",
    canales=None,
    modelo=None,
    responde_a=None,
    tarea=None,
    uso=None,
    raiz=None,
):
    """Publica un mensaje y deja copia en las bandejas que corresponda."""
    if rol not in ("alex", "director", "agente", "sistema"):
        raise ValueError("rol no válido: %s" % rol)
    if canal not in CANALES:
        raise ValueError("canal no válido: %s" % canal)
    mensaje = {
        "id": _nuevo_id(),
        "t": _ahora_iso(),
        "de": de,
        "rol": rol,
        "tipo": tipo,
        "texto": tachar(texto or "")[:MAX_TEXTO],
        "canal": canal,
    }
    if canales:
        mensaje["canales"] = list(canales)
    if modelo:
        mensaje["modelo"] = modelo
    if responde_a:
        mensaje["respondeA"] = responde_a
    if tarea:
        mensaje["tarea"] = tarea
    if uso:
        mensaje["uso"] = {
            k: v
            for k, v in uso.items()
            if k in ("tokensEntrada", "tokensSalida", "segundos", "coste")
        }
    entregas = []
    for destino in canales or []:
        if destino not in CANALES_BANDEJA:
            continue
        _anadir(_bandejas(raiz) / ("%s.jsonl" % destino), [mensaje])
        entregas.append(
            {
                "tipo": "entrega",
                "de_id": mensaje["id"],
                "canal": destino,
                "estado": "pendiente",
                "t": _ahora_iso(),
            }
        )
    _anadir(_chat(raiz), [mensaje] + entregas)
    if toca_la_puerta(raiz):
        # (IND1029H) Copia del feed al chat compartido; el archivo local manda y nunca lanza.
        publicar_en_puerta(mensaje)
    return mensaje


def entrega(de_id, canal, estado, detalle=None, raiz=None):
    """Registra una entrega; manda el ÚLTIMO de cada (de_id, canal)."""
    if canal not in CANALES:
        raise ValueError("canal no válido: %s" % canal)
    if estado not in ESTADOS_ENTREGA:
        raise ValueError("estado no válido: %s" % estado)
    registro = {
        "tipo": "entrega",
        "de_id": de_id,
        "canal": canal,
        "estado": estado,
        "t": _ahora_iso(),
    }
    if detalle:
        registro["detalle"] = tachar(detalle)
    _anadir(_chat(raiz), [registro])
    return registro


def _epoch_de(registro):
    marca = registro.get("t", "")
    try:
        return datetime.fromisoformat(marca).timestamp() * 1000
    except (ValueError, TypeError):
        pass
    idm = registro.get("id") or registro.get("de_id") or ""
    try:
        return float(idm.split("-")[1])
    except (IndexError, ValueError):
        return 0.0


def _epoch_desde(desde):
    """Acepta epoch en ms, segundos o fecha ISO."""
    if desde is None:
        return None
    if isinstance(desde, (int, float)):
        return float(desde) if desde > 1e11 else float(desde) * 1000
    texto = str(desde).strip()
    try:
        valor = float(texto)
        return valor if valor > 1e11 else valor * 1000
    except ValueError:
        return datetime.fromisoformat(texto).timestamp() * 1000


def _leer_lineas(ruta, solo_cola=False):
    if not ruta.exists():
        return []
    if solo_cola and ruta.stat().st_size > LECTURA_BYTES:
        with open(ruta, "rb") as f:
            f.seek(-LECTURA_BYTES, os.SEEK_END)
            datos = f.read().decode("utf-8", "replace")
        lineas = datos.split("\n")[1:]
    else:
        lineas = ruta.read_text(encoding="utf-8").splitlines()
    registros = []
    for linea in lineas:
        linea = linea.strip()
        if not linea:
            continue
        try:
            registros.append(json.loads(linea))
        except json.JSONDecodeError:
            continue
    return registros


def leer(desde=None, limite=200, raiz=None):
    """Lee los últimos 256 KB del chat y devuelve lo posterior a `desde`."""
    registros = _leer_lineas(_chat(raiz), solo_cola=True)
    corte = _epoch_desde(desde)
    if corte is not None:
        registros = [r for r in registros if _epoch_de(r) > corte]
    registros.sort(key=_epoch_de)
    return registros[-limite:]


def _ultimas_entregas(raiz=None):
    ultimas = {}
    for r in _leer_lineas(_chat(raiz)):
        if r.get("tipo") == "entrega":
            ultimas[(r.get("de_id"), r.get("canal"))] = r.get("estado")
    return ultimas


def bandeja(canal, solo_pendientes=True, raiz=None):
    """Mensajes copiados a la bandeja de un canal, pendientes por defecto."""
    mensajes = _leer_lineas(_bandejas(raiz) / ("%s.jsonl" % canal))
    if not solo_pendientes:
        return mensajes
    ultimas = _ultimas_entregas(raiz)
    return [m for m in mensajes if ultimas.get((m.get("id"), canal)) != "respondido"]


# ── Chat compartido por la puerta de datos (IND1029H) ──────────────────────────
# El feed vive en el archivo local, que sigue siendo la verdad. En producción, cada
# `publicar` deja (sin lanzar) una copia del mensaje en la puerta de datos del A1
# como latido de clase `metagenesis` con id `chat.<id del mensaje>`: la puerta guarda
# un latido por id, así que lo repetido no se duplica. El cartero del líder de
# dirección recoge con `recoger_puerta` los mensajes de OTRAS neuronas que aquí aún
# no están y los `incorpora` a este chat CON SU MISMO id (por eso no vuelven ni se
# vuelven a publicar a la puerta). Sin puerta no cambia nada.

CLASE_PUERTA = "metagenesis"
CHAT_TTL_S = 7200
_PREFIJO_CHAT_PUERTA = "chat."
_campos_puerta = ("id", "t", "de", "rol", "tipo", "texto", "canal", "canales", "modelo", "respondeA", "tarea")

_la_puerta_instancia = None


def toca_la_puerta(raiz=None, pruebas=None):
    """PURA. ¿Un mensaje recién publicado debe dejar copia en la puerta? Solo en producción."""
    pruebas = en_pruebas() if pruebas is None else pruebas
    return raiz is None and not pruebas


def paquete_puerta(mensaje):
    """PURA. Copia de un mensaje del chat, lista para la puerta (sin entregas ni uso)."""
    return {c: mensaje[c] for c in _campos_puerta if c in mensaje}


def _la_puerta():
    """La `Puerta` del entorno; una instancia por proceso guarda su tasa de fallos."""
    global _la_puerta_instancia
    if _la_puerta_instancia is None:
        from puerta_datos_cliente import Puerta  # noqa: PLC0415 — mismo directorio
        _la_puerta_instancia = Puerta.desde_entorno(rol="enjambre")
    return _la_puerta_instancia


def publicar_en_puerta(mensaje, puerta=None):
    """Deja una copia del mensaje en la puerta si responde: «puerta»|«sin-puerta»|«fallo». Nunca lanza."""
    try:
        p = puerta if puerta is not None else _la_puerta()
        if not (p.configurada() and p.disponible()):
            return "sin-puerta"
        r = p.latido(
            CLASE_PUERTA,
            _PREFIJO_CHAT_PUERTA + str(mensaje["id"]),
            paquete_puerta(mensaje),
            respaldo=lambda _c: None,
        )
        ok = isinstance(r, dict) and r.get("via") == "puerta" and not r.get("error")
        return "puerta" if ok else "fallo"
    except Exception:  # noqa: BLE001
        return "fallo"


def mensajes_puerta(latidos):
    """PURA. Mensajes de chat desde los latidos de la puerta: únicos por id, del más viejo al más nuevo."""
    unicos = {}
    for l in latidos or []:
        if not (isinstance(l, dict) and str(l.get("id") or "").startswith(_PREFIJO_CHAT_PUERTA)):
            continue
        m = l.get("datos")
        if not (isinstance(m, dict) and m.get("id") and "texto" in m):
            continue
        m = dict(m)
        m["id"] = str(m["id"])
        previo = unicos.get(m["id"])
        if previo is None or _epoch_de(m) >= _epoch_de(previo):
            unicos[m["id"]] = m
    return sorted(unicos.values(), key=_epoch_de)


def mensajes_pendientes(mensajes, ids_locales):
    """PURA. Los cuyo id aún no está en el chat local (sin duplicar lo ya integrado)."""
    ids = set(ids_locales or ())
    return [m for m in mensajes if m.get("id") not in ids]


def _ids_locales(raiz=None, tope=1000):
    ids = [r["id"] for r in _leer_lineas(_chat(raiz)) if isinstance(r, dict) and r.get("id")]
    return set(ids[-tope:])


def recoger_puerta(puerta=None, raiz=None, pedir=None):
    """Para el cartero del líder: mensajes de otras neuronas pendientes aquí, o [].

    `pedir()` sustituye la lectura de la puerta (pruebas). Nunca lanza.
    """
    try:
        if pedir is not None:
            latidos = pedir()
        else:
            p = puerta if puerta is not None else _la_puerta()
            if not (p.configurada() and p.disponible()):
                return []
            estado, j = p._pedir(
                "GET", "/v1/latidos?clase=%s&vivos_s=%d" % (CLASE_PUERTA, CHAT_TTL_S)
            )
            if estado != 200:
                return []
            latidos = (j or {}).get("latidos")
        return mensajes_pendientes(mensajes_puerta(latidos), _ids_locales(raiz))
    except Exception:  # noqa: BLE001
        return []


def incorporar(mensajes, raiz=None):
    """Añade mensajes llegados por la puerta al chat local CON su id (para no re-recogerlos)."""
    if not mensajes:
        return []
    _anadir(_chat(raiz), [dict(m) for m in mensajes])
    return list(mensajes)


def _formatear(registro):
    try:
        hora = datetime.fromisoformat(registro.get("t", "")).strftime("%H:%M")
    except ValueError:
        hora = "??:??"
    modelo = " (%s)" % registro["modelo"] if registro.get("modelo") else ""
    if registro.get("tipo") == "entrega":
        return "%s entrega %s → %s: %s" % (
            hora,
            registro.get("de_id"),
            registro.get("canal"),
            registro.get("estado"),
        )
    texto = (registro.get("texto") or "").replace("\n", " ")
    return "%s %s [%s]%s: %s" % (
        hora,
        registro.get("de"),
        registro.get("rol"),
        modelo,
        texto,
    )


def _principal(argv=None):
    p = argparse.ArgumentParser(
        prog="director_chat", description="Chat Director de Genesis"
    )
    sub = p.add_subparsers(dest="orden", required=True)
    s = sub.add_parser("leer", help="leer el chat")
    s.add_argument("-n", type=int, default=20, metavar="N")
    s.add_argument("--desde", default=None)
    s = sub.add_parser("decir", help="Alex dice algo")
    s.add_argument("texto")
    s.add_argument("--de", default="alex")
    s.add_argument("--a", default=None)
    s.add_argument("--modelo", default=None)
    s = sub.add_parser("publicar", help="publicar un informe")
    s.add_argument("texto", nargs="?", default=None)
    s.add_argument("--de", default="claude-cowork")
    s.add_argument("--tipo", default="informe")
    s.add_argument("--modelo", default=None)
    s.add_argument("--archivo", default=None)
    s.add_argument("--a", default=None)
    s = sub.add_parser("bandeja", help="ver la bandeja de un canal")
    s.add_argument("canal", choices=CANALES_BANDEJA)
    s.add_argument("--todas", action="store_true")
    s = sub.add_parser("entrega", help="marcar el estado de una entrega")
    s.add_argument("id")
    s.add_argument("canal")
    s.add_argument("estado", choices=ESTADOS_ENTREGA)
    args = p.parse_args(argv)
    if args.orden == "leer":
        for r in leer(desde=args.desde, limite=args.n):
            print(_formatear(r))
    elif args.orden == "decir":
        destinos = args.a.split(",") if args.a else None
        m = publicar(
            args.texto,
            de=args.de,
            rol="alex",
            tipo="mensaje",
            canal="terminal",
            canales=destinos,
            modelo=args.modelo,
        )
        print("Publicado como %s" % m["id"])
    elif args.orden == "publicar":
        if args.archivo:
            texto = Path(args.archivo).read_text(encoding="utf-8")
        elif args.texto is not None:
            texto = args.texto
        else:
            p.error("publicar necesita un texto o --archivo")
        destinos = args.a.split(",") if args.a else None
        m = publicar(
            texto,
            de=args.de,
            rol="director",
            tipo=args.tipo,
            modelo=args.modelo,
            canales=destinos,
        )
        print("Publicado como %s" % m["id"])
    elif args.orden == "bandeja":
        for m in bandeja(args.canal, solo_pendientes=not args.todas):
            print(_formatear(m))
    elif args.orden == "entrega":
        r = entrega(args.id, args.canal, args.estado)
        print("Entrega %s marcada como %s" % (r["de_id"], r["estado"]))


if __name__ == "__main__":
    _principal()
