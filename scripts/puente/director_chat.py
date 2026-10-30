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
from typing import Any

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
    publicar_puerta(mensaje)
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


# ── Chat del director entre neuronas (IND1029H) ────────────────────────────────
# La puerta de datos del A1 como estado común: `publicar` deja ahí el mensaje (latido
# `servicio`, id `chat.<id de mensaje>`) y `leer` mezcla una vez los nuevos, sin duplicar por id.

CLASE_CHAT_PUERTA = "servicio"
PREFIJO_ID_CHAT = "chat."
TOPE_TEXTO_PUERTA = 6000
CHAT_PUERTA_VIVOS_S = 24 * 3600
CHAT_PUERTA_CADA_S = 60
CHAT_PUERTA_MAX = 100

_PUERTA_FABRICA = None  # pruebas: callable () → cliente de la puerta (o None)
_puerta_instancia: Any = None  # cliente de la puerta rodeado de None, o False si no hay
_puerta_chat_ultimo = 0.0
_puerta_chat_lista = []
_puerta_vistos = set()


def _puerta():
    """Cliente de la puerta de datos (None si no está configurada o falla al construir)."""
    global _puerta_instancia
    if _puerta_instancia is None:
        try:
            if _PUERTA_FABRICA is not None:
                _puerta_instancia = _PUERTA_FABRICA() or False
            else:
                from puerta_datos_cliente import Puerta  # noqa: PLC0415 — mismo directorio

                cliente = Puerta.desde_entorno(rol="enjambre")
                _puerta_instancia = cliente if cliente.configurada() else False
        except Exception:  # noqa: BLE001
            _puerta_instancia = False
    return _puerta_instancia or None


def id_puerta_del_mensaje(id_mensaje):
    """PURA. Id del latido en la puerta para un mensaje: `chat.<id del mensaje>`."""
    return PREFIJO_ID_CHAT + str(id_mensaje)


def a_puerta(mensaje, tope_texto=TOPE_TEXTO_PUERTA):
    """PURA. Lo que viaja del mensaje a la puerta, con el texto capado (latidos ≤ 8 KB)."""
    fuera = dict(mensaje) if isinstance(mensaje, dict) else {}
    fuera["texto"] = str(fuera.get("texto") or "")[: max(0, int(tope_texto))]
    return fuera


def de_puerta(latido, prefijo=PREFIJO_ID_CHAT):
    """PURA. Mensaje reconstruido de un latido `chat.*` (None si no es un mensaje de chat)."""
    idl = latido.get("id") if isinstance(latido, dict) else None
    datos = latido.get("datos") if isinstance(latido, dict) else None
    if not (isinstance(idl, str) and idl.startswith(prefijo) and isinstance(datos, dict)):
        return None
    mensaje = dict(datos)
    mensaje.setdefault("id", idl[len(prefijo):])
    mensaje["via_puerta"] = True
    return mensaje


def mensajes_de_puerta(latidos, maximo=CHAT_PUERTA_MAX):
    """PURA. Mensajes de chat sacados de latidos de la puerta, lo más nuevo primero, sin duplicar."""
    fuera = {}
    for l in latidos or []:
        m = de_puerta(l)
        if m and m.get("id") and m["id"] not in fuera:
            fuera[m["id"]] = m
    return sorted(fuera.values(), key=_epoch_de, reverse=True)[: max(0, int(maximo))]


def _nuevos_de_puerta(registros, latidos):
    """PURA. Mensajes de la puerta que esta neurona aún no tiene ni sacó antes (por id de mensaje)."""
    ids = {r.get("id") for r in registros if isinstance(r, dict) and r.get("id")}
    ids |= _puerta_vistos
    return [m for m in mensajes_de_puerta(latidos) if m.get("id") and m["id"] not in ids]


def publicar_puerta(mensaje):
    """Deja el mensaje en la puerta (latido `chat.<id>`). True si entró. Nunca lanza ni encola."""
    try:
        if en_pruebas() and _PUERTA_FABRICA is None:
            return False
        valido = isinstance(mensaje, dict) and bool(mensaje.get("id"))
        cliente = _puerta() if valido else None
        r = (cliente.latido(CLASE_CHAT_PUERTA, id_puerta_del_mensaje(mensaje["id"]),
                            a_puerta(mensaje), respaldo=lambda _c: None) if cliente else None)
        return bool(isinstance(r, dict) and r.get("via") == "puerta" and not r.get("error"))
    except Exception:  # noqa: BLE001
        return False


def _traer_chat_puerta():
    """Latidos `chat.*` que hay en la puerta (una petición cada CHAT_PUERTA_CADA_S). Sin lanzar."""
    global _puerta_chat_ultimo, _puerta_chat_lista
    ahora = time.time()
    if _puerta_chat_ultimo and ahora - _puerta_chat_ultimo < CHAT_PUERTA_CADA_S:
        return _puerta_chat_lista
    _puerta_chat_ultimo = ahora
    try:
        cliente = _puerta()
        estado, j = cliente._pedir("GET", "/v1/latidos?clase=%s&vivos_s=%d"
                                   % (CLASE_CHAT_PUERTA, CHAT_PUERTA_VIVOS_S)) if cliente else (None, None)
        latidos = (j or {}).get("latidos")
        if estado == 200 and isinstance(latidos, list):
            _puerta_chat_lista = latidos
    except Exception:  # noqa: BLE001
        pass
    return _puerta_chat_lista


def _anadir_puerta(registros):
    """Añade a `leer` los mensajes nuevos de la puerta, sin duplicar por id, y los anota."""
    ids = {r.get("id") for r in registros if isinstance(r, dict) and r.get("id")} | _puerta_vistos
    nuevos = [m for m in mensajes_de_puerta(_traer_chat_puerta())
              if m.get("id") and m["id"] not in ids]
    _puerta_vistos.update(m["id"] for m in nuevos)
    return registros + nuevos


def leer(desde=None, limite=200, raiz=None):
    """Última cola del chat posterior a `desde`, más los mensajes nuevos de la puerta (IND1029H)."""
    registros = _anadir_puerta(_leer_lineas(_chat(raiz), solo_cola=True))
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
