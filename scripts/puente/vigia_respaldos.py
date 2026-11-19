#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Vigía de las tres copias cifradas de claves (SEG1119B).

Lee una vez al día `~/.starseed/respaldo-claves/respaldo.log` y compara SOLO la huella y
la fecha de los archivos `claves-mac-*.gpg` en la Maggabox, el A1 y Google Drive. Nunca
abre, imprime, mueve ni descifra el `.gpg`: el registro ya trae la huella.

Formato del registro (una línea por copia; también acepta JSON por línea):

    2026-11-19T03:10:00Z copia=maggabox archivo=claves-mac-2026-11-19.gpg huella=sha256:... fecha=2026-11-19
    {"copia":"a1","archivo":"claves-mac-2026-11-19.gpg","huella":"sha256:...","fecha":"2026-11-19"}

Si una copia falta o difiere dos días seguidos, avisa en el Chat Director y deja la acción
en «Te toca a ti» con la orden exacta. El estado vive en `~/.starseed/vigia-respaldos.json`.

  python3 scripts/puente/vigia_respaldos.py            # una pasada (para launchd diario)
  python3 scripts/puente/vigia_respaldos.py --json     # resumen legible por máquina
  python3 scripts/puente/vigia_respaldos.py --seco     # no escribe estado ni avisa
  python3 scripts/puente/vigia_respaldos.py --orden a1 # imprime la orden exacta de una copia

Plist diario de ejemplo (03:10, después del respaldo):
  ProgramArguments: /usr/bin/python3 <raiz>/scripts/puente/vigia_respaldos.py
  StartCalendarInterval: Hour=3, Minute=10
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import sys

RAIZ = os.environ.get("STARSEED_ROOT") or os.path.expanduser("~/Documents/starseed-os-main")
LOG = os.path.expanduser("~/.starseed/respaldo-claves/respaldo.log")
ESTADO = os.path.expanduser("~/.starseed/vigia-respaldos.json")
ACCIONES = os.path.join(RAIZ, "starseed_memory_root", "mando", "acciones-de-alex.json")
COPIAS = ("maggabox", "a1", "gdrive")
NOMBRES = {"maggabox": "Maggabox", "a1": "A1 (Oracle)", "gdrive": "Google Drive"}
ALIAS = {
    "maggabox": "maggabox", "nodo-1": "maggabox", "nodo1": "maggabox",
    "a1": "a1", "oracle": "a1", "oracle-a1": "a1", "starseed-a1": "a1",
    "gdrive": "gdrive", "drive": "gdrive", "google-drive": "gdrive", "googledrive": "gdrive",
    "mac": "mac", "local": "mac", "origen": "mac",
}
PATRON_ARCHIVO = re.compile(r"^claves-mac-[0-9]{4}-?[0-9]{2}-?[0-9]{2}\.gpg$")
DIAS_PARA_AVISAR = 2


def normalizar_copia(nombre):
    """PURA. Nombre canónico de una copia (`maggabox`, `a1`, `gdrive`) o "" si no se conoce."""
    n = str(nombre or "").strip().lower().replace("_", "-").replace(" ", "-")
    return ALIAS.get(n, "")


def es_archivo_de_claves(nombre):
    """PURA. ¿Es un `claves-mac-<fecha>.gpg`? Solo el nombre, sin rutas."""
    return bool(PATRON_ARCHIVO.match(os.path.basename(str(nombre or "").strip())))


def normalizar_huella(valor):
    """PURA. Huella comparable: sin `sha256:`, sin comillas y en minúsculas."""
    t = str(valor or "").strip().strip('"').strip("'").lower()
    for prefijo in ("sha256:", "sha256-", "sha256="):
        if t.startswith(prefijo):
            t = t[len(prefijo):]
    return re.sub(r"\s+", "", t)


def _fecha_de(valor):
    """PURA. `YYYY-MM-DD` de una fecha ISO, `YYYYMMDD` o el nombre de un archivo."""
    m = re.search(r"(\d{4})-?(\d{2})-?(\d{2})", str(valor or ""))
    if not m:
        return ""
    anio, mes, dia = m.groups()
    try:
        return dt.date(int(anio), int(mes), int(dia)).isoformat()
    except ValueError:
        return ""


