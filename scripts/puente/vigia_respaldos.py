#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Vigía de respaldos de claves (SEG1119B · 19-11).

Lee `~/.starseed/respaldo-claves/respaldo.log` —que escribe el respaldo diario de la Mac,
fuera del repo— y compara SOLO huellas y fechas de las copias `claves-mac-AAAA-MM-DD.gpg`
en la Maggabox, el A1 y Google Drive. Nunca abre, imprime, mueve ni descifra un `.gpg`:
el registro ya trae lo justo para comparar.

Formato del registro, una línea por copia (también vale un objeto JSON por línea):

    2026-11-18T03:10:00Z copia=maggabox archivo=claves-mac-2026-11-18.gpg huella=sha256:<64 hex> bytes=4096 orden="bash ~/.starseed/respaldo-claves/copiar-claves.sh maggabox"

`copia` admite alias (`oracle` = `a1`, `drive`/`google drive` = `gdrive`). Si el campo
`orden` falta, se usa la orden documentada en `starseed_memory_root/fundamentos/
accesos-y-recuperacion.md`. Si una copia falta o difiere dos días seguidos, se avisa en el
Chat Director y en «Te toca a ti» con esa orden exacta.

    python3 scripts/puente/vigia_respaldos.py            # una pasada del día
    python3 scripts/puente/vigia_respaldos.py --json     # imprime el resultado y sale
