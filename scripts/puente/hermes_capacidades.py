#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Hermes capacidades (HERL1118B): mide pantalla, control, registros y lanzador sin pedir permisos.

Uso:
  python3 scripts/puente/hermes_capacidades.py comprobar [--sin-publicar]

Escribe ~/.starseed/hermes-capacidades.json y publica una línea en el Chat Director.
La interpretación es pura y se prueba en test_hermes_capacidades.py.
"""
import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import zlib
from datetime import datetime, timezone
from pathlib import Path

AQUI = os.path.dirname(os.path.abspath(__file__))
AJUSTES_PANTALLA = "Ajustes del Sistema › Privacidad y seguridad › Grabación de pantalla y audio del sistema"
AJUSTES_ACCESIBILIDAD = "Ajustes del Sistema › Privacidad y seguridad › Accesibilidad"
AJUSTES_AUTOMATIZACION = "Ajustes del Sistema › Privacidad y seguridad › Automatización"
RUTA_LOG_MAC = os.path.expanduser("~/Library/Logs/app.starseed.os/enlaces.log")
RUTA_SALIDA = os.environ.get("STARSEED_HERMES_CAPACIDADES") or os.path.expanduser(
    "~/.starseed/hermes-capacidades.json"
)
HOST_MAGGABOX = "maggasukha@starseed-nodo-1.local"
LLAVE_NODO = os.path.expanduser("~/.ssh/starseed_nodo1")
KNOWN_HOSTS_NODO = os.path.expanduser("~/.ssh/known_hosts_starseed_nodo")
SILENCIO_MAX_S = 12 * 3600
_ISO = re.compile(r"^(\d{4}-\d\d-\d\dT[\d:.]+Z)")


def interpretar_captura(salida, codigo, existe, tamano, negro=None):
    """PURA. Traduce el resultado de `screencapture` a un estado con su ajuste exacto."""
    texto = (salida or "").lower()
    falta = (
        "could not create image" in texto
        or "screen recording" in texto
        or "grabación de pantalla" in texto
        or "not permitted" in texto
        or "no permission" in texto
    )
    if falta:
        return {
            "estado": "falta-permiso",
            "detalle": "screencapture no puede leer la pantalla: falta el permiso de grabación",
            "ajustes": AJUSTES_PANTALLA,
            "bytes": tamano or 0,
        }
    if not existe or not tamano:
        return {
            "estado": "fallo",
            "detalle": "screencapture terminó (%s) pero no dejó un archivo legible" % codigo,
            "ajustes": None,
            "bytes": tamano or 0,
        }
    if negro is True:
        return {
            "estado": "fallo",
            "detalle": "la captura salió en negro: la pantalla no se está leyendo",
            "ajustes": AJUSTES_PANTALLA,
            "bytes": tamano,
        }
    return {
        "estado": "ok",
        "detalle": "captura creada (%d bytes)" % tamano,
        "ajustes": None,
        "bytes": tamano,
    }


def interpretar_control(salida, codigo, error):
    """PURA. Traduce el resultado de `osascript` a un estado con su ajuste exacto."""
    texto = "%s %s" % (salida or "", error or "")
    bajo = texto.lower()
    automatizacion = (
        "not authorized to send apple events" in bajo
        or "(-1743)" in bajo
        or "automatización" in bajo
    )
    if automatizacion:
        return {
            "estado": "falta-permiso",
            "detalle": "System Events no acepta órdenes: falta Automatización",
            "ajustes": AJUSTES_AUTOMATIZACION,
        }
    falta = (
        "assistive access" in bajo
        or "not allowed" in bajo
        or "not authorized" in bajo
        or "accesibilidad" in bajo
        or "(-1719)" in bajo
        or "(-25211)" in bajo
    )
    if falta:
        return {
            "estado": "falta-permiso",
            "detalle": "System Events no deja leer procesos: falta Accesibilidad",
            "ajustes": AJUSTES_ACCESIBILIDAD,
        }
    nombre = (salida or "").strip()
    if codigo == 0 and nombre:
        return {
            "estado": "ok",
            "detalle": "System Events responde; primer proceso: %s" % nombre[:80],
            "ajustes": None,
        }
    return {
        "estado": "fallo",
        "detalle": "osascript terminó (%s) sin nombre de proceso: %s"
        % (codigo, (error or "sin salida").strip()[:120]),
        "ajustes": None,
    }


def _iso(epoch):
    if epoch is None:
        return None
    return datetime.fromtimestamp(epoch, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def interpretar_registro(nombre, existe, tamano, ultima, ahora=None, max_silencio_s=SILENCIO_MAX_S):
    """PURA. Estado del registro local: ok, sin-registro o parado."""
    ahora = time.time() if ahora is None else ahora
    if not existe or not tamano:
        return {
            "nombre": nombre,
            "estado": "sin-registro",
            "bytes": tamano or 0,
            "ultima": _iso(ultima),
            "silencio_s": None,
            "detalle": "no hay enlaces.log legible en %s" % nombre,
        }
    silencio = int(max(0, ahora - ultima)) if ultima is not None else None
    parado = silencio is not None and silencio > max_silencio_s
    return {
        "nombre": nombre,
        "estado": "parado" if parado else "ok",
        "bytes": tamano,
        "ultima": _iso(ultima),
        "silencio_s": silencio,
        "detalle": (
            "sin líneas nuevas desde %s" % _iso(ultima)
            if parado
            else "registro con %d bytes; última línea %s" % (tamano, _iso(ultima) or "sin fecha")
        ),
    }


def interpretar_ssh(codigo, salida, error, ahora=None, nombre="Maggabox"):
    """PURA. Estado del registro remoto leído por SSH."""
    if codigo != 0:
        return {
            "nombre": nombre,
            "estado": "sin-acceso",
            "bytes": 0,
            "ultima": None,
            "silencio_s": None,
            "detalle": "SSH no respondió (%s): %s" % (codigo, (error or "").strip()[:120]),
        }
    texto = (salida or "").strip()
    if not texto or texto.split()[0].upper() == "SIN":
        return interpretar_registro(nombre, False, 0, None, ahora=ahora)
    lineas = texto.splitlines()
    partes = lineas[0].split()
    try:
        tamano = int(partes[0])
        epoch = float(partes[1]) if len(partes) > 1 else None
    except (ValueError, IndexError):
        return {
            "nombre": nombre,
            "estado": "error",
            "bytes": 0,
            "ultima": None,
            "silencio_s": None,
            "detalle": "respuesta SSH ilegible: %s" % texto[:120],
        }
    ultima = leer_ultima_epoch("\n".join(lineas[1:]), respaldo=epoch)
    return interpretar_registro(nombre, True, tamano, ultima, ahora=ahora)


def interpretar_lanzador(codigo, salida, error):
    """PURA. Ficha de `lanzador_hermes_app.py estado`."""
    try:
        datos = json.loads(salida or "")
    except (TypeError, ValueError):
        return {
            "estado": "error",
            "usa_launcher": None,
            "servicio_cargado": None,
            "app_existe": None,
            "detalle": "no se pudo leer la ficha del lanzador (%s): %s"
            % (codigo, (error or "salida vacía").strip()[:120]),
        }
    usa = bool(datos.get("usa_launcher"))
    servicio = bool(datos.get("servicio_cargado"))
    app = bool(datos.get("app_existe"))
    if usa and app and servicio:
        estado = "ok"
    elif usa and app:
        estado = "sin-servicio"
    else:
        estado = "sin-lanzador"
    return {
        "estado": estado,
        "usa_launcher": usa,
        "servicio_cargado": servicio,
        "app_existe": app,
        "detalle": "lanzador %s; app %s; servicio %s"
        % ("en uso" if usa else "sin instalar", "presente" if app else "ausente",
           "cargado" if servicio else "descargado"),
    }


def leer_ultima_epoch(linea, respaldo=None):
    """PURA. Época UTC del prefijo ISO de una línea de enlaces.log, o `respaldo`."""
    m = _ISO.match((linea or "").strip())
    if not m:
        return respaldo
    try:
        base = datetime.strptime(m.group(1)[:19], "%Y-%m-%dT%H:%M:%S").replace(tzinfo=timezone.utc)
        resto = m.group(1)[19:-1]
        return base.timestamp() + (float("0" + resto) if resto.startswith(".") else 0.0)
    except (ValueError, TypeError):
        return respaldo


_ETIQUETAS = {
    "ok": "bien",
    "falta-permiso": "falta permiso",
    "sin-registro": "sin registro",
    "parado": "parado",
    "sin-acceso": "sin acceso",
    "sin-lanzador": "sin lanzador",
    "sin-servicio": "sin servicio",
    "error": "error",
    "fallo": "falla",
}


def linea_publicacion(resultado):
    """PURA. Una sola línea para el Chat Director: qué puede Hermes y qué le falta."""
    registros = resultado.get("registros") or {}
    piezas = [
        ("captura", resultado.get("captura") or {}),
        ("control", resultado.get("control") or {}),
        ("registros Mac", registros.get("mac") or {}),
        ("Maggabox", registros.get("maggabox") or {}),
        ("lanzador", resultado.get("lanzador") or {}),
    ]
    puede = [nombre for nombre, dato in piezas if dato.get("estado") == "ok"]
    linea = "Hermes · puede: %s" % (", ".join(puede) if puede else "nada")
    faltan = [
        "%s (%s)" % (nombre, _ETIQUETAS.get(dato.get("estado") or "", dato.get("estado")))
        for nombre, dato in piezas
        if dato.get("estado") != "ok"
    ]
    if faltan:
        linea += " · pendiente: %s" % "; ".join(faltan)
    ajustes = [
        "%s → %s" % (nombre, dato["ajustes"])
        for nombre, dato in piezas
        if dato.get("ajustes")
    ]
    if ajustes:
        linea += " · falta activar en %s" % "; ".join(ajustes)
    return (linea + ".").replace("\n", " ")


def _es_negro_png(datos, umbral=12):
    """PURA. True si una PNG de 8 bits no tiene ningún píxel de luz por encima de `umbral`."""
    if datos[:8] != b"\x89PNG\r\n\x1a\n":
        return None
    pos, idat = 8, []
    ancho = alto = prof = tipo = inter = 0
    while pos + 12 <= len(datos):
        n = int.from_bytes(datos[pos:pos + 4], "big")
        nombre = datos[pos + 4:pos + 8]
        cuerpo = datos[pos + 8:pos + 8 + n]
        pos += 12 + n
        if nombre == b"IHDR":
            ancho = int.from_bytes(cuerpo[0:4], "big")
            alto = int.from_bytes(cuerpo[4:8], "big")
            prof, tipo, inter = cuerpo[8], cuerpo[9], cuerpo[12]
        elif nombre == b"IDAT":
            idat.append(cuerpo)
        elif nombre == b"IEND":
            break
    canales = {0: 1, 2: 3, 4: 2, 6: 4}.get(tipo)
    if prof != 8 or inter or not canales or not ancho or not alto:
        return None
    try:
        crudo = zlib.decompress(b"".join(idat))
    except zlib.error:
        return None
    fila_bytes = ancho * canales
    previo = bytearray(fila_bytes)
    salto = max(1, ancho // 16)
    for _ in range(alto):
        if len(crudo) < 1 + fila_bytes:
            break
        filtro = crudo[0]
        fila = bytearray(crudo[1:1 + fila_bytes])
        for i in range(fila_bytes):
            a = fila[i - canales] if i >= canales else 0
            b = previo[i]
            c = previo[i - canales] if i >= canales else 0
            if filtro == 1:
                fila[i] = (fila[i] + a) & 255
            elif filtro == 2:
                fila[i] = (fila[i] + b) & 255
            elif filtro == 3:
                fila[i] = (fila[i] + ((a + b) >> 1)) & 255
            elif filtro == 4:
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                pr = a if pa <= pb and pa <= pc else (b if pb <= pc else c)
                fila[i] = (fila[i] + pr) & 255
        for x in range(0, ancho, salto):
            i = x * canales
            luz = max(fila[i], fila[i + 1], fila[i + 2]) if canales in (3, 4) else fila[i]
            if luz > umbral:
                return False
        previo = fila
        crudo = crudo[1 + fila_bytes:]
    return True


def es_negro(ruta):
    """True si la captura es negra; None si no se puede saber."""
    try:
        if os.path.getsize(ruta) < 4096:
            return True
    except OSError:
        return None
    destino = ruta + ".pequena.png"
    try:
        r = subprocess.run(["sips", "-Z", "64", ruta, "--out", destino],
                           capture_output=True, timeout=15)
        if r.returncode == 0 and os.path.exists(destino):
            with open(destino, "rb") as f:
                return _es_negro_png(f.read())
    except (OSError, subprocess.SubprocessError):
        return None
    finally:
        try:
            os.remove(destino)
        except OSError:
            pass
    return None


def medir_captura():
    carpeta = tempfile.mkdtemp(prefix="hermes-capacidades-")
    destino = os.path.join(carpeta, "captura.png")
    try:
        r = subprocess.run(["screencapture", "-x", destino],
                           capture_output=True, text=True, timeout=20)
        existe = os.path.exists(destino)
        tamano = os.path.getsize(destino) if existe else 0
        negro = es_negro(destino) if existe else None
        return interpretar_captura((r.stderr or "") + (r.stdout or ""), r.returncode,
                                   existe, tamano, negro)
    except FileNotFoundError:
        return interpretar_captura("screencapture no existe", 127, False, 0)
    except subprocess.TimeoutExpired:
        return interpretar_captura("screencapture agotó el tiempo", 124, False, 0)
    finally:
        shutil.rmtree(carpeta, ignore_errors=True)


def medir_control():
    script = 'tell application "System Events" to get name of first process'
    try:
        r = subprocess.run(["osascript", "-e", script],
                           capture_output=True, text=True, timeout=10)
        return interpretar_control(r.stdout, r.returncode, r.stderr)
    except FileNotFoundError:
        return interpretar_control("", 127, "osascript no existe")
    except subprocess.TimeoutExpired:
        return interpretar_control("", 124, "osascript agotó el tiempo")


def _ultima_linea(ruta, maximo=65536):
    try:
        with open(ruta, "rb") as f:
            f.seek(0, os.SEEK_END)
            n = f.tell()
            f.seek(max(0, n - maximo))
            texto = f.read().decode("utf-8", "replace")
        for linea in reversed(texto.splitlines()):
            if linea.strip():
                return linea
    except OSError:
        pass
    return None


def medir_registro_mac(ruta=None):
    ruta = ruta or RUTA_LOG_MAC
    try:
        s = os.stat(ruta)
    except OSError:
        return interpretar_registro("Mac", False, 0, None)
    ultima = leer_ultima_epoch(_ultima_linea(ruta), respaldo=s.st_mtime)
    return interpretar_registro("Mac", True, s.st_size, ultima)


def _ssh_base():
    return [
        "ssh",
        "-i", LLAVE_NODO,
        "-o", "AddressFamily=inet",
        "-o", "IdentitiesOnly=yes",
        "-o", "BatchMode=yes",
        "-o", "ConnectTimeout=8",
        "-o", "UserKnownHostsFile=" + KNOWN_HOSTS_NODO,
        HOST_MAGGABOX,
    ]


def medir_registro_maggabox():
    comando = (
        'L="$HOME/Library/Logs/app.starseed.os/enlaces.log"; '
        'if [ -f "$L" ]; then s=$(wc -c < "$L" | tr -d " "); '
        'm=$(stat -c %Y "$L" 2>/dev/null || stat -f %m "$L" 2>/dev/null '
        '|| date -r "$L" +%s); echo "$s $m"; tail -n 1 "$L"; else echo SIN; fi'
    )
    try:
        r = subprocess.run(_ssh_base() + [comando], capture_output=True, text=True, timeout=15)
        return interpretar_ssh(r.returncode, r.stdout, r.stderr)
    except FileNotFoundError:
        return interpretar_ssh(127, "", "ssh no existe")
    except subprocess.TimeoutExpired:
        return interpretar_ssh(124, "", "ssh agotó el tiempo")


def medir_lanzador():
    ruta = os.path.join(AQUI, "lanzador_hermes_app.py")
    try:
        r = subprocess.run([sys.executable, ruta, "estado"],
                           capture_output=True, text=True, timeout=20)
        return interpretar_lanzador(r.returncode, r.stdout, r.stderr)
    except (OSError, subprocess.SubprocessError) as e:
        return interpretar_lanzador(1, "", str(e))


def _escribir(resultado):
    ruta = Path(RUTA_SALIDA)
    ruta.parent.mkdir(parents=True, exist_ok=True)
    temporal = ruta.with_suffix(".json.tmp")
    temporal.write_text(json.dumps(resultado, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(temporal, ruta)


def _publicar(linea):
    try:
        subprocess.run(
            [sys.executable, os.path.join(AQUI, "director_chat.py"), "publicar", linea,
             "--de", "director-presidente", "--tipo", "informe"],
            capture_output=True, text=True, timeout=20,
        )
    except (OSError, subprocess.SubprocessError):
        pass


def comprobar(publicar=True):
    resultado = {
        "t": datetime.now(timezone.utc).astimezone().isoformat(),
        "captura": medir_captura(),
        "control": medir_control(),
        "registros": {"mac": medir_registro_mac(), "maggabox": medir_registro_maggabox()},
        "lanzador": medir_lanzador(),
    }
    resultado["linea"] = linea_publicacion(resultado)
    _escribir(resultado)
    if publicar:
        _publicar(resultado["linea"])
    return resultado


def main(argv=None):
    p = argparse.ArgumentParser(prog="hermes_capacidades", description="Capacidades de Hermes")
    sub = p.add_subparsers(dest="orden", required=True)
    s = sub.add_parser("comprobar", help="mide pantalla, control, registros y lanzador")
    s.add_argument("--sin-publicar", action="store_true", help="no escribe en el Chat Director")
    args = p.parse_args(argv)
    if args.orden == "comprobar":
        print(json.dumps(comprobar(publicar=not args.sin_publicar), ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
