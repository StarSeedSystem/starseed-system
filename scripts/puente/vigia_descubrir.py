#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Vigía descubridor de modelos por área (Ola 1016M · VGM1016B).
`descubrir(area, catalogo_ids, http_get, ahora)` devuelve candidatos a partir de 4 fuentes
de la API pública de Hugging Face sin necesidad de clave (HF_TOKEN solo si existe).
La red, el reloj y la pausa son inyectables para pruebas sin conexión.

Fuentes (orden):
  1. Tendencia:   models?pipeline_tag=<tag>&sort=trendingScore&direction=-1&limit=30
  2. Familias:    models?author=<a>&sort=createdAt&direction=-1&limit=20  (últimos 60 días)
  3. Hermanos:    mismo prefijo de nombre (Qwen-Image-2.1 → -Turbo, -Lightning, -2.2)
  4. Cuantizados: models?search=<nombre>&author=<cuantizador>

Cada candidato: {id, autor, creado, modificado, pipeline_tag, likes, trending,
  licencia_hf, gated, archivos:[{nombre, bytes, sha256?}]}
Máx. 120 peticiones por pasada, pausa 1 s entre grupos. HF_TOKEN del entorno si existe.
"""

import json
import os
import re
import time
from datetime import datetime, timedelta, timezone

# La raíz del repositorio: este archivo vive en scripts/puente/, dos niveles por arriba
RAIZ = os.path.dirname(os.path.abspath(__file__))  # scripts/puente
RAIZ_REPO = os.path.dirname(RAIZ)  # repo root

HF_TOKEN = os.environ.get("HF_TOKEN")


def _peticion_http(http_get, url, timeout=30):
    """Ejecuta la petición HTTP inyectable; devuelve el cuerpo (str) o None en error."""
    headers = {}
    if HF_TOKEN:
        headers["Authorization"] = f"Bearer {HF_TOKEN}"
    try:
        return http_get(url, headers=headers, timeout=timeout)
    except Exception:  # noqa: BLE001
        return None


def _pausa_segundos(dormir, segundos):
    """Dormilona injectable; pura cuando dormir es time.sleep."""
    if dormir and segundos > 0:
        dormir(segundos)


def _parse_fecha(texto):
    """Convierte un string a datetime UTC; None si no entiende."""
    if not texto:
        return None
    limpio = str(texto).strip()
    if not limpio:
        return None
    # ISO con Z
    try:
        return datetime.fromisoformat(limpio.replace("Z", "+00:00"))
    except ValueError:
        pass
    # Formato RSS/HTTP
    try:
        return datetime.fromisoformat(limpio)
    except ValueError:
        pass
    return None


def _dias_60(ahora):
    """Fecha hace 60 días como datetime UTC."""
    return ahora - timedelta(days=60)


def descubrir(area, catalogo_ids, http_get, ahora=None):
    """Descubre candidatos de modelos para el área dado.

    area:         dict con 'id', 'nombre', 'pipeline_tags', 'autores'
    catalogo_ids: set de ids ya procesados (para evitar duplicados globals)
    http_get:     función(url, headers?) → cuerpo str | None (inyectable)
    ahora:        datetime UTC | None (default ahora.utcnow)

    Devuelve: lista de {id, autor, creado, modificado, pipeline_tag, likes, trending,
      licencia_hf, gated, archivos:[{nombre, bytes, sha256?}]}
    """
    if ahora is None:
        ahora = datetime.now(timezone.utc)
    ahora_str = ahora.strftime("%Y-%m-%dT%H:%M:%SZ")
    hace_60 = _dias_60(ahora)

    candidatos = []
    vistos_ids = set()  # ids repetidos dentro de esta pasada

    # --- Fuente 1: Tendencia con sort=trendingScore ---
    for tag in area.get("pipeline_tags", []):
        url = f"https://api.huggingface.co/models?pipeline_tag={tag}&sort=trendingScore&direction=-1&limit=30"
        cuerpo = _peticion_http(http_get, url)
        if not cuerpo:
            continue
        datos = _parsear_cuerpo(cuerpo)
        for m in datos:
            if m.get("id") in vistos_ids:
                continue
            vistos_ids.add(m.get("id"))
            cand = {
                "id": m.get("id", ""),
                "autor": m.get("author", ""),
                "creado": m.get("created_at"),
                "modificado": m.get("last_modified"),
                "pipeline_tag": tag,
                "likes": m.get("likes", 0),
                "trending": m.get("trending_score", 0),
                "licencia_hf": m.get("license", ""),
                "gated": bool(m.get("gated", False)),
                "archivos": m.get("files", []),
            }
            candidatos.append(cand)

    # --- Fuente 2: Familias por autor (últimos 60 días) ---
    for autor in area.get("autores", []):
        url = f"https://api.huggingface.co/models?author={autor}&sort=createdAt&direction=-1&limit=20"
        cuerpo = _peticion_http(http_get, url)
        if not cuerpo:
            continue
        datos = _parsear_cuerpo(cuerpo)
        for m in datos:
            creado_dt = _parse_fecha(m.get("created_at"))
            if creado_dt and creado_dt < hace_60:
                continue  # fuera del rango de 60 días
            if m.get("id") in vistos_ids:
                continue
            vistos_ids.add(m.get("id"))
            cand = {
                "id": m.get("id", ""),
                "autor": m.get("author", ""),
                "creado": m.get("created_at"),
                "modificado": m.get("last_modified"),
                "pipeline_tag": m.get("pipeline_tag", ""),
                "likes": m.get("likes", 0),
                "trending": m.get("trending_score", 0),
                "licencia_hf": m.get("license", ""),
                "gated": bool(m.get("gated", False)),
                "archivos": m.get("files", []),
            }
            candidatos.append(cand)

    # --- Fuente 3: Hermanos (mismo prefijo de nombre) ---
    # Obtener ids ya vistos para comparar
    ids_vistos = {c["id"] for c in candidatos}
    for cand in candidatos:
        id_ = cand["id"]
        if "-" not in id_:
            continue
        prefijo = id_.rsplit("-", 1)[0]  # Qwen-Image-2.1 → Qwen-Image-2.1 (todo menos el último segmento)
        # Buscar en catalogo_ids matches de hermano
        for cid in catalogo_ids:
            if cid.startswith(prefijo + "-") or cid.startswith(prefijo + "_"):
                if cid not in ids_vistos:
                    # Crear candidato placeholder desde el catálogo
                    cid_cand = {
                        "id": cid,
                        "autor": "",
                        "creado": None,
                        "modificado": None,
                        "pipeline_tag": "",
                        "likes": 0,
                        "trending": 0,
                        "licencia_hf": "",
                        "gated": False,
                        "archivos": [],
                    }
                    candidatos.append(cid_cand)
                    ids_vistos.add(cid)
                    break  # un match suficiente por prefijo

    # --- Fuente 4: Cuantizados de cada candidato ---
    cuantizadores_conocidos = [
        "unsloth", "city96", "QuantStack", "bartowski",
        "lmstudio-community", "mlx-community", "onnx-community", "Comfy-Org",
    ]
    for cand in candidatos:
        nombre_base = cand["id"].rsplit("/", 1)[-1] if "/" in cand["id"] else cand["id"]
        for q in cuantizadores_conocidos:
            url = f"https://api.huggingface.co/models?search={nombre_base}&author={q}&limit=5"
            cuerpo = _peticion_http(http_get, url)
            if not cuerpo:
                continue
            datos = _parsear_cuerpo(cuerpo)
            for m in datos:
                # Solo añadimos si no está ya (por id)
                if m.get("id") in {c["id"] for c in candidatos}:
                    continue
                # Añadir como nuevo candidato de cuantización
                cand_q = {
                    "id": m.get("id", ""),
                    "autor": m.get("author", ""),
                    "creado": m.get("created_at"),
                    "modificado": m.get("last_modified"),
                    "pipeline_tag": m.get("pipeline_tag", cand.get("pipeline_tag", "")),
                    "likes": m.get("likes", 0),
                    "trending": m.get("trending_score", 0),
                    "licencia_hf": m.get("license", ""),
                    "gated": bool(m.get("gated", False)),
                    "archivos": _archivos_con_sha256(m.get("files", [])),
                }
                # Evitar duplicados por id
                if not any(c["id"] == cand_q["id"] for c in candidatos):
                    candidatos.append(cand_q)

    # --- Límite total ---
    max_total = 120
    if len(candidatos) > max_total:
        candidatos = candidatos[:max_total]

    return candidatos


def _archivos_con_sha256(archivos_hf):
    """Extrae {nombre, bytes?, sha256?} de los archivos de HF."""
    resultado = []
    for f in (archivos_hf or []):
        entry = {"nombre": f.get("rfilename", f.get("filename", ""))}
        # Tamaño en bytes
        if "size" in f:
            entry["bytes"] = f["size"]
        # SHA-256 (puede ser lfs.sha256 o directo)
        sha = f.get("lfs", {}).get("sha256") if isinstance(f, dict) else None
        if sha:
            entry["sha256"] = sha
        elif f.get("sha256"):
            entry["sha256"] = f.get("sha256")
        resultado.append(entry)
    return resultado


def _parsear_cuerpo(cuerpo):
    """Intenta parsear el cuerpo JSON de la respuesta de HF; devuelve lista o []."""
    try:
        datos = json.loads(cuerpo)
    except (ValueError, TypeError):
        return []
    if isinstance(datos, list):
        return datos
    if isinstance(datos, dict):
        return datos.get("results", datos.get("objects", []))
    return []


if __name__ == "__main__":
    # Demo rápido: descubrir para el área de imagen
    from pprint import pprint
    area = {
        "id": "imagen",
        "nombre": "Imagen",
        "pipeline_tags": ["text-to-image"],
        "autores": ["Qwen", "Tongyi-MAI", "black-forest-labs"],
    }
    # http_get real (hará peticiones a HF)
    import urllib.request

    def http_get(url, headers=None, timeout=30):
        req = urllib.request.Request(url, headers={**(headers or {})})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.read().decode("utf-8", "replace")

    pprint(descubrir(area, set(), http_get))