"""
from __future__ import annotations

import datetime as dt
import json
import os
import re
import sys

COPIA_ESPERADAS = ("maggabox", "a1", "gdrive")
DIAS_PARA_AVISAR = 2
ORDENES = {
    "maggabox": "bash ~/.starseed/respaldo-claves/copiar-claves.sh maggabox",
    "a1": "bash ~/.starseed/respaldo-claves/copiar-claves.sh a1",
    "gdrive": "bash ~/.starseed/respaldo-claves/copiar-claves.sh gdrive",
}
_RUTA_LOG = "~/.starseed/respaldo-claves/respaldo.log"
_RUTA_ESTADO = "~/.starseed/respaldo-claves/vigia-respaldos.json"
_RUTA_ACCIONES = "starseed_memory_root/mando/acciones-de-alex.json"

_ALIAS = {
    "maggabox": "maggabox", "maggabox-local": "maggabox", "maggabox_local": "maggabox",
    "a1": "a1", "oracle": "a1", "oracle-a1": "a1", "a1-oracle": "a1",
    "gdrive": "gdrive", "google-drive": "gdrive", "google_drive": "gdrive", "drive": "gdrive",
}
_ARCHIVO = re.compile(r"^claves-mac-(\d{4}-\d{2}-\d{2})\.gpg$")
_CAMPO = re.compile(r'(\w+)=("(?:[^"\\]|\\.)*"|\S+)')
_FECHA = re.compile(r"^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?)?")
_HEX64 = re.compile(r"^[0-9a-f]{64}$")


def normalizar_copia(valor):
    """PURA: nombre canónico de la copia (`maggabox`, `a1`, `gdrive`) o None."""
    return _ALIAS.get(str(valor or "").strip().lower().replace(" ", "-"))


def normalizar_huella(valor):
    """PURA: `sha256:<64 hex>` en minúsculas; cadena vacía si no es una huella conocida."""
    t = str(valor or "").strip().lower()
    for prefijo in ("sha256:", "sha-256:", "sha256=", "hash:"):
        if t.startswith(prefijo):
            t = t[len(prefijo):]
            break
    if _HEX64.match(t):
        return "sha256:" + t
    if _HEX64.match(t[7:]):
        return t
    return ""


def archivo_valido(nombre):
    """PURA: solo `claves-mac-AAAA-MM-DD.gpg` con una fecha real."""
    m = _ARCHIVO.match(str(nombre or ""))
    if not m:
        return False
    try:
        dt.date.fromisoformat(m.group(1))
        return True
    except ValueError:
        return False


def _fecha(valor):
    """PURA: ISO (`Z` incluida), fecha sola o `AAAA-MM-DD HH:MM:SS` → datetime."""
    t = str(valor or "").strip()
    if not t:
        return None
    if t.endswith("Z"):
        t = t[:-1] + "+00:00"
    try:
        return dt.datetime.fromisoformat(t)
    except ValueError:
        return None


def _sin_comillas(valor):
    v = str(valor or "")
    if len(v) >= 2 and v[0] == v[-1] == '"':
        v = v[1:-1].replace('\\"', '"')
    return v


def parsear_log(texto):
    """PURA: líneas de registro → lista de dicts normalizados, ordenada por fecha."""
    registros = []
    for bruta in str(texto or "").splitlines():
        linea = bruta.strip()
        if not linea or linea.startswith("#"):
            continue
        datos = {}
        if linea.startswith("{"):
            try:
                leido = json.loads(linea)
            except ValueError:
                continue
            if not isinstance(leido, dict):
                continue
            datos = {str(k).lower(): v for k, v in leido.items()}
            fecha = datos.get("fecha") or datos.get("date") or datos.get("t")
            copia = datos.get("copia") or datos.get("medio") or datos.get("copy")
            archivo = datos.get("archivo") or datos.get("file")
            huella = datos.get("huella") or datos.get("sha256") or datos.get("hash")
            orden = datos.get("orden") or datos.get("order")
            tamano = datos.get("bytes")
        else:
            campos = {k.lower(): _sin_comillas(v) for k, v in _CAMPO.findall(linea)}
            fecha = campos.get("fecha")
            if fecha is None:
                hallada = _FECHA.match(linea)
                fecha = hallada.group(0) if hallada else None
            copia = campos.get("copia") or campos.get("medio") or campos.get("copy")
            archivo = campos.get("archivo") or campos.get("file")
            huella = campos.get("huella") or campos.get("sha256") or campos.get("hash")
            orden = campos.get("orden") or campos.get("order")
            tamano = campos.get("bytes")
        canonica = normalizar_copia(copia)
        cuando = _fecha(fecha)
        nombre = str(archivo or "").strip()
        if not canonica or not cuando or not archivo_valido(nombre):
            continue
        registro = {"fecha": cuando, "copia": canonica, "archivo": nombre,
                    "huella": normalizar_huella(huella), "orden": str(orden).strip() if orden else None}
        if tamano is not None:
            try:
                registro["bytes"] = int(tamano)
            except (TypeError, ValueError):
                pass
        registros.append(registro)
    registros.sort(key=lambda r: (r["fecha"], r["copia"]))
    return registros


def orden_de_copia(copia, registro=None):
    """PURA: la orden exacta que dejó el registro o la documentada para esa copia."""
    if registro and registro.get("orden"):
        return registro["orden"]
    return ORDENES.get(copia, "")


def evaluar(registros, estado_previo=None, hoy=None, dias_para_avisar=DIAS_PARA_AVISAR):
    """PURA: compara las copias del último día y cuenta las rachas de falta/diferencia.

    Devuelve `archivo`, el estado por copia, los problemas de hoy, las alertas (racha de
    `dias_para_avisar` o más), el estado nuevo que hay que persistir y si está sano.
    """
    hoy = hoy or dt.date.today()
    hoy_iso = hoy.isoformat()
    ultima = max((r["fecha"] for r in registros), default=None)
    del_dia = [r for r in registros if ultima and r["fecha"].date() == ultima.date()]
    archivo = max((r["archivo"] for r in del_dia), default="")
    por_copia = {}
    for registro in del_dia:
        if registro["archivo"] == archivo:
            por_copia[registro["copia"]] = registro
    firmas = {}
    for copia, registro in por_copia.items():
        if not registro["huella"]:
            continue
        firma = (registro["huella"], registro["fecha"].date().isoformat())
        firmas.setdefault(firma, []).append(copia)
    referencia = None
    if len(por_copia) == 1:
        referencia = next(iter(firmas))
    elif firmas:
        mayoria = max(firmas.values(), key=len)
        if len(mayoria) >= 2:
            referencia = next(f for f, copias in firmas.items() if len(copias) == len(mayoria))

    previas = (estado_previo or {}).get("copias") or {}
    dia_previo = str((estado_previo or {}).get("ultimo") or "")
    ayer = (hoy - dt.timedelta(days=1)).isoformat()
    copias, problemas = {}, []
    for copia in COPIA_ESPERADAS:
        registro = por_copia.get(copia)
        if registro is None:
            tipo = "falta"
        elif not registro["huella"]:
            tipo = "difiere"
        elif referencia is None or (registro["huella"], registro["fecha"].date().isoformat()) != referencia:
            tipo = "difiere"
        else:
            tipo = "ok"
        if tipo == "ok":
            copias[copia] = {"tipo": "ok", "dias": 0, "archivo": archivo}
            continue
        previa = previas.get(copia) or {}
        dias_previos = int(previa.get("dias") or 0)
        if previa.get("tipo") != tipo:
            dias = 1
        elif dia_previo == hoy_iso:
            dias = max(1, dias_previos)
        elif dia_previo == ayer:
            dias = dias_previos + 1
        else:
            dias = 1
        copias[copia] = {"tipo": tipo, "dias": dias, "archivo": archivo}
        problemas.append({"copia": copia, "tipo": tipo, "dias": dias, "archivo": archivo,
                          "orden": orden_de_copia(copia, registro)})

    alertas = [p for p in problemas if p["dias"] >= dias_para_avisar]
    return {
        "hoy": hoy_iso,
        "archivo": archivo,
        "copias": copias,
        "problemas": problemas,
        "alertas": alertas,
        "sano": not problemas,
        "estado": {"version": 1, "ultimo": hoy_iso,
                   "copias": {c: v for c, v in copias.items() if v["tipo"] != "ok"}},
    }


def texto_alerta(problema):
    """PURA: el aviso para el Chat Director, con la orden exacta y sin ningún secreto."""
    copia = problema["copia"]
    que = "falta" if problema.get("tipo") == "falta" else "difiere de las otras copias"
    archivo = problema.get("archivo") or "sin archivo en el registro"
    return (
        "AVISO · respaldo de claves: la copia «%s» %s dos días o más seguidos (%d días) — %s.\n"
        "Orden exacta para rehacerla: %s\n"
        "Nadie lee, mueve, descifra ni imprime claves: nunca se abren los .gpg; solo se "
        "comparan huellas y fechas."
        % (copia, que, int(problema.get("dias") or 0), archivo,
           problema.get("orden") or ORDENES.get(copia, ""))
    )


def accion_de_alerta(problema):
    """PURA: una entrada de «Te toca a ti» con la orden ya escrita."""
    copia = problema["copia"]
    estado = "falta" if problema.get("tipo") == "falta" else "difiere de las otras dos"
    return {
        "id": "respaldo-claves-%s" % copia,
        "titulo": "Rehacer la copia de claves en %s" % copia,
        "por_que": ("la copia «%s» %s desde hace %d días seguidos; si se pierde la Mac, "
                    "esa vía deja de servir" % (copia, estado, int(problema.get("dias") or 0))),
        "urgencia": "alta",
        "comando": problema.get("orden") or ORDENES.get(copia, ""),
        "enlace": "",
        "por_que_no_lo_hago_yo": ("mover claves cifradas fuera de la Mac es una acción de la "
                                  "persona; un agente no las lee, mueve ni descifra"),
        "detalle": "archivo %s · solo huellas y fechas" % (problema.get("archivo") or "sin registro"),
        "variable": None,
    }


def raiz():
    """Raíz del repo: `scripts/puente/` está dos niveles por debajo."""
    return os.environ.get("STARSEED_ROOT") or os.path.dirname(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def leer_texto(ruta):
    try:
        with open(ruta, encoding="utf-8") as fichero:
            return fichero.read()
    except OSError:
        return ""


def cargar_estado(ruta):
    try:
        with open(ruta, encoding="utf-8") as fichero:
            datos = json.load(fichero)
    except (OSError, ValueError):
        return {}
    return datos if isinstance(datos, dict) else {}


def guardar_json(ruta, datos):
    """Escritura atómica; nunca lanza."""
    try:
        os.makedirs(os.path.dirname(os.path.abspath(ruta)), exist_ok=True)
        temporal = ruta + ".tmp"
        with open(temporal, "w", encoding="utf-8") as fichero:
            json.dump(datos, fichero, ensure_ascii=False, indent=1)
        os.replace(temporal, ruta)
        return True
    except OSError:
        return False


def anotar_acciones(alertas, ruta=None, generado=None):
    """Deja las alertas en «Te toca a ti» conservando las demás acciones."""
    ruta = ruta or os.path.join(raiz(), _RUTA_ACCIONES)
    try:
        with open(ruta, encoding="utf-8") as fichero:
            datos = json.load(fichero)
    except (OSError, ValueError):
        datos = {}
    if not isinstance(datos, dict):
        datos = {}
    acciones = [a for a in (datos.get("acciones") or [])
                if isinstance(a, dict) and not str(a.get("id") or "").startswith("respaldo-claves-")]
    acciones.extend(accion_de_alerta(p) for p in alertas)
    return guardar_json(ruta, {
        "generado": generado or dt.datetime.now().strftime("%Y-%m-%d %H:%M"),
        "acciones": acciones,
    })


def publicar_chat(texto, publicar=None):
    """Avisa en el Chat Director; inyectable en pruebas. Nunca lanza."""
    if publicar is None:
        try:
            import director_chat
            publicar = director_chat.publicar
        except Exception:  # noqa: BLE001
            return "sin-canal"
    try:
        publicar(texto, de="vigia-respaldos", rol="director", tipo="aviso")
        return "avisado"
    except Exception:  # noqa: BLE001
        return "fallo"


def main(argv=None):
    argumentos = list(sys.argv[1:] if argv is None else argv)
    ruta_log = os.path.expanduser(os.environ.get("STARSEED_RESPALDO_LOG") or _RUTA_LOG)
    ruta_estado = os.path.expanduser(os.environ.get("STARSEED_RESPALDO_ESTADO") or _RUTA_ESTADO)
    resultado = evaluar(parsear_log(leer_texto(ruta_log)), cargar_estado(ruta_estado))
    guardar_json(ruta_estado, resultado["estado"])
    if "--json" in argumentos:
        print(json.dumps(resultado, ensure_ascii=False, indent=1, default=str))
        return 0
    for alerta in resultado["alertas"]:
        estado = publicar_chat(texto_alerta(alerta))
        print("Chat Director: %s · copia %s" % (estado, alerta["copia"]))
    if resultado["alertas"]:
        anotar_acciones(resultado["alertas"])
    if resultado["sano"]:
        print("Respaldo de claves: las tres copias coinciden (%s)." % (resultado["archivo"] or "sin registro"))
    else:
        print("Respaldo de claves: %d problema(s), %d alerta(s)."
              % (len(resultado["problemas"]), len(resultado["alertas"])))
        for problema in resultado["problemas"]:
            print("· %s: %s (%d día(s))" % (problema["copia"], problema["tipo"], problema["dias"]))
    return 0


if __name__ == "__main__":
    sys.exit(main() or 0)
