# -*- coding: utf-8 -*-
"""Orquestación diaria de alcance GitHub (ALC1113A).
Núcleo PURO: E/S inyectable, sin red real en tests. Escribe fichas en starseed_memory_root/alcance/github/<fecha>.json.
"""
from __future__ import annotations
from datetime import date
from pathlib import Path
from typing import TYPE_CHECKING, Any, Callable

if TYPE_CHECKING:
    from collections.abc import Callable

import alcance_github_temas as T
from alcance_github_semillas import leer_semillas, RepoSemilla
from alcance_github_http import buscar_repos_por_tema, _fetch_repo_detalle
from alcance_github_fichas import ficha_desde_repo

TOPE_DIARIO = 15

def procesar_dia(
    fecha: date,
    sesion: Any,
    salida_dir: str | Path,
    *,
    token: str | None = None,
    tope_diario: int = TOPE_DIARIO,
    dormir: Callable[[float], None] = lambda s: None,
) -> list[dict]:
    """Ejecuta búsqueda diaria, construye fichas y escribe JSON en salida_dir/<fecha>.json."""
    salida_dir = Path(salida_dir)
    salida_dir.mkdir(parents=True, exist_ok=True)
    fichas: list[dict] = []
    semillas = {s.full_name().lower() for s in leer_semillas()}
    for tema in T.temas_del_dia(fecha, tope=tope_diario):
        if len(fichas) >= tope_diario: break
        for query in tema["queries"]:
            if len(fichas) >= tope_diario: break
            repos = buscar_repos_por_tema(query, sesion, token=token, dormir=dormir)
            for repo in repos:
                if len(fichas) >= tope_diario: break
                full = repo["full_name"].lower()
                if full in semillas: continue
                detalle = _fetch_repo_detalle(repo["owner"]["login"], repo["name"], sesion, token)
                if not detalle: continue
                ficha = ficha_desde_repo(detalle, tema["id"], sesion)
                fichas.append(ficha)
    import json
    archivo = salida_dir / f"{fecha.isoformat()}.json"
    archivo.write_text(json.dumps(fichas, ensure_ascii=False, indent=1), encoding="utf-8")
    return fichas