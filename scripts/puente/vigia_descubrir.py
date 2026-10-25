#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Vigía descubridor de modelos por área (VGM1016B): cuatro fuentes de Hugging Face, tope de 120 peticiones, sin red en pruebas."""
import json, os, re, time
from datetime import datetime, timedelta, timezone
BASE = "https://huggingface.co/api/models"
VETADO = re.compile(r"uncensored|abliterated|heretic|decensored|\bnsfw\b", re.I)
MAX_PETICIONES, TOPE_DESCUBRIR, TOPE_DETALLES, TOPE_CUANTIZADOS, DIAS, PAUSA = 120, 48, 40, 8, 60, 1.0
def _nombre(ref):
    return str(ref or "").rsplit("/", 1)[-1]
def _licencia(m):
    card = m.get("cardData") or {}
    lic = m.get("license") or card.get("license") or ""
    real = m.get("license_name") or card.get("license_name") or ""
    if str(lic).lower() in ("", "other", "unknown") and real:
        return str(real)
    if lic:
        return str(lic)
    return next((t.split(":", 1)[1] for t in m.get("tags") or []
                 if isinstance(t, str) and t.startswith("license:")), str(real))
def _archivos(m):
    salida = []
    for f in m.get("siblings") or m.get("files") or []:
        if not isinstance(f, dict):
            continue
        lfs = f["lfs"] if isinstance(f.get("lfs"), dict) else {}
        item = {"nombre": f.get("rfilename") or f.get("filename") or ""}
        if isinstance(f.get("size", lfs.get("size")), int):
            item["bytes"] = f.get("size", lfs.get("size"))
        sha = lfs.get("sha256") or lfs.get("oid") or f.get("sha256")
        if isinstance(sha, str) and len(sha) == 64:
            item["sha256"] = sha
        salida.append(item)
    return salida
def _nuevo(m, tag=None, trending=None):
    ref = str(m.get("id") or m.get("modelId") or "")
    return {"id": ref, "autor": m.get("author") or (ref.split("/", 1)[0] if "/" in ref else ""),
            "creado": m.get("createdAt") or m.get("created_at"),
            "modificado": m.get("lastModified") or m.get("last_modified"),
            "pipeline_tag": m.get("pipeline_tag") or tag or "", "likes": m.get("likes") or 0,
            "trending": m.get("trendingScore") or m.get("trending_score") or trending or 0,
            "licencia_hf": _licencia(m),
            "gated": str(m.get("gated", False)).strip().lower() not in ("", "false", "no", "none"),
            "archivos": _archivos(m)}
def _lista(datos):
    crudo = datos if isinstance(datos, list) else (datos.get("results") if isinstance(datos, dict) else None) or []
    return [m for m in (crudo if isinstance(crudo, list) else []) if isinstance(m, dict) and m.get("id")]
def descubrir(area, catalogo_ids, http_get, ahora=None, dormir=None):
    """Candidatos nuevos de un área; ver vigia-modelos.md §2."""
    ahora, dormir = ahora or datetime.now(timezone.utc), dormir or time.sleep
    catalogo = set(catalogo_ids.keys() if isinstance(catalogo_ids, dict) else catalogo_ids or ())
    estado = {"n": 0, "pausa": False}
    def pedir(url, tope=MAX_PETICIONES):
        if estado["n"] >= tope:
            return None
        if estado["pausa"]:
            dormir(PAUSA)
        estado["n"] += 1
        estado["pausa"] = True
        token = os.environ.get("HF_TOKEN")  # solo el nombre; jamás su valor
        cabeceras = {"Authorization": f"Bearer {token}"} if token else {}
        try:
            cuerpo = http_get(url, headers=cabeceras, timeout=30)
        except TypeError:
            cuerpo = http_get(url)
        except Exception:
            return None
        try:
            return json.loads(cuerpo) if isinstance(cuerpo, (str, bytes)) else cuerpo
        except (TypeError, ValueError):
            return None
    candidatos, orden = {}, []
    def anadir(m, tag=None, trending=None):
        nuevo = _nuevo(m, tag, trending)
        if not nuevo["id"] or nuevo["id"] in catalogo or VETADO.search(nuevo["id"]):
            return
        previo = candidatos.get(nuevo["id"])
        if previo is None:
            candidatos[nuevo["id"]] = nuevo
            orden.append(nuevo["id"])
            return
        previo["trending"] = max(previo["trending"] or 0, nuevo["trending"] or 0)
        previo["likes"] = max(previo["likes"] or 0, nuevo["likes"] or 0)
        previo["archivos"] = previo["archivos"] or nuevo["archivos"]
        previo["licencia_hf"] = previo["licencia_hf"] or nuevo["licencia_hf"]
    for tag in area.get("pipeline_tags") or []:
        filas = _lista(pedir(f"{BASE}?pipeline_tag={tag}&sort=trendingScore&direction=-1&limit=30", TOPE_DESCUBRIR))
        for pos, m in enumerate(filas):
            anadir(m, tag, len(filas) - pos)
    desde = ahora - timedelta(days=DIAS)
    for autor in area.get("autores") or []:
        for m in _lista(pedir(f"{BASE}?author={autor}&sort=createdAt&direction=-1&limit=20", TOPE_DESCUBRIR)):
            try:
                creado = datetime.fromisoformat(str(m.get("createdAt") or "").replace("Z", "+00:00"))
            except ValueError:
                creado = None
            if creado is None or creado >= desde:
                anadir(m)
    for nombre in dict.fromkeys(_nombre(ref) for ref in sorted(catalogo) if _nombre(ref)):
        for m in _lista(pedir(f"{BASE}?search={nombre}&limit=30", TOPE_DESCUBRIR)):
            if _nombre(m.get("id")).startswith(nombre) and _nombre(m.get("id")) != nombre:
                anadir(m)
    for ref in list(orden)[:TOPE_CUANTIZADOS]:
        for q in area.get("cuantizadores") or []:
            for m in _lista(pedir(f"{BASE}?search={_nombre(ref)}&author={q}&limit=5")):
                if _nombre(ref).lower() in _nombre(m.get("id")).lower():
                    anadir(m)
    for ref in list(orden)[:TOPE_DETALLES]:
        if estado["n"] >= MAX_PETICIONES:
            break
        cand = candidatos[ref]
        if any(a.get("sha256") for a in cand["archivos"]):
            continue
        datos = pedir(f"{BASE}/{ref}?blobs=true")
        if not isinstance(datos, dict):
            continue
        cand["archivos"] = _archivos(datos) or cand["archivos"]
        cand["licencia_hf"] = cand["licencia_hf"] or _licencia(datos)
        cand["gated"] = cand["gated"] or str(datos.get("gated", False)).strip().lower() not in ("", "false", "no", "none")
    return [candidatos[ref] for ref in orden]
