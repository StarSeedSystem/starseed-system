#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Drive como servidor de almacenamiento de StarSeed, no como carpeta suelta.

QUÉ PIDIÓ ALEX (2026-09-17)
---------------------------
«El botón de Google Drive aparece como montado pero al abrirlo solo aparece un
archivo. Todo lo de StarSeed —memorias, progreso del proyecto completo, Genesis y todos sus medios y contextos— debe estar ahí vinculado. Será
nuestro servidor de almacenamiento principal, también para archivos pesados,
para no necesitar de esta computadora para editar el programa: esta computadora
solo es otro medio.»

QUÉ PASABA DE VERDAD
--------------------
Drive SÍ está montado, con la app oficial de Google, y está lleno. Lo que estaba
vacío era el sitio al que mira Genesis:

    My Drive/StarSeed_Memory_Root/          ← existe, pero de junio y julio
    My Drive/StarSeed_Memory_Root/neurona-maggasukha.local/   ← VACÍA

Había un modelo de carpetas (`drive-carpetas.ts`, que dice qué debería estar
espejado y qué movido) y no había nada que lo hiciera. El «montado» era cierto;
el contenido, no. Dos meses sin subir una línea.

QUÉ HACE ESTO
-------------
Sube el estado real de esta neurona a su carpeta de Drive, con rsync:

    starseed_memory_root/  →  neurona-<host>/memoria/
    memory/                →  neurona-<host>/memoria-repo/
    PUENTE-DE-MANDO.md, CLAUDE.md, los contextos  →  neurona-<host>/contextos/

y escribe un `INDICE.md` legible para que cualquier medio —otro ordenador, el
móvil, un IDE, otra sesión— sepa qué hay ahí sin tener que adivinar.

