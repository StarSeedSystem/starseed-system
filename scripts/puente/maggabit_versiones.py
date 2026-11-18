#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Maggabit · instaladores de cada publicación del repo de MetaGenesis (MAG1117, Ola MAG07).

Cada versión completa lista para instalar vive en `RAIZ/MetaGenesis/instaladores/`: la publicación
marcada «Latest» y la de `servidor-local` en `instaladores/<etiqueta>/`, y en `canal-pruebas` cada
número de prueba en su subcarpeta `prueba-<n>/` (se conservan las 3 últimas). La decisión es PURA
(`plan`, `comprobar`, `ficha_de`, `ficha_igual`) y la E/S es una capa fina con todo inyectable
(subprocess con timeout, lectura y escritura de disco, guardado de ficha).

Principio 0: con el disco ausente nada falla ni espera. El volumen exFAT puede no responder: todo
subprocess lleva timeout y se devuelve «sin-respuesta», nunca se cuelga. Nunca se borra en el
origen: una prueba retirada sale solo de la carpeta local, la publicación queda en GitHub. Nunca se
imprimen tokens, claves ni URLs con credenciales. Fichas: `_publicacion.json` (nombre, publicado,
archivos con bytes) es lo que decide si una etiqueta vuelve a bajarse.
"""
from __future__ import annotations

import json
import os
import re
import shutil
import subprocess

REPO = os.environ.get("STARSEED_MAGGABIT_REPO") or "StarSeedSystem/starseed-system"
SUBIDA = "MetaGenesis/instaladores"
ARCHIVO_FICHA = "_publicacion.json"
CANAL_PRUEBAS = "canal-pruebas"
SERVIDOR_LOCAL = "servidor-local"
CANAL_ESTABLE = "estable"
CONSERVADAS = 3
TIEMPO_VISTA_S = 60
TIEMPO_BAJA_S = 1800


# ── lógica pura ──

def numero_prueba(texto):
    """PURA. Número de prueba que llevan etiqueta o nombre (`prueba-4`, `canal-pruebas-4`); None si no lleva."""
    if not texto:
        return None
    m = re.search(r"pruebas?[-_ ]?(\d+)", str(texto))
    return int(m.group(1)) if m else None


def canal_de(pub):
    """PURA. Canal de una publicación: estable (la marcada Latest) · canal-pruebas · servidor-local.

    None si no es de esos tres: las demás no se tocan. Un `canal` explícito manda."""
    c = str((pub or {}).get("canal") or "")
    if c in (CANAL_ESTABLE, CANAL_PRUEBAS, SERVIDOR_LOCAL):
        return c
    if (pub or {}).get("latest"):
        return CANAL_ESTABLE
    etiqueta = str((pub or {}).get("etiqueta") or "")
    nombre = str((pub or {}).get("nombre") or "")
    if SERVIDOR_LOCAL in etiqueta or SERVIDOR_LOCAL in nombre:
        return SERVIDOR_LOCAL
    if CANAL_PRUEBAS in etiqueta or numero_prueba(etiqueta) is not None or numero_prueba(nombre) is not None:
        return CANAL_PRUEBAS
    return None


def ficha_de(pub):
    """PURA. Ficha canónica de la publicación: etiqueta, nombre, publicado y archivos con bytes.

    Es lo que va en `_publicacion.json` y lo que se compara para decidir si se vuelve a bajar."""
    archivos = sorted(
        [
            {"nombre": str((a or {}).get("nombre") or ""), "bytes": int((a or {}).get("bytes") or 0)}
            for a in (pub or {}).get("archivos") or []
        ],
        key=lambda a: a["nombre"],
    )
    return {
        "etiqueta": str((pub or {}).get("etiqueta") or ""),
        "nombre": str((pub or {}).get("nombre") or ""),
        "publicado": str((pub or {}).get("publicado") or ""),
        "archivos": archivos,
    }


def ficha_igual(nueva, guardada):
    """PURA. ¿La ficha guardada dice lo mismo que la nueva (nombre, publicado, archivos con bytes)?"""
    if not isinstance(guardada, dict):
        return False
    return ficha_de(nueva) == ficha_de(guardada)


def destino_de(canal, etiqueta, prueba=0):
    """PURA. Carpeta de la versión, relativa a la raíz del repo. En canal-pruebas va a `prueba-<n>/`."""
    if canal == CANAL_PRUEBAS:
        return "%s/%s/prueba-%d" % (SUBIDA, CANAL_PRUEBAS, int(prueba))
    return "%s/%s" % (SUBIDA, etiqueta)


def plan(publicaciones, guardadas):
    """PURA. Órdenes para dejar `RAIZ/MetaGenesis/instaladores` al día con las publicaciones.

    Baja una etiqueta solo si su ficha (nombre, publicado, archivos con bytes) cambió respecto de
    `_publicacion.json`. En canal-pruebas cada número va a su subcarpeta y se conservan las 3 últimas:
    las más viejas se listan como 'retirar' con la poda anotada, y nunca se toca una estable. Sin
    cambios → [].

    `publicaciones`: [{"etiqueta", "nombre", "publicado", "latest", "archivos": [{"nombre","bytes"}]}]
    `guardadas`: {etiqueta: ficha leída de `_publicacion.json`}.
    """
    ordenes = []
    numeros = set()
    for f in (guardadas or {}).values():
        if isinstance(f, dict) and f.get("prueba") is not None:
            numeros.add(int(f["prueba"]))
    for pub in publicaciones or []:
        canal = canal_de(pub)
        if canal is None:
            continue
        etiqueta = str((pub or {}).get("etiqueta") or "")
        ficha = ficha_de(pub)
        prueba = None
        if canal == CANAL_PRUEBAS:
            prueba = (pub or {}).get("prueba")
            if prueba is None:
                prueba = numero_prueba((pub or {}).get("nombre"))
            if prueba is None:
                prueba = numero_prueba(etiqueta)
            if prueba is None:
                prueba = (max(numeros) + 1) if numeros else 1
            prueba = int(prueba)
            numeros.add(prueba)
            ficha["prueba"] = prueba
        if ficha_igual(ficha, (guardadas or {}).get(etiqueta)):
            continue
        ordenes.append(
            {
                "accion": "bajar",
                "etiqueta": etiqueta,
                "canal": canal,
                "prueba": prueba,
                "destino": destino_de(canal, etiqueta, prueba or 0),
                "ficha": dict(ficha),
            }
        )
    for n in sorted(numeros)[: -CONSERVADAS] if len(numeros) > CONSERVADAS else []:
        ordenes.append(
            {
                "accion": "retirar",
                "etiqueta": CANAL_PRUEBAS,
                "prueba": n,
                "destino": destino_de(CANAL_PRUEBAS, CANAL_PRUEBAS, n),
                "motivo": "poda: se conservan las %d últimas" % CONSERVADAS,
            }
        )
    return ordenes


def comprobar(carpeta, ficha, stat_archivo=os.stat):
    """Comprueba que cada archivo de la ficha existe en `carpeta` y mide lo que la ficha dice.

    Devuelve {"estado": "completa" | "incompleta", "faltan": [nombres], "mal": [{nombre, esperado, real}]}.
    Un archivo más corto que lo dicho es 'incompleta'. `stat_archivo` inyectable para las pruebas."""
    faltan, mal = [], []
    for a in (ficha or {}).get("archivos") or []:
        nombre = str((a or {}).get("nombre") or "")
        esperado = int((a or {}).get("bytes") or 0)
        try:
            real = int(stat_archivo(os.path.join(carpeta, nombre)).st_size)
        except OSError:
            faltan.append(nombre)
            continue
        if real != esperado:
            mal.append({"nombre": nombre, "esperado": esperado, "real": real})
    estado = "completa" if not faltan and not mal else "incompleta"
    return {"estado": estado, "faltan": faltan, "mal": mal}


# ── E/S fina (subprocess, disco y guardado de ficha, todo con timeout e inyectable) ──

def gh(args, timeout=TIEMPO_VISTA_S, ejecutar=None):
    """Corre `gh …` con timeout. El volumen exFAT puede no responder: nunca se cuelga.

    Devuelve (salida, error): error es "" si fue bien, o «sin-respuesta» (timeout), «sin-gh» o el
    primer renglón del fallo."""
    run = ejecutar or subprocess.run
    try:
        r = run(args, capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired:
        return "", "sin-respuesta"
    except OSError:
        return "", "sin-gh"
    if r.returncode != 0:
        renglones = (r.stderr or "").strip().splitlines()
        return "", (renglones[0] if renglones else "fallo")
    return (r.stdout or ""), ""


def ver_publicacion(etiqueta, repo=REPO, pedir_gh=gh):
    """Lee una publicación con `gh release view … --json`; None si falla o no responde.

    Con `etiqueta` vacía devuelve la marcada «Latest». Mapea activos a {"nombre","bytes"}."""
    args = ["gh", "release", "view", "--repo", repo, "--json", "tagName,name,publishedAt,isLatest,assets"]
    if etiqueta:
        args.insert(3, etiqueta)
    salida, _ = pedir_gh(args)
    if not salida:
        return None
    try:
        d = json.loads(salida)
    except ValueError:
        return None
    return {
        "etiqueta": str(d.get("tagName") or etiqueta or ""),
        "nombre": str(d.get("name") or ""),
        "publicado": str(d.get("publishedAt") or ""),
        "latest": bool(d.get("isLatest")),
        "archivos": [
            {"nombre": str((a or {}).get("name") or ""), "bytes": int((a or {}).get("size") or 0)}
            for a in d.get("assets") or []
        ],
    }


def bajar(pub, destino_abs, ficha=None, repo=REPO, pedir_gh=gh, guardar=None):
    """Baja los activos con `gh release download … --clobber` (con timeout) y guarda la ficha.

    `pub` solo hace falta con etiqueta; la ficha que se anota viene en `ficha` (la del plan). Con el
    disco ausente devuelve «sin-disco»: nada falla ni espera (principio 0)."""
    try:
        os.makedirs(destino_abs, exist_ok=True)
    except OSError:
        return {"estado": "sin-disco"}
    args = ["gh", "release", "download", str((pub or {}).get("etiqueta") or ""),
            "--clobber", "--dir", destino_abs, "--repo", repo]
    _, error = pedir_gh(args, timeout=TIEMPO_BAJA_S)
    if error:
        return {"estado": error}
    if guardar and ficha:
        guardar(destino_abs, ficha)
    return {"estado": "baja"}


def guardar_ficha(carpeta, ficha):
    """Escribe `_publicacion.json` dentro de la carpeta (mejor esfuerzo: un disco lento no tumba nada)."""
    try:
        os.makedirs(carpeta, exist_ok=True)
        with open(os.path.join(carpeta, ARCHIVO_FICHA), "w", encoding="utf-8") as f:
            json.dump(ficha, f, ensure_ascii=False, sort_keys=True, indent=2)
        return True
    except OSError:
        return False


def fichas_guardadas(raiz_abs):
    """Lee las fichas de `raiz/MetaGenesis/instaladores/**/_publicacion.json`, por etiqueta.

    Con el disco ausente devuelve {} sin fallar ni esperar (principio 0)."""
    fichas = {}
    base = os.path.join(raiz_abs, SUBIDA)
    if not os.path.isdir(base):
        return fichas
    for dirpath, _dirs, nombres in os.walk(base):
        if ARCHIVO_FICHA not in nombres:
            continue
        try:
            with open(os.path.join(dirpath, ARCHIVO_FICHA), encoding="utf-8") as f:
                ficha = json.load(f)
        except (OSError, ValueError):
            continue
        fichas[str((ficha or {}).get("etiqueta") or os.path.basename(dirpath))] = ficha
    return fichas


def retirar_prueba(destino_abs, borrar=None):
    """Retira del disco local la carpeta de una prueba vieja (poda). Nunca toca el origen.

    La publicación queda en GitHub: solo se quita lo instalado en esta máquina. False si no había carpeta."""
    borrar = borrar or shutil.rmtree
    try:
        if os.path.isdir(destino_abs):
            borrar(destino_abs)
            return True
    except OSError:
        pass
    return False


def revisar(raiz_abs, repo=REPO, pedir_gh=gh, ver=ver_publicacion, fichas=fichas_guardadas,
            bajar_pub=bajar, escribir_ficha=guardar_ficha, stat_archivo=os.stat, quitar=retirar_prueba):
    """Un ciclo completo: mira las tres publicaciones, aplica el plan y comprueba cada carpeta tocada.

    La Latest se lee sin etiqueta (`gh release view` la trae sola); `servidor-local` y `canal-pruebas`
    van por su etiqueta. Con el disco ausente no falla ni espera: «sin-disco». Cada baja termina con su
    `comprobacion` (cada archivo existe y mide lo que la ficha dice); la poda solo toca carpetas locales."""
    if not os.path.isdir(raiz_abs):
        return {"estado": "sin-disco", "ordenes": [], "aplicadas": []}
    publicaciones = []
    for etiqueta in [None, SERVIDOR_LOCAL, CANAL_PRUEBAS]:
        p = ver(etiqueta, repo=repo, pedir_gh=pedir_gh)
        if p:
            publicaciones.append(p)
    ordenes = plan(publicaciones, fichas(raiz_abs))
    aplicadas = []
    for o in ordenes:
        destino_abs = os.path.join(raiz_abs, o["destino"])
        if o["accion"] == "bajar":
            r = bajar_pub({"etiqueta": o["etiqueta"]}, destino_abs, ficha=o.get("ficha"),
                          repo=repo, pedir_gh=pedir_gh, guardar=escribir_ficha)
            r["destino"] = o["destino"]
            r["comprobacion"] = comprobar(destino_abs, o.get("ficha") or {}, stat_archivo=stat_archivo)
        else:
            r = {"accion": "retirar", "destino": o["destino"], "motivo": o.get("motivo", ""),
                 "hecho": quitar(destino_abs)}
        aplicadas.append(r)
    return {"estado": "ok", "ordenes": ordenes, "aplicadas": aplicadas}
