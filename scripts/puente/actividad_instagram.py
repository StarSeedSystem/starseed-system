#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Guardados de Instagram desde la exportación oficial «Descargar tu información» (SDP1111I).
Solo lee saved_posts.json y saved_collections.json: sueltos en ~/.starseed/actividad/entrada/
instagram/ o en ~/Downloads/, o dentro de un zip llamado instagram-<usuario>-<fecha>-<id>.zip.
Nunca abre Instagram, no usa la sesión de Alex ni hace peticiones a instagram.com; los zips de
Descargas solo se leen, nunca se borran.
Salida PRIVADA: ~/.starseed/actividad/instagram/guardados.json (0600), fuera de
starseed_memory_root y por tanto de Drive. Incremental por enlace: lo ya guardado conserva su
primera fecha."""
from __future__ import annotations
import json
import os
import re
import zipfile
from datetime import datetime, timezone
from pathlib import Path

ENTRADA = Path.home() / ".starseed" / "actividad" / "entrada" / "instagram"
DESCARGAS = Path.home() / "Downloads"
SALIDA = Path.home() / ".starseed" / "actividad" / "instagram" / "guardados.json"
ZIP_OK = re.compile(r"^instagram-.+\.zip$", re.I)
PERFIL = re.compile(r"^https?://(?:www\.)?instagram\.com/([^/?#]+)", re.I)
RESERVADAS = {"p", "reel", "reels", "tv", "explore", "stories", "accounts"}


def autor_de_enlace(enlace: str) -> str:
    m = PERFIL.match(enlace or "")
    usuario = (m.group(1) or "").strip().lower() if m else ""
    return "" if usuario in RESERVADAS else usuario


def _iso(ts) -> str:
    try:
        return datetime.fromtimestamp(int(ts), timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ") \
            if int(ts) > 0 else ""
    except (TypeError, ValueError):
        return ""


def ficha(enlace, ts=0, coleccion: str = ""):
    # Ficha privada de un guardado: enlace, autor y fecha (invisible si se desconoce).
    enlace = str(enlace or "").strip()
    if not enlace:
        return None
    return {"enlace": enlace, "autor": autor_de_enlace(enlace), "fecha": _iso(ts),
            "coleccion": str(coleccion or "").strip(), "privado": True}


def fichas_de_saved_posts(datos):
    # El enlace de cada guardado vive en string_map_data.Media del JSON oficial.
    fichas = []
    for item in datos or []:
        smd = item.get("string_map_data") or {} if isinstance(item, dict) else {}
        media = smd.get("Media") or {}
        f = ficha(media.get("href"), (smd.get("Saved on") or {}).get("timestamp")
                  or media.get("timestamp") or 0)
        if f: fichas.append(f)
    return fichas


def fichas_de_saved_collections(datos):
    # Colecciones oficiales: nombre + enlaces dentro de media_list_data.
    fichas = []
    for col in datos or []:
        nombre = str(col.get("name") or "") if isinstance(col, dict) else ""
        for media in (col.get("media_list_data") or []) if isinstance(col, dict) else []:
            href = ((media.get("string_map_data") or {}).get("Media") or {}).get("href")
            f = ficha(href, coleccion=nombre)
            if f: fichas.append(f)
    return fichas


def fundir(nuevas, previas=()):
    # Une por enlace sin duplicar: lo previo conserva su fecha y se le rellena la colección vacía.
    por_enlace = {f["enlace"]: dict(f) for f in previas or []}
    for f in nuevas or []:
        vieja = por_enlace.get(f["enlace"])
        if vieja is None:
            por_enlace[f["enlace"]] = dict(f)
        elif not vieja.get("coleccion") and f.get("coleccion"):
            vieja["coleccion"] = f["coleccion"]
    return list(por_enlace.values())


def fichas_de_zip(ruta):
    # saved_posts.json y saved_collections.json, sueltos o en la carpeta interna del zip.
    fichas = []
    with zipfile.ZipFile(ruta) as z:
        for nombre in z.namelist():
            base = os.path.basename(nombre)
            if base not in ("saved_posts.json", "saved_collections.json"):
                continue
            datos = json.loads(z.read(nombre).decode("utf-8"))
            fichas += fichas_de_saved_posts(datos) if base == "saved_posts.json" \
                else fichas_de_saved_collections(datos)
    return fichas


def fuentes():
    # JSON sueltos en los dos sitios y los zips que se llaman instagram-*.zip.
    for directorio in (ENTRADA, DESCARGAS):
        for ruta in sorted(directorio.iterdir()) if directorio.is_dir() else []:
            if ruta.name in ("saved_posts.json", "saved_collections.json"):
                yield ("json", ruta)
            elif ZIP_OK.match(ruta.name):
                yield ("zip", ruta)


def main() -> int:
    nuevas = []
    for tipo, ruta in fuentes():
        if tipo == "zip":
            nuevas += fichas_de_zip(ruta)
        elif ruta.name == "saved_posts.json":
            nuevas += fichas_de_saved_posts(json.loads(ruta.read_text(encoding="utf-8")))
        else:
            nuevas += fichas_de_saved_collections(json.loads(ruta.read_text(encoding="utf-8")))
    previas = json.loads(SALIDA.read_text(encoding="utf-8")) if SALIDA.exists() else []
    todo = fundir(nuevas, previas)
    todo.sort(key=lambda f: f.get("fecha") or "", reverse=True)
    SALIDA.parent.mkdir(parents=True, exist_ok=True)
    tmp = SALIDA.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(todo, ensure_ascii=False, indent=1), encoding="utf-8")
    os.chmod(tmp, 0o600)
    os.replace(tmp, SALIDA)
    print(f"Instagram: {len(todo)} guardados ({len(todo) - len(previas)} nuevos desde "
          f"{len(previas)}) → {SALIDA}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
