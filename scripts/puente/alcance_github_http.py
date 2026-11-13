# -*- coding: utf-8 -*-
"""Helpers HTTP para GitHub API (ALC1113). Inyectables para tests."""
from __future__ import annotations
from typing import TYPE_CHECKING, Any, Callable

if TYPE_CHECKING:
    from collections.abc import Callable

GITHUB_API = "https://api.github.com"

def _headers(token: str | None = None) -> dict[str, str]:
    h = {"Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"}
    if token: h["Authorization"] = f"Bearer {token}"
    return h

def _respetar_rate_limit(headers: dict[str, str], dormir: Callable[[float], None]) -> None:
    rem = int(headers.get("X-RateLimit-Remaining", "1") or 1)
    if rem <= 5:
        reset = int(headers.get("X-RateLimit-Reset", "0") or 0)
        import time
        espera = max(0, reset - int(time.time()) + 2)
        if espera > 0: dormir(min(espera, 60))

def buscar_repos_por_tema(
    query: str,
    sesion: Any,
    *,
    max_paginas: int = 3,
    token: str | None = None,
    dormir: Callable[[float], None] = lambda s: None,
) -> list[dict]:
    """Busca repos por query; devuelve lista de items (máx 100 por página)."""
    repos = []
    for pagina in range(1, max_paginas + 1):
        params = {"q": f"{query} in:name,description,topics", "sort": "updated", "per_page": 100, "page": pagina}
        r = sesion.get(f"{GITHUB_API}/search/repositories", params=params, headers=_headers(token), timeout=30)
        _respetar_rate_limit(r.headers, dormir)
        data = r.json()
        items = data.get("items") or []
        repos.extend(items)
        if not items:
            break
    return repos[:300]

def _fetch_repo_detalle(owner: str, name: str, sesion: Any, token: str | None = None) -> dict | None:
    r = sesion.get(f"{GITHUB_API}/repos/{owner}/{name}", headers=_headers(token), timeout=30)
    if r.status == 404: return None
    r.raise_for_status()
    return r.json()

def _fetch_readme(owner: str, name: str, sesion: Any, token: str | None = None) -> str:
    r = sesion.get(f"{GITHUB_API}/repos/{owner}/{name}/readme", headers={**_headers(token), "Accept": "application/vnd.github.raw"}, timeout=30)
    if r.status == 404: return ""
    r.raise_for_status()
    return r.text