def parsear_linea(linea):
    """PURA. Una línea del registro → {copia, archivo, huella, fecha, fecha_archivo} o None."""
    texto = str(linea or "").strip()
    if not texto or texto.startswith("#"):
        return None
    datos = {}
    if texto.startswith("{"):
        try:
            objeto = json.loads(texto)
        except ValueError:
            return None
        if not isinstance(objeto, dict):
            return None
        datos = {str(k).strip().lower(): v for k, v in objeto.items()}
    else:
        marca = re.match(r"^(\d{4}-\d{2}-\d{2}[T ][0-9:.+\-Z]+)\s+", texto)
        if marca:
            datos["t"] = marca.group(1)
            texto = texto[marca.end():]
        for clave, valor in re.findall(r"(\w+)\s*=\s*(\"[^\"]*\"|'[^']*'|\S+)", texto):
            datos[clave.lower()] = valor
        if not datos:
            for clave, valor in re.findall(r"(\w+)\s*:\s*(\"[^\"]*\"|'[^']*'|\S+)", texto):
                datos[clave.lower()] = valor
    copia = normalizar_copia(
        datos.get("copia") or datos.get("destino") or datos.get("medio") or datos.get("copia_nombre")
    )
    archivo = os.path.basename(
        str(datos.get("archivo") or datos.get("file") or datos.get("nombre") or "").strip().strip('"').strip("'")
    )
    huella = normalizar_huella(datos.get("huella") or datos.get("hash") or datos.get("sha256"))
    fecha = _fecha_de(datos.get("fecha") or datos.get("dia") or datos.get("date") or archivo)
    if not copia or not es_archivo_de_claves(archivo) or not huella or not fecha:
        return None
    return {
        "copia": copia,
        "archivo": archivo,
        "huella": huella,
        "fecha": fecha,
        "fecha_archivo": _fecha_de(archivo) or fecha,
    }


def leer_registro(texto):
    """PURA. Todas las líneas válidas del registro, en orden."""
    registros = []
    for linea in str(texto or "").splitlines():
        registro = parsear_linea(linea)
        if registro is not None:
            registros.append(registro)
    return registros


def evaluar_dia(registros, dia):
    """PURA. Estado de las tres copias ese día: `ok`, `falta` o `difiere`.

    La referencia es la huella de la Mac si el registro la trae (`copia=mac`); si no, la
    huella mayoritaria entre las copias presentes. Un empate se resuelve por la fecha del
    archivo y, después, por el orden Maggabox → A1 → Drive.
    """
    del_dia = [r for r in registros or [] if r.get("fecha") == dia]
    if not del_dia:
        return {"esperada": "", "copias": {}}
    por_copia = {}
    for r in del_dia:
        actual = por_copia.get(r["copia"])
        if actual is None or (r["fecha_archivo"], r["archivo"]) >= (actual["fecha_archivo"], actual["archivo"]):
            por_copia[r["copia"]] = r
    if "mac" in por_copia:
        esperada = por_copia["mac"]["huella"]
    else:
        presentes = [por_copia[c] for c in COPIAS if c in por_copia]
        if not presentes:
            return {"esperada": "", "copias": {}}
        cuenta = {}
        for r in presentes:
            cuenta[r["huella"]] = cuenta.get(r["huella"], 0) + 1
        maximo = max(cuenta.values())
        candidatas = [h for h, n in cuenta.items() if n == maximo]
        if len(candidatas) == 1:
            esperada = candidatas[0]
        else:
            prioridad = {c: i for i, c in enumerate(COPIAS)}
            elegida = sorted(
                [r for r in presentes if r["huella"] in candidatas],
                key=lambda r: (r["fecha_archivo"], -prioridad.get(r["copia"], 9)),
                reverse=True,
            )[0]
            esperada = elegida["huella"]
    copias = {}
    for copia in COPIAS:
        r = por_copia.get(copia)
        if r is None:
            copias[copia] = {"estado": "falta", "huella": "", "archivo": "", "fecha": ""}
        else:
            estado = "ok" if r["huella"] == esperada else "difiere"
            copias[copia] = {
                "estado": estado,
                "huella": r["huella"],
                "archivo": r["archivo"],
                "fecha": r["fecha"],
            }
    return {"esperada": esperada, "copias": copias}