LO QUE NO SUBE, Y POR QUÉ
-------------------------
Los registros por tarea de `olas/logs/` son 45 de los 52 MB y no los lee nadie
más que el orquestador de esta máquina: son ruido caro. Los worktrees tampoco:
se regeneran. Y NUNCA los archivos de claves — ni `.env`, ni `env`, ni
`auth.json`: subir un secreto a una nube compartida es exactamente lo que no
puede pasar, y es más fácil de hacer sin querer que de deshacer.
"""

import argparse
import json
import os
import shutil
import subprocess
import time

RAIZ = os.environ.get("STARSEED_ROOT") or os.path.dirname(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
)
BASE_CLOUD = os.path.expanduser("~/Library/CloudStorage")

#: (SUP0811K, 08-11) Lo que el espejo deja libre en el disco como mínimo. Lo que se escribe en la
#: carpeta de Drive se queda en el disco de esta máquina hasta que Drive lo sube (y en modo «espejo»,
#: para siempre): `starseed_memory_root` ya pesa ~1,8 GB sin los registros (era 76 MB en septiembre)
#: y esta Mac vive con 2–7 GB libres. Un tramo se salta si, tras copiarlo, quedarían menos de esto.
#: `STARSEED_ESPEJO_DISCO_MIN_MB` lo cambia; 0 lo apaga.
DISCO_MIN_MB = 5120

#: Lo que nunca viaja. El primer bloque es peso muerto; el segundo, secretos.
EXCLUIR = (
    "olas/logs/", "olas/pasos/", "*.log", "node_modules/", ".next/", ".git/",
    "__pycache__/", "*.pyc", ".DS_Store", "*.tmp",
    # (SUP0811L, 08-11) La app de Google Drive ya respalda `starseed_memory_root` y deja ahí sus temporales de
    # subida/bajada, que aparecen y desaparecen mientras rsync lee: eran el «rsync rc=23» del tramo «memoria».
    ".tmp.driveupload/", ".tmp.drivedownload/",
    ".env", ".env.*", "env", "auth.json", "*.key", "*.pem", "id_rsa*",
    "*credenciales*", "*secreto*",
)

#: Qué se sube y dónde cae, dentro de la carpeta de esta neurona.
TRAMOS = (
    ("starseed_memory_root", "memoria"),
    ("memory", "memoria-repo"),
)

#: Archivos sueltos de contexto: lo que un IDE o una sesión nueva necesita leer
#: para ponerse al día sin esta máquina delante.
CONTEXTOS = (
    "PUENTE-DE-MANDO.md",
    "CLAUDE.md",
    "AGENTS.md",
    ".github/copilot-instructions.md",
    ".cursor/rules/puente-de-mando.mdc",
)


def unidad_drive():
    """La carpeta del Drive montado, o None.

    Hay TRES montajes en esta máquina y dos son de sesiones viejas, con la fecha
    en el nombre. El bueno es el que no la lleva; si se coge uno de los otros se
    escribe en un sitio que nadie mira.
    """
    try:
        entradas = sorted(os.listdir(BASE_CLOUD))
    except OSError:
        return None
    vivos = [
        e for e in entradas
        if e.startswith("GoogleDrive-") and "(" not in e
    ]
    if not vivos:
        return None
    return os.path.join(BASE_CLOUD, vivos[0])


def carpeta_neurona(unidad, host=None):
    host = host or os.uname().nodename
    return os.path.join(unidad, "My Drive", "StarSeed_Memory_Root", "neurona-" + host)


def _rsync(origen, destino, seco=False):
    if not os.path.isdir(origen):
        return None
    if not seco:  # en seco no se crea nada (rsync --dry-run tampoco)
        os.makedirs(destino, exist_ok=True)
    orden = ["rsync", "-a", "--delete", "--partial"]
    for e in EXCLUIR:
        orden += ["--exclude", e]
    if seco:
        orden.append("--dry-run")
    orden += [origen.rstrip("/") + "/", destino.rstrip("/") + "/"]
    r = subprocess.run(orden, capture_output=True, text=True, timeout=1800)
    return r.returncode


def _libre_mb(ruta=None):
    """MB libres en el disco de esta máquina (el de HOME: ahí viven el repo y la caché de Drive), o None."""
    try:
        return shutil.disk_usage(ruta or os.path.expanduser("~")).free // (1024 * 1024)
    except OSError:
        return None


def _disco_min_mb():
    try:
        return max(0, int(os.environ.get("STARSEED_ESPEJO_DISCO_MIN_MB", DISCO_MIN_MB)))
    except ValueError:
        return DISCO_MIN_MB


def _tamano(ruta):
    total = 0
    for base, _, archivos in os.walk(ruta):
        for a in archivos:
            try:
                total += os.path.getsize(os.path.join(base, a))
            except OSError:
                pass
    return total


def indice(destino, tramos_hechos, cuando):
    """Un índice que se lee desde el móvil y dice qué hay y de cuándo."""
    lineas = [
        "# StarSeed · neurona `%s`" % os.uname().nodename,
        "",
        "Espejo de esta máquina en Drive, escrito por `scripts/puente/espejo-drive.py`.",
        "Última sincronización: **%s**." % cuando,
        "",
        "Esta computadora es un medio más: lo que hay aquí basta para ponerse al día",
        "desde otro ordenador, desde el móvil o desde un IDE, sin tenerla delante.",
        "",
        "## Qué hay",
        "",
    ]
    for nombre, mb in tramos_hechos:
        lineas.append("- `%s/` — %.1f MB" % (nombre, mb))
    lineas += [
        "",
        "## Qué NO hay, a propósito",
        "",
        "- Los registros por tarea (`olas/logs/`, `olas/pasos/`): son 45 de los 52 MB",
        "  y solo los lee el orquestador de esta máquina.",
        "- Los worktrees y `node_modules`: se regeneran.",
        "- **Ninguna clave.** Ni `.env`, ni `env`, ni `auth.json`, ni nada que se les",
        "  parezca. Las claves viven en variables de entorno de cada máquina y no",
        "  suben a una nube compartida: es más fácil hacerlo sin querer que deshacerlo.",
        "",
        "## Cómo se actualiza",
        "",
        "    python3 scripts/puente/espejo-drive.py",
        "",
        "Se ejecuta también al cerrar cada ola del enjambre.",
        "",
    ]
    ruta = os.path.join(destino, "INDICE.md")
    with open(ruta, "w", encoding="utf-8") as f:
        f.write("\n".join(lineas))
    return ruta


def sincronizar(seco=False, host=None):
    unidad = unidad_drive()
    if not unidad:
        return {"ok": False, "porque": "no encuentro el Drive montado en ~/Library/CloudStorage"}
    destino = carpeta_neurona(unidad, host)
    if not seco:
        try:
            os.makedirs(destino, exist_ok=True)
        except OSError as e:
            # (SUP0811K) Sin permiso para la carpeta de Drive (un servicio sin acceso a los archivos de
            # Google Drive, el disco lleno…) esto salía como un Traceback entero que nadie leía.
            return {"ok": False, "destino": destino, "tramos": [], "fallos": [],
                    "porque": "no puedo escribir en la carpeta de Drive: %s: %s" % (type(e).__name__, e)}

    hechos, fallos = [], []
    minimo = _disco_min_mb()
    for origen_rel, sub in TRAMOS:
        origen = os.path.join(RAIZ, origen_rel)
        if not seco and minimo and os.path.isdir(origen):
            libre = _libre_mb()
            if libre is not None and libre < minimo:
                fallos.append("%s: me lo salto por disco (%.1f GB libres, mínimo %.1f GB)"
                              % (sub, libre / 1024.0, minimo / 1024.0))
                continue
        try:
            rc = _rsync(origen, os.path.join(destino, sub), seco=seco)
        except (OSError, subprocess.SubprocessError) as e:
            fallos.append("%s: %s: %s" % (sub, type(e).__name__, e))
            continue
        if rc is None:
            continue
        if rc == 0:
            hechos.append((sub, _tamano(os.path.join(destino, sub)) / 1e6))
        else:
            fallos.append("%s (rsync rc=%d)" % (sub, rc))

    ctx = os.path.join(destino, "contextos")
    copiados = 0
    for rel in CONTEXTOS:
        o = os.path.join(RAIZ, rel)
        if not os.path.isfile(o):
            continue
        if seco:  # (SUP0811K) «--seco no escribe nada»: antes copiaba los contextos igual
            copiados += 1
            continue
        try:
            os.makedirs(ctx, exist_ok=True)
            with open(o, "rb") as f:
                datos = f.read()
            with open(os.path.join(ctx, os.path.basename(rel)), "wb") as f:
                f.write(datos)
            copiados += 1
        except OSError as e:
            fallos.append("contexto %s: %s" % (rel, e))
    if copiados:
        hechos.append(("contextos", _tamano(ctx) / 1e6))

    cuando = time.strftime("%Y-%m-%d %H:%M:%S")
    if not seco:
        try:
            indice(destino, hechos, cuando)
        except OSError as e:
            fallos.append("INDICE.md: %s: %s" % (type(e).__name__, e))
        try:
            with open(os.path.join(destino, "estado.json"), "w", encoding="utf-8") as f:
                json.dump(
                    {"t": cuando, "host": host or os.uname().nodename,
                     "tramos": {n: round(mb, 2) for n, mb in hechos},
                     "fallos": fallos},
                    f, ensure_ascii=False, indent=1,
                )
        except OSError:
            pass
    return {"ok": not fallos, "destino": destino, "tramos": hechos,
            "fallos": fallos, "cuando": cuando}


def main():
    ap = argparse.ArgumentParser(description="Espeja esta neurona en Google Drive.")
    ap.add_argument("--seco", action="store_true", help="no escribe nada")
    args = ap.parse_args()
    # (SUP0811K, 08-11) El orquestador guarda como aviso los primeros 300 caracteres de esta salida.
    # Con un Traceback eran siempre «Traceback (most recent call last): File …» y la causa no se veía:
    # del 27-09 al 08-11 el espejo falló en cada cierre de ola (651 avisos) sin que se supiera por qué. Ahora un
    # fallo sale en UNA línea, y los fallos van delante de la ruta (larga) del Drive.
    try:
        r = sincronizar(seco=args.seco)
    except Exception as e:  # noqa: BLE001
        print("✗ %s: %s" % (type(e).__name__, e))
        return 1
    if r.get("porque"):
        print("✗", r["porque"])
        return 1
    for f in r["fallos"]:
        print("✗", f)
    print("Drive:", r["destino"])
    for nombre, mb in r["tramos"]:
        print("  %-14s %6.1f MB" % (nombre, mb))
    print("  %s" % r["cuando"])
    return 0 if r["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
