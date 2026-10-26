#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Vigía descubridor de modelos por área (Ola 1016M · tarea VGM1016B).

`descubrir(area, catalogo_ids, http_get, ahora)` devuelve candidatos
{ id, autor, creado, modificado, pipeline_tag, likes, trending, licencia_hf, gated,
  archivos:[{nombre, bytes, sha256?}] } con cuatro fuentes de la API pública de
Hugging Face (`https://huggingface.co/api/models`):
  1) Tendencia:   ?pipeline_tag=<tag>&sort=trendingScore&direction=-1&limit=30
                  (sort=likes NO trae lo nuevo: Qwen-Image-2.1-Turbo solo sale
                  con trendingScore; medido el 2026-10-16).
  2) Familias:    ?author=<autor>&sort=createdAt&direction=-1&limit=20, solo lo
                  creado en los últimos 60 días.
  3) Hermanos:    a partir de un id del catálogo (Qwen/Qwen-Image-2.1) busca repos
                  cuyo nombre empiece por el suyo (→ Qwen-Image-2.1-Turbo); lo que
                  ya está en el catálogo no vuelve como candidato.
  4) Cuantizados: ?search=<nombre>&author=<cuantizador>&limit=5 (unsloth, city96…).

El detalle de archivos sale de ?blobs=true (siblings con size y lfs.sha256).
Máximo 120 peticiones por pasada, pausa de 1 s entre peticiones y HF_TOKEN en la
cabecera SOLO si existe en el entorno (su valor no sale de aquí más que en esa
cabecera). La red, el reloj y la pausa son inyectables: las pruebas sin red.
"""

import json
import os
import time
from datetime import datetime, timedelta, timezone
from urllib.parse import quote

BASE_API = "https://huggingface.co/api/models"
LIMITE_PETICIONES = 120
PAUSA_SEGUNDOS = 1.0
CUANTIZADORES = (
    "unsloth", "city96", "QuantStack", "bartowski",
    "lmstudio-community", "mlx-community", "onnx-community", "Comfy-Org",
)
# Re-subidas de terceros que NO deben entrar (medidas el 2026-10-16 en tendencia).
MARCAS_FUERA = ("uncensored", "abliterated", "nsfw")


def _parse_fecha(texto):
    """Texto ISO → datetime UTC; None si no se entiende."""
    if not texto:
        return None
    try:
        fecha = datetime.fromisoformat(str(texto).strip().replace("Z", "+00:00"))
    except ValueError:
        return None
    return fecha if fecha.tzinfo else fecha.replace(tzinfo=timezone.utc)


def _sale_de_negras(id_modelo):
    """True si el id lleva marca de resubida que no debe entrar."""
    id_bajo = str(id_modelo).lower()
    return any(marca in id_bajo for marca in MARCAS_FUERA)


def _candidato_de_modelo(modelo):
    """Candidato con la forma del contrato, a partir de una respuesta de lista."""
    return {
        "id": modelo.get("id") or "",
        "autor": modelo.get("author") or "",
        "creado": modelo.get("created_at"),
        "modificado": modelo.get("last_modified"),
        "pipeline_tag": modelo.get("pipeline_tag") or "",
        "likes": modelo.get("likes") or 0,
        "trending": modelo.get("trending_score") or 0,
        "licencia_hf": modelo.get("license") or "",
        "gated": bool(modelo.get("gated", False)),
        "archivos": [],
    }


def _archivos_de_siblings(siblings):
    """Siblings de ?blobs=true → {nombre, bytes?, sha256?}."""
    archivos = []
    for s in siblings or []:
        archivo = {"nombre": s.get("rfilename", "")}
        if s.get("size") is not None:
            archivo["bytes"] = s["size"]
        sha = (s.get("lfs") or {}).get("sha256")
        if sha:
            archivo["sha256"] = sha
        archivos.append(archivo)
    return archivos


# Compatibilidad con el nombre que usaron las primeras pruebas (misma función).
_archivos_con_sha256 = _archivos_de_siblings


def _como_lista(datos):
    """El cuerpo parseado si es lista de modelos; si no, vacío."""
    return datos if isinstance(datos, list) else []


def descubrir(area, catalogo_ids, http_get, ahora=None, dormir=time.sleep):
    """Descubre candidatos del área con las cuatro fuentes.

    area:         dict con `pipeline_tags` y `autores` (como en config/vigia-areas.json).
    catalogo_ids: ids ya presentes en el catálogo; no vuelven como candidatos.
    http_get:     función(url, headers=…, timeout=…) → cuerpo str | None (inyectable).
    ahora:        datetime UTC (reloj inyectable); hace 60 días se mide desde aquí.
    dormir:       función de pausa entre peticiones (time.sleep fuera de las pruebas).

    Devuelve la lista de candidatos con sus archivos (si quedó presupuesto para blobs).
    """
    if ahora is None:
        ahora = datetime.now(timezone.utc)
    hace_60 = ahora - timedelta(days=60)
    catalogo = {str(cid) for cid in (catalogo_ids or ())}

    vistos = set(catalogo)  # lo que ya está en el catálogo no vuelve como candidato
    candidatos = []
    estado = {"n": 0}

    def pedir(url):
        """Una petición API: cuenta, pausa y devuelve el cuerpo parseado o None."""
        if estado["n"] >= LIMITE_PETICIONES:
            return None
        if estado["n"] > 0:
            dormir(PAUSA_SEGUNDOS)
        estado["n"] += 1
        cabeceras = {}
        token = os.environ.get("HF_TOKEN")
        if token:
            cabeceras["Authorization"] = f"Bearer {token}"
        try:
            cuerpo = http_get(url, headers=cabeceras, timeout=30)
            datos = json.loads(cuerpo)
        except Exception:
            return None
        return datos if isinstance(datos, (list, dict)) else None

    def anadir(candidato):
        if candidato["id"] and candidato["id"] not in vistos and not _sale_de_negras(candidato["id"]):
            vistos.add(candidato["id"])
            candidatos.append(candidato)

    def tomar(url):
        return _como_lista(pedir(url))

    # Fuente 1: tendencia con trendingScore
    for tag in area.get("pipeline_tags") or ():
        url = f"{BASE_API}?pipeline_tag={quote(tag, '')}&sort=trendingScore&direction=-1&limit=30"
        for modelo in tomar(url):
            anadir(_candidato_de_modelo(modelo))

    # Fuente 2: familias vigiladas, solo lo creado en los últimos 60 días
    for autor in area.get("autores") or ():
        url = f"{BASE_API}?author={quote(autor, '')}&sort=createdAt&direction=-1&limit=20"
        for modelo in tomar(url):
            creado = _parse_fecha(modelo.get("created_at"))
            if creado is None or creado < hace_60:
                continue  # sin fecha fiable o fuera del rango: no entra
            anadir(_candidato_de_modelo(modelo))

    # Fuente 3: hermanos de lo que ya está en el catálogo
    for catalogo_id in sorted(catalogo):
        _, _, nombre = str(catalogo_id).rpartition("/")
        if not nombre:
            continue
        url = f"{BASE_API}?search={quote(nombre, '')}&sort=trendingScore&direction=-1&limit=20"
        for modelo in tomar(url):
            if modelo.get("id", "").rpartition("/")[2].startswith(nombre):
                anadir(_candidato_de_modelo(modelo))

    # Fuente 4: cuantizados de cada candidato
    por_cuantizar = list(candidatos)
    for candidato in por_cuantizar:
        nombre = candidato["id"].rpartition("/")[2]
        for cuantizador in CUANTIZADORES:
            url = f"{BASE_API}?search={quote(nombre, '')}&author={quote(cuantizador, '')}&limit=5"
            for modelo in tomar(url):
                anadir(_candidato_de_modelo(modelo))

    # Detalle de archivos: una petición blobs por candidato mientras quede presupuesto
    for candidato in list(candidatos):
        url = f"{BASE_API}/{quote(candidato['id'], '')}?blobs=true"
        datos = pedir(url)
        if isinstance(datos, dict) and "siblings" in datos:
            candidato["archivos"] = _archivos_de_siblings(datos["siblings"])

    return candidatos