def _dia_anterior(dia):
    """PURA. El día anterior en formato ISO, o "" si la fecha no se puede leer."""
    try:
        return (dt.date.fromisoformat(str(dia)) - dt.timedelta(days=1)).isoformat()
    except ValueError:
        return ""


def actualizar_estado(previo, evaluacion, dia):
    """PURA. Racha por copia: cuántos días seguidos lleva faltando o difiriendo."""
    previo = previo if isinstance(previo, dict) else {}
    evaluacion = evaluacion if isinstance(evaluacion, dict) else {}
    crudo_prev = previo.get("copias")
    copias_prev = crudo_prev if isinstance(crudo_prev, dict) else {}
    crudo_eval = evaluacion.get("copias")
    copias_eval = crudo_eval if isinstance(crudo_eval, dict) else {}
    ayer = _dia_anterior(dia)
    nuevo = {}
    for copia in COPIAS:
        evaluada = copias_eval.get(copia)
        if not isinstance(evaluada, dict):
            evaluada = {"estado": "falta", "huella": "", "archivo": "", "fecha": ""}
        antes = copias_prev.get(copia)
        if not isinstance(antes, dict):
            antes = {}
        dia_antes = str(antes.get("ultimo_dia") or "")
        if evaluada["estado"] == "ok":
            dias = 0
            avisado = ""
        elif dia_antes == dia:
            dias = max(int(antes.get("dias") or 0), 1)
            avisado = str(antes.get("avisado_dia") or "")
        elif dia_antes == ayer:
            dias = int(antes.get("dias") or 0) + 1
            avisado = str(antes.get("avisado_dia") or "")
        else:
            dias = 1
            avisado = ""
        nuevo[copia] = {
            "dias": dias,
            "ultimo_dia": dia,
            "estado": evaluada["estado"],
            "huella": evaluada["huella"],
            "archivo": evaluada["archivo"],
            "avisado_dia": avisado,
        }
    return {"version": 1, "ultimo_dia": dia, "copias": nuevo}


def procesar_registros(previo, registros):
    """PURA. Estado al día más nuevo del registro, sin repetir días ya procesados.

    Si no hay estado previo, recorre el registro en orden: así un arranque nuevo detecta
    una copia que lleva dos días mal sin esperar a una segunda pasada.
    """
    if not registros:
        return {}, "", {"esperada": "", "copias": {}}
    dias = sorted({r["fecha"] for r in registros})
    dia = dias[-1]
    previo = previo if isinstance(previo, dict) else {}
    ultimo = str(previo.get("ultimo_dia") or "")
    nuevo = previo
    for d in dias:
        if ultimo and d <= ultimo:
            continue
        nuevo = actualizar_estado(nuevo, evaluar_dia(registros, d), d)
    if not nuevo.get("copias"):
        nuevo = actualizar_estado({}, evaluar_dia(registros, dia), dia)
    return nuevo, dia, evaluar_dia(registros, dia)


def alertas(estado, dia):
    """PURA. Copias que llevan dos días seguidos mal y aún no se avisaron hoy."""
    salida = []
    crudo = estado.get("copias") if isinstance(estado, dict) else None
    copias_estado = crudo if isinstance(crudo, dict) else {}
    for copia in COPIAS:
        datos = copias_estado.get(copia)
        if not isinstance(datos, dict):
            continue
        dias = int(datos.get("dias") or 0)
        if dias >= DIAS_PARA_AVISAR and str(datos.get("avisado_dia") or "") != dia:
            salida.append({
                "copia": copia,
                "dias": dias,
                "estado": str(datos.get("estado") or "falta"),
                "huella": str(datos.get("huella") or ""),
                "archivo": str(datos.get("archivo") or ""),
                "dia": dia,
            })
    return salida


def marcar_avisados(estado, dia, copias):
    """PURA. Copia del estado con `avisado_dia` puesto en las copias avisadas."""
    nuevo = json.loads(json.dumps(estado or {}))
    mapa = nuevo.get("copias")
    if not isinstance(mapa, dict):
        return nuevo
    for copia in copias or []:
        if isinstance(mapa.get(copia), dict):
            mapa[copia]["avisado_dia"] = dia
    return nuevo


def mensaje_alerta(alerta):
    """PURA. Texto para el Chat Director, con la orden exacta y sin abrir la clave."""
    nombre = NOMBRES.get(alerta["copia"], alerta["copia"])
    que = "falta" if alerta["estado"] == "falta" else "difiere"
    huella = (alerta.get("huella") or "")[:12]
    extra = (" Huella vista: %s…." % huella) if huella else ""
    return (
        "Respaldo de claves: la copia de %s %s desde hace %d días seguidos.%s "
        "Orden exacta: %s"
        % (nombre, que, alerta["dias"], extra, orden_exacta(alerta["copia"]))
    )


def orden_exacta(copia):
    """PURA. Orden lista para pegar que vuelve a dejar la copia cifrada en su sitio.

    La ejecuta Alex, no el vigía: aquí solo se imprime. No abre ni descifra el `.gpg`.
    """
    if copia == "maggabox":
        return (
            "cd \"%s\" && rsync -a --checksum ~/.starseed/respaldo-claves/ "
            "maggasukha@starseed-nodo-1.local:~/StarSeed-almacen/respaldos/claves/" % RAIZ
        )
    if copia == "a1":
        return (
            "cd \"%s\" && ip=$(python3 -c 'import json,os;"
            "d=json.load(open(os.path.expanduser(\"~/.starseed/oracle.json\")));"
            "print(next((i[\"ip_publica\"] for i in d.get(\"instancias\",[]) "
            "if \"a1\" in str(i.get(\"nombre\",\"\")) and i.get(\"ip_publica\")),\"\"))') "
            "&& rsync -a --checksum -e 'ssh -i ~/.ssh/starseed_oracle_ed25519 -o BatchMode=yes' "
            "~/.starseed/respaldo-claves/ ubuntu@$ip:~/StarSeed-almacen/respaldos/claves/" % RAIZ
        )
    if copia == "gdrive":
        return (
            "cd \"%s\" && rclone copy ~/.starseed/respaldo-claves/ "
            "gdrive:StarSeed/respaldo-claves/ --include 'claves-mac-*.gpg' --checksum" % RAIZ
        )
    return ""


def accion_te_toca_a_ti(alerta):
    """PURA. La acción de «Te toca a ti» con la orden exacta y el motivo."""
    nombre = NOMBRES.get(alerta["copia"], alerta["copia"])
    que = "falta" if alerta["estado"] == "falta" else "no coincide"
    huella = (alerta.get("huella") or "")[:12]
    detalle = (
        "El vigía compara solo huellas y fechas; nunca abre el .gpg. "
        "La copia de %s %s desde hace %d días seguidos." % (nombre, que, alerta["dias"])
    )
    if huella:
        detalle += " Última huella vista: %s…." % huella
    return {
        "id": "respaldo-claves-%s" % alerta["copia"],
        "titulo": "Copia de claves %s: %s desde hace %d días" % (nombre, que, alerta["dias"]),
        "por_que": (
            "las claves de la Mac tienen tres copias cifradas y una de ellas falta o no "
            "coincide; sin las tres, un solo fallo deja el OS sin recuperación"
        ),
        "urgencia": "alta",
        "comando": orden_exacta(alerta["copia"]),
        "enlace": "",
        "por_que_no_lo_hago_yo": (
            "mover o descifrar las claves es de la persona; ningún agente las abre ni las mueve"
        ),
        "detalle": detalle,
    }


def fusionar_accion(acciones, accion):
    """PURA. Lista de acciones sin duplicar el id y con la nueva al final."""
    salida = [
        a for a in (acciones or [])
        if isinstance(a, dict) and str(a.get("id") or "") != str(accion.get("id") or "")
    ]
    salida.append(dict(accion))
    return salida


def _leer_json(ruta, por_defecto):
    try:
        with open(ruta, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return por_defecto


def _guardar_json(ruta, datos):
    carpeta = os.path.dirname(ruta)
    if carpeta:
        os.makedirs(carpeta, exist_ok=True)
    temporal = ruta + ".tmp"
    with open(temporal, "w", encoding="utf-8") as f:
        json.dump(datos, f, ensure_ascii=False, indent=1)
    os.replace(temporal, ruta)


def publicar_en_chat(texto):
    """Deja el aviso en el Chat Director. Nunca lanza: un vigía no puede caerse al avisar."""
    try:
        import director_chat

        director_chat.publicar(texto, de="vigia-respaldos", rol="director", tipo="aviso")
        return True
    except Exception:  # noqa: BLE001
        return False


def publicar_en_te_toca_a_ti(accion):
    """Fusiona la acción en `acciones-de-alex.json`, que es lo que pinta «Te toca a ti»."""
    try:
        datos = _leer_json(ACCIONES, {})
        if not isinstance(datos, dict):
            datos = {}
        acciones = datos.get("acciones")
        datos["generado"] = dt.datetime.now().strftime("%Y-%m-%d %H:%M")
        datos["acciones"] = fusionar_accion(acciones if isinstance(acciones, list) else [], accion)
        _guardar_json(ACCIONES, datos)
        return True
    except OSError:
        return False


def main(argv=None):
    parser = argparse.ArgumentParser(description="Vigía de las tres copias cifradas de claves.")
    parser.add_argument("--log", default=LOG, help="registro de respaldos de claves")
    parser.add_argument("--estado", default=ESTADO, help="estado de rachas del vigía")
    parser.add_argument("--json", action="store_true", help="resumen legible por máquina")
    parser.add_argument("--seco", action="store_true", help="no escribe estado ni avisa")
    parser.add_argument("--orden", choices=COPIAS, help="imprime la orden exacta de una copia y sale")
    args = parser.parse_args(argv)

    if args.orden:
        print(orden_exacta(args.orden))
        return 0

    try:
        with open(args.log, encoding="utf-8") as f:
            texto = f.read()
    except OSError:
        texto = ""
    registros = leer_registro(texto)
    if not registros:
        resumen = {"estado": "sin-registro", "log": args.log, "alertas": []}
        print(json.dumps(resumen, ensure_ascii=False, indent=1) if args.json
              else "Sin registros de respaldo de claves en %s" % args.log)
        return 0

    previo = _leer_json(args.estado, {})
    nuevo, dia, evaluacion = procesar_registros(previo, registros)
    lista = alertas(nuevo, dia) if str(nuevo.get("ultimo_dia") or "") == dia else []

    avisadas = []
    for alerta in lista:
        texto_alerta = mensaje_alerta(alerta)
        aviso_chat = aviso_accion = False
        if not args.seco:
            aviso_chat = publicar_en_chat(texto_alerta)
            aviso_accion = publicar_en_te_toca_a_ti(accion_te_toca_a_ti(alerta))
        if aviso_chat and aviso_accion:
            avisadas.append(alerta["copia"])
        if not args.json:
            print(texto_alerta)

    if avisadas and not args.seco:
        nuevo = marcar_avisados(nuevo, dia, avisadas)
    if not args.seco:
        _guardar_json(args.estado, nuevo)

    if args.json:
        print(json.dumps({
            "dia": dia,
            "esperada": evaluacion.get("esperada", ""),
            "copias": evaluacion.get("copias", {}),
            "alertas": lista,
            "avisadas": avisadas,
        }, ensure_ascii=False, indent=1))
    elif not lista:
        print("Respaldo de claves: las tres copias coinciden (%s)" % dia)
    return 0


if __name__ == "__main__":
    sys.exit(main